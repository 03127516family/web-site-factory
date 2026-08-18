// 投影器（§2/§6）：镜像 = project(源树, TM)。full=预览/编辑（草稿+占位+pending 注解）；
// approved=生产（只出已审，空段删，核心字段未审→null 不可发）。纯函数，零 IO。
import { fp, extractInlineUnits, sliceInlineMd, inlineSpans, applyInlineUnit } from './i18n-sent.mjs'
import { inlineMdToNodes } from './mdast-tree.mjs'
import { validateDoc } from './content-schema.mjs'
import { SKIP_KEYS, skipPath, VALUE_SKIP } from './i18n-collect.mjs' // 同一套排除：键+路径前缀+值形态（值形态命中的串直通保留——它们永远不进 TM，删了就是生产镜像丢图）

export const PENDING_CLASS = 'i18n-pending'
export const FAILED_CLASS = 'i18n-failed' // 引擎拒收句（红深）——审阅时重点看
export const UNTRANSLATED_CLASS = 'i18n-untranslated' // 从未翻译句=中文占位（红浅）——与待审黄标区分，审阅一眼可找
export const ANNO_CLASSES = [PENDING_CLASS, FAILED_CLASS, UNTRANSLATED_CLASS] // 注解类全集：adoptMirror/harvest 剥注解按此判（span 不进句 md）
const PENDING_MARK = { type: 'span', attrs: { class: PENDING_CLASS } }
const FAILED_MARK = { type: 'span', attrs: { class: FAILED_CLASS } }
const UNTRANSLATED_MARK = { type: 'span', attrs: { class: UNTRANSLATED_CLASS } }
const CORE_FIELDS = ['title', 'page.title', 'page.description', 'breadcrumb.current']

const anno = nodes => nodes.map(n => n.type === 'text'
  ? { ...n, marks: [...(n.marks ?? []), { type: 'span', attrs: { class: PENDING_CLASS } }] }
  : n)
const annoFailed = nodes => nodes.map(n => n.type === 'text'
  ? { ...n, marks: [...(n.marks ?? []), { type: 'span', attrs: { class: FAILED_CLASS } }] }
  : n)
const annoUntranslated = nodes => nodes.map(n => n.type === 'text'
  ? { ...n, marks: [...(n.marks ?? []), { type: 'span', attrs: { class: UNTRANSLATED_CLASS } }] }
  : n)

// 一句的投影：返回节点数组 | null（不出）
function sentNodes(text, sentenceFp, tm, mode) {
  const e = tm.sentences[sentenceFp]
  if (e?.status === 'approved') return inlineMdToNodes(e.translation)
  if (mode === 'approved') return null
  if (e?.status === 'draft') return anno(inlineMdToNodes(e.translation))
  if (e?.status === 'failed') return annoFailed(inlineMdToNodes(text)) // 拒收句=红深中文占位
  return annoUntranslated(inlineMdToNodes(text)) // 未译 → 中文占位（full 模式，红浅标）
}

// 树投影：逐节点重建。返回值 null = 该节点整体不出。lang = 目标语言（句间空格合成判 CJK 用）
function projNode(node, tm, mode, lang) {
  if (node.type === 'paragraph') {
    let nodes = node.content ?? []
    const { spans, text } = inlineSpans(nodes)
    const units = extractInlineUnits(nodes)
    const sepless = sp => !/[\s　]$/.test(text.slice(sp.start, sp.end)) // 源 span 无尾随分隔符（hardBreak 字符 \n 算有）
    const cjk = /^(zh|ja|ko)/.test(lang ?? '')
    let keptAfter = false
    for (let si = units.length - 1; si >= 0; si--) { // 降序回植防 si 漂移
      const e = tm.sentences[fp(units[si].md)]
      if (mode === 'approved' && e?.status !== 'approved') { nodes = applyInlineUnit(nodes, si, ''); continue } // 未审句删除
      const replacement = e?.status === 'approved' ? e.translation : e?.status === 'draft' ? e.translation : units[si].md
      const anno = e?.status === 'approved' ? [] : e?.status === 'failed' ? [FAILED_MARK] : e?.status === 'draft' ? [PENDING_MARK] : [UNTRANSLATED_MARK]
      const trail = keptAfter && sepless(spans[si]) && !cjk ? ' ' : '' // 合成句间空格（保留句之后还有保留句才补）
      nodes = applyInlineUnit(nodes, si, replacement, { annoMarks: anno, trail })
      keptAfter = true
    }
    if (mode === 'approved') { // 删句后悬空分隔符清边（段首孤 <br>/首尾纯空白节点）
      while (nodes.length && ((nodes[0].type === 'text' && !nodes[0].text.trim()) || nodes[0].type === 'hardBreak')) nodes.shift()
      while (nodes.length && ((nodes[nodes.length - 1].type === 'text' && !nodes[nodes.length - 1].text.trim()) || nodes[nodes.length - 1].type === 'hardBreak')) nodes.pop()
    }
    return nodes.length ? { ...node, content: nodes } : null
  }
  if (node.type === 'heading' || node.type === 'tableHeader' || node.type === 'tableCell') {
    if (node.type !== 'heading' && (node.content ?? []).length > 1) throw new Error('多段单元格暂不支持投影（先定语义再扩）')
    const inner = node.type === 'heading' ? (node.content ?? []) : (node.content?.[0]?.content ?? [])
    const { spans } = inlineSpans(inner)
    const md = sliceInlineMd(inner, spans[0]?.start ?? 0, spans[spans.length - 1]?.end ?? 0)
    if (!md) return node
    const nodes = sentNodes(md, fp(md), tm, mode)
    if (!nodes) return null
    return node.type === 'heading' ? { ...node, content: nodes } : { ...node, content: [{ type: 'paragraph', content: nodes }] }
  }
  if (node.type === 'image') {
    const alt = node.attrs?.alt?.trim()
    if (!alt) return node
    const e = tm.sentences[fp(alt)]
    const t = e?.status === 'approved' ? e.translation : mode === 'full' && e?.status === 'draft' ? e.translation : alt
    return { ...node, attrs: { ...node.attrs, alt: t } } // alt 未审保中文（属性位，不破阅读面）
  }
  if (node.content) {
    const kids = (node.content ?? []).map(c => projNode(c, tm, mode, lang)).filter(Boolean)
    if (!kids.length && node.type !== 'doc') return null
    return { ...node, content: kids }
  }
  return node // 叶子（hr 等）
}

