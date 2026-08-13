#!/usr/bin/env node
// accept-i18n2：翻译块重设计全链验收（引擎 mock，无 key 全绿）。
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { rmSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { loadTm, saveTm, upsert, loadConfig, saveConfig } from '../src/i18n-tm.mjs'
import { collectUnits, collectTreeUnits } from '../src/i18n-collect.mjs'
import { projectPage, PENDING_CLASS } from '../src/i18n-project.mjs'
import { loadTerms, saveTerms, relevantTerms, hasToken } from '../src/i18n-terms.mjs'
import { checkSentence, checkCoverage } from '../src/i18n-checks.mjs'
import { translateSegments } from '../src/i18n-engine.mjs'
const cases = []
const test = (name, fn) => cases.push([name, fn])

// ---------- Task 1: 句切分 ----------
import { splitPlain, inlineSpans, sliceInlineMd, extractInlineUnits, applyInlineUnit, fp } from '../src/i18n-sent.mjs'

test('切句:中文句界', () => {
  const r = splitPlain('起重量为3吨。它采用变频控制！适用吗？')
  assert.deepEqual(r.map(s => s.text), ['起重量为3吨。', '它采用变频控制！', '适用吗？'])
})
test('切句:小数点不切', () => {
  const r = splitPlain('跨度7.5米。自重3.5吨')
  assert.deepEqual(r.map(s => s.text), ['跨度7.5米。', '自重3.5吨'])
})
test('切句:英文句点须跟空格/结尾+缩写不切', () => {
  const r = splitPlain('Made in U.S.A. standard. It works.')
  assert.deepEqual(r.map(s => s.text), ['Made in U.S.A. standard. ', 'It works.'])
})
test('切句:空白段忽略+指纹归一', () => {
  assert.equal(splitPlain('  ').length, 0)
  assert.equal(fp('起重量为3吨。'), fp(' 起重量为3吨。\n'))
})
test('行内:链接跨句合并', () => {
  const nodes = [
    { type: 'text', text: '前句。' },
    { type: 'text', text: '跨句链接。后半。', marks: [{ type: 'link', attrs: { href: '/x' } }] },
  ]
  const { spans } = inlineSpans(nodes)
  assert.equal(spans.length, 2) // '前句。' + 链接整体一句
})
test('行内:加粗内切片+回植往返', () => {
  const nodes = [{ type: 'text', text: '这台' }, { type: 'text', text: '起重机', marks: [{ type: 'bold' }] }, { type: 'text', text: '很好。第二句。' }]
  const units = extractInlineUnits(nodes)
  assert.equal(units.length, 2)
  assert.equal(units[0].md, '这台**起重机**很好。')
  const out = applyInlineUnit(nodes, 1, 'Second sentence.')
  assert.equal(out.map(n => n.text ?? '').join(''), '这台起重机很好。Second sentence.')
})
test('行内:hardBreak 强制界+回植保 hardBreak', () => {
  const nodes = [{ type: 'text', text: '起重量：3吨' }, { type: 'hardBreak' }, { type: 'text', text: '跨度：7.5米' }]
  const units = extractInlineUnits(nodes)
  assert.equal(units.length, 2)
  const out = applyInlineUnit(nodes, 0, 'Capacity: 3t')
  assert.equal(out.map(n => n.type === 'hardBreak' ? '\n' : n.text).join(''), 'Capacity: 3t\n跨度：7.5米')
})
test('行内:回植保尾随空格', () => {
  const nodes = [{ type: 'text', text: 'Made in U.S.A. standard. It works.' }]
  const out = applyInlineUnit(nodes, 0, '中国制造。')
  assert.equal(out.map(n => n.text).join(''), '中国制造。 It works.')
})

// ---------- Task 2: TM 库 ----------
test('TM:空语言对=空表', () => {
  const tm = loadTm('zh-CN', 'xx-nonexist')
  assert.deepEqual(tm.sentences, {})
})
test('TM:upsert 写读往返+状态机', () => {
  const tm = loadTm('zh-CN', 'xx-nonexist')
  upsert(tm, 'abc123', { text: '源句', translation: 'draft one', status: 'draft', origin: 'engine' })
  assert.equal(tm.sentences['abc123'].status, 'draft')
  upsert(tm, 'abc123', { status: 'approved' }) // 部分更新不丢字段
  assert.equal(tm.sentences['abc123'].translation, 'draft one')
  assert.equal(tm.sentences['abc123'].status, 'approved')
  assert.ok(tm.sentences['abc123'].updatedAt)
})
test('配置:缺文件给默认', () => {
  const c = loadConfig()
  assert.equal(typeof c.auto, 'boolean')
  assert.equal(c.review.en, 'required')
})
test('TM:saveTm/loadTm 真落盘往返', () => {
  const f = join(process.cwd(), 'src', 'i18n', 'tm.t-x.t-y.json')
  const tm = loadTm('t-x', 't-y')
  upsert(tm, 'k1', { text: '源', translation: '译', status: 'draft', origin: 'engine' })
  saveTm('t-x', 't-y', tm)
  assert.equal(loadTm('t-x', 't-y').sentences['k1'].translation, '译')
  rmSync(f) // 清理，不留测试残留
})
test('配置:saveConfig review 深合并不丢键', () => {
  const f = join(process.cwd(), 'src', 'i18n', 'config.json')
  saveConfig({ review: { de: 'auto' } })
  saveConfig({ review: { en: 'auto' } })
  const c = loadConfig()
  assert.equal(c.review.de, 'auto')  // de 不被顶掉
  assert.equal(c.review.en, 'auto')
  rmSync(f) // 还原「缺文件」初始态（前面用例依赖它）
})

// ---------- Task 3: 可译采集 ----------
test('采集:文本字段+结构性排除', () => {
  const j = {
    page: { slug: 'posts/x', lang: 'zh-CN', title: '页面标题' },
    title: '文章标题',
    breadcrumb: { current: '当前', trail: [{ label: '首页', url: 'https://x.com/zh/' }] },
    hero: { image: 'a.jpg', link: 'https://x.com/', alt: '一张图' },
  }
  const units = collectUnits(j)
  const ids = units.map(u => u.id)
  assert.ok(ids.includes('title') && ids.includes('page.title') && ids.includes('breadcrumb.current') && ids.includes('hero.alt'))
  assert.ok(!ids.some(i => i.includes('slug') || i.includes('trail') || i.includes('image') || i.includes('link') || i.includes('lang')))
})
test('采集:树段落逐句+坐标', () => {
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '第一句。第二句。' }] }] }
  const out = []
  collectTreeUnits(doc, 'overview', out)
  assert.equal(out.length, 2)
  assert.equal(out[0].id, 'overview:content[0]#0')
  assert.equal(out[1].text, '第二句。')
})
test('采集:标题/单元格/alt 整体一句', () => {
  const doc = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '标题有句点。仍一句' }] },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '起重量 5吨' }] }] }] }] },
    { type: 'image', attrs: { src: 'a.jpg', alt: '产品图' } },
  ] }
  const out = []
  collectTreeUnits(doc, 'sec', out)
  assert.deepEqual(out.map(u => u.kind), ['block', 'cell', 'alt'])
  assert.equal(out[0].text, '标题有句点。仍一句')
})
test('采集:产品页配置键不进翻译（family/geomBaseline）', () => {
  const j = { page: { slug: 'products/x', lang: 'zh-CN', title: '产品页', family: 'product@1', template: 'src/templates/product.html', geomBaseline: 'src/templates/product.html' }, title: '产品标题' }
  const ids = collectUnits(j).map(u => u.id)
  assert.deepEqual(ids.sort(), ['page.title', 'title'].sort())
})
test('采集:值形态排除各分支钉死', () => {
  const j = {
    avatar: '/assets/img/product/x.jpg',   // /assets/ 前缀
    doc: 'manual.pdf',                      // 文件名形态
    dead: '#',                              // 死链占位
    size: '2400x1600',                      // 尺寸串
    prose: '这是正经散文，必须进翻译。',
  }
  const ids = collectUnits(j).map(u => u.id)
  assert.deepEqual(ids, ['prose'])
})
test('采集:真实内容零垃圾单元', () => {
  // 全量 zh 页实测：采集结果不得含尺寸串/死链/配置键
  const dir = join(process.cwd(), 'content')
  const files = []
  for (const t of ['posts', 'products']) for (const f of readdirSync(join(dir, t))) if (f.endsWith('.json')) files.push(join(t, f))
  for (const f of files) {
    const units = collectUnits(JSON.parse(readFileSync(join(dir, f), 'utf8')))
    for (const u of units) {
      assert.ok(!/^\d+(\.\d+)?x\d+(\.\d+)?$/.test(u.text), `${f} 尺寸串漏排: ${u.id}`)
      assert.ok(u.text !== '#', `${f} 死链漏排: ${u.id}`)
      assert.ok(!/family|geomBaseline|breadcrumb\.trail/.test(u.id), `${f} 配置键漏排: ${u.id}`)
    }
  }
})
test('采集:多段单元格抛错不静默', () => {
  const doc = { type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '一' }] }, { type: 'paragraph', content: [{ type: 'text', text: '二' }] }] }] }] }] }
  assert.throws(() => collectTreeUnits(doc, 'sec', []), /多段单元格/)
})

