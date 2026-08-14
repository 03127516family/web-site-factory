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
    join(SITE, 'src/components/ProductPage.meta.json'),
    join(SITE, 'src/components/ProductPage.astro'),
    join(SITE, 'content/products/single-girder-eot-cranes.json'))
  const keys = catalog.map(c => c.key)
  for (const k of ['overview', 'introduction', 'advantages', 'protection', 'specs', 'hero.headline', 'page.description'])
    ok(`目录含 ${k} 且已核验`, keys.includes(k) && catalog.find(c => c.key === k).verified)

  const meta = lib.loadMeta(join(SITE, 'src/components/ProductPage.meta.json'))
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

  const catalog = lib.loadCatalog(
    join(SITE, 'src/components/ProductPage.meta.json'),
    join(SITE, 'src/components/ProductPage.astro'),
    join(SITE, 'content/products/single-girder-eot-cranes.json'))
  const html = lib.previewHtml(j, catalog)
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
  const jx = await lib.assemble({ slug: 'wd-test', productName: '写回测试', sectionResults: [], imagePool: [] })
  const f1 = burner.writeDraft(jx, 'wd-test')
  const jx2 = await lib.assemble({ slug: 'wd-test', productName: '写回测试2', sectionResults: [], imagePool: [] })
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
  ok('oneshot 提示词含白名单与 few-shot 示例', om.includes('示例') && om.includes('overview'))
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
    throw new Error('不应走到 ' + tag)
  }
  let refused = ''
  try { await burner.burn({ text: raw, slug: 'tf-post', productName: 'x' }, { callAI: postFake }) } catch (e) { refused = e.message }
  ok('auto 判为未建族干净拒绝', /未建/.test(refused))

  const explicit = async (m, tag) => {
    if (tag === 'classify') throw new Error('不该判族')
    if (tag === 'oneshot') return { fields: { overview: { title: '欧式桥式起重机', body_md: blocks[1].text } } }
  }
  const re = await burner.burn({ text: raw, slug: 'tf-exp', productName: '欧式桥式起重机', family: 'product' }, { callAI: explicit })
  ok('显式 product 跳过判族直烧', re.json.overview?.body?.type === 'doc')

  let badFam = ''
  try { await burner.burn({ text: raw, slug: 'tf-bad', productName: 'x', family: 'post' }, { callAI: explicit }) } catch (e) { badFam = e.message }
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
  const r1 = await burner.burn({ text: raw, slug: 'to-ok', productName: '欧式桥式起重机', family: 'product' }, { callAI: async () => good })
  ok('一把梭全过', r1.json.overview?.body?.type === 'doc' && r1.json.specs.length === 2 && r1.report.sections.every(s => s.status === 'ok'))
  ok('未用段落列出（fake 只用了前两段）', r1.report.unused.length > 0 && r1.report.unused[0].preview.length > 0)

  // 2. 编造句 → 重烧修复（逐格备胎）
  let calls = 0
  const liarThenFix = async (m, tag) => {
    if (tag === 'oneshot') return { fields: { overview: { title: '欧式桥式起重机', body_md: '本公司是全球最大的起重机制造商。' } } }
    calls++
    return { title: '欧式桥式起重机', body_md: blocks[1].text }
  }
  const r2 = await burner.burn({ text: raw, slug: 'to-rep', productName: '欧式桥式起重机', family: 'product' }, { callAI: liarThenFix })
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

  // 5. 位置审计：specs 条目被塞进 overview → 同段复用告警
  const misplaced = { fields: {
    overview: { title: '欧式桥式起重机', body_md: blocks[1].text + '\n\n容量 3.2-80吨' },
    specs: { items: ['容量 3.2-80吨'] },
  } }
  const r5 = await burner.burn({ text: raw, slug: 'to-mis', productName: '欧式桥式起重机', family: 'product' }, { callAI: async () => misplaced })
  ok('同段复用告警出现', r5.report.notes.some(n => /同时被|装错格/.test(n)), r5.report.notes.join(' | '))

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
  const r7 = await burner.burn({ text: raw, slug: 'to-fb', productName: '欧式桥式起重机', family: 'product' }, { callAI: checkFeedback })
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

  // 11. 全过路径零告警（防误报回归钉）
  ok('全过路径零告警', r1.report.notes.filter(n => /颠倒|同时被/.test(n)).length === 0, r1.report.notes.join(' | '))

  // 12. fieldMap 进报告
  ok('fieldMap 呈现格子对应段落', Array.isArray(r1.report.fieldMap) && r1.report.fieldMap.some(f => f.key === 'overview'))

  // 13. auditPositions 直接钉
  const paras = lib.numberBlocks('甲段\n\n乙段\n\n丙段')
  const w1 = lib.auditPositions([{ key: 'a', shape: 'text', data: { text: '甲段' } }, { key: 'b', shape: 'text', data: { text: '甲段' } }], '甲段\n\n乙段\n\n丙段', paras)
  ok('audit 同段复用告警', w1.warnings.some(w => /同时被/.test(w)))
  const w2 = lib.auditPositions([{ key: 'a', shape: 'text', data: { text: '原文没有的话' } }], '甲段\n\n乙段\n\n丙段', paras)
  ok('audit 未命中不告警', w2.warnings.length === 0)
  ok('audit 空段落不崩', Array.isArray(lib.auditPositions([], '', []).warnings))

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
    const r10 = await burner.burn({ text: raw, slug: 'to-dup', productName: '欧式桥式起重机', family: 'product' }, { callAI: fixer })
    ok('重叠格触发重烧且修复', r10.report.sections.every(s => s.status === 'ok' || s.status === 'repaired') && repairCalls === 2 && r10.json.introduction?.body?.type === 'doc')
    ok('重烧原因含重复提示', r10.report.sections.some(s => (s.issues[0] ?? '').includes('重复')) || repairCalls === 2)

    // 15. 屡教不改的重叠 → 双格 failed 缺席
    const alwaysDup = async (m, tag) => tag === 'oneshot' ? dupShot
      : { title: '欧式桥式起重机', body_md: blocks[1].text } // 重烧还是给同一段
    const r11 = await burner.burn({ text: raw, slug: 'to-dup2', productName: '欧式桥式起重机', family: 'product' }, { callAI: alwaysDup })
    ok('屡犯重叠双格 failed 缺席', r11.report.sections.every(s => s.status === 'failed') && r11.json.overview === undefined && r11.json.introduction === undefined)

    // 16. 判族提示词不含「起重机」
    ok('判族提示词不限起重机', !burner.classifyMessages('x')[1].content.includes('起重机'))

    // 17. RULES 含不重复条款
    ok('RULES 含不重复条款', burner.oneShotMessages('原文', [{ key: 'overview', shape: 'section' }], '名')[0].content.includes('只许用于一个字段'))

    // 18. 重叠硬闸重烧全败：状态必须 failed（假 repaired 漏洞钉）
    const dupShot2 = { fields: {
      overview: { title: '欧式桥式起重机', body_md: blocks[1].text },
      introduction: { title: '欧式桥式起重机', body_md: blocks[1].text },
    } }
    const fixer2 = async (m, tag) => {
      if (tag === 'oneshot') return dupShot2
      if (tag === 'overview') return { title: '原文里不存在的标题', body_md: blocks[2].text } // 重烧仍不过关（标题假）
      if (tag === 'introduction') return { title: '欧式桥式起重机', body_md: blocks[5].text }
      throw new Error('未覆盖 ' + tag)
    }
    const r12 = await burner.burn({ text: raw, slug: 'to-dup3', productName: '欧式桥式起重机', family: 'product' }, { callAI: fixer2 })
    const ov = r12.report.sections.find(s => s.key === 'overview')
    ok('硬闸重烧全败状态为 failed 且缺席', ov.status === 'failed' && r12.json.overview === undefined && r12.json.introduction?.body?.type === 'doc', ov.status)
  }
}

// ---------- 汇总 ----------
const fails = results.filter(r => !r.pass)
console.log(`\n${results.length - fails.length}/${results.length} 通过`)
if (fails.length) { console.log('失败:', fails.map(f => f.name).join(' | ')); process.exit(1) }
