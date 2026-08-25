#!/usr/bin/env node
// DeepSeek 烧制台验收（无 key 全链 mock；真 key 验收为手动步骤，见计划 Task 9）。
// 惯例同 accept-poc5/f3：ok() 累计，结尾非零退出。
import { readFileSync, existsSync, rmSync, writeFileSync, unlinkSync, mkdtempSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(SITE, '../src/content/raw/overhead-cranes-for-sale.txt')
const results = []
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`) }

const lib = await import('../src/burn-lib.mjs')

// 两族套件的 example（chrome 值真源；断言一律相对它，不写字面站名——引擎去站化钉）
const EX_PROD = JSON.parse(readFileSync(join(SITE, 'src/components/products/ProductPage/example.json'), 'utf8'))
const EX_POST = JSON.parse(readFileSync(join(SITE, 'src/components/posts/PostPage/example.json'), 'utf8'))

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

// ---------- T1 套件文件夹 ----------
{
  const kitDir = join(SITE, 'src/components/products/ProductPage')
  ok('套件 index.astro 在位', existsSync(join(kitDir, 'index.astro')))
  ok('套件 meta.json 在位', existsSync(join(kitDir, 'meta.json')))
  ok('套件 example.json 在位', existsSync(join(kitDir, 'example.json')))
  ok('套件 meta.md 在位', existsSync(join(kitDir, 'meta.md')))
  const ex = JSON.parse(readFileSync(join(kitDir, 'example.json'), 'utf8'))
  ok('example 是填好的产品 JSON（含 hero）', ex.hero && ex.page)
  const cat = lib.loadCatalog(
    join(kitDir, 'meta.json'), join(kitDir, 'index.astro'), join(kitDir, 'example.json'))
  ok('套件内双源核验过（16 字段全 verified）', cat.length === 16 && cat.every(c => c.verified))
}

// ---------- T-scan 套件扫描 ----------
{
  const kits = lib.scanKits(join(SITE, 'src/components'))
  const pp = kits.find(k => k.family === 'products' && k.name === 'ProductPage')
  ok('scanKits 扫到 products/ProductPage', !!pp)
  ok('ProductPage 套件 complete（齐三件）', pp && pp.complete)
  ok('scanKits 不收无 index.astro 的空文件夹', !kits.some(k => !k.hasAstro))
  const found = lib.findKit(join(SITE, 'src/components'), 'products', 'ProductPage')
  ok('findKit 返回套件目录', found && found.endsWith('products/ProductPage'))
  let threw = false
  try { lib.findKit(join(SITE, 'src/components'), 'products', '不存在') } catch { threw = true }
  ok('findKit 找不到抛错', threw)
}

// ---------- T-incomplete 不整套件拒收 ----------
{
  const tmp = mkdtempSync(join(tmpdir(), 'kits-'))
  try {
    mkdirSync(join(tmp, 'products', 'PartialPage'), { recursive: true })
    writeFileSync(join(tmp, 'products', 'PartialPage', 'index.astro'), '{}') // 只 astro，缺 meta+example
    const kits = lib.scanKits(tmp)
    const partial = kits.find(k => k.name === 'PartialPage')
    ok('scanKits 收到不整套件（complete=false）', partial && partial.complete === false)
    ok('不整套件正确标 hasAstro=true/hasMeta=false/hasExample=false',
      partial && partial.hasAstro && !partial.hasMeta && !partial.hasExample)
    let threw = false, msg = ''
    try { lib.findKit(tmp, 'products', 'PartialPage') } catch (e) { threw = true; msg = e.message }
    ok('findKit 不整套件抛错', threw)
    ok('抛错信息点名缺的文件（meta.json + example.json）',
      /套件不完整/.test(msg) && /meta\.json/.test(msg) && /example\.json/.test(msg))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// ---------- T2 字段目录 ----------
{
  const catalog = lib.loadCatalog(
    join(SITE, 'src/components/products/ProductPage/meta.json'),
    join(SITE, 'src/components/products/ProductPage/index.astro'),
    join(SITE, 'content/products/single-girder-eot-cranes.json'))
  const keys = catalog.map(c => c.key)
  for (const k of ['overview', 'introduction', 'advantages', 'protection', 'specs', 'hero.headline', 'page.description'])
    ok(`目录含 ${k} 且已核验`, keys.includes(k) && catalog.find(c => c.key === k).verified)

  const meta = lib.loadMeta(join(SITE, 'src/components/products/ProductPage/meta.json'))
  ok('loadMeta 返回 16 项', meta.length === 16, `${meta.length} 项`)
  ok('loadMeta 含 overview(section/verbatim)', meta.some(c => c.key === 'overview' && c.shape === 'section' && c.level === 'verbatim'))
  ok('loadMeta 含 page.description(seo/summary)', meta.some(c => c.key === 'page.description' && c.shape === 'seo' && c.level === 'summary'))
}

// ---------- loadMeta 异常分支 ----------
{
  const bad = join(SITE, '.tmp-bad-meta.json')
  writeFileSync(bad, '[{"key":"x","shape":"section"}]')
  let threw = false
  try { lib.loadMeta(bad) } catch { threw = true }
  ok('loadMeta 缺 level 抛错', threw)
  unlinkSync(bad)
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
    sectionResults, imagePool: [{ caption: '横梁', name: 'cross-girder3.jpg' }], example: EX_PROD,
  })
  ok('组装 page 骨架', j.page.slug === 'products/overhead-cranes-for-sale-burn' && j.page.status === 'draft' && j.page.family === EX_PROD.page.family && j.page.type === 'product')
  ok('page.title 后缀保真（example 机械替换）', j.page.title === EX_PROD.page.title.replace(EX_PROD.title, '欧式桥式起重机'))
  ok('chrome 值全自套件 example', j.inquiry_form.form_id === EX_PROD.inquiry_form.form_id
    && j.breadcrumb.trail.length === EX_PROD.breadcrumb.trail.length && j.breadcrumb.current === '欧式桥式起重机')
  ok('section 落 title+树', j.overview.title === '概述' && j.overview.body.type === 'doc')
  ok('specs 落 [{text}]', j.specs.length === 2 && j.specs[0].text === '容量 3.2-80吨')
  ok('gallery 吃图池且带 alt', j.gallery[0].image === 'cross-girder3.jpg' && j.gallery[0].alt === '横梁')
  ok('summary.cta 自 example 且 example 内容不泄入', j.summary.cta === EX_PROD.summary.cta && j.summary.intro === undefined)
  ok('related_products 壳自 example 且 seed 清空', j.related_products.title === EX_PROD.related_products.title && j.related_products.seed.length === 0)
  ok('version=1 且无杂键', j.version === 1 && !('_notes' in j))

  const catalog = lib.loadCatalog(
    join(SITE, 'src/components/products/ProductPage/meta.json'),
    join(SITE, 'src/components/products/ProductPage/index.astro'),
    join(SITE, 'content/products/single-girder-eot-cranes.json'))
  const html = lib.previewHtml(j, catalog)
  ok('预览含标题/正文/规格/图', html.includes('欧式桥式起重机') && html.includes('机械制造') && html.includes('3.2-80吨') && html.includes('cross-girder3.jpg'))
}

// ---------- T4.1 审查修复钉：渲染器无守卫字段的站级默认 ----------
{
  const j2 = await lib.assemble({ slug: 'bare', productName: '裸烧测试', sectionResults: [], imagePool: [], example: EX_PROD })
  ok('specs 默认空数组不炸渲染器', Array.isArray(j2.specs) && j2.specs.length === 0)
  ok('hero.highlights 默认空数组', Array.isArray(j2.hero.highlights))
  ok('related_products 站级默认', j2.related_products?.type === 'related-products' && Array.isArray(j2.related_products.seed))
  const j3 = await lib.assemble({ slug: 'inst', productName: '安装段测试', example: EX_PROD, sectionResults: [
    { key: 'installation', shape: 'section', data: { title: '安装', body_md: '按图纸安装。' } },
  ], imagePool: [] })
  ok('installation 自动补 cases 空数组', Array.isArray(j3.installation.cases))
  let dropped = false
  try { await lib.assemble({ slug: 'x', productName: 'x', sectionResults: [{ key: 'mystery', shape: 'weird', data: { text: 'x' } }], imagePool: [], example: EX_PROD }) } catch (e) { dropped = /未处理/.test(e.message) }
  ok('未知字段/shape 组装即炸不静默丢', dropped)
}

// ---------- T5.1 审查修复钉：快败/items 守卫/seo 标出/writeDraft ----------
{
  const burner = await import('./deepseek-burn.mjs')
  const raw = readFileSync(RAW, 'utf8')
  const blocks = lib.numberBlocks(raw)

  // 4xx 快败 / 5xx 重试满 / 截断快败（mock 全局 fetch，backoffMs:1 不等真秒）
  const origFetch = globalThis.fetch
  let c1 = 0
  globalThis.fetch = async () => { c1++; return new Response('{"error":"bad key"}', { status: 401 }) }
  let m1 = '', e1 = null
  try { await burner.createDeepseekCaller({ apiKey: 'fake', backoffMs: 1 })([], 't') } catch (e) { m1 = e.message; e1 = e }
  globalThis.fetch = origFetch
  ok('401 不重试快速失败', c1 === 1 && /401/.test(m1), `calls=${c1}`)
  ok('401 包装错误透传 noRetry 标志（外层快败用）', e1?.noRetry === true)

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

  // items 类型/空守卫（verifyByShape 已 named export）
  const specList = { key: 'specs', shape: 'list', level: 'verbatim' }
  ok('list 空条目被拒', burner.verifyByShape(specList, { items: ['容量 3.2-80吨', ''] }, '容量 3.2-80吨', '名', blocks) !== null)
  ok('list 非字符串条目被拒', burner.verifyByShape(specList, { items: [5] }, '容量 5 吨', '名', blocks) !== null)

  // seo 概括字段进 notes 标出
  const withSeo = async (messages, tag) => {
    if (tag === 'classify') return { family: 'product', reason: '含参数表与销售文案' }
    if (tag === 'oneshot') return { fields: { 'page.description': { text: 'AI 概括的描述。' } } }
    throw new Error('未覆盖 ' + tag)
  }
  const r4 = await burner.burn({ text: raw, slug: 't51-seo', productName: '欧式桥式起重机' }, { callAI: withSeo })
  ok('seo 字段烧出后进 notes 标出', r4.json.page.description === 'AI 概括的描述。' && r4.report.notes.some(n => /概括|豁免|人工/.test(n)))

  // writeDraft：撞名序号 / 强制 draft / 非法 slug（try/finally 保证清理，钉炸了也不留毒草稿）
  const jx = await lib.assemble({ slug: 'wd-test', productName: '写回测试', sectionResults: [], imagePool: [], example: EX_PROD })
  const f1 = burner.writeDraft(jx, 'wd-test')
  const jx2 = await lib.assemble({ slug: 'wd-test', productName: '写回测试2', sectionResults: [], imagePool: [], example: EX_PROD })
  const f2 = burner.writeDraft(jx2, 'wd-test')
  const p1 = join(SITE, 'content/products', f1 + '.json')
  const p2 = join(SITE, 'content/products', f2 + '.json')
  try {
    ok('writeDraft 撞名加序号', f1 === 'wd-test' && f2 === 'wd-test-2' && existsSync(p1) && existsSync(p2))
    ok('writeDraft 强制 draft', JSON.parse(readFileSync(p1, 'utf8')).page.status === 'draft')
    ok('writeDraft 戳 page.template（路由 glob 依赖，缺则预览构建炸）', JSON.parse(readFileSync(p1, 'utf8')).page.template === 'ProductPage')
    let badSlug = false
    try { burner.writeDraft(jx, '坏 slug!') } catch { badSlug = true }
    ok('writeDraft 非法 slug 拒收', badSlug)
  } finally { rmSync(p1, { force: true }); rmSync(p2, { force: true }) }
}

// ---------- T8.5 终审补丁钉 ----------
{
  const burner = await import('./deepseek-burn.mjs')
  const om = burner.oneShotMessages('原文', [{ key: 'overview', shape: 'section' }], '名').at(-1).content
  ok('oneshot 提示词含白名单；无 sample 不带示例行（示例文字只从套件 example 现取）', om.includes('overview') && !om.includes('示例'))
  const om2 = burner.oneShotMessages('原文', [{ key: 'overview', shape: 'section' }], '名', '{"fields":{"overview":{"title":"…","body_md":"…"}}}').at(-1).content
  ok('onesot 带 sample 时注入示例行', om2.includes('示例') && om2.includes('overview'))
  ok('section 提示词含示例输出', burner.sectionMessages('overview', 'section', '原文', '名').at(-1).content.includes('示例输出'))
  const dup = lib.extractImages('（配图：一 a.jpg）\n\n（配图：一 a.jpg）\n\n（配图：二 b.jpg）')
  ok('extractImages 按名去重', dup.length === 2 && dup[0].name === 'a.jpg' && dup[1].name === 'b.jpg')
}

// ---------- T-url 容器预切钉 ----------
{
  const wp = '<html><body><nav>菜单</nav><div id="product"><h1>标题</h1><p>正文一</p><p>正文二 <img src="/wp-content/uploads/inner.jpg"></p></div><div id="related-products"><p>相关产品一</p><img src="/wp-content/uploads/related.jpg"></div><footer>脚</footer></body></html>'
  const r = lib.stripHtml(wp)
  ok('剥壳优先抽 #product 容器', r.text.includes('正文一') && !r.text.includes('相关产品一') && !r.text.includes('菜单'), '')
  ok('容器外图片不收', r.images.includes('inner.jpg') && !r.images.includes('related.jpg'))
  const fallback = lib.stripHtml('<html><body><p>无容器页正文</p></body></html>')
  ok('无 #product 回退整页剥', fallback.text.includes('无容器页正文'))
}

// ---------- T-family 选族/判族钉 ----------
{
  const burner = await import('./deepseek-burn.mjs')
  const raw = readFileSync(RAW, 'utf8')
  const blocks = lib.numberBlocks(raw)

  let classifyCalls = 0
  const autoFake = async (m, tag) => {
    if (tag === 'classify') { classifyCalls++; return { family: 'product', reason: '含参数表与销售文案' } }
    if (tag === 'oneshot') return { fields: { overview: { title: '欧式桥式起重机', body_md: blocks[1].text } } }
    throw new Error('未覆盖 ' + tag)
  }
  const ra = await burner.burn({ text: raw, slug: 'tf-auto', productName: '欧式桥式起重机' }, { callAI: autoFake })
  ok('auto 默认判族且判中 product 继续烧', classifyCalls === 1 && ra.report.family === 'products' && ra.json.overview?.body?.type === 'doc')
  ok('auto 判族理由进 notes', ra.report.notes.some(n => /自动判族/.test(n)))

  const postFake = async (m, tag) => {
    if (tag === 'classify') return { family: 'post', reason: '散文体培训文章' }
    if (tag === 'oneshot') return { fields: { title: { text: '欧式桥式起重机' }, 'body.sections': { items: [
      { heading: blocks[1].text.split('\n')[0], body_md: blocks[1].text } ] } } }
    throw new Error('不应走到 ' + tag)
  }
  const rp = await burner.burn({ text: raw, slug: 'tf-post', productName: '欧式桥式起重机' }, { callAI: postFake })
  ok('auto 判为文章族继续烧（posts 已建，spec B）', rp.report.family === 'posts' && rp.json.body?.sections?.length === 1)

  const unbuiltFake = async (m, tag) => {
    if (tag === 'classify') return { family: 'news', reason: '像新闻但该页族未建' }
    throw new Error('不应走到 ' + tag)
  }
  let refused = ''
  try { await burner.burn({ text: raw, slug: 'tf-news', productName: 'x' }, { callAI: unbuiltFake }) } catch (e) { refused = e.message }
  ok('auto 判为未建族干净拒绝', /已建页族/.test(refused))

  const explicit = async (m, tag) => {
    if (tag === 'classify') throw new Error('不该判族')
    if (tag === 'oneshot') return { fields: { overview: { title: '欧式桥式起重机', body_md: blocks[1].text } } }
  }
  const re = await burner.burn({ text: raw, slug: 'tf-exp', productName: '欧式桥式起重机', family: 'product' }, { callAI: explicit })
  ok('显式 product 跳过判族直烧', re.json.overview?.body?.type === 'doc')

  let badFam = ''
  try { await burner.burn({ text: raw, slug: 'tf-bad', productName: 'x', family: 'news' }, { callAI: explicit }) } catch (e) { badFam = e.message }
  ok('显式选未建族直接拒', /未建/.test(badFam))
}

// ---------- T-oneshot 一把梭钉 ----------
{
  const burner = await import('./deepseek-burn.mjs')
  const raw = readFileSync(RAW, 'utf8')
  const blocks = lib.numberBlocks(raw)

  // 1. 全过路径
  const good = { fields: {
    'hero.headline': { text: '欧式桥式起重机' },
    overview: { title: '欧式桥式起重机', body_md: blocks[1].text },
    specs: { items: ['容量 3.2-80吨', '跨度长度 4-31.5米'] },
  } }
  const r1 = await burner.burn({ text: raw, slug: 'to-ok', productName: '欧式桥式起重机', family: 'product' }, { callAI: async () => good, noBackfill: true })
  ok('一把梭全过', r1.json.overview?.body?.type === 'doc' && r1.json.specs.length === 2 && r1.report.sections.every(s => s.status === 'ok'))
  ok('未用段落列出（fake 只用了前两段）', r1.report.unused.length > 0 && r1.report.unused[0].preview.length > 0)

  // 2. 编造句 → 重烧修复（逐格备胎）
  let calls = 0
  const liarThenFix = async (m, tag) => {
    if (tag === 'oneshot') return { fields: { overview: { title: '欧式桥式起重机', body_md: '本公司是全球最大的起重机制造商。' } } }
    calls++
    return { title: '欧式桥式起重机', body_md: blocks[1].text }
  }
  const r2 = await burner.burn({ text: raw, slug: 'to-rep', productName: '欧式桥式起重机', family: 'product' }, { callAI: liarThenFix, noBackfill: true })
  ok('编造句打回且逐格修复', r2.report.sections[0].status === 'repaired' && calls === 1, r2.report.sections[0].issues[0])
  ok('打回原因带原句（人话）', /原文里找不到/.test(r2.report.sections[0].issues[0] ?? ''))

  // 3. 屡败格 failed 且缺席
  const alwaysLiar = async (m, tag) => tag === 'oneshot'
    ? { fields: { overview: { title: '欧式桥式起重机', body_md: '纯属编造，原文绝对没有这句话。' } } }
    : { title: '欧式桥式起重机', body_md: '还是编造的，原文照样没有。' }
  const r3 = await burner.burn({ text: raw, slug: 'to-fail', productName: '欧式桥式起重机', family: 'product' }, { callAI: alwaysLiar })
  ok('屡败格 failed 且 JSON 缺席', r3.report.sections[0].status === 'failed' && r3.json.overview === undefined)

  // 4. 发明字段名：该格拒，其余照常，不整次崩
  const withInvented = { fields: { overview: { title: '欧式桥式起重机', body_md: blocks[1].text }, customization: { title: '定制', body_md: blocks[1].text } } }
  const r4 = await burner.burn({ text: raw, slug: 'to-inv', productName: '欧式桥式起重机', family: 'product' }, { callAI: async () => withInvented })
  const inv = r4.report.sections.find(s => s.key === 'customization')
  ok('发明字段格被拒、正常格照收', inv.status === 'failed' && /白名单/.test(inv.issues[0]) && r4.json.overview?.body?.type === 'doc' && r4.json.customization === undefined)

  // 4b. 自然名归一（2026-08-17 实战教训）：模型照 example 结构输出嵌套块 summary/hero 不是发明字段——
  // 确定性拆回目录格名并落盘；chrome 子键（cta/image）不烧；块内无有效子键才枪毙
  const nested = { fields: {
    summary: { intro: blocks[1].text, cta: '立即询价（模型瞎给）' },
    hero: { headline: '欧式桥式起重机', highlights: ['容量 3.2-80吨'], image: 'x.jpg' },
    overview: { title: '欧式桥式起重机', body_md: blocks[1].text },
  } }
  const r4b = await burner.burn({ text: raw, slug: 'to-alias', productName: '欧式桥式起重机', family: 'product' }, { callAI: async () => nested })
  ok('嵌套 summary/hero 拆回正格并落盘', r4b.json.summary?.intro === blocks[1].text && r4b.json.hero?.headline === '欧式桥式起重机' && r4b.json.hero?.highlights?.length === 1)
  ok('归一后报告格名为目录格名（无 summary/hero 整块）', ['summary.intro', 'hero.headline', 'hero.highlights'].every(k => r4b.report.sections.some(s => s.key === k)) && !r4b.report.sections.some(s => s.key === 'summary' || s.key === 'hero'))
  ok('chrome 子键不被模型值覆盖（cta 仍是套件默认、image 不落盘）', r4b.json.summary?.cta === EX_PROD.summary.cta && r4b.json.hero?.image === undefined)
  const heroOnly = { fields: { hero: { image: 'x.jpg' } } }
  const r4c = await burner.burn({ text: raw, slug: 'to-alias2', productName: '欧式桥式起重机', family: 'product' }, { callAI: async () => heroOnly })
  const heroFail = r4c.report.sections.find(s => s.key === 'hero')
  ok('别名块内无有效子键 → 枪毙且理由指到点上', heroFail.status === 'failed' && /headline\/highlights/.test(heroFail.issues[0]))

  // 4d. 漏格补齐（2026-08-17 实战教训：one-shot 只出 3 格、正文六大段未用）——未返回的目录格逐格补烧，
  // 成功落盘、失败缺席；报告注明漏格数
  const backfillMock = async (m, tag) => {
    if (tag === 'oneshot') return { fields: { overview: { title: '欧式桥式起重机', body_md: blocks[1].text } } }
    if (tag === 'summary.intro') return { text: blocks[1].text }
    if (tag === 'hero.headline') return { text: '欧式桥式起重机' }
    if (tag === 'hero.highlights') return { items: ['容量 3.2-80吨'] }
    if (tag === 'page.description') return { text: 'AI 概括的描述。' }
    return { title: '编造标题', body_md: '原文绝对没有这句话。' } // 其余格：内容对不上 → 补烧失败缺席
  }
  const r4d = await burner.burn({ text: raw, slug: 'to-gap', productName: '欧式桥式起重机', family: 'product' }, { callAI: backfillMock })
  const gapIntro = r4d.report.sections.find(s => s.key === 'summary.intro')
  const gapHl = r4d.report.sections.find(s => s.key === 'hero.highlights')
  const gapIntroF = r4d.report.sections.find(s => s.key === 'introduction')
  ok('漏格逐格补烧成功落盘', gapIntro?.status === 'repaired' && gapHl?.status === 'repaired' && r4d.json.summary?.intro === blocks[1].text && r4d.json.hero?.highlights?.length === 1 && r4d.json.page?.description === 'AI 概括的描述。')
  ok('补烧失败的格照常缺席不整次崩', gapIntroF?.status === 'failed' && r4d.json.introduction === undefined)
  ok('报告注明漏格补烧（不静默）', r4d.report.notes.some(n => /漏格.*补烧/.test(n)))
  // 4e. one-shot 全空 → 全目录补烧；不漏格时零补烧（notes 无漏格字样）
  const catalog4d = lib.loadCatalog(
    join(SITE, 'src/components/products/ProductPage/meta.json'),
    join(SITE, 'src/components/products/ProductPage/index.astro'),
    join(SITE, 'src/components/products/ProductPage/example.json'))
  const emptyMock = async (m, tag) => tag === 'oneshot' ? { fields: {} } : { text: '原文绝对没有这句话。' }
  const r4e = await burner.burn({ text: raw, slug: 'to-gap2', productName: '欧式桥式起重机', family: 'product' }, { callAI: emptyMock })
  ok('one-shot 全空也走补烧（整次不崩）', r4e.report.sections.length === catalog4d.length && r4e.report.sections.every(s => s.status === 'failed' || s.status === 'repaired'))
  const fullMock = async (m, tag) => {
    if (tag !== 'oneshot') throw new Error('不该有补烧调用')
    return { fields: { overview: { title: '欧式桥式起重机', body_md: blocks[1].text } } }
  }
  const r4f = await burner.burn({ text: raw, slug: 'to-gap3', productName: '欧式桥式起重机', family: 'product' }, { callAI: fullMock, noBackfill: true })
  ok('noBackfill 关闸：零补烧调用且无漏格注记（成本开关）', r4f.report.sections.length === 1 && !r4f.report.notes.some(n => /漏格/.test(n)))

  // 4f. 漏格判定用归一化后收货名单（2026-08-17 实证 bug：拆回格被当漏格重复补烧、补烧值后栽覆盖正确值、报告同格矛盾双行）
  const tags4f = []
  const nestedThen = async (m, tag) => {
    tags4f.push(tag)
    if (tag === 'oneshot') return { fields: {
      summary: { intro: blocks[1].text },
      hero: { headline: '欧式桥式起重机', highlights: ['容量 3.2-80吨'] },
      'page.description': { text: 'AI 概括的描述。' },
    } }
    if (tag === 'summary.intro') return { text: blocks[2].text } // 若被重复补烧：另一句原文会顶掉正确值
    return { title: '编造标题', body_md: '原文绝对没有这句话。' }
  }
  const r4fx = await burner.burn({ text: raw, slug: 'to-dup', productName: '欧式桥式起重机', family: 'product' }, { callAI: nestedThen })
  ok('拆回格不算漏格（summary.intro/hero.* 零补烧调用）', !tags4f.includes('summary.intro') && !tags4f.includes('hero.headline') && !tags4f.includes('hero.highlights'))
  ok('拆回值不被补烧覆盖', r4fx.json.summary?.intro === blocks[1].text)
  ok('报告同格不出矛盾双行', r4fx.report.sections.filter(s => s.key === 'summary.intro').length === 1)

  // 4g. 缺席阀门（2026-08-17）：模型声明 {"absent":true} → 干净缺席（absent 非 failed）、只问一次不施压、JSON 缺席、注记可见
  const tags4g = []
  const abstMock = async (m, tag) => {
    tags4g.push(tag)
    if (tag === 'oneshot') return { fields: { overview: { title: '欧式桥式起重机', body_md: blocks[1].text } } }
    if (tag === 'protection' || tag === 'which_better') return { absent: true }
    return { title: '编造标题', body_md: '原文绝对没有这句话。' }
  }
  const r4g = await burner.burn({ text: raw, slug: 'to-abs', productName: '欧式桥式起重机', family: 'product' }, { callAI: abstMock })
  const prot = r4g.report.sections.find(s => s.key === 'protection')
  ok('声明 absent → 干净缺席（absent 非 failed，JSON 缺席）', prot?.status === 'absent' && r4g.json.protection === undefined)
  ok('声明后不再施压（该格只问一次）', tags4g.filter(t => t === 'protection').length === 1 && tags4g.filter(t => t === 'which_better').length === 1)
  ok('合法缺席进注记（人审可见）', r4g.report.notes.some(n => /合法缺席/.test(n)))

  // 4h. 格子语义进提示词（治本：光秃英文名→漏格的根因）+ 单格提示词带格含义与缺席出口
  let oneShotUser = '', perCellUser = ''
  const capMock = async (m, tag) => {
    if (tag === 'oneshot') { oneShotUser = m.map(x => x.content).join('\n'); return { fields: {} } }
    if (tag === 'overview' && !perCellUser) perCellUser = m.map(x => x.content).join('\n')
    return { absent: true }
  }
  await burner.burn({ text: raw, slug: 'to-desc', productName: '欧式桥式起重机', family: 'product' }, { callAI: capMock })
  ok('one-shot 提示词带各格含义（desc 自套件 meta.json）', /各格含义/.test(oneShotUser) && /overview：开篇概述/.test(oneShotUser))
  ok('单格提示词带格含义与缺席出口（不硬凑）', /overview（开篇概述/.test(perCellUser) && /"absent":true/.test(perCellUser))

  // 4i. 整行闸（「我已整理好」模式，2026-08-18）：verbatim 升严——半句/跳行拼接拒收；连续行合并+剥强调符号放行；raw 模式不受影响
  const strictRaw = '欧式桥式起重机\n\n**起重量大**、工作级别高，广泛用于车间。\n电源为三相交流电，额定频率50Hz。\n\n- 容量 3.2-80吨\n- 跨度 4-31.5米'
  const cutBody = '工作级别高，广泛用于车间' // 半句：是原文子串但不是任何一整行
  const cutMock = async (m, tag) => {
    if (tag === 'oneshot') return { fields: { overview: { title: '欧式桥式起重机', body_md: cutBody } } }
    return { title: '欧式桥式起重机', body_md: '起重量大、工作级别高，广泛用于车间。' } // 重烧交整行（剥了 ** 也过——坑②修正）
  }
  const rCut = await burner.burn({ text: strictRaw, slug: 'to-cut', productName: '欧式桥式起重机', family: 'product', mode: 'organized' }, { callAI: cutMock, noBackfill: true })
  const cutRec = rCut.report.sections.find(s => s.key === 'overview')
  ok('整行闸拒收半句、重烧整行修复（剥 ** 不冤枉）', cutRec.status === 'repaired' && /整行/.test(cutRec.issues[0]) && rCut.json.overview?.body?.type === 'doc', cutRec.issues[0])
  let mergeUser = ''
  const mergeMock = async (m, tag) => {
    if (tag === 'oneshot') {
      mergeUser = m.map(x => x.content).join('\n')
      return { fields: { overview: { title: '欧式桥式起重机', body_md: '起重量大、工作级别高，广泛用于车间。\n电源为三相交流电，额定频率50Hz。' } } }
    }
    return { absent: true }
  }
  const rMerge = await burner.burn({ text: strictRaw, slug: 'to-merge', productName: '欧式桥式起重机', family: 'product', mode: 'organized' }, { callAI: mergeMock, noBackfill: true })
  ok('连续两行合并放行（坑①假换行修正）', rMerge.report.sections.find(s => s.key === 'overview').status === 'ok' && rMerge.json.overview?.body?.type === 'doc')
  ok('organized 提示词带搬运粒度铁律', /搬运粒度铁律|只许整行/.test(mergeUser))
  const cutRawMock = async (m, tag) => tag === 'oneshot'
    ? { fields: { overview: { title: '欧式桥式起重机', body_md: cutBody } } }
    : { absent: true }
  const rCutRaw = await burner.burn({ text: strictRaw, slug: 'to-cutraw', productName: '欧式桥式起重机', family: 'product' }, { callAI: cutRawMock, noBackfill: true })
  ok('raw 模式不受整行闸（半句子串即过）', rCutRaw.report.sections.find(s => s.key === 'overview').status === 'ok' && rCutRaw.json.overview?.body?.type === 'doc')

  // 4j. 强制安置（organized 防丢兜底，2026-08-18）：未用段落必须逐段有去处（只许并入已有内容的格）；非法分配 → 兜底并入最后有内容的格
  const placeMock = async (m, tag) => {
    if (tag === 'oneshot') return { fields: { overview: { title: '欧式桥式起重机', body_md: '起重量大、工作级别高，广泛用于车间。' } } }
    if (tag === 'place') return { place: [{ n: 2, key: 'overview' }, { n: 3, key: 'overview' }] }
    return { absent: true } // 补烧全部声明缺席
  }
  const rPlace = await burner.burn({ text: strictRaw, slug: 'to-place', productName: '欧式桥式起重机', family: 'product', mode: 'organized' }, { callAI: placeMock })
  const ovPlace = rPlace.report.sections.find(s => s.key === 'overview')
  ok('强制安置并入且未用清零', rPlace.report.unused.length === 0 && JSON.stringify(rPlace.json.overview?.body ?? {}).includes('容量 3.2-80吨'))
  ok('强制安置标出（格 issues + 注记），位置人审', /强制安置/.test(ovPlace.issues.join()) && rPlace.report.notes.some(n => /强制安置/.test(n)))
  const badPlaceMock = async (m, tag) => {
    if (tag === 'oneshot') return { fields: { overview: { title: '欧式桥式起重机', body_md: '起重量大、工作级别高，广泛用于车间。' } } }
    if (tag === 'place') return { place: [{ n: 2, key: '不存在格' }, { n: 3, key: 'overview' }] } // 非法格名，两次都败
    return { absent: true }
  }
  const rPlaceBad = await burner.burn({ text: strictRaw, slug: 'to-placebad', productName: '欧式桥式起重机', family: 'product', mode: 'organized' }, { callAI: badPlaceMock })
  ok('分配非法 → 兜底并入最后有内容的格+注记', JSON.stringify(rPlaceBad.json.overview?.body ?? {}).includes('电源为三相交流电') && rPlaceBad.report.notes.some(n => /兜底并入最后一个/.test(n)))

  // 4k. 配图标记=图池元数据不是正文（2026-08-18 自检实证）：organized 下「只搬文字不抄标记」是正确行为，整行闸不得误杀；
  // 独立标记行不算未用、不进强制安置（防泄漏）；输出里带标记=拒收（两模式同闸）
  const markerRaw = '欧式桥式起重机\n\n主梁采用Q345B钢板焊接，腹板经过预拱处理。（配图：主梁 Main-Girder-1.jpg）\n\n（配图：整机 overview.jpg）'
  const rMk = await burner.burn({ text: markerRaw, slug: 'to-marker', productName: '欧式桥式起重机', family: 'product', mode: 'organized' }, { callAI: async (m, tag) => {
    if (tag === 'oneshot') return { fields: { overview: { title: '欧式桥式起重机', body_md: '主梁采用Q345B钢板焊接，腹板经过预拱处理。' } } }
    return { absent: true }
  } })
  const mkOv = rMk.report.sections.find(s => s.key === 'overview')
  ok('整行闸不误杀「只搬文字不抄标记」', mkOv.status === 'ok' && rMk.json.overview?.body?.type === 'doc', mkOv.issues.join(' | '))
  ok('独立标记行不算未用、标记不泄漏进 JSON', !rMk.report.unused.some(u => /配图/.test(u.preview)) && !JSON.stringify(rMk.json).includes('配图'))
  const rMkOut = await burner.burn({ text: markerRaw, slug: 'to-marker2', productName: '欧式桥式起重机', family: 'product' }, { callAI: async (m, tag) => {
    if (tag === 'oneshot') return { fields: { overview: { title: '欧式桥式起重机', body_md: '主梁采用Q345B钢板焊接，腹板经过预拱处理。（配图：主梁 Main-Girder-1.jpg）' } } }
    return { absent: true }
  }, noBackfill: true })
  ok('输出带配图标记 → 拒收（元数据不是正文）', /配图标记/.test(rMkOut.report.sections.find(s => s.key === 'overview').issues[0]))

  // 5. 同段复用：告警层已裁（分不清「AI 塞两格」与「原文本身重复」，硬误报源）——fieldMap 仍直接呈现
  const misplaced = { fields: {
    overview: { title: '欧式桥式起重机', body_md: blocks[1].text + '\n\n容量 3.2-80吨' },
    specs: { items: ['容量 3.2-80吨'] },
  } }
  const r5 = await burner.burn({ text: raw, slug: 'to-mis', productName: '欧式桥式起重机', family: 'product' }, { callAI: async () => misplaced })
  const ovP = r5.report.fieldMap.find(f => f.key === 'overview')?.paras ?? []
  const spP = r5.report.fieldMap.find(f => f.key === 'specs')?.paras ?? []
  ok('同段命中在 fieldMap 可见（不再告警）', ovP.some(n => spP.includes(n)) && !r5.report.notes.some(n => /同时被|装错格/.test(n)), `overview←${ovP} specs←${spP}`)

  // 5b. 相似级降级（2026-08-17）：标题/标语不像原文 → 照收 + 提示进 issues，不枪毙整格
  const fuzzy = { fields: {
    overview: { title: '企业实力展示', body_md: blocks[1].text },
    'hero.headline': { text: '品质赢得全球市场信赖' },
  } }
  const r5b = await burner.burn({ text: raw, slug: 'to-fuzzy', productName: '欧式桥式起重机', family: 'product' }, { callAI: async () => fuzzy })
  const fz = r5b.report.sections
  ok('标题不像照收且正文保留', r5b.json.overview?.body?.type === 'doc' && fz.find(s => s.key === 'overview').status === 'ok')
  ok('标题提示进 issues', fz.find(s => s.key === 'overview').issues.some(i => /提示：标题与原文/.test(i)), fz.find(s => s.key === 'overview').issues.join(' | '))
  ok('hero 标语不像也照收带提示', r5b.json.hero.headline === '品质赢得全球市场信赖' && fz.find(s => s.key === 'hero.headline').issues.some(i => /提示：/.test(i)))

  // 6. 一把梭调用失败 → 干净报错
  let msg = ''
  try { await burner.burn({ text: raw, slug: 'to-err', productName: '欧式桥式起重机', family: 'product' }, { callAI: async () => { throw new Error('输出被 max_tokens 截断（段太长，重试无义）') } }) } catch (e) { msg = e.message }
  ok('截断干净报错建议分段', /整页烧失败/.test(msg) && /分段/.test(msg))

  // 7.（已退役）顺序颠倒审计——真 key 复验实证：页面栏序由组件固定，文章栏序与目录不同是合法排布，
  //    该告警全是误报。对应的「reversed」用例与断言已删。

  // 8. 重烧喂回拒收原因
  let sawReason = false
  const checkFeedback = async (m, tag) => {
    if (tag === 'oneshot') return { fields: { overview: { title: '欧式桥式起重机', body_md: '本公司是全球最大的起重机制造商。' } } }
    if (m.at(-1).content.includes('原文里找不到')) sawReason = true
    return { title: '欧式桥式起重机', body_md: blocks[1].text }
  }
  const r7 = await burner.burn({ text: raw, slug: 'to-fb', productName: '欧式桥式起重机', family: 'product' }, { callAI: checkFeedback, noBackfill: true })
  ok('重烧喂回拒收原因', sawReason && r7.report.sections[0].status === 'repaired')

  // 9. 重烧途中硬失败 → 该格降级不拖垮整次
  const hardFailRepair = async (m, tag) => {
    if (tag === 'oneshot') return { fields: { overview: { title: '欧式桥式起重机', body_md: '本公司是全球最大的起重机制造商。' }, specs: { items: ['容量 3.2-80吨'] } } }
    throw new Error('网络超时（模拟）')
  }
  const r8 = await burner.burn({ text: raw, slug: 'to-hf', productName: '欧式桥式起重机', family: 'product' }, { callAI: hardFailRepair })
  ok('重烧硬失败降级不拖垮整次', r8.report.sections.find(s => s.key === 'overview').status === 'failed' && r8.json.specs.length === 1)

  // 10. 段数带噪提示恢复
  const bigText = Array.from({ length: 210 }, (_, i) => `第${i}段内容`).join('\n\n')
  const r9 = await burner.burn({ text: bigText, slug: 'to-noise', productName: '测试', family: 'product' }, { callAI: async () => ({ fields: { overview: { title: '测试', body_md: '第0段内容' } } }) })
  ok('段数带噪提示', r9.report.notes.some(n => /带噪/.test(n)))

  // 11. 全过路径零告警零提示（防误报回归钉）
  ok('全过路径零告警零提示', r1.report.notes.filter(n => /颠倒|同时被/.test(n)).length === 0 && r1.report.sections.every(s => s.issues.length === 0), r1.report.notes.join(' | '))

  // 12. fieldMap 进报告
  ok('fieldMap 呈现格子对应段落', Array.isArray(r1.report.fieldMap) && r1.report.fieldMap.some(f => f.key === 'overview'))

  // 13. auditPositions 直接钉（只产 fieldMap——告警层裁后的事实陈列）
  const paras = lib.numberBlocks('甲段\n\n乙段\n\n丙段')
  const w1 = lib.auditPositions([{ key: 'a', shape: 'text', data: { text: '甲段' } }, { key: 'b', shape: 'text', data: { text: '甲段' } }], '甲段\n\n乙段\n\n丙段', paras)
  ok('audit 同段命中在 fieldMap 呈现', w1.fieldMap.length === 2 && w1.fieldMap.every(f => f.paras.includes(1)))
  const w2 = lib.auditPositions([{ key: 'a', shape: 'text', data: { text: '原文没有的话' } }], '甲段\n\n乙段\n\n丙段', paras)
  ok('audit 未命中段号为空', w2.fieldMap.length === 1 && w2.fieldMap[0].paras.length === 0)
  ok('audit 空段落不崩', Array.isArray(lib.auditPositions([], '', []).fieldMap))

  // 14. 重叠硬闸：one-shot 两格全文重复 → 重烧修复
  {
    const dupShot = { fields: {
      overview: { title: '欧式桥式起重机', body_md: blocks[1].text },
      introduction: { title: '欧式桥式起重机', body_md: blocks[1].text }, // 与 overview 全同
    } }
    let repairCalls = 0
    const fixer = async (m, tag) => {
      if (tag === 'oneshot') return dupShot
      repairCalls++
      if (tag === 'overview') return { title: '欧式桥式起重机', body_md: blocks[1].text.split('。').slice(0, 2).join('。') + '。' }
      if (tag === 'introduction') return { title: '欧式桥式起重机', body_md: blocks[5].text }
      throw new Error('未覆盖 ' + tag)
    }
    const r10 = await burner.burn({ text: raw, slug: 'to-dup', productName: '欧式桥式起重机', family: 'product' }, { callAI: fixer, noBackfill: true })
    ok('重叠格触发重烧且修复', r10.report.sections.every(s => s.status === 'ok' || s.status === 'repaired') && repairCalls === 2 && r10.json.introduction?.body?.type === 'doc')
    ok('重烧原因含重复提示', r10.report.sections.some(s => (s.issues[0] ?? '').includes('重复')) || repairCalls === 2)

    // 15. 屡教不改的重叠 → 双格 failed 缺席
    const alwaysDup = async (m, tag) => tag === 'oneshot' ? dupShot
      : { title: '欧式桥式起重机', body_md: blocks[1].text } // 重烧还是给同一段
    const r11 = await burner.burn({ text: raw, slug: 'to-dup2', productName: '欧式桥式起重机', family: 'product' }, { callAI: alwaysDup, noBackfill: true })
    ok('屡犯重叠双格 failed 缺席', r11.report.sections.every(s => s.status === 'failed') && r11.json.overview === undefined && r11.json.introduction === undefined)

    // 16. 判族提示词不含「起重机」（已建族由调用方动态传入）
    ok('判族提示词不限起重机', !burner.classifyMessages('x', ['products', 'posts'])[1].content.includes('起重机'))

    // 17. RULES 含不重复条款
    ok('RULES 含不重复条款', burner.oneShotMessages('原文', [{ key: 'overview', shape: 'section' }], '名')[0].content.includes('只许用于一个字段'))

    // 18. 重叠硬闸重烧全败：状态必须 failed（假 repaired 漏洞钉）
    const dupShot2 = { fields: {
      overview: { title: '欧式桥式起重机', body_md: blocks[1].text },
      introduction: { title: '欧式桥式起重机', body_md: blocks[1].text },
    } }
    const fixer2 = async (m, tag) => {
      if (tag === 'oneshot') return dupShot2
      if (tag === 'overview') return { title: '欧式桥式起重机', body_md: '重烧仍编造，原文没有这句。' } // 重烧仍不过关（正文逐字硬闸不过；标题已降级为提示，不能当失败刺激源）
      if (tag === 'introduction') return { title: '欧式桥式起重机', body_md: blocks[5].text }
      throw new Error('未覆盖 ' + tag)
    }
    const r12 = await burner.burn({ text: raw, slug: 'to-dup3', productName: '欧式桥式起重机', family: 'product' }, { callAI: fixer2 })
    const ov = r12.report.sections.find(s => s.key === 'overview')
    ok('硬闸重烧全败状态为 failed 且缺席', ov.status === 'failed' && r12.json.overview === undefined && r12.json.introduction?.body?.type === 'doc', ov.status)
  }
}

// ---------- T-post 文章族钉（spec B：posts/PostPage + sections 形态） ----------
{
  const burner = await import('./deepseek-burn.mjs')

  // 套件扫描 + 双源核验
  const pk = lib.scanKits(join(SITE, 'src/components')).find(k => k.family === 'posts' && k.name === 'PostPage')
  ok('scanKits 认出 posts/PostPage 完整套件', pk?.complete === true)
  const pcat = lib.loadCatalog(join(pk.dir, 'meta.json'), join(pk.dir, 'index.astro'), join(pk.dir, 'example.json'))
  ok('文章目录三键全核验', pcat.length === 3 && pcat.every(c => c.verified))

  // sections 验收：逐项逐字 / 段间重叠 / 编造
  const raw2 = '起重机安全培训\n\n安全要求\n\n操作人员必须持证上岗，作业前检查制动器。\n\n应急处理\n\n突发停电时应将控制器回零位并报警。'
  const spec = { key: 'body.sections', shape: 'sections', level: 'verbatim' }
  const paras = lib.numberBlocks(raw2)
  const good = { items: [
    { heading: '安全要求', body_md: '操作人员必须持证上岗，作业前检查制动器。' },
    { heading: '应急处理', body_md: '突发停电时应将控制器回零位并报警。' } ] }
  ok('sections 逐字搬运过验', burner.verifyByShape(spec, good, raw2, '起重机安全培训', paras) === null)
  ok('sections 段间重叠拒收', /大面积重复/.test(burner.verifyByShape(spec, { items: [good.items[0], { heading: '应急处理', body_md: good.items[0].body_md }] }, raw2, 'x', paras)))
  ok('sections 编造文字拒收', /原文里找不到/.test(burner.verifyByShape(spec, { items: [{ heading: '安全要求', body_md: '这个行业一般要穿劳保鞋。' }] }, raw2, 'x', paras)))

  // 文章骨架组装 + 预览
  const jp = await lib.assemble({ slug: 'zzt', productName: '起重机安全培训', family: 'posts',
    sectionResults: [{ key: 'body.sections', shape: 'sections', data: good },
      { key: 'title', shape: 'text', data: { text: '起重机安全培训' } },
      { key: 'page.description', shape: 'seo', data: { text: '起重机安全操作培训要点。' } }], imagePool: [], example: EX_POST })
  ok('assemblePost 文章骨架', jp.page.type === 'post' && jp.page.slug === 'posts/zzt' && jp.body.sections.length === 2
    && jp.title === '起重机安全培训' && jp.page.description === '起重机安全操作培训要点。')
  ok('文章 chrome 值全自套件 example（trail/form 同源，current 换新名）',
    jp.breadcrumb.trail.length === EX_POST.breadcrumb.trail.length && jp.breadcrumb.current === '起重机安全培训'
    && jp.inquiry_form.form_id === EX_POST.inquiry_form.form_id && jp.page.title === EX_POST.page.title.replace(EX_POST.title, '起重机安全培训'))
  ok('文章预览渲出章节', lib.previewHtml(jp, pcat).includes('安全要求'))

  // 图池顺序配段（缺图 known-leftover 不炸、不带假尺寸）
  const ji = await lib.assemble({ slug: 'zzt2', productName: 'x', family: 'posts',
    sectionResults: [{ key: 'body.sections', shape: 'sections', data: good }], imagePool: [{ caption: '', name: 'no-such.jpg' }], example: EX_POST })
  ok('图池顺序配段（缺图不炸）', ji.body.sections[0].image === 'no-such.jpg' && ji.body.sections[0].width === undefined)

  // writeDraft 按 page.type 落 content/posts + template 自带 + draft 强制
  const final = burner.writeDraft(jp, 'zz-accept-post')
  const ppath = join(SITE, 'content/posts', `${final}.json`)
  const saved = JSON.parse(readFileSync(ppath, 'utf8'))
  ok('writeDraft 落 content/posts 带 template 且强制 draft', existsSync(ppath) && saved.page.template === 'PostPage' && saved.page.status === 'draft' && saved.page.slug.startsWith('posts/'))
  rmSync(ppath)
}

// ---------- T-perkit 指定套件烧制钉（一 astro 一模版，spec B2） ----------
{
  const burner = await import('./deepseek-burn.mjs')

  const kits = lib.scanKits(join(SITE, 'src/components'))
  ok('scanKits 认出 6 套件（产品 1 + 文章 5）', kits.filter(k => k.complete).length === 6
    && kits.filter(k => k.family === 'posts' && k.complete).length === 5)
  ok('canonicalKitOf 通用件约定（PostPage/ProductPage）',
    lib.canonicalKitOf(kits, 'posts') === 'PostPage' && lib.canonicalKitOf(kits, 'products') === 'ProductPage')
  for (const n of ['gantry-cranes-for-sale', '5-ton-overhead-crane', 'crane-lifting-safety-training', '32t-rail-mounted-container-gantry-crane-exported-to-russia']) {
    const cat = lib.loadCatalog(join(SITE, `src/components/posts/${n}/meta.json`), join(SITE, `src/components/posts/${n}/index.astro`), join(SITE, `src/components/posts/${n}/example.json`))
    ok(`${n} 套件双源核验过`, cat.every(c => c.verified))
  }

  // 烧进 gantry 套件：titlePath 落位、发明格子拒收、chrome 自 gantry example、草稿带套件名
  const raw2 = '龙门吊价格科普\n\n价格区间\n\n龙门起重机价格受跨度与吨位影响，小型设备数万元起。\n\n结论\n\n选型前应向多家供应商询价比较。'
  const gEx = JSON.parse(readFileSync(join(SITE, 'src/components/posts/gantry-cranes-for-sale/example.json'), 'utf8'))
  const { json: gj, report: gr } = await burner.burn(
    { text: raw2, slug: 'zz-gantry', productName: '龙门吊价格科普', family: 'posts:gantry-cranes-for-sale' },
    { callAI: async (m, tag) => {
      if (tag === 'oneshot') return { fields: {
        title: { text: '龙门吊价格科普' },
        h_price: { text: '价格区间' },
        price: { title: '价格区间', body_md: '龙门起重机价格受跨度与吨位影响，小型设备数万元起。' }, // gantry 无此槽→须拒
        conclusion: { title: '结论', body_md: '选型前应向多家供应商询价比较。' } } }
      throw new Error('未覆盖 ' + tag)
    } })
  ok('指定套件：报告带套件名', gr.kit === 'gantry-cranes-for-sale' && gr.family === 'posts')
  const rp2 = await burner.burn({ text: '甲文\n\n安全要求\n\n操作人员必须持证上岗。\n\n十不吊\n\n超载不吊，斜拉不吊。', slug: 'zz-un-used', productName: '甲文', family: 'posts' }, { callAI: async (m, tag) => {
    if (tag === 'oneshot') return { fields: { title: { text: '甲文' }, 'body.sections': { items: [
      { heading: '安全要求', body_md: '操作人员必须持证上岗。' }, { heading: '十不吊', body_md: '超载不吊，斜拉不吊。' }] } } }
    throw new Error('未覆盖 ' + tag)
  } })
  ok('sections 内容计入已用文本（unused 不再误报）', rp2.report.unused.length === 0, JSON.stringify(rp2.report.unused))
  ok('titlePath 落位（text→body.h_price、section 标题→body.h_conclusion）',
    gj.body.h_price === '价格区间' && gj.body.h_conclusion === '结论' && gj.conclusion.body.type === 'doc')
  ok('发明格子拒收（gantry 无 price 槽）', gr.sections.find(s => s.key === 'price')?.status === 'failed' && /白名单/.test(gr.sections.find(s => s.key === 'price')?.issues[0]))
  ok('chrome 值自 gantry example（trail 同源、current 换新名）',
    gj.breadcrumb.trail.length === gEx.breadcrumb.trail.length && gj.breadcrumb.current === '龙门吊价格科普')
  ok('草稿自带套件名（template=gantry…）', gj.page.template === 'gantry-cranes-for-sale')

  const gfinal = burner.writeDraft(gj, 'zz-gantry-accept')
  const gpath = join(SITE, 'content/posts', `${gfinal}.json`)
  ok('writeDraft 按声明的套件落 content/posts', JSON.parse(readFileSync(gpath, 'utf8')).page.template === 'gantry-cranes-for-sale')
  rmSync(gpath)
}

// ---------- T-guard 守卫完备性钉（可选内容必须「有值才渲染」，漏挂当场红） ----------
{
  // 受检范围：图槽（body.* 图 / hero 横幅 / 重复章节配图）——正文段与标题的守卫由 T9 纪律人工守，
  // 图槽最易漏（2026-08-14 烧无图文章暴露 29 处裸奔）。gallery/case 等数组项除外（外层 map 已含守卫语义）。
  const kits = lib.scanKits(join(SITE, 'src/components')).filter(k => k.complete)
  let checked = 0, missing = []
  for (const k of kits) {
    const src = readFileSync(join(k.dir, 'index.astro'), 'utf8')
    const lines = src.split('\n')
    lines.forEach((line, i) => {
      const guarded = /&&\s*\(/.test(line) || (i > 0 && /&&\s*\(\s*$/.test(lines[i - 1]))
      for (const m of line.matchAll(/<img[^>]*data-field="(body\.\w+|hero\.image|section\.image)"/g)) {
        checked++
        if (!guarded) missing.push(`${k.family}/${k.name}: ${m[1]}`)
      }
    })
  }
  ok(`图槽守卫完备（${checked} 个受检，0 裸奔）`, missing.length === 0, missing.slice(0, 5).join('；'))
}

// ---------- 汇总 ----------
const fails = results.filter(r => !r.pass)
console.log(`\n${results.length - fails.length}/${results.length} 通过`)
if (fails.length) { console.log('失败:', fails.map(f => f.name).join(' | ')); process.exit(1) }