// ---------- Task 4: 投影 ----------
const SRC = () => ({
  version: '1',
  page: { slug: 'posts/x', type: 'post', lang: 'zh-CN', title: '页标题', description: '页描述', status: 'published' },
  title: '文章标题',
  breadcrumb: { current: '当前', trail: [{ label: '首页', url: 'https://x/' }] },
  overview: { title: '概述', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '第一句。第二句。' }] }] } },
  empty_sec: { title: '空段', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '没翻的句子。' }] }] } },
})
const tmWith = entries => { const tm = loadTm('zh-CN', 't1'); for (const e of entries) upsert(tm, fp(e.text), e); return tm }

test('投影:approved 模式 draft 句不出（核心已审则页可发）', () => {
  const tm = tmWith([
    { text: '页标题', translation: 'P', status: 'approved', origin: 'engine' },
    { text: '文章标题', translation: 'A', status: 'approved', origin: 'engine' },
    { text: '页描述', translation: 'D', status: 'approved', origin: 'engine' },
    { text: '当前', translation: 'C', status: 'approved', origin: 'engine' },
    { text: '第一句。', translation: 'First.', status: 'draft', origin: 'engine' }, // draft → 不出
  ])
  const j = projectPage(SRC(), tm, 'approved', { lang: 't1' })
  assert.ok(j)                          // 核心已审 → 页可发
  assert.equal(j.overview, undefined)   // overview 段标题未审 → 整段删
})
test('投影:核心字段未审 → null（不可发）', () => {
  const tm = tmWith([{ text: '第一句。', translation: 'First.', status: 'approved', origin: 'engine' }])
  assert.equal(projectPage(SRC(), tm, 'approved', { lang: 't1' }), null)
})
test('投影:approved 全齐 → 骨架≡源+译文+无注解 span', () => {
  const tm = tmWith([
    { text: '页标题', translation: 'Page T', status: 'approved', origin: 'engine' },
    { text: '文章标题', translation: 'Article T', status: 'approved', origin: 'engine' },
    { text: '页描述', translation: 'Desc', status: 'approved', origin: 'engine' },
    { text: '当前', translation: 'Current', status: 'approved', origin: 'engine' },
    { text: '概述', translation: 'Overview', status: 'approved', origin: 'engine' },
    { text: '第一句。', translation: 'First.', status: 'approved', origin: 'engine' },
    // '第二句。' 与 '空段' 段未审
  ])
  const j = projectPage(SRC(), tm, 'approved', { lang: 't1' })
  assert.ok(j)
  const para = j.overview.body.content[0]
  assert.equal(para.content.map(n => n.text).join(''), 'First.')       // 第二句被剔除
  assert.equal(j.empty_sec, undefined)                                  // 整段无一句已审 → 段删
  assert.equal(j.breadcrumb.trail[0].label, '首页')                     // trail 不译不动
  assert.equal(JSON.stringify(j).includes(PENDING_CLASS), false)        // 生产无注解
  assert.equal(j.page.slug, 't1/posts/x')                               // 镜像 slug 前缀
})
test('投影:full 草稿/未译都出+带 pending 注解', () => {
  const tm = tmWith([{ text: '第一句。', translation: 'First draft.', status: 'draft', origin: 'engine' }])
  const j = projectPage(SRC(), tm, 'full', { lang: 't1' })
  const para = j.overview.body.content[0]
  assert.equal(para.content.map(n => n.text).join(''), 'First draft. 第二句。') // 草稿+中文占位（句间空格 = C1 合成半：预览与生产同形）
  const spans = para.content.flatMap(n => (n.marks ?? []).filter(m => m.type === 'span' && m.attrs?.class === PENDING_CLASS))
  assert.ok(spans.length >= 2)                                          // 草稿句与未译句都标 pending
})
test('投影:full 保 mirror 现有 status', () => {
  const tm = tmWith([])
  const j = projectPage(SRC(), tm, 'full', { lang: 't1', existingStatus: 'published' })
  assert.equal(j.page.status, 'published')
  assert.equal(j.page.lang, 't1')
})
test('投影:approved 数组空壳项剔除', () => {
  const src = { ...SRC(), faq: [{ q: '问题一', a: '答案一' }, { q: '问题二', a: '答案二' }] }
  const tm = tmWith([
    { text: '页标题', translation: 'P', status: 'approved', origin: 'engine' },
    { text: '文章标题', translation: 'A', status: 'approved', origin: 'engine' },
    { text: '页描述', translation: 'D', status: 'approved', origin: 'engine' },
    { text: '当前', translation: 'C', status: 'approved', origin: 'engine' },
    { text: '问题一', translation: 'Q1', status: 'approved', origin: 'engine' },
    { text: '答案一', translation: 'A1', status: 'approved', origin: 'engine' },
  ])
  const j = projectPage(src, tm, 'approved', { lang: 't1' })
  assert.deepEqual(j.faq, [{ q: 'Q1', a: 'A1' }]) // 第二项全未审 → 剔除而非空壳
})
test('投影:字符串数组项走 TM（approved 不漏中文）', () => {
  const src = { ...SRC(), hero: { highlights: ['卖点一', '卖点二'] } }
  const tm = tmWith([
    { text: '页标题', translation: 'P', status: 'approved', origin: 'engine' },
    { text: '文章标题', translation: 'A', status: 'approved', origin: 'engine' },
    { text: '页描述', translation: 'D', status: 'approved', origin: 'engine' },
    { text: '当前', translation: 'C', status: 'approved', origin: 'engine' },
    { text: '卖点一', translation: 'Point One', status: 'approved', origin: 'engine' },
  ])
  const j = projectPage(src, tm, 'approved', { lang: 't1' })
  assert.deepEqual(j.hero.highlights, ['Point One']) // 卖点二未审 → 剔除而非漏中文
})
test('投影:句间空格保留（英文必须）', () => {
  const src = SRC(); src.overview.body.content[0].content[0].text = '第一句。 第二句。'
  const tm = tmWith([
    { text: '页标题', translation: 'P', status: 'approved', origin: 'engine' },
    { text: '文章标题', translation: 'A', status: 'approved', origin: 'engine' },
    { text: '页描述', translation: 'D', status: 'approved', origin: 'engine' },
    { text: '当前', translation: 'C', status: 'approved', origin: 'engine' },
    { text: '概述', translation: 'O', status: 'approved', origin: 'engine' },
    { text: '第一句。', translation: 'First.', status: 'approved', origin: 'engine' },
    { text: '第二句。', translation: 'Second.', status: 'approved', origin: 'engine' },
  ])
  const j = projectPage(src, tm, 'approved', { lang: 't1' })
  assert.equal(j.overview.body.content[0].content.map(n => n.text).join(''), 'First. Second.')
})
test('投影:hardBreak 保留', () => {
  const src = SRC(); src.overview.body.content[0].content = [{ type: 'text', text: '起重量：3吨' }, { type: 'hardBreak' }, { type: 'text', text: '跨度：7.5米' }]
  const tm = tmWith([
    { text: '页标题', translation: 'P', status: 'approved', origin: 'engine' },
    { text: '文章标题', translation: 'A', status: 'approved', origin: 'engine' },
    { text: '页描述', translation: 'D', status: 'approved', origin: 'engine' },
    { text: '当前', translation: 'C', status: 'approved', origin: 'engine' },
    { text: '概述', translation: 'O', status: 'approved', origin: 'engine' },
    { text: '起重量：3吨', translation: 'Capacity: 3t', status: 'approved', origin: 'engine' },
    { text: '跨度：7.5米', translation: 'Span: 7.5m', status: 'approved', origin: 'engine' },
  ])
  const j = projectPage(src, tm, 'approved', { lang: 't1' })
  const c = j.overview.body.content[0].content
  assert.ok(c.some(n => n.type === 'hardBreak'))
  assert.equal(c.map(n => n.type === 'hardBreak' ? '\n' : n.text).join(''), 'Capacity: 3t\nSpan: 7.5m')
})
test('投影:approved 未审句删除无残留', () => {
  const src = SRC(); src.overview.body.content[0].content[0].text = '第一句。 第二句。'
  const tm = tmWith([
    { text: '页标题', translation: 'P', status: 'approved', origin: 'engine' },
    { text: '文章标题', translation: 'A', status: 'approved', origin: 'engine' },
    { text: '页描述', translation: 'D', status: 'approved', origin: 'engine' },
    { text: '当前', translation: 'C', status: 'approved', origin: 'engine' },
    { text: '概述', translation: 'O', status: 'approved', origin: 'engine' },
    { text: '第二句。', translation: 'Second.', status: 'approved', origin: 'engine' },
  ])
  const j = projectPage(src, tm, 'approved', { lang: 't1' })
  assert.equal(j.overview.body.content[0].content.map(n => n.text).join('').trim(), 'Second.')
})
test('投影:源无分隔符→合成英文空格', () => {
  const src = SRC() // '第一句。第二句。' 源无空格
  const tm = tmWith([
    { text: '页标题', translation: 'P', status: 'approved', origin: 'engine' },
    { text: '文章标题', translation: 'A', status: 'approved', origin: 'engine' },
    { text: '页描述', translation: 'D', status: 'approved', origin: 'engine' },
    { text: '当前', translation: 'C', status: 'approved', origin: 'engine' },
    { text: '概述', translation: 'O', status: 'approved', origin: 'engine' },
    { text: '第一句。', translation: 'First.', status: 'approved', origin: 'engine' },
    { text: '第二句。', translation: 'Second.', status: 'approved', origin: 'engine' },
  ])
  const j = projectPage(src, tm, 'approved', { lang: 't1' })
  assert.equal(j.overview.body.content[0].content.map(n => n.text).join(''), 'First. Second.')
})
test('投影:删句不留段首悬空 hardBreak', () => {
  const src = SRC(); src.overview.body.content[0].content = [{ type: 'text', text: '起重量：3吨' }, { type: 'hardBreak' }, { type: 'text', text: '跨度：7.5米' }]
  const tm = tmWith([
    { text: '页标题', translation: 'P', status: 'approved', origin: 'engine' },
    { text: '文章标题', translation: 'A', status: 'approved', origin: 'engine' },
    { text: '页描述', translation: 'D', status: 'approved', origin: 'engine' },
    { text: '当前', translation: 'C', status: 'approved', origin: 'engine' },
    { text: '概述', translation: 'O', status: 'approved', origin: 'engine' },
    { text: '跨度：7.5米', translation: 'Span: 7.5m', status: 'approved', origin: 'engine' }, // 首句未审
  ])
  const j = projectPage(src, tm, 'approved', { lang: 't1' })
  const c = j.overview.body.content[0].content
  assert.equal(c[0].type, 'text')
  assert.equal(c.map(n => n.type === 'hardBreak' ? '\n' : n.text).join(''), 'Span: 7.5m')
})

