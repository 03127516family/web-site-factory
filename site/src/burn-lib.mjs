// DeepSeek 烧制台·纯逻辑库（零网络零 AI，全部可单测）。
// AI 只产 markdown/简单 JSON；树转换、校验、组装全在这里——结构归代码。
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { mdToDoc } from './render/mdast-tree.mjs'
import { validateDoc } from './content/schema.mjs'
import { renderDoc } from './render/render.mjs'
import { getIn, setIn } from './render/tree-utils.mjs'
import { probe } from '../scripts/img-probe.mjs'
import { loadSiteAssetConfig, publicAssetPolicy } from './asset-config.mjs'

export { mdToDoc, validateDoc, getIn, setIn }

// ---------- 站点资产约定（换站唯一要改的一处；模版/chrome/内容全是数据自带） ----------
const ASSET_CONFIG = loadSiteAssetConfig()
export const SITE_ASSETS = {
  dir: join(ASSET_CONFIG.diskRoot, 'product'),
  url: publicAssetPolicy({ namespace: 'product', valueFormat: 'filename' }, ASSET_CONFIG).publicPrefix.replace(/\/$/, ''),
}

// ---------- 原文分段编号（不给 AI；仅供代码侧反查漏段/位置审计） ----------
export function numberBlocks(rawText) {
  return rawText.split(/\n\s*\n/).map(t => t.trim()).filter(Boolean)
    .map((text, i) => ({ n: i + 1, text }))
}

// ---------- 配图标记提取：（配图：横梁 cross-girder3.jpg）/（配图 Main-girder.jpg）（冒号可省） ----------
export function extractImages(rawText) {
  const out = []
  const re = /（\s*配图\s*[:：]?\s*([^）]*?)([\w.-]+\.(?:jpe?g|png|webp))\s*）/gi
  for (const m of rawText.matchAll(re))
    out.push({ caption: m[1].trim(), name: m[2] })
  return [...new Map(out.map(i => [i.name, i])).values()] // 同名图去重（重复配图标记不重复进 gallery）
}

// 配图标记 = 图池元数据，不是正文（2026-08-18 自检实证）：比对/安置层必须剥掉——留着会冤枉「只搬文字不抄标记」
// 的正确搬运（整行闸误杀），也会让独立标记行被误判「未用」、经强制安置泄漏进页面正文。
const IMG_RE_SRC = '（\\s*配图\\s*[:：]?\\s*[^）]*?[\\w.-]+\\.(?:jpe?g|png|webp)\\s*）'
export const hasImgMarker = s => new RegExp(IMG_RE_SRC, 'i').test(String(s))
export const stripImgMarkers = s => String(s).replace(new RegExp(IMG_RE_SRC, 'gi'), '')

