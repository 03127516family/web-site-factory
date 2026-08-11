// DeepSeek 烧制台·纯逻辑库（零网络零 AI，全部可单测）。
// AI 只产 markdown/简单 JSON；树转换、校验、组装全在这里——结构归代码。
import { readFileSync } from 'node:fs'
import { mdToDoc } from './mdast-tree.mjs'
import { validateDoc } from './content-schema.mjs'
import { renderDoc } from './render-doc.mjs'
import { getIn } from './tree-utils.mjs'
import { probe } from '../scripts/img-probe.mjs'

export { mdToDoc, validateDoc, getIn }

// ---------- 原文切块编号（AI 只许引用块号，span 校验=纯集合运算） ----------
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

// ---------- URL 剥壳（启发式，对 dgcrane 旧站调优；剥不好用户改贴文本） ----------
export function stripHtml(html) {
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

// ---------- 字段目录（spec §5）：结构真相=ProductPage.astro + 参照 JSON，装载时自校验 ----------
// shape: section={title,body_md} | list=文本数组 | text=单文本 | seo=概括豁免
export const SECTION_CATALOG = [
  // 正文段（title 相似级 + body 逐字级树），全部可选——缺段=缺席
  { key: 'overview',      shape: 'section', level: 'verbatim' },
  { key: 'introduction',  shape: 'section', level: 'verbatim' },
  { key: 'advantages',    shape: 'section', level: 'verbatim' },
  { key: 'protection',    shape: 'section', level: 'verbatim' },
  { key: 'main_features', shape: 'section', level: 'verbatim' },
  { key: 'basic_params',  shape: 'section', level: 'verbatim' },
  { key: 'spec_compare',  shape: 'section', level: 'verbatim' },
  { key: 'spec_detail',   shape: 'section', level: 'verbatim' },
  { key: 'which_better',  shape: 'section', level: 'verbatim' },
  { key: 'summary_intro', shape: 'section', level: 'verbatim' }, // 组件只渲 body（无 title 槽，loadCatalog 特判）
  { key: 'installation',  shape: 'section', level: 'verbatim' },
  // 特殊字段
  { key: 'specs',           shape: 'list', level: 'verbatim' }, // [{text}]，规格数字逐字
  { key: 'summary.intro',   shape: 'text', level: 'verbatim' },
  { key: 'hero.headline',   shape: 'text', level: 'similar' },  // 允许等于产品名
  { key: 'hero.highlights', shape: 'list', level: 'similar' },
  { key: 'page.description',shape: 'seo',  level: 'summary' },  // 概括豁免+报告标出
]
// v1 不烧（缺席或站级默认，报告注明）：gallery 以外的图组、related_products、case、
// production_flow、components_images、crane_types_images、breadcrumb.trail、inquiry_form

// 双源核验：组件字段看 .astro data-field（specs 特判 spec.text）；page.* 等 chrome 层看参照 JSON 实际键
export function loadCatalog(astroPath, refJsonPath) {
  const fields = new Set([...readFileSync(astroPath, 'utf8').matchAll(/data-field="([^"]+)"/g)].map(m => m[1]))
  const ref = JSON.parse(readFileSync(refJsonPath, 'utf8'))
  return SECTION_CATALOG.map(c => {
    let verified
    if (c.key === 'summary_intro') verified = fields.has('summary_intro.body') // 组件/旧模版均只渲 body（title 为存量死数据，烧 title 仅为与存量 JSON 同构）
    else if (c.shape === 'section') verified = fields.has(`${c.key}.title`) && fields.has(`${c.key}.body`)
    else if (c.key === 'specs') verified = fields.has('spec.text')
    else verified = fields.has(c.key) || getIn(ref, c.key) !== undefined
    if (!verified) throw new Error(`目录键 ${c.key} 双源核验失败（.astro 与参照 JSON 都没有）——先对齐组件或目录`)
    return { ...c, verified }
  })
}

// ---------- 规划表硬查（纯集合运算 + specs 数字启发式；AI 输出边界，畸形输入一律转可喂回的错误） ----------
export function checkPlan(plan, blocks) {
  const errors = []
  const seenFields = new Set()
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.fields))
    return { errors: ['规划表结构非法（须为 {fields:[…]}）'], uncovered: blocks.map(b => b.n) }
  if (plan.fields.length === 0)
    return { errors: ['规划表 fields 为空'], uncovered: blocks.map(b => b.n) }
  const known = new Set(SECTION_CATALOG.map(c => c.key))
  const seen = new Map() // 块号 → field
  let lastFirst = 0
  const sliceOf = ns => blocks.filter(b => ns.includes(b.n)).map(b => b.text).join('\n')
  for (const f of plan.fields) {
    if (!f || typeof f !== 'object') { errors.push('规划条目不是对象'); continue }
    if (!known.has(f.field)) { errors.push(`未知字段 "${f.field}"`); continue }
    if (seenFields.has(f.field)) { errors.push(`字段重复 "${f.field}"`); continue }
    seenFields.add(f.field)
    if (!Array.isArray(f.blocks) || !f.blocks.length) { errors.push(`${f.field}: blocks 为空`); continue }
    const valid = []
    for (const b of f.blocks) {
      if (!Number.isInteger(b) || b < 1 || b > blocks.length) { errors.push(`${f.field}: 块号越界 ${b}`); continue }
      if (seen.has(b)) errors.push(`块 ${b} 重叠（${seen.get(b)} 与 ${f.field}）`)
      seen.set(b, f.field)
      valid.push(b)
    }
    // 单调判定只消费校验过的块号——脏值不污染后续字段（审查 Important #1）
    if (valid.length) {
      const first = Math.min(...valid)
      if (first < lastFirst) errors.push(`${f.field}: 顺序非单调（出现在更前面的字段之前）`)
      lastFirst = Math.max(lastFirst, first)
      if (f.field === 'specs' && !/\p{Nd}/u.test(sliceOf(valid))) errors.push('specs 映射的原文块里没有数字——疑似指错位置')
    }
  }
  const uncovered = []
  for (const b of blocks) if (!seen.has(b.n)) uncovered.push(b.n)
  return { errors, uncovered }
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

// ---------- 逐字溯源：树里每个块级文字，规范化后必须是原文切片的子串 ----------
export function verifyTree(tree, srcSlice) {
  validateDoc(tree, 'verify') // 顺手过 schema——畸形树与凑字段同罪
  const hay = normalizeText(srcSlice)
  const failures = treeBlocks(tree).filter(t => !hay.includes(normalizeText(t)))
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

// ---------- 组装：结构归代码，AI 的值栽进产品超集骨架；只返回 JSON 本体 ----------
export async function assemble({ slug, productName, sectionResults, imagePool = [] }) {
  const j = {
    version: 1,
    page: {
      slug: `products/${slug}`, type: 'product', lang: 'zh-CN',
      title: `${productName} - DGCRANE`,
      description: '', family: 'product@1', status: 'draft',
    },
    title: productName,
    breadcrumb: { current: productName, trail: [{ label: '首页', url: 'https://www.dgcrane.com/zh/' }] },
    inquiry_form: { type: 'inquiry-form', form_id: 713, title: '填写您的详细资料，我们将在24小时内给您答复!' },
    summary: { cta: '报价要求' },
    specs: [],
    related_products: { type: 'related-products', title: '相关产品', category: '', limit: 4, seed: [] },
    hero: { headline: '', highlights: [] },
  }
  for (const r of sectionResults) {
    if (!r.data) continue // 失败段缺席（超集裁剪天然支持）
    if (r.shape === 'section') {
      const tree = mdToDoc(r.data.body_md)
      validateDoc(tree, `${r.key}.body`)
      j[r.key] = { title: r.data.title, body: tree }
    } else if (r.key === 'specs') {
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
      const dims = await probe(name) // 缺图 {} —— known-leftover 惯例
      j.gallery.push({ image: name, alt: caption || productName, ...dims })
    }
  }
  return j
}

// ---------- 近似预览（结构预览非像素级；真实页面存草稿后 dist-edit 看） ----------
export function previewHtml(j) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const escAttr = s => esc(s).replace(/"/g, '&quot;')
  const sections = SECTION_CATALOG.filter(c => c.shape === 'section' && j[c.key])
    .map(c => `<section><h3>${esc(j[c.key].title)}</h3>${renderDoc(j[c.key].body)}</section>`).join('\n')
  const specs = j.specs?.length ? `<section><h3>主要参数</h3><ul>${j.specs.map(s => `<li>${esc(s.text)}</li>`).join('')}</ul></section>` : ''
  const gallery = j.gallery?.length ? `<section><h3>图集</h3>${j.gallery.map(g => `<figure style="display:inline-block;margin:6px"><img src="/assets/img/product/${escAttr(g.image)}" alt="${escAttr(g.alt)}" style="max-width:220px" width="${g.width ?? 220}" height="${g.height ?? 150}"><figcaption style="font-size:12px;color:#666">${esc(g.image)}</figcaption></figure>`).join('')}</section>` : ''
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
${gallery}
</body></html>`
}