// ---------- Task 5: 术语表 JSON ----------
test('术语:JSON 加载+相关选料', () => {
  const t = loadTerms('zh-CN', 'en')
  assert.ok(Array.isArray(t.lock) && typeof t.map === 'object')
  const r = relevantTerms(t, '这台桥式起重机起重量5吨，HD 型')
  assert.equal(r.map['桥式起重机'], 'Overhead Crane')
  assert.ok(r.lock.includes('HD'))
})
test('术语:hasToken 词边界（CD 不误伤 LDC）', () => {
  assert.ok(hasToken('HD 型', 'HD'))
  assert.ok(!hasToken('LDC 型', 'CD'))
})
test('术语:saveTerms 校验拒收空值/重复', () => {
  const f = join(process.cwd(), 'src', 'i18n', 'terms.t-a.t-b.json')
  try {
    assert.throws(() => saveTerms('t-a', 't-b', { lock: ['HD', 'HD'], map: {} }), /重复/)
    assert.throws(() => saveTerms('t-a', 't-b', { lock: [' '], map: {} }), /空/)
    assert.throws(() => saveTerms('t-a', 't-b', { lock: [], map: { '桥式起重机': ' ' } }), /空/)
    assert.ok(!existsSync(f)) // 拒收不落盘
    saveTerms('t-a', 't-b', { lock: [' HD '], map: { ' 桥式起重机': 'Overhead Crane ' } }) // 空白归一后落盘
    const t = loadTerms('t-a', 't-b')
    assert.deepEqual(t.lock, ['HD'])
    assert.equal(t.map['桥式起重机'], 'Overhead Crane')
  } finally {
    if (existsSync(f)) rmSync(f) // 成败都清理
  }
})

