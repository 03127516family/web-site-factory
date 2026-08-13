// 树工具：组件(Astro)与写回端点(edit-server)共用——切块、规整、路径写入。
// 注意：这里只有「树 → 树」操作，永远没有 HTML 解析（那条路已随 htmlToMd 退役）。

// body 树按 ### 切成段（components/crane_types 双处结构拼合用）：标题是分界，不属于段内容
export function splitByHeading(doc) {
  const out = []
  for (const n of doc.content) {
    if (n.type === 'heading') out.push({ heading: n, nodes: [] })
    else {
      if (!out.length) out.push({ heading: null, nodes: [] })
      out[out.length - 1].nodes.push(n)
    }
  }
  return out
}
export function joinByHeading(parts) {
  return { type: 'doc', content: parts.flatMap(p => (p.heading ? [p.heading, ...p.nodes] : p.nodes)) }
}

// 编辑器 getJSON() 的树 → 落盘形态：heading 层级回退（walker 渲染 +1 的逆操作）、
// 图片剥掉路径前缀、清 null/PM 噪音属性。纯树变换，零 HTML。
export function normalizeTree(node, opts = {}) {
  const { headingShift = -1, imgBase = '/assets/img/product/' } = opts
  if (Array.isArray(node)) return node.map(n => normalizeTree(n, opts))
  if (node === null || typeof node !== 'object') return node
  const n = {}
  if (node.type) n.type = node.type
  if (node.text !== undefined) n.text = node.text
  if (node.attrs) {
    const a = {}
    for (const [k, v] of Object.entries(node.attrs)) {
      if (v === null || v === undefined) continue
      a[k] = v
    }
    if (n.type === 'image') {
      if (typeof a.src === 'string' && a.src.startsWith(imgBase)) a.src = a.src.slice(imgBase.length)
      delete a.class; delete a.title; delete a.loading; delete a.decoding
    }
    if (n.type === 'heading' && typeof a.level === 'number') a.level += headingShift
    if (n.type === 'tableHeader' || n.type === 'tableCell') {
      if (a.colspan === 1) delete a.colspan
      if (a.rowspan === 1) delete a.rowspan
      delete a.colwidth; delete a.style; delete a.align
    }
    if (Object.keys(a).length) n.attrs = a
  }
  if (node.marks?.length) {
    n.marks = node.marks.map(m => {
      if (m.type === 'link') return { type: 'link', attrs: { href: m.attrs?.href ?? '' } }
      if (m.type === 'span') return m.attrs?.class ? { type: 'span', attrs: { class: m.attrs.class } } : { type: 'span' }
      return { type: m.type }
    })
  }
  if (node.content) {
    // 空段落不落盘（脱出列表等操作会在树尾留空 paragraph；留白是外观不是内容）
    n.content = normalizeTree(node.content, opts).filter(c =>
      !(c.type === 'paragraph' && (!c.content?.length || c.content.every(t => t.type === 'text' && !t.text.trim()))))
  }
  return n
}

// 点路径写入：'a.b[2].c'
export function setIn(obj, path, value) {
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  let cur = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] === undefined) cur[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {}
    cur = cur[keys[i]]
  }
  cur[keys[keys.length - 1]] = value
}

// 点路径读取（与 setIn 对称）：'a.b[2].c'，缺任何一段返回 undefined
export function getIn(obj, path) {
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  let cur = obj
  for (const k of keys) {
    if (cur == null) return undefined
    cur = cur[k]
  }
  return cur
}