// ---------- URL 剥壳（旧站迁移插件：对 dgcrane 旧站调优，换站不保证；贴裸文本路站点无关） ----------
export function stripHtml(html) {
  // dgcrane 旧站产品页：优先抽 #product 主容器（§7：标题→询盘在其内，related-products 在其外）；抽不到回退整页剥
  const start = html.match(/<div[^>]*id=["']product["'][^>]*>/i)
  if (start) {
    const rest = html.slice(start.index)
    const end = rest.match(/<div[^>]*id=["'](?:related-products|crane-related|footer)["'][^>]*>/i) // 旧站模版的正文终止标记（相关区或 #footer div）
    html = end ? rest.slice(0, end.index) : rest
  }
  const images = []
  for (const m of html.matchAll(/<img[^>]+src=["'][^"']*?\/([\w.-]+\.(?:jpe?g|png|webp))["'?\s]/gi))
    images.push(m[1])
  let t = html
    .replace(/<(script|style|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
  return { text: t, images: [...new Set(images)] }
}

// ---------- 取源：text 直通 / url 抓取剥壳 ----------
export async function fetchSource({ text, url }) {
  if (text) return { rawText: text, images: extractImages(text) }
  if (!/^https?:\/\//.test(url || '')) throw new Error('url 仅支持 http/https')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 burn-console' } })
    if (!res.ok) throw new Error(`抓取失败 HTTP ${res.status}`)
    const html = (await res.text()).slice(0, 2_000_000) // 大小上限 2MB
    const { text: rawText, images } = stripHtml(html)
    if (numberBlocks(rawText).length < 3) throw new Error('剥壳后正文过少，请改贴裸文本')
    return { rawText, images: images.map(name => ({ caption: '', name })) }
  } finally { clearTimeout(timer) }
}

// ---------- 字段目录：结构真相=套件 index.astro + example 参照，装载时自校验 ----------
// 字段清单及其语义依据见套件同目录 meta.json + meta.md（components/products/<名>/，单一真相）

// 读模板旁边的 meta 文件，返回字段清单 [{key,shape,level}]
export function loadMeta(metaPath) {
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
  if (!Array.isArray(meta) || !meta.every(c => c.key && c.shape && c.level))
    throw new Error(`meta 格式非法(须为 [{key,shape,level}]):${metaPath}`)
  return meta
}

// ---------- 套件扫描发现：扫 components/<族>/<名>/，同名三件齐=完整套件 ----------
export function scanKits(componentsDir) {
  const kits = []
  const fams = readdirSync(componentsDir, { withFileTypes: true }).filter(d => d.isDirectory())
  for (const fd of fams) {
    const famDir = join(componentsDir, fd.name)
    for (const nd of readdirSync(famDir, { withFileTypes: true }).filter(d => d.isDirectory())) {
      const dir = join(famDir, nd.name)
      kits.push({
        family: fd.name, name: nd.name, dir,
        hasAstro: existsSync(join(dir, 'index.astro')),
        hasMeta: existsSync(join(dir, 'meta.json')),
        hasExample: existsSync(join(dir, 'example.json')),
      })
    }
  }
  return kits.map(k => ({ ...k, complete: k.hasAstro && k.hasMeta && k.hasExample }))
}

// 通用件约定名（posts→PostPage / products→ProductPage，首字母大写）：auto 判族与无声明落盘的默认套件
export function canonicalKitOf(kits, fam) {
  const complete = kits.filter(k => k.family === fam && k.complete)
  return complete.find(k => k.name === fam.replace(/s$/, '').replace(/^./, c => c.toUpperCase()) + 'Page')?.name
    ?? complete[0]?.name
}

// 取指定族/名的完整套件；不存在或不完整→抛错（缺哪样明说）
export function findKit(componentsDir, family, name) {
  const k = scanKits(componentsDir).find(x => x.family === family && x.name === name)
  if (!k) throw new Error(`套件不存在：${family}/${name}`)
  if (!k.complete) {
    const miss = [['index.astro', k.hasAstro], ['meta.json', k.hasMeta], ['example.json', k.hasExample]]
      .filter(([, h]) => !h).map(([f]) => f)
    throw new Error(`套件不完整：${family}/${name} 缺 ${miss.join('、')}`)
  }
  return k.dir
}

// 双源核验：字段清单读 meta；组件字段看 .astro data-field（specs 特判 spec.text）；page.* 等 chrome 层看参照 JSON 实际键
export function loadCatalog(metaPath, astroPath, refJsonPath) {
  const catalog = loadMeta(metaPath)
  const fields = new Set([...readFileSync(astroPath, 'utf8').matchAll(/data-field="([^"]+)"/g)].map(m => m[1]))
  const ref = JSON.parse(readFileSync(refJsonPath, 'utf8'))
  return catalog.map(c => {
    let verified
    if (c.key === 'summary_intro') verified = fields.has('summary_intro.body') // 组件/旧模版均只渲 body（title 为存量死数据，烧 title 仅为与存量 JSON 同构）
    else if (c.shape === 'section') verified = fields.has(`${c.key}.body`)
      && (c.titlePath === null || fields.has(c.titlePath ?? `${c.key}.title`)) // titlePath=标题落点；null=无标题槽（body-only）；缺省=<key>.title
    else if (c.shape === 'sections') verified = fields.has('section.heading') && fields.has('section.body') // 重复章节：单元槽是套件 map 里的相对名（section.*）
    else if (c.key === 'specs') verified = fields.has('spec.text')
    else verified = c.path ? fields.has(c.path) : (fields.has(c.key) || getIn(ref, c.key) !== undefined) // text 带 path=值落点（如标题位 body.h_x）
    if (!verified) throw new Error(`目录键 ${c.key} 双源核验失败（.astro 与参照 JSON 都没有）——先对齐组件或 meta`)
    return { ...c, verified }
  })
}

// ---------- 自然名归一：模型照 example 结构输出嵌套块名时，确定性拆回目录格名 ----------
// meta 白名单用平铺点号格名（summary.intro/hero.headline/hero.highlights），而 example.json 顶层是
// 嵌套块（summary/hero）。模型照 example 抄整块不该被当「发明字段」枪毙——example 顶层存在、
// 目录里有点号子键的块名是合法别名，按目录 shape 拆回子格；拆不出有效子格的才落 unknown 枪毙。
export function normalizeFields(fields, catalog, example) {
  const byKey = new Map(catalog.map(c => [c.key, c]))
  const aliases = new Map() // 顶层块名 → Map(子键 → 目录格名)
  for (const c of catalog) {
    const dot = c.key.indexOf('.')
    if (dot <= 0) continue
    const top = c.key.slice(0, dot)
    const sub = c.key.slice(dot + 1)
    if (example && typeof example === 'object' && Object.prototype.hasOwnProperty.call(example, top)) {
      if (!aliases.has(top)) aliases.set(top, new Map())
      aliases.get(top).set(sub, c.key)
    }
  }
  const out = []
  for (const [key, data] of Object.entries(fields ?? {})) {
    if (byKey.has(key)) { out.push({ key, data }); continue }
    const sub = aliases.get(key)
    let mapped = 0
    if (sub && data && typeof data === 'object' && !Array.isArray(data)) {
      for (const [sk, ck] of sub) {
        const v = data[sk]
        if (v === undefined || v === null) continue
        const shape = byKey.get(ck).shape
        if (shape === 'text' && typeof v === 'string') { out.push({ key: ck, data: { text: v } }); mapped++ }
        else if (shape === 'list' && Array.isArray(v) && v.every(x => typeof x === 'string')) { out.push({ key: ck, data: { items: v } }); mapped++ }
        else if (shape === 'seo' && typeof v === 'string') { out.push({ key: ck, data: { text: v } }); mapped++ }
      }
      if (mapped) continue
      out.push({ key, data, unknown: `块「${key}」内没有可用的子键（白名单只收 ${[...sub.keys()].join('/')}；图片等 chrome 字段不烧）` })
      continue
    }
    out.push({ key, data, unknown: '格子名不在白名单（发明字段）' })
  }
  return out
}

// ---------- 位置归集（人审辅助）：命中位置机器算，不经 AI 认领 ----------
// 只产 fieldMap（每格命中的原文段号）。告警层已退役（2026-08-17）：同段复用告警分不清
// 「AI 把一段塞两格」与「原文本身重复」（散文+规格表同句是常态）——硬误报源修不好；
// 重度重复（>50%）由 findDuplicates 硬闸管，轻度重复人眼在 fieldMap 行自见。
export function auditPositions(filledResults, rawText, paragraphs) {
  const normSrc = normalizeText(rawText)
  // 段落规范化区间（normSrc ≡ 各段规范化串的顺序拼接，区间严格相邻）
  const spans = []
  let cursor = 0
  for (const p of paragraphs) {
    const t = normalizeText(p.text)
    const at = normSrc.indexOf(t, cursor)
    spans.push({ n: p.n, from: at >= 0 ? at : cursor, to: at >= 0 ? at + t.length : cursor })
    if (at >= 0) cursor = at + t.length
  }
  const paraOf = pos => spans.find(s => pos >= s.from && pos < s.to)?.n

  const hits = [] // {key, shape, pos}
  for (const r of filledResults) {
    const texts = r.shape === 'section' ? treeBlocks(mdToDoc(r.data.body_md))
      : r.shape === 'sections' ? r.data.items.flatMap(it => [it.heading, ...treeBlocks(mdToDoc(it.body_md))])
      : r.shape === 'list' ? r.data.items
      : [r.data.text].filter(Boolean)
    for (const t of texts) {
      const at = normSrc.indexOf(normalizeText(t))
      if (at >= 0) hits.push({ key: r.key, shape: r.shape, pos: at })
    }
  }
  // 人审辅助：每格命中的段号（去重排序）
  const fieldMap = filledResults.map(r => ({
    key: r.key,
    paras: [...new Set(hits.filter(h => h.key === r.key).map(h => paraOf(h.pos)).filter(n => n !== undefined))].sort((a, b) => a - b),
  }))
  return { fieldMap }
}

// ---------- 重叠检测（防全文塞多格）：section 格两两比，共享块/最大块数 > 0.5 判重复 ----------
export function findDuplicates(filled) {
  const bodies = new Map()
  for (const r of filled) {
    if (r.shape !== 'section' || !r.data?.body_md) continue
    bodies.set(r.key, treeBlocks(mdToDoc(r.data.body_md)).map(normalizeText))
  }
  const out = []
  const keys = [...bodies.keys()]
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const A = bodies.get(keys[i]), B = bodies.get(keys[j])
    const setB = new Set(B)
    const shared = A.filter(t => setB.has(t)).length
    const pct = shared / Math.max(A.length, B.length)
    if (pct > 0.5) out.push({ a: keys[i], b: keys[j], pct: Math.round(pct * 100) })
  }
  return out
}

// ---------- 规范化：溯源比较的唯一口径（全角→半角、标点归一、去空白、拉丁小写） ----------
const FW = s => s.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
export function normalizeText(s) {
  return FW(String(s))
    .replace(/[，。：；、（）【】％～？！]/g, c => ({ '，': ',', '。': '.', '：': ':', '；': ';', '、': ',', '（': '(', '）': ')', '【': '[', '】': ']', '％': '%', '～': '~', '？': '?', '！': '!' }[c]))
    .replace(/\s+/g, '')
    .toLowerCase()
}

// ---------- 树 → 块级文字数组（段落/标题/列表项/单元格各一条；图跳过） ----------
export function treeBlocks(node, out = []) {
  if (node.type === 'text') return out
  if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'listItem'
    || node.type === 'tableCell' || node.type === 'tableHeader') {
    const t = (function flat(n) { return n.type === 'text' ? n.text : (n.content ?? []).map(flat).join('') })(node)
    if (t.trim()) out.push(t)
    return out
  }
  for (const c of node.content ?? []) treeBlocks(c, out)
  return out
}

// ---------- 逐字溯源：树里每个块级文字，规范化后必须是原文全文的子串 ----------
export function verifyTree(tree, srcSlice) {
  validateDoc(tree, 'verify') // 顺手过 schema——畸形树与凑字段同罪
  const hay = normalizeText(srcSlice)
  const failures = treeBlocks(tree).filter(t => !hay.includes(normalizeText(t)))
  return { ok: failures.length === 0, failures }
}

// ---------- 整行查验（「我已整理好」模式，2026-08-18）：输出每块必须 = 一整行或连续几整行 ----------
// 比 verifyTree 更严：子串（半句/挑句拼）也算过 → 整行才算搬运。三个实战修正：
// ①允许连续行合并（粘贴假换行把一句话折成多行，不许合并则那段无处可去）；跳行拼接不合法（=重组内容）；
// ②比对前剥 markdown 行首标记（#/列表/有序/引用）与行内强调（**等是排版不是字，不剥会冤枉照抄）；
// ③粒度单位是「行」而非「段」：一段散文是一行，清单一行一条，表格行按行+单元格双口径。
export function stripMdMarkers(s) {
  return String(s)
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.、)]\s*|>\s*)/, '')
    .replace(/(\*\*|__|~~|`|\*)/g, '')
}

// 行原子判定器：whole(t)=t 是否恰好等于一整行（或连续几整行拼接，merge=false 时禁拼接）
export function lineAtom(src) {
  const norm = t => normalizeText(stripMdMarkers(t))
  const singles = new Set(), seq = []
  for (const line of String(src).split('\n').map(t => stripImgMarkers(t).trim()).filter(Boolean)) {
    const n = norm(line)
    if (!n) continue
    singles.add(n); seq.push(n)
    if (line.includes('|')) // 表格行：单元格也算合法搬运单位
      for (const c of line.split('|').map(x => norm(x))) if (c) singles.add(c)
  }
  const whole = (t, merge = true) => {
    const n = norm(t)
    if (!n) return true
    if (singles.has(n)) return true
    if (!merge) return false
    for (let i = 0; i < seq.length; i++) { // 连续行滑窗（至多 40 行，页级文本足够）
      let acc = ''
      for (let j = i; j < Math.min(seq.length, i + 40); j++) {
        acc += seq[j]
        if (acc === n) return true
        if (acc.length > n.length) break
      }
    }
    return false
  }
  return { whole }
}

export function verifyTreeStrict(tree, srcSlice) {
  validateDoc(tree, 'verify') // 顺手过 schema——畸形树与凑字段同罪
  const { whole } = lineAtom(srcSlice)
  const failures = treeBlocks(tree).filter(t => !whole(t))
  return { ok: failures.length === 0, failures }
}

// ---------- 相似度（纯 Dice bigram；包含关系归 similarToAny 管，不在这里特判） ----------
export function similarity(a, b) {
  const [x, y] = [normalizeText(a), normalizeText(b)]
  if (x === y) return 1
  if (x.length < 2 || y.length < 2) return 0
  const bg = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); m.set(k, (m.get(k) ?? 0) + 1) } return m }
  const [mx, my] = [bg(x), bg(y)]
  let hit = 0
  for (const [k, v] of mx) hit += Math.min(v, my.get(k) ?? 0)
  return (2 * hit) / (x.length - 1 + y.length - 1)
}

// ---------- 标题级判定：规范化后互相包含 或 Dice ≥ 阈值，任一即中 ----------
export function similarToAny(title, candidates, threshold = 0.9) {
  const t = normalizeText(title)
  return candidates.some(c => {
    const s = normalizeText(c)
    return t === s || (t.length >= 2 && s.includes(t)) || (s.length >= 2 && t.includes(s)) || similarity(t, s) >= threshold
  })
}

// ---------- 组装：结构归代码，AI 的值栽进骨架；骨架跟族（产品超集 / 文章），只返回 JSON 本体 ----------
// 族分支是骨架装配层的边界（骨架形态=族级差异，同「新族=新套件+新装配」）；
// 值的栽种仍全按 shape/目录/meta 路径声明驱动，无字段名特判。
export async function assemble({ slug, productName, family = 'products', sectionResults, imagePool = [], example }) {
  return family === 'posts'
    ? assemblePost({ slug, productName, sectionResults, imagePool, example })
    : assembleProduct({ slug, productName, sectionResults, imagePool, example })
}

// 通用栽种（meta 路径声明驱动，两族共用）：section 树落 <key>.body、标题按 titlePath
// （null=无标题槽，title 落 <key>.title 当结构对齐死数据——summary_intro 旧例）；text 带 path 落 path。
// 消化了返回 true，族装配器只处理自己认识的剩余键。
function plantField(j, r) {
  if (r.shape === 'section' && r.data) {
    // 树在验收期已过 schema（verifyTree 内含 validateDoc），落盘前 writeDraft 再过——此处不重复验
    j[r.key] = { title: r.data.title, body: mdToDoc(r.data.body_md) }
    if (typeof r.titlePath === 'string') setIn(j, r.titlePath, r.data.title)
    return true
  }
  if (r.shape === 'text' && r.path && r.data) { setIn(j, r.path, r.data.text); return true }
  return false
}

// ---------- chrome 骨架：值全从套件 example.json 克隆（引擎只认契约路径，不认站） ----------
// page.title 后缀 = 机械替换（example.page.title 含 example.title 则换名保后缀，否则裸标题）。
function chromeOf(example, productName, slug, type) {
  if (!example?.page) throw new Error('assemble 需要 example（套件参照 JSON）——chrome 值从它克隆，引擎不内置任何站点信息')
  const famDir = type === 'post' ? 'posts' : 'products'
  const suffixTitle = t => (example.page.title && example.title && example.page.title.includes(example.title))
    ? example.page.title.replace(example.title, t)
    : t
  const j = {
    version: 1,
    page: {
      slug: `${famDir}/${slug}`, type, lang: example.page.lang ?? 'zh-CN',
      title: suffixTitle(productName), description: '', family: example.page.family, status: 'draft',
    },
    title: productName,
  }
  if (example.breadcrumb) j.breadcrumb = structuredClone({ ...example.breadcrumb, current: productName })
  if (example.inquiry_form) j.inquiry_form = structuredClone(example.inquiry_form)
  return j
}

async function assembleProduct({ slug, productName, sectionResults, imagePool = [], example }) {
  const j = {
    ...chromeOf(example, productName, slug, 'product'),
    summary: example.summary ? { ...structuredClone(example.summary), intro: undefined } : {},
    specs: [],
    related_products: example.related_products ? { ...structuredClone(example.related_products), seed: [] } : undefined,
    hero: { headline: '', highlights: [] },
  }
  for (const r of sectionResults) {
    if (!r.data) continue // 失败段缺席（超集裁剪天然支持）
    if (plantField(j, r)) continue
    else if (r.key === 'specs') {
      j.specs = r.data.items.map(text => ({ text }))
    } else if (r.key === 'summary.intro') {
      j.summary.intro = r.data.text
    } else if (r.key === 'hero.headline') {
      j.hero.headline = r.data.text
    } else if (r.key === 'hero.highlights') {
      j.hero.highlights = r.data.items
    } else if (r.key === 'page.description') {
      j.page.description = r.data.text
    } else throw new Error(`assemble 未处理的字段: ${r.key}（${r.shape}）——先对齐目录或组装，不静默丢`)
  }
  if (j.installation && !j.installation.cases) j.installation.cases = [] // 组件无守卫读 .cases.map
  if (imagePool.length) {
    j.gallery = []
    for (const { caption, name } of imagePool) {
      const dims = await probe(name, SITE_ASSETS.dir) // 缺图 {} —— known-leftover 惯例
      j.gallery.push({ image: name, alt: caption || productName, ...dims })
    }
  }
  return j
}

// ---------- 文章骨架：值全从套件 example 克隆；PostPage 型 sections 重复章节；图池按顺序配段 ----------
async function assemblePost({ slug, productName, sectionResults, imagePool = [], example }) {
  const j = {
    ...chromeOf(example, productName, slug, 'post'),
    body: {},
  }
  for (const r of sectionResults) {
    if (!r.data) continue // 失败段缺席
    if (r.shape === 'sections') {
      // 逐项树验收期已过 schema（verifyTree），落盘前 writeDraft 再过——此处不重复验
      j.body.sections = r.data.items.map(it => ({ heading: it.heading, body: mdToDoc(it.body_md) }))
    } else if (plantField(j, r)) continue
    else if (r.key === 'title') {
      j.title = r.data.text
      j.page.title = j.page.title.includes(productName) ? j.page.title.replace(productName, r.data.text) : r.data.text
    } else if (r.key === 'page.description') {
      j.page.description = r.data.text
    } else throw new Error(`assemblePost 未处理的字段: ${r.key}（${r.shape}）——先对齐目录或组装，不静默丢`)
  }
  // 图池顺序配段：第 i 图给第 i 段，余图挂末段（确定性分配，人工在编辑器再调；报告注明）
  for (const [i, { caption, name }] of imagePool.entries()) {
    const target = j.body.sections[Math.min(i, j.body.sections.length - 1)]
    if (!target) break // 无章节则图无宿主，丢弃（报告的图池注记兜底）
    const dims = await probe(name, SITE_ASSETS.dir) // 缺图 {} —— known-leftover 惯例
    Object.assign(target, { image: name, alt: caption || target.heading, ...dims })
  }
  return j
}

// ---------- 近似预览（结构预览非像素级；真实页面存草稿后 dist-edit 看） ----------
export function previewHtml(j, catalog) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const escAttr = s => esc(s).replace(/"/g, '&quot;')
  const sections = catalog.filter(c => c.shape === 'section' && j[c.key])
    .map(c => { const t = (typeof c.titlePath === 'string' ? getIn(j, c.titlePath) : undefined) ?? j[c.key].title
      return `<section><h3>${esc(t)}</h3>${renderDoc(j[c.key].body)}</section>` }).join('\n')
  const chapters = catalog.filter(c => c.shape === 'sections').flatMap(c => getIn(j, c.key) ?? [])
    .map(s => `<section><h3>${esc(s.heading)}</h3>${renderDoc(s.body)}${s.image
      ? `<figure style="margin:6px 0"><img src="${SITE_ASSETS.url}/${escAttr(s.image)}" alt="${escAttr(s.alt ?? '')}" style="max-width:460px" width="${s.width ?? 880}" height="${s.height ?? 495}"></figure>` : ''}</section>`)
    .join('\n')
  const specs = j.specs?.length ? `<section><h3>主要参数</h3><ul>${j.specs.map(s => `<li>${esc(s.text)}</li>`).join('')}</ul></section>` : ''
  const gallery = j.gallery?.length ? `<section><h3>图集</h3>${j.gallery.map(g => `<figure style="display:inline-block;margin:6px"><img src="${SITE_ASSETS.url}/${escAttr(g.image)}" alt="${escAttr(g.alt)}" style="max-width:220px" width="${g.width ?? 220}" height="${g.height ?? 150}"><figcaption style="font-size:12px;color:#666">${esc(g.image)}</figcaption></figure>`).join('')}</section>` : ''
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
body{font:14px/1.7 -apple-system,"PingFang SC",sans-serif;max-width:860px;margin:20px auto;padding:0 16px;color:#222}
h1{border-bottom:2px solid #2563eb;padding-bottom:8px}h3{color:#1e40af;margin-top:28px}
.meta{background:#f6f7f9;border-radius:8px;padding:10px 14px;font-size:13px;color:#555}
table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 10px}
</style></head><body>
<h1>${esc(j.title)}</h1>
<div class="meta">slug: ${esc(j.page.slug)} ｜ status: draft ｜ SEO: ${esc(j.page.description || '（缺）')}</div>
${j.hero?.headline ? `<p><b>${esc(j.hero.headline)}</b></p>` : ''}
${j.hero?.highlights?.length ? `<ul>${j.hero.highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
${j.summary?.intro ? `<p>${esc(j.summary.intro)}</p>` : ''}
${specs}
${sections}
${chapters}
${gallery}
</body></html>`
}
