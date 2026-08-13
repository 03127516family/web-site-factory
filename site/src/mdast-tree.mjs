// mdast → 语义树 映射（md-to-json 与 i18n-apply 共用）。
// 烧树只此一份逻辑：未映射的节点一律抛错（先定语义再扩注册表，不静默降级）。
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfm } from 'micromark-extension-gfm'
import { gfmFromMarkdown } from 'mdast-util-gfm'

export function mapInline(nodes, marks = []) {
  const out = []
  for (const n of nodes) {
    const withMarks = marks.length ? { marks: marks.map(m => ({ ...m })) } : {}
    switch (n.type) {
      case 'text':      out.push({ type: 'text', text: n.value, ...withMarks }); break
      case 'strong':    out.push(...mapInline(n.children, [...marks, { type: 'bold' }])); break
      case 'emphasis':  out.push(...mapInline(n.children, [...marks, { type: 'italic' }])); break
      case 'inlineCode':out.push({ type: 'text', text: n.value, marks: [...marks, { type: 'code' }] }); break
      case 'link':      out.push(...mapInline(n.children, [...marks, { type: 'link', attrs: { href: n.url } }])); break
      case 'image':     out.push({ type: 'image', attrs: { src: n.url, alt: n.alt ?? null } }); break
      case 'break':     out.push({ type: 'hardBreak' }); break
      default: throw new Error(`未映射的行内节点: ${n.type}（先定语义再扩注册表，不静默降级）`)
    }
  }
  return out
}

function mapTable(n) {
  return {
    type: 'table',
    content: n.children.map((row, ri) => ({
      type: 'tableRow',
      content: row.children.map(cell => ({
        type: ri === 0 ? 'tableHeader' : 'tableCell',
        content: [{ type: 'paragraph', content: mapInline(cell.children) }],
      })),
    })),
  }
}

export function mapBlock(nodes) {
  const out = []
  for (const n of nodes) {
    if (n.type === 'paragraph') {
      const inline = mapInline(n.children)
      // 吸收图片尺寸后缀 {WxH}（旧 MD 约定）
      for (let i = 0; i < inline.length - 1; i++) {
        if (inline[i].type === 'image' && inline[i + 1].type === 'text') {
          const m = inline[i + 1].text.match(/^\{(\d+)x(\d+)\}$/)
          if (m) {
            inline[i].attrs.width = +m[1]
            inline[i].attrs.height = +m[2]
            inline.splice(i + 1, 1)
          }
        }
      }
      // image 是块级节点：从段落里提出来，前后文字各成段落
      let buf = []
      const flush = () => { if (buf.length) { out.push({ type: 'paragraph', content: buf }); buf = [] } }
      for (const c of inline) {
        if (c.type === 'image') { flush(); out.push(c) } else buf.push(c)
      }
      flush()
    } else if (n.type === 'heading') {
      out.push({ type: 'heading', attrs: { level: n.depth }, content: mapInline(n.children) })
    } else if (n.type === 'list') {
      out.push({
        type: n.ordered ? 'orderedList' : 'bulletList',
        content: n.children.map(li => ({ type: 'listItem', content: mapBlock(li.children) })),
      })
    } else if (n.type === 'blockquote') {
      out.push({ type: 'blockquote', content: mapBlock(n.children) })
    } else if (n.type === 'table') {
      out.push(mapTable(n))
    } else if (n.type === 'thematicBreak') {
      out.push({ type: 'horizontalRule' })
    } else {
      throw new Error(`未映射的块节点: ${n.type}（先定语义再扩注册表，不静默降级）`)
    }
  }
  return out
}

// markdown 正文 → doc 树（gfm 全开）
export const mdToDoc = md => ({
  type: 'doc',
  content: mapBlock(fromMarkdown(md, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }).children),
})

// 单行 inline markdown → inline 节点数组（i18n-apply 译文回解析用）。
// 入参必须恰好解析出一个段落——译文里冒出多段/表格/图片 = 翻译节点越界，抛错。
export function inlineMdToNodes(md) {
  const ast = fromMarkdown(String(md), { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
  if (ast.children.length !== 1 || ast.children[0].type !== 'paragraph')
    throw new Error(`译文 run 须是单段行内 markdown，实际解析出 ${ast.children.map(c => c.type).join('/') || '空'}：${String(md).slice(0, 80)}`)
  const nodes = mapInline(ast.children[0].children)
  if (nodes.some(n => n.type === 'image'))
    throw new Error(`译文 run 不允许塞图片（骨架由代码保留）：${String(md).slice(0, 80)}`)
  return nodes
}