// ---------- Task 6: 机器验收 ----------
const TERMS = { lock: ['HD', 'Schneider'], map: { 桥式起重机: 'Overhead Crane', 起重量: 'Lifting Capacity' } }

test('验收:全过', () => {
  const r = checkSentence('HD 桥式起重机起重量为3吨，跨度7.5米', 'HD Overhead Crane, Lifting Capacity 3 tons, span 7.5m', TERMS)
  assert.equal(r.ok, true)
})
test('验收:锁词丢→打回', () => {
  assert.equal(checkSentence('HD 型', 'High Definition type', TERMS).fails.join(','), 'lock:HD')
})
test('验收:固定译法错/中文残留→打回', () => {
  assert.ok(checkSentence('桥式起重机', 'bridge crane', TERMS).fails.some(f => f.startsWith('map-missing')))
  assert.ok(checkSentence('桥式起重机', 'Overhead Crane 桥式起重机', TERMS).fails.some(f => f.startsWith('map-residual')))
})
test('验收:数字丢→打回', () => {
  assert.ok(checkSentence('3吨 7.5米', '3 tons', TERMS).fails.includes('number:7.5'))
})
test('验收:URL 尾跟中文标点不误报', () => {
  const r = checkSentence('详见 https://dgcrane.com/x。谢谢', 'See https://dgcrane.com/x. Thanks', { lock: [], map: {} })
  assert.equal(r.ok, true)
})
test('验收:覆盖率不齐', () => {
  const r = checkCoverage(['a', 'b', 'c'], { a: 'A', c: 'C' })
  assert.deepEqual(r.missing, ['b'])
})
test('验收:map 表层归一（小写行文不误报）', () => {
  const r = checkSentence('单梁桥式起重机制造商', 'single girder overhead crane manufacturer', TERMS)
  assert.equal(r.ok, true)
})
test('验收:非 map 中文残留打回（第六道）', () => {
  const r = checkSentence('广泛应用于机械加工', 'widely used in 机械加工', { lock: [], map: {} })
  assert.ok(r.fails.includes('cjk-residual'))
})
test('验收:中文日期英译不误报', () => {
  assert.equal(checkSentence('2024年5月发货', 'shipped in May 2024', { lock: [], map: {} }).ok, true)
})
test('验收:千分位归一不误报', () => {
  assert.equal(checkSentence('帮助10,000+客户', 'helped 10000+ clients', { lock: [], map: {} }).ok, true)
})
test('验收:URL 丢失打回（正向）', () => {
  assert.ok(checkSentence('见 https://dgcrane.com/x 详情', 'see details', { lock: [], map: {} }).fails.some(f => f.startsWith('url:')))
})
test('验收:覆盖率畸形值不抛记 missing', () => {
  assert.deepEqual(checkCoverage(['a'], { a: 123 }).missing, ['a'])
})