export function projectPage(srcJ, tm, mode, { lang, existingStatus, existingTrail } = {}) {
  if (mode !== 'full' && mode !== 'approved') throw new Error(`projectPage mode 非法: ${mode}`)
  const j = structuredClone(srcJ)
  delete j.i18n_rev; delete j.i18n_fp
  j.page = { ...j.page, slug: `${lang}/${srcJ.page.slug}`, lang, status: existingStatus ?? 'draft' }

  // 核心字段闸（approved 模式）：任一未审 → 整页不可发
  if (mode === 'approved') {
    for (const f of CORE_FIELDS) {
      const v = f.split('.').reduce((o, k) => o?.[k], srcJ)
      if (typeof v === 'string' && tm.sentences[fp(v)]?.status !== 'approved') return null
    }
  }
  const walk = (node, path) => {
    if (node == null) return node
    if (skipPath(path)) return node // breadcrumb.trail 等：整棵子树原样保留（随后可被 existingTrail 覆盖）
    if (typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map((v, i) => {
      if (typeof v === 'string') {
        const key = path.split('.').pop() // 数组项无键名，用父键判排除（与采集器同口径）
        if (SKIP_KEYS.has(key) || VALUE_SKIP(v) || !v.trim()) return v // 直通
        const e = tm.sentences[fp(v)]
        if (e?.status === 'approved') return e.translation
        if (mode === 'approved') return null // 未审串项剔除（中文不进生产）
        return e?.status === 'draft' ? e.translation : v // full：draft 出译文/未译出中文（裸串挂不了 span，pending 高亮只覆盖树句——有意简化）
      }
      return walk(v, `${path}[${i}]`)
    }).filter(v => v !== null && !(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)) // null 项与空壳项都剔（规格审 #2 一并收）
    if (node.type === 'doc') {
      const doc = projNode(node, tm, mode, lang)
      return doc && doc.content.length ? doc : null // 空 body → 段删信号
    }
    const out = {}
    for (const [k, v] of Object.entries(node)) {
      const p = path ? `${path}.${k}` : k
      if (!path && k === 'i18n') continue
      if (typeof v === 'string' && !SKIP_KEYS.has(k) && !VALUE_SKIP(v) && v.trim() && !skipPath(p)) {
        const e = tm.sentences[fp(v)]
        if (e?.status === 'approved') out[k] = e.translation
        else if (mode === 'approved') continue            // 非核心文本未审 → 删字段
        else out[k] = e?.status === 'draft' ? e.translation : v // full：draft 出译文，未译出中文
        continue
      }
      const r = walk(v, p)
      if (r === null) continue
      if (typeof r === 'object' && !Array.isArray(r) && Object.keys(r).length === 0) continue // 空对象段删
      out[k] = r
    }
    // 段一致性：有 body 的段，body 投影没了 → 整段删；任何带 title 对象标题未审（被删）→ 整体删
    if (node.body?.type === 'doc' && out.body === undefined) return null
    if (typeof node.title === 'string' && out.title === undefined) return null // inquiry_form/related_products 同款，防空 h2/h3 残页
    return out
  }
  const result = walk(j, '')
  if (existingTrail && result.breadcrumb) result.breadcrumb.trail = existingTrail // 分语言手写 trail 保留
  // body 树逐份 validateDoc（V4 同纪律：投影产物也过 schema）
  for (const [k, v] of Object.entries(result)) {
    if (v && typeof v === 'object' && v.body?.type === 'doc') validateDoc(v.body, `${k}.body`)
  }
  result.i18n = { source: srcJ.page.lang }
  return result
}
