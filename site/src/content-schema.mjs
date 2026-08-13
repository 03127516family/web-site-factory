// 内容 schema（R8/R11）：节点/标记注册表 + 写时校验。
// type 是语义不是外观——颜色/字号/版式物理上写不进来；未注册类型直接拒收（外观锁执法）。
// 编辑器写回端点与迁移脚本共用同一份校验：烂数据进不了盘。

export const MARKS = {
  bold: {},
  italic: {},
  code: {},
  link: { attrs: { href: 'string' } },
  span: { attrs: { class: 'string?' } }, // 行内语义钩子（如价格强调），编辑层 SpanMark 往返
}

// content 类别：block=块级 children；inline=行内 children；items/rows/cells/paras=受限 children
export const NODES = {
  doc:            { content: 'block', min: 1 },
  paragraph:      { content: 'inline' },
  heading:        { content: 'inline', attrs: { level: 'int2-4' } },
  blockquote:     { content: 'block', min: 1 },
  bulletList:     { content: 'items' },
  orderedList:    { content: 'items' },
  listItem:       { content: 'block', min: 1 },
  table:          { content: 'rows' },
  tableRow:       { content: 'cells' },
  tableHeader:    { content: 'paras' },   // 单元格只装段落（与编辑层提交约定一致：单段解包）
  tableCell:      { content: 'paras' },
  image:          { leaf: true, attrs: { src: 'string', alt: 'string|null', width: 'int?', height: 'int?' } },
  horizontalRule: { leaf: true },
  hardBreak:      { leaf: true, inline: true },
  text:           { leaf: true, inline: true, text: true },
}

const BLOCKS = new Set(['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'table', 'image', 'horizontalRule'])

function fail(path, msg) { throw new Error(`schema 拒收 @ ${path}: ${msg}`) }

function checkAttrs(spec, attrs, path) {
  for (const [k, rule] of Object.entries(spec)) {
    const v = attrs?.[k]
    const optional = rule.endsWith('?') || rule.includes('|null')
    if (v === undefined || v === null) {
      if (!optional) fail(path, `缺属性 ${k}`)
      if (v === null && !rule.includes('null')) fail(path, `属性 ${k} 不许为 null`)
      continue
    }
    if (rule.startsWith('int')) {
      if (!Number.isInteger(v)) fail(path, `属性 ${k} 须为整数`)
      const m = rule.match(/^int(\d+)-(\d+)$/)
      if (m && (v < +m[1] || v > +m[2])) fail(path, `属性 ${k}=${v} 超界 ${m[1]}-${m[2]}`)
    } else if (rule.startsWith('string') && typeof v !== 'string') fail(path, `属性 ${k} 须为字符串`)
  }
}

export function validateDoc(node, path = 'doc') {
  const spec = NODES[node.type]
  if (!spec) fail(path, `未知节点类型 "${node.type}"`)
  if (spec.attrs) checkAttrs(spec.attrs, node.attrs, path)
  if (spec.text) {
    if (typeof node.text !== 'string' || node.text === '') fail(path, 'text 节点须带非空 text')
    for (const mk of node.marks ?? []) {
      const ms = MARKS[mk.type]
      if (!ms) fail(path, `未知标记 "${mk.type}"`)
      if (ms.attrs) checkAttrs(ms.attrs, mk.attrs, path)
    }
    return
  }
  if (spec.leaf) {
    if (node.content?.length) fail(path, `${node.type} 是叶子节点，不许带 children`)
    return
  }
  const kids = node.content ?? []
  if (spec.min && kids.length < spec.min) fail(path, `${node.type} 至少 ${spec.min} 个子节点`)
  kids.forEach((k, i) => {
    const p = `${path}.content[${i}]`
    switch (spec.content) {
      case 'block': if (!BLOCKS.has(k.type)) fail(p, `块级位不允许 "${k.type}"`); break
      case 'inline': if (!NODES[k.type]?.inline && k.type !== 'text') fail(p, `行内位不允许 "${k.type}"`); break
      case 'items': if (k.type !== 'listItem') fail(p, `列表只能装 listItem，不是 "${k.type}"`); break
      case 'rows':  if (k.type !== 'tableRow') fail(p, `表格只能装 tableRow，不是 "${k.type}"`); break
      case 'cells': if (k.type !== 'tableHeader' && k.type !== 'tableCell') fail(p, `行只能装单元格，不是 "${k.type}"`); break
      case 'paras': if (k.type !== 'paragraph') fail(p, `单元格只能装 paragraph，不是 "${k.type}"`); break
    }
    validateDoc(k, p)
  })
}
