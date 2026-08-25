// 可译单元采集：walk 源 JSON → [{id, kind, field, path?, si?, text, fp}]。
// 判形不判名：doc 树→树单元；字符串→文本单元；结构性键与 URL/文件形态值排除（U-1 沿用）。
import { fp, extractInlineUnits, sliceInlineMd, inlineSpans } from './i18n-sent.mjs'

export const SKIP_KEYS = new Set(['version', 'status', 'slug', 'lang', 'type', 'template', 'family', 'category', 'id', 'dataSize', 'image', 'src', 'href', 'url', 'video', 'pdf'])
const SKIP_TOP = new Set(['i18n', 'i18n_rev', 'i18n_fp'])
const SKIP_PATHS = new Set(['breadcrumb.trail']) // 分语言手写结构（旧 STRUCTURAL_EXCLUDE）
const SKIP_PATH_LIST = [...SKIP_PATHS]
export const skipPath = p => SKIP_PATH_LIST.some(sp => p === sp || p.startsWith(sp + '.') || p.startsWith(sp + '[')) // 前缀命中整棵子树都跳（投影器复用）
export const VALUE_SKIP = v => /^(https?:)?\/\//.test(v) || v.startsWith('/assets/') || v.startsWith('#') || /^\d+(\.\d+)?x\d+(\.\d+)?$/.test(v) || /^[\w.-]+\.\w{2,4}$/.test(v)

// 树 → 单元。段落逐句；标题/单元格整体一句；图片 alt 一句；其余容器递归。
export function collectTreeUnits(node, field, out, path = '') {
  if (node.type === 'paragraph') {
    for (const u of extractInlineUnits(node.content ?? []))
      out.push({ id: `${field}:${path}#${u.si}`, kind: 'sent', field, path, si: u.si, text: u.md, fp: fp(u.md) })
    return
  }
  if (node.type === 'heading' || node.type === 'tableHeader' || node.type === 'tableCell') {
    if (node.type !== 'heading' && (node.content ?? []).length > 1) throw new Error(`多段单元格暂不支持采集（先定语义再扩）：${field}:${path}`) // 守卫只限单元格：heading 的 content 是行内节点，多节点属常态
    const inner = node.type === 'heading' ? (node.content ?? []) : (node.content?.[0]?.content ?? []) // 单元格单段解包
    const { spans } = inlineSpans(inner)
    const md = sliceInlineMd(inner, spans[0]?.start ?? 0, spans[spans.length - 1]?.end ?? 0)
    if (md) out.push({ id: `${field}:${path}#0`, kind: node.type === 'heading' ? 'block' : 'cell', field, path, si: 0, text: md, fp: fp(md) })
    return
  }
  if (node.type === 'image') {
    const alt = node.attrs?.alt?.trim()
    if (alt) out.push({ id: `${field}:${path}#alt`, kind: 'alt', field, path, text: alt, fp: fp(alt) })
    return
  }
  ;(node.content ?? []).forEach((c, i) => collectTreeUnits(c, field, out, path ? `${path}.content[${i}]` : `content[${i}]`))
}

// 整页 JSON → 单元清单（字段序稳定 = walk 序）
export function collectUnits(j) {
  const out = []
  const walk = (node, path) => {
    if (node == null || skipPath(path)) return
    if (typeof node === 'string') {
      const key = path.split('.').pop().replace(/\[\d+\]$/, '')
      if (SKIP_KEYS.has(key) || !node.trim() || VALUE_SKIP(node)) return
      out.push({ id: path, kind: 'field', field: path, text: node, fp: fp(node) })
      return
    }
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`)); return }
    if (typeof node === 'object') {
      if (node.type === 'doc') { collectTreeUnits(node, path, out); return }
      for (const [k, v] of Object.entries(node)) {
        if (!path && SKIP_TOP.has(k)) continue
        walk(v, path ? `${path}.${k}` : k)
      }
    }
  }
  walk(j, '')
  return out
}
