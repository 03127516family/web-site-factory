#!/usr/bin/env node
// DeepSeek 烧制台验收（无 key 全链 mock；真 key 验收为手动步骤，见计划 Task 9）。
// 惯例同 accept-poc5/f3：ok() 累计，结尾非零退出。
import { readFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(SITE, '../src/content/raw/overhead-cranes-for-sale.txt')
const results = []
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`) }

const lib = await import('../src/burn-lib.mjs')

// ---------- T1 原文切块编号 / 图清单 / 剥壳 ----------
{
  const blocks = lib.numberBlocks('甲段\n\n乙段\n\n\n丙段\n')
  ok('numberBlocks 按空行切块并编号', blocks.length === 3 && blocks[0].n === 1 && blocks[2].n === 3 && blocks[2].text === '丙段')

  const raw = readFileSync(RAW, 'utf8')
  const rb = lib.numberBlocks(raw)
  ok('numberBlocks 吃真实裸文章', rb.length > 30 && rb.every((b, i) => b.n === i + 1), `${rb.length} 块`)

  const imgs = lib.extractImages(raw)
  ok('extractImages 提取配图标记', imgs.length >= 5 && imgs.some(i => i.name === 'cross-girder3.jpg' && i.caption === '横梁'), `${imgs.length} 张`)

  const { text, images } = lib.stripHtml('<html><head><style>x{}</style><script>y()</script></head><body><nav>菜单</nav><main><p>第一段</p><p>第二段 <img src="/wp-content/uploads/ab-c.jpg"></p></main><footer>脚</footer></body></html>')
  ok('stripHtml 去脚本样式导航页脚、留正文、收图', text.includes('第一段') && text.includes('第二段') && !text.includes('菜单') && !text.includes('脚') && !text.includes('y()') && images.includes('ab-c.jpg'))
}

// ---------- T2 字段目录 / 规划表硬查 ----------
{
  const blocks = lib.numberBlocks(readFileSync(RAW, 'utf8'))
  const catalog = lib.loadCatalog(
    join(SITE, 'src/components/ProductPage.astro'),
    join(SITE, 'content/products/single-girder-eot-cranes.json'))
  const keys = catalog.map(c => c.key)
  for (const k of ['overview', 'introduction', 'advantages', 'protection', 'specs', 'hero.headline', 'page.description'])
    ok(`目录含 ${k} 且已核验`, keys.includes(k) && catalog.find(c => c.key === k).verified)

  const good = { fields: [
    { field: 'hero.headline', blocks: [1] },
    { field: 'overview', blocks: [2] },
    { field: 'specs', blocks: [3] },
    { field: 'introduction', blocks: [6] },
  ] }
  const r1 = lib.checkPlan(good, blocks)
  ok('合法规划表零 error', r1.errors.length === 0, r1.errors[0])

  const bad = { fields: [
    { field: 'overview', blocks: [2, 3] },
    { field: 'specs', blocks: [3, 4] },            // 重叠
    { field: 'no_such_field', blocks: [5] },       // 未知字段
    { field: 'introduction', blocks: [1, 9999] },  // 越界 + 顺序在 overview 前（非单调）
  ] }
  const r2 = lib.checkPlan(bad, blocks)
  const msg = r2.errors.join(';')
  ok('重叠被抓', /重叠/.test(msg))
  ok('未知字段被抓', /未知字段/.test(msg))
  ok('块号越界被抓', /越界/.test(msg))
  ok('非单调被抓', /单调|顺序/.test(msg))
  ok('未覆盖块进 uncovered', r2.uncovered.length > 0 && r2.uncovered.includes(7))

  const noDigit = { fields: [{ field: 'specs', blocks: [2] }] } // 块2是纯散文无数字
  const r3 = lib.checkPlan(noDigit, blocks)
  ok('specs 映射无数字块被打回', r3.errors.some(e => /数字/.test(e)), r3.errors[0])
}

// ---------- T2.1 checkPlan 边界加固（质量审查 Important 修复的回归钉） ----------
{
  const blocks = lib.numberBlocks(readFileSync(RAW, 'utf8'))
  const r1 = lib.checkPlan(null, blocks)
  ok('null 规划不崩且报结构非法', r1.errors.length > 0 && /结构非法/.test(r1.errors[0]))
  const r2 = lib.checkPlan({ fields: [] }, blocks)
  ok('空 fields 报错', r2.errors.some(e => /为空/.test(e)))
  const r3 = lib.checkPlan({ fields: [null, { field: 'overview', blocks: [2] }] }, blocks)
  ok('null 条目报错跳过不崩', r3.errors.some(e => /不是对象/.test(e)))
  const r4 = lib.checkPlan({ fields: [{ field: 'overview', blocks: [2, 'x'] }, { field: 'introduction', blocks: [1] }] }, blocks)
  ok('脏值不污染单调判定（该抓还抓）', r4.errors.some(e => /越界/.test(e)) && r4.errors.some(e => /单调|顺序/.test(e)))
  const r5 = lib.checkPlan({ fields: [{ field: 'overview', blocks: [9999] }, { field: 'introduction', blocks: [2] }] }, blocks)
  ok('越界高值不冤枉后续字段', r5.errors.some(e => /越界/.test(e)) && !r5.errors.some(e => /单调|顺序/.test(e)))
}

// ---------- T3 规范化 / 相似度 / 溯源 ----------
{
  ok('normalizeText 全角半角空白归一', lib.normalizeText('容量： ３．２-80吨　IP54') === '容量:3.2-80吨ip54')

  const slice = '欧式桥式起重机广泛用于机械制造、石油、石化等行业的车间和仓库。容量 3.2-80吨，跨度 4-31.5米。'
  const goodTree = lib.mdToDoc('广泛用于机械制造、石油、石化等行业的车间和仓库。\n\n- 容量 3.2-80吨\n- 跨度 4-31.5米')
  const v1 = lib.verifyTree(goodTree, slice)
  ok('逐字树通过', v1.ok, v1.failures[0])

  const badTree = lib.mdToDoc('起重能力 100 吨，全球最大。') // 编造：原文没有
  const v2 = lib.verifyTree(badTree, slice)
  ok('凑字段树被溯源拒收', !v2.ok && v2.failures.length === 1, v2.failures[0])

  ok('similarity 近义高分（纯 Dice）', lib.similarity('欧式桥式起重机', '欧式桥式起重机！') >= 0.9)
  ok('similarity 相异低分', lib.similarity('欧式桥式起重机', '门式起重机参数表') < 0.9)

  ok('similarToAny 包含即中', lib.similarToAny('主要参数', ['概述', '主要参数：', '简介'], 0.8))
  ok('similarToAny 完全一致', lib.similarToAny('概述', ['概述', '主要参数：'], 0.9))
  ok('similarToAny 不命中', !lib.similarToAny('企业实力展示', ['概述', '主要参数：'], 0.8))
}

// ---------- T3.1 审查补钉：schema 拒收路径 + 表格块溯源 ----------
{
  let threw = false
  try { lib.verifyTree({ type: 'doc', content: [{ type: 'bogus' }] }, '任何原文') } catch (e) { threw = /schema 拒收/.test(e.message) }
  ok('verifyTree 畸形树先过 schema 拒收', threw)
  const tbl = lib.mdToDoc('| 容量 | 跨度 |\n| --- | --- |\n| 3.2-80吨 | 4-31.5米 |')
  const v = lib.verifyTree(tbl, '容量 3.2-80吨，跨度 4-31.5米。')
  ok('表格树逐单元格溯源通过', v.ok, v.failures[0])
}

// ---------- T4 组装 / 预览 ----------
{
  const sectionResults = [
    { key: 'overview', shape: 'section', data: { title: '概述', body_md: '欧式桥式起重机广泛用于机械制造、石油、石化等行业。' } },
    { key: 'specs', shape: 'list', data: { items: ['容量 3.2-80吨', '跨度长度 4-31.5米'] } },
    { key: 'hero.headline', shape: 'text', data: { text: '欧式桥式起重机' } },
    { key: 'page.description', shape: 'seo', data: { text: '欧式桥式起重机制造商，3.2-80吨，出口经验丰富。' } },
  ]
  const j = await lib.assemble({
    slug: 'overhead-cranes-for-sale-burn', productName: '欧式桥式起重机',
    sectionResults, imagePool: [{ caption: '横梁', name: 'cross-girder3.jpg' }],
  })
  ok('组装 page 骨架', j.page.slug === 'products/overhead-cranes-for-sale-burn' && j.page.status === 'draft' && j.page.family === 'product@1' && j.page.type === 'product')
  ok('page.title 站级拼法', j.page.title === '欧式桥式起重机 - DGCRANE')
  ok('chrome 站级默认', j.inquiry_form.form_id === 713 && j.breadcrumb.trail[0].label === '首页' && j.breadcrumb.current === '欧式桥式起重机')
  ok('section 落 title+树', j.overview.title === '概述' && j.overview.body.type === 'doc')
  ok('specs 落 [{text}]', j.specs.length === 2 && j.specs[0].text === '容量 3.2-80吨')
  ok('gallery 吃图池且带 alt', j.gallery[0].image === 'cross-girder3.jpg' && j.gallery[0].alt === '横梁')
  ok('summary.cta 站级默认', j.summary.cta === '报价要求')
  ok('version=1 且无杂键', j.version === 1 && !('_notes' in j))

  const html = lib.previewHtml(j)
  ok('预览含标题/正文/规格/图', html.includes('欧式桥式起重机') && html.includes('机械制造') && html.includes('3.2-80吨') && html.includes('cross-girder3.jpg'))
}

// ---------- T4.1 审查修复钉：渲染器无守卫字段的站级默认 ----------
{
  const j2 = await lib.assemble({ slug: 'bare', productName: '裸烧测试', sectionResults: [], imagePool: [] })
  ok('specs 默认空数组不炸渲染器', Array.isArray(j2.specs) && j2.specs.length === 0)
  ok('hero.highlights 默认空数组', Array.isArray(j2.hero.highlights))
  ok('related_products 站级默认', j2.related_products?.type === 'related-products' && Array.isArray(j2.related_products.seed))
  const j3 = await lib.assemble({ slug: 'inst', productName: '安装段测试', sectionResults: [
    { key: 'installation', shape: 'section', data: { title: '安装', body_md: '按图纸安装。' } },
  ], imagePool: [] })
  ok('installation 自动补 cases 空数组', Array.isArray(j3.installation.cases))
  let dropped = false
  try { await lib.assemble({ slug: 'x', productName: 'x', sectionResults: [{ key: 'mystery', shape: 'weird', data: { text: 'x' } }], imagePool: [] }) } catch (e) { dropped = /未处理/.test(e.message) }
  ok('未知字段/shape 组装即炸不静默丢', dropped)
}

// ---------- T5 burn() 编排（注入假 callAI，无 key 全链） ----------
{
  const burner = await import('./deepseek-burn.mjs')
  const raw = readFileSync(RAW, 'utf8')
  const blocks = lib.numberBlocks(raw)

  // 假 DeepSeek：规划按出现顺序；值从原文切片取（天然逐字）；标题用产品名（规则允许）
  const fake = async (messages, tag) => {
    if (tag === 'plan') return { fields: [{ field: 'hero.headline', blocks: [1] }, { field: 'overview', blocks: [2] }, { field: 'specs', blocks: [3] }] }
    if (tag === 'overview') return { title: '欧式桥式起重机', body_md: blocks[1].text.split('。').slice(0, 2).join('。') + '。' }
    if (tag === 'specs') return { items: ['容量 3.2-80吨', '跨度长度 4-31.5米'] }
    if (tag === 'hero.headline') return { text: '欧式桥式起重机' }
    throw new Error('假 caller 未覆盖: ' + tag)
  }
  const { json: j, report } = await burner.burn(
    { text: raw, slug: 't5-smoke', productName: '欧式桥式起重机' },
    { callAI: fake })
  ok('burn 返回整页 JSON', j.page.slug === 'products/t5-smoke' && j.overview?.body?.type === 'doc' && j.specs?.length === 2)
  ok('report 三段全 ok', report.sections.every(s => s.status === 'ok'), report.sections.map(s => `${s.key}:${s.status}`).join(','))
  ok('report 携带未覆盖块清单', Array.isArray(report.uncovered) && report.uncovered.length > 0)

  // 假 caller 先凑字段、被退货后修好：验证段级重修循环
  let calls = 0
  let sawRepair = false
  const liarThenFix = async (messages, tag) => {
    if (tag === 'plan') return { fields: [{ field: 'overview', blocks: [2] }] }
    calls++
    if (messages.at(-1).content.includes('溯源拒收')) sawRepair = true
    if (calls === 1) return { title: '欧式桥式起重机', body_md: '本公司成立于 1990 年，是全球最大的起重机制造商。' } // 编造
    return { title: '欧式桥式起重机', body_md: blocks[1].text }
  }
  const r2 = await burner.burn({ text: raw, slug: 't5-repair', productName: '欧式桥式起重机' }, { callAI: liarThenFix })
  ok('凑字段触发重修且最终修复', r2.report.sections[0].status === 'repaired' && calls >= 2, `calls=${calls}`)
  ok('重修提示带了拒收原因', sawRepair)

  // 屡教不改：段标 failed 且缺席，不静默出货
  const alwaysLiar = async (messages, tag) => tag === 'plan'
    ? { fields: [{ field: 'overview', blocks: [2] }] }
    : { title: '欧式桥式起重机', body_md: '纯属编造的内容，原文绝对没有这句话。' }
  const r3 = await burner.burn({ text: raw, slug: 't5-fail', productName: '欧式桥式起重机' }, { callAI: alwaysLiar })
  ok('屡教不改段 failed 且 JSON 中缺席', r3.report.sections[0].status === 'failed' && r3.json.overview === undefined)
  ok('failed 段进 notes 提示', r3.report.notes.some(n => /烧败|缺席|标红/.test(n)))
}

// ---------- T5.1 审查修复钉：降级/快败/重复字段/items 守卫/seo 标出/writeDraft ----------
{
  const burner = await import('./deepseek-burn.mjs')
  const raw = readFileSync(RAW, 'utf8')
  const blocks = lib.numberBlocks(raw)

  // 段级硬失败降级 failed，不拖垮整次
  const hardFail = async (messages, tag) => {
    if (tag === 'plan') return { fields: [{ field: 'overview', blocks: [2] }, { field: 'specs', blocks: [3] }] }
    if (tag === 'overview') throw new Error('网络超时（模拟）')
    if (tag === 'specs') return { items: ['容量 3.2-80吨'] }
    throw new Error('未覆盖 ' + tag)
  }
  const r = await burner.burn({ text: raw, slug: 't51-degrade', productName: '欧式桥式起重机' }, { callAI: hardFail })
  const ov = r.report.sections.find(s => s.key === 'overview')
  const sp = r.report.sections.find(s => s.key === 'specs')
  ok('段级硬失败降级 failed 不整次崩', ov.status === 'failed' && /调用失败/.test(ov.issues[0] ?? '') && sp.status === 'ok' && r.json.overview === undefined && r.json.specs.length === 1)

  // 4xx 快败 / 5xx 重试满 / 截断快败（mock 全局 fetch，backoffMs:1 不等真秒）
  const origFetch = globalThis.fetch
  let c1 = 0
  globalThis.fetch = async () => { c1++; return new Response('{"error":"bad key"}', { status: 401 }) }
  let m1 = ''
  try { await burner.createDeepseekCaller({ apiKey: 'fake', backoffMs: 1 })([], 't') } catch (e) { m1 = e.message }
  globalThis.fetch = origFetch
  ok('401 不重试快速失败', c1 === 1 && /401/.test(m1), `calls=${c1}`)

  let c5 = 0
  globalThis.fetch = async () => { c5++; return new Response('err', { status: 500 }) }
  let m5 = ''
  try { await burner.createDeepseekCaller({ apiKey: 'fake', backoffMs: 1 })([], 't') } catch (e) { m5 = e.message }
  globalThis.fetch = origFetch
  ok('5xx 重试满 3 次', c5 === 3 && /重试 2 次/.test(m5), `calls=${c5}`)

  let cL = 0
  globalThis.fetch = async () => { cL++; return new Response(JSON.stringify({ choices: [{ message: { content: '{"a":' }, finish_reason: 'length' }] }), { status: 200 }) }
  let mL = ''
  try { await burner.createDeepseekCaller({ apiKey: 'fake', backoffMs: 1 })([], 't') } catch (e) { mL = e.message }
  globalThis.fetch = origFetch
  ok('max_tokens 截断不重试报段太长', cL === 1 && /截断/.test(mL), `calls=${cL}`)

  // 同字段多条目：合并（不重叠）/ 仍抓（重叠）
  const dup = lib.checkPlan({ fields: [{ field: 'overview', blocks: [2] }, { field: 'overview', blocks: [5] }] }, blocks)
  ok('同字段多条目合并并记录', dup.errors.length === 0 && dup.merged?.includes('overview'), JSON.stringify(dup.merged))
  const dupBad = lib.checkPlan({ fields: [{ field: 'overview', blocks: [2] }, { field: 'overview', blocks: [2, 3] }] }, blocks)
  ok('同字段块重叠仍被抓', dupBad.errors.some(e => /重叠/.test(e)))

  // items 类型/空守卫（verifyByShape 已 named export）
  const specList = { key: 'specs', shape: 'list', level: 'verbatim' }
  ok('list 空条目被拒', burner.verifyByShape(specList, { items: ['容量 3.2-80吨', ''] }, '容量 3.2-80吨', '名', blocks, [3]) !== null)
  ok('list 非字符串条目被拒', burner.verifyByShape(specList, { items: [5] }, '容量 5 吨', '名', blocks, [3]) !== null)

  // seo 概括字段进 notes 标出
  const withSeo = async (messages, tag) => {
    if (tag === 'plan') return { fields: [{ field: 'page.description', blocks: [2] }] }
    if (tag === 'page.description') return { text: 'AI 概括的描述。' }
    throw new Error('未覆盖 ' + tag)
  }
  const r4 = await burner.burn({ text: raw, slug: 't51-seo', productName: '欧式桥式起重机' }, { callAI: withSeo })
  ok('seo 字段烧出后进 notes 标出', r4.json.page.description === 'AI 概括的描述。' && r4.report.notes.some(n => /概括|豁免|人工/.test(n)))

  // writeDraft：撞名序号 / 强制 draft / 非法 slug（try/finally 保证清理，钉炸了也不留毒草稿）
  const jx = await lib.assemble({ slug: 'wd-test', productName: '写回测试', sectionResults: [], imagePool: [] })
  const f1 = burner.writeDraft(jx, 'wd-test')
  const jx2 = await lib.assemble({ slug: 'wd-test', productName: '写回测试2', sectionResults: [], imagePool: [] })
  const f2 = burner.writeDraft(jx2, 'wd-test')
  const p1 = join(SITE, 'content/products', f1 + '.json')
  const p2 = join(SITE, 'content/products', f2 + '.json')
  try {
    ok('writeDraft 撞名加序号', f1 === 'wd-test' && f2 === 'wd-test-2' && existsSync(p1) && existsSync(p2))
    ok('writeDraft 强制 draft', JSON.parse(readFileSync(p1, 'utf8')).page.status === 'draft')
    let badSlug = false
    try { burner.writeDraft(jx, '坏 slug!') } catch { badSlug = true }
    ok('writeDraft 非法 slug 拒收', badSlug)
  } finally { rmSync(p1, { force: true }); rmSync(p2, { force: true }) }
}

// ---------- T8.5 终审补丁钉 ----------
{
  const burner = await import('./deepseek-burn.mjs')
  ok('plan 提示词含 few-shot 示例', burner.planMessages('[1] 甲', ['overview']).at(-1).content.includes('示例'))
  ok('section 提示词含示例输出', burner.sectionMessages('overview', 'section', '原文', '名').at(-1).content.includes('示例输出'))
  const dup = lib.extractImages('（配图：一 a.jpg）\n\n（配图：一 a.jpg）\n\n（配图：二 b.jpg）')
  ok('extractImages 按名去重', dup.length === 2 && dup[0].name === 'a.jpg' && dup[1].name === 'b.jpg')
}

// ---------- T-merge 闭环钉：阶段 2 消费合并后字段 ----------
{
  const burner = await import('./deepseek-burn.mjs')
  const raw = readFileSync(RAW, 'utf8')
  const blocks = lib.numberBlocks(raw)
  let overviewCalls = 0
  const counting = async (messages, tag) => {
    if (tag === 'plan') return { fields: [{ field: 'overview', blocks: [2] }, { field: 'overview', blocks: [5] }] }
    if (tag === 'overview') { overviewCalls++; return { title: '欧式桥式起重机', body_md: blocks[1].text + '\n\n' + blocks[4].text } }
    throw new Error('未覆盖 ' + tag)
  }
  const r5 = await burner.burn({ text: raw, slug: 't-merge', productName: '欧式桥式起重机' }, { callAI: counting })
  ok('同字段多条目只烧一次', overviewCalls === 1 && r5.report.sections.filter(s => s.key === 'overview').length === 1, `calls=${overviewCalls}`)
  ok('合并事件进 notes', r5.report.notes.some(n => /合并/.test(n)))
  ok('合并后内容齐全（两块正文都在）', r5.json.overview.body && lib.verifyTree(r5.json.overview.body, blocks[1].text + '\n' + blocks[4].text).ok)
}

// ---------- 汇总 ----------
const fails = results.filter(r => !r.pass)
console.log(`\n${results.length - fails.length}/${results.length} 通过`)
if (fails.length) { console.log('失败:', fails.map(f => f.name).join(' | ')); process.exit(1) }