// ---------- Task 7: 引擎层 ----------
{ // 裸块隔离：TERMS/SEGS 与 Task 6 的 TERMS 同模块去重（T5.1 节已有此前例）
const TERMS = { lock: ['HD'], map: { 桥式起重机: 'Overhead Crane' } }
const SEGS = [
  { id: 'a#0', text: 'HD 桥式起重机。', before: null, after: '下一句。' },
  { id: 'a#1', text: '下一句。', before: 'HD 桥式起重机。', after: null },
]

test('引擎:正常翻译+术语提示词注入', async () => {
  let seenUser = ''
  const callAI = async messages => { // callAI 契约 = 返回解析后的 content 对象（与真 caller 一致）
    seenUser = messages[1].content
    return { translations: { 'a#0': 'HD Overhead Crane.', 'a#1': 'Next sentence.' } }
  }
  const r = await translateSegments(SEGS, TERMS, { callAI })
  assert.equal(r.ok['a#0'], 'HD Overhead Crane.')
  assert.ok(seenUser.includes('HD') && seenUser.includes('Overhead Crane')) // 术语进了提示词
})
test('引擎:机器验收打回→带原因重翻→成功', async () => {
  let calls = 0
  const callAI = async () => {
    calls++
    const good = calls >= 2
    return { translations: { 'a#0': good ? 'HD Overhead Crane.' : 'overhead crane.', 'a#1': 'Next.' } }
  }
  const r = await translateSegments(SEGS, TERMS, { callAI })
  assert.equal(calls, 2)
  assert.equal(r.ok['a#0'], 'HD Overhead Crane.')
})
test('引擎:屡败→failed 不静默；覆盖不齐→failed', async () => {
  const callAI = async () => ({ translations: { 'a#0': 'no lock word' } }) // a#1 缺+a#0 验收不过
  const r = await translateSegments(SEGS, TERMS, { callAI })
  assert.ok(r.fail['a#0']?.includes('lock:HD'))
  assert.ok(r.fail['a#1']?.includes('coverage'))
})
test('引擎:noRetry 快败不重试', async () => {
  let calls = 0
  const callAI = async () => { calls++; const e = new Error('401'); e.noRetry = true; throw e }
  const r = await translateSegments(SEGS, TERMS, { callAI })
  assert.equal(calls, 1)
  assert.ok(r.fail['a#0'])
})
test('引擎:重翻提示词带上轮拒收原因', async () => {
  const seen = []
  const callAI = async messages => {
    seen.push(messages[1].content)
    if (seen.length === 1) return { translations: { 'a#0': 'no lock', 'a#1': 'Next.' } } // a#0 首轮败
    return { translations: { 'a#0': 'HD Overhead Crane.' } }
  }
  const r = await translateSegments(SEGS, TERMS, { callAI })
  assert.ok(seen[1].includes('lock:HD')) // 第二轮提示词含上轮原因
  assert.equal(r.ok['a#0'], 'HD Overhead Crane.')
})
test('引擎:瞬时错误→下轮成功→fail 清账', async () => {
  let calls = 0
  const callAI = async () => {
    if (++calls === 1) throw new Error('HTTP 500') // 可重试瞬时错
    return { translations: { 'a#0': 'HD Overhead Crane.', 'a#1': 'Next.' } }
  }
  const r = await translateSegments(SEGS, TERMS, { callAI })
  assert.equal(calls, 2)
  assert.equal(r.fail['a#0'], undefined) // 成功后清账
})
}

// ---------- 汇总（勿动） ----------
let pass = 0
for (const [name, fn] of cases) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`) }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`) }
}
console.log(`\naccept-i18n2: ${pass}/${cases.length}`)
process.exit(pass === cases.length ? 0 : 1)
