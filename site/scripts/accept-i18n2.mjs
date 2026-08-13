#!/usr/bin/env node
// accept-i18n2：翻译块重设计全链验收（引擎 mock，无 key 全绿）。
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { rmSync, readFileSync, readdirSync } from 'node:fs'
import { loadTm, saveTm, upsert, loadConfig, saveConfig } from '../src/i18n-tm.mjs'
import { collectUnits, collectTreeUnits } from '../src/i18n-collect.mjs'
import { projectPage, PENDING_CLASS } from '../src/i18n-project.mjs'
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

// ---------- 汇总（勿动） ----------
let pass = 0
for (const [name, fn] of cases) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`) }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`) }
}
console.log(`\naccept-i18n2: ${pass}/${cases.length}`)
process.exit(pass === cases.length ? 0 : 1)
