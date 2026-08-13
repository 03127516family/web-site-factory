// JSON 语义树 → HTML（R15）：自由内容唯一的「内容→视图」逻辑。纯函数、不认页族。
// 站点约定只许集中在这一个文件：图片路径前缀、表格套 .custom_tables、正文标题层偏移、
// 单元格/单段解包。未知节点 throw——外观锁执法：要么 schema/walker/编辑器/CSS 四方齐活，要么不出页。

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = s => esc(s).replace(/"/g, '&quot;')

const MARK = {
  bold: h => `<strong>${h}</strong>`,
  italic: h => `<em>${h}</em>`,
  code: h => `<code>${h}</code>`,
  link: (h, a) => `<a href="${escAttr(a.href)}">${h}</a>`,
  span: (h, a) => (a?.class ? `<span class="${escAttr(a.class)}">${h}</span>` : `<span>${h}</span>`),
}

function inline(n, opts) {
  switch (n.type) {
    case 'text':
      return (n.marks ?? []).reduce((h, m) => {
        const fn = MARK[m.type]
        if (!fn) throw new Error(`渲染拒收: 未知标记 "${m.type}"`)
        return fn(h, m.attrs ?? {})
      }, esc(n.text))
    case 'hardBreak': return '<br>'
    default: throw new Error(`渲染拒收: 行内位未知节点 "${n.type}"`)
  }
}
const inlines = (n, opts) => (n.content ?? []).map(c => inline(c, opts)).join('')
const blocks = (n, opts) => (n.content ?? []).map(c => block(c, opts)).join('')

function block(n, opts) {
  switch (n.type) {
    case 'paragraph': return `<p>${inlines(n, opts)}</p>`
    case 'heading': {
      const lv = n.attrs.level + (opts.headingOffset ?? 0)
      return `<h${lv}>${inlines(n, opts)}</h${lv}>`
    }
    case 'blockquote': return `<blockquote>${blocks(n, opts)}</blockquote>`
    case 'bulletList': return `<ul>${blocks(n, opts)}</ul>`
    case 'orderedList': return `<ol>${blocks(n, opts)}</ol>`
    case 'listItem': return `<li>${singlePara(n, opts)}</li>`
    case 'table': return `<div class="custom_tables"><table><tbody>${blocks(n, opts)}</tbody></table></div>`
    case 'tableRow': return `<tr>${blocks(n, opts)}</tr>`
    case 'tableHeader': return `<th style="text-align: left;">${singlePara(n, opts)}</th>` // 站点约定：表头一律左对齐（原站全站如此）
    case 'tableCell': return `<td>${singlePara(n, opts)}</td>`
    case 'image': {
      const a = n.attrs
      const wh = `${a.width ? ` width="${a.width}"` : ''}${a.height ? ` height="${a.height}"` : ''}`
      return `<img decoding="async" src="${escAttr((opts.imgBase ?? '') + a.src)}" alt="${escAttr(a.alt ?? '')}"${wh}>`
    }
    case 'horizontalRule': return '<hr>'
    default: throw new Error(`渲染拒收: 未知节点 "${n.type}"`)
  }
}

// 唯一段落解包（单元格/列表项/p 宿主槽共用，与编辑层提交约定互逆）
function singlePara(n, opts) {
  return n.content?.length === 1 && n.content[0].type === 'paragraph'
    ? inlines(n.content[0], opts)
    : blocks(n, opts)
}

export function renderDoc(doc, opts = {}) {
  if (doc?.type !== 'doc') throw new Error('renderDoc 只接受 doc 根')
  return blocks(doc, opts)
}

// p 宿主槽（installation.body / component.body）：单段树只出行内内容，多段才出块
export function renderSlot(doc, opts = {}) {
  return doc?.content?.length === 1 && doc.content[0].type === 'paragraph'
    ? inlines(doc.content[0], opts)
    : renderDoc(doc, opts)
}
