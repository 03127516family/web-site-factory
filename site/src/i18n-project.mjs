// 投影器（§2/§6）：镜像 = project(源树, TM)。full=预览/编辑（草稿+占位+pending 注解）；
// approved=生产（只出已审，空段删，核心字段未审→null 不可发）。纯函数，零 IO。
import { fp, extractInlineUnits, sliceInlineMd, inlineSpans } from './i18n-sent.mjs'
import { inlineMdToNodes } from './mdast-tree.mjs'
import { validateDoc } from './content-schema.mjs'
import { SKIP_KEYS, skipPath, VALUE_SKIP } from './i18n-collect.mjs' // 同一套排除：键+路径前缀+值形态（值形态命中的串直通保留——它们永远不进 TM，删了就是生产镜像丢图）

export const PENDING_CLASS = 'i18n-pending'
const CORE_FIELDS = ['title', 'page.title', 'page.description', 'breadcrumb.current']

const anno = nodes => nodes.map(n => n.type === 'text'
  ? { ...n, marks: [...(n.marks ?? []), { type: 'span', attrs: { class: PENDING_CLASS } }] }
  : n)

// 一句的投影：返回节点数组 | null（不出）
function sentNodes(text, sentenceFp, tm, mode) {
  const e = tm.sentences[sentenceFp]
  if (e?.status === 'approved') return inlineMdToNodes(e.translation)
  if (mode === 'approved') return null
  if (e?.status === 'draft') return anno(inlineMdToNodes(e.translation))
  return anno(inlineMdToNodes(text)) // 未译/failed → 中文占位（full 模式）
}

// 树投影：逐节点重建。返回值 null = 该节点整体不出。
function projNode(node, tm, mode) {
  if (node.type === 'paragraph') {
    const out = []
    for (const u of extractInlineUnits(node.content ?? [])) {
      const nodes = sentNodes(u.md, fp(u.md), tm, mode)
      if (nodes) out.push(...nodes)
    }
    return out.length ? { ...node, content: out } : null
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
    const kids = (node.content ?? []).map(c => projNode(c, tm, mode)).filter(Boolean)
    if (!kids.length && node.type !== 'doc') return null
    return { ...node, content: kids }
  }
  return node // 叶子（hr 等）
}

export function projectPage(srcJ, tm, mode, { lang, existingStatus, existingTrail } = {}) {
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
      const doc = projNode(node, tm, mode)
      return doc && doc.content.length ? doc : null // 空 body → 段删信号
    }
    const out = {}
    for (const [k, v] of Object.entries(node)) {
      const p = path ? `${path}.${k}` : k
      if (!path && k === 'i18n') continue
      if (typeof v === 'string' && !SKIP_KEYS.has(k) && !VALUE_SKIP(v) && v.trim()) {
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
    // 段一致性：有 body 的段，body 投影没了 → 整段删；段标题未审（被删）→ 整段删
    if (node.body?.type === 'doc' && out.body === undefined) return null
    if (node.body?.type === 'doc' && typeof node.title === 'string' && out.title === undefined) return null
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
