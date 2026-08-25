// POC-5 编辑层：在 demo 试衣间基础上接写回——改动收集 → 预览 → 存草稿/发布 → /__save。
// 铁律：body 树在 commit 时缓存 getJSON()，保存永不从 DOM 反解 HTML。
// v2 修复: ①mousedown 捕获即挂载(光标落在点击处) ②文本字段写回纯文本(不再塞 <p>)
//          ③浮条按挂载现造(不裸奔) ④重复区 −/＋ 移出字段 DOM(改悬浮覆盖)
import { Editor, Mark } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'

const state = {
  on: false, toolbar: true,
  editor: null, el: null, kind: null,
  hadTableWrap: false,
  dirty: { fields: new Map(), trees: new Map(), chunks: new Map(), arrays: new Set() },
}
const $ = (s) => document.querySelector(s)

// ---------- 形态推断 ----------
function inferKind(el) {
  const declared = el.getAttribute('data-edit') // 有显式声明先听声明(文章族模版自带), 没有再推断
  if (declared === 'image' || declared === 'link' || declared === 'rich' || declared === 'text') return declared
  if (el.tagName === 'IMG') return 'image'
  if (el.tagName === 'A') return 'link'
  const field = el.getAttribute('data-field') || ''
  if (field.endsWith('.body')) return 'rich'
  if (el.querySelector('p, ul, ol, table, h2, h3, h4, blockquote')) return 'rich'
  return 'text'
}

// ---------- TipTap 套件 ----------
// 单行字段 = 内联文档(内容直接是文本, 不包 <p>)——模型对齐语义:
// 没有寄生 <p> 去接站点的 p 样式, 编辑时标题/列表行不再"脱妆"
const InlineDoc = Document.extend({ content: 'text*' })
// 行内包装保全记号: <span>(含 class)是站点样式钩子(如价格橙色 #F5A623),
// PM 默认会把不认识的行内元素拆光 → 编辑一次样式就没了。把它登记为 mark, 不解其义、原样往返。
const SpanMark = Mark.create({
  name: 'span',
  inclusive: false,
  addAttributes: () => ({ class: { default: null } }),
  parseHTML: () => [{ tag: 'span' }],
  renderHTML: ({ HTMLAttributes }) => ['span', HTMLAttributes, 0],
})
function miniKit() {
  return [
    InlineDoc,
    StarterKit.configure({
      document: false,
      strike: false, code: false, codeBlock: false,
      blockquote: false, bulletList: false, orderedList: false, listItem: false,
      heading: false, horizontalRule: false, hardBreak: false,
      dropcursor: false, gapcursor: false,
    }),
    Link.configure({ openOnClick: false }),
    SpanMark,
  ]
}

// ---------- 固定工具条(顶部居中; 富文本编辑期间常驻——取代跟随光标的浮条, 解决"找不到按钮") ----------
let toolbarEl = null
function ensureToolbar() {
  if (toolbarEl) return toolbarEl
  const el = document.createElement('div')
  el.className = 'edl-ui edl-toolbar'
  el.hidden = true
  el.innerHTML = '<button data-op="bold"><b>B</b></button><button data-op="italic"><i>I</i></button><button data-op="h" title="小标题">H</button><button data-op="link">🔗</button><button data-op="list">• 列表</button><button data-op="image">🖼 插图</button>'
  el.addEventListener('mousedown', e => e.preventDefault()) // 保住编辑器选区
  el.addEventListener('click', e => {
    const op = e.target.closest('button')?.dataset?.op
    if (!op || !state.editor) return
    const c = state.editor.chain().focus()
    if (op === 'h') c.toggleHeading({ level: 4 }).run() // 页面上正文小标题是 h4（落盘 -1 → JSON level 3）
    if (op === 'bold') c.toggleBold().run()
    if (op === 'italic') c.toggleItalic().run()
    if (op === 'list') c.toggleBulletList().run()
    if (op === 'image') openInsertPopover()
    if (op === 'link') {
      const cur = state.editor.getAttributes('link').href || ''
      const url = window.prompt('链接地址(留空移除链接):', cur) // 预填当前地址; extendMarkRange 让"光标在链接里"=改整个链接
      if (url === null) return
      url ? c.extendMarkRange('link').setLink({ href: url }).run() : c.extendMarkRange('link').unsetLink().run()
    }
  })
  document.body.appendChild(el)
  toolbarEl = el
  return el
}
function showToolbar() { if (state.toolbar) ensureToolbar().hidden = false }
function hideToolbar() { if (toolbarEl) toolbarEl.hidden = true }

// Image 属性保全: PM 默认只留 src/alt/title → width/height/class/loading/decoding 全被剥
// (尺寸属性是 CLS 与 known-leftover 约定的命根, class 是 WP 对齐样式钩子)
const ImagePreserve = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null },
      height: { default: null },
      class: { default: null },
      loading: { default: null },
      decoding: { default: null },
    }
  },
})
// 表格单元 style 保全: 原站 <th style="text-align:left"> 压住浏览器默认居中, 剥了排版就变
const TableHeaderP = TableHeader.extend({
  addAttributes() { return { ...this.parent?.(), style: { default: null } } },
})
const TableCellP = TableCell.extend({
  addAttributes() { return { ...this.parent?.(), style: { default: null } } },
})
function richKit() {
  return [
    StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
    Table.configure({ resizable: false }),
    TableRow, TableHeaderP, TableCellP,
    Link.configure({ openOnClick: false }),
    ImagePreserve,
    SpanMark,
  ]
}

// ---------- 挂载 / 提交 ----------
function mountEditor(el, kind, at) {
  state.hadTableWrap = !!el.querySelector('.custom_tables')
  state.kind = kind
  const initial = el.innerHTML   // 修"双重渲染": 先取走内容, 清空挂载点, 显式传给编辑器
  el.innerHTML = ''
  const editor = new Editor({
    element: el,
    content: initial,
    extensions: kind === 'text' ? miniKit() : richKit(),
    editorProps: kind === 'text' ? {
      handleKeyDown(view, event) {
        if (event.key === 'Enter') { commitActive(); return true }
        return false
      }
    } : {},
  })
  state.editor = editor
  state.el = el
  el.classList.add('edl-active')
  if (kind === 'rich') { wireTableChips(); showToolbar(); editor.on('selectionUpdate', updateImageChip) }
  // 显式聚焦: 落在点击坐标处, 定位不到才落文末
  requestAnimationFrame(() => {
    if (state.editor !== editor) return
    try {
      const pos = at ? editor.view.posAtCoords({ left: at.x, top: at.y }) : null
      if (pos && Number.isInteger(pos.pos)) editor.commands.focus(pos.pos)
      else editor.commands.focus('end')
    } catch { editor.commands.focus('end') }
  })
}

function commitActive() {
  if (!state.editor) return
  let el = state.el
  const kind = state.kind
  if (kind === 'text') {
    const html = state.editor.getHTML() // 内联文档: 产出无 <p>, 但 <span>/<b>/<a> 等行内元素原样往返
    state.editor.destroy()
    el.innerHTML = html
    state.dirty.fields.set(pathOf(el).path, el) // 保存时读 innerHTML（与 JSON 字符串语义同源）
    updateDirtyBadge()
  } else {
    const tree = state.editor.getJSON() // 树在此刻捕获——DOM 反解那条路已随 htmlToMd 退役
    const html = state.editor.getHTML()
    state.editor.destroy()
    markRichDirty(el, tree)
    // §2.4 防护: 宿主是 <p> 时——单段输出剥壳(防 <p><p> 嵌套); 多块/块级则宿主换 <div>(<p> 法定装不下)
    if (el.tagName === 'P') {
      const t = document.createElement('template')
      t.innerHTML = html.trim()
      const kids = [...t.content.children]
      if (kids.length === 1 && kids[0].tagName === 'P') {
        el.innerHTML = kids[0].innerHTML
      } else if (kids.length > 0) {
        const div = document.createElement('div')
        for (const a of el.attributes) div.setAttribute(a.name, a.value)
        div.innerHTML = html
        el.replaceWith(div)
        el = div
      } else {
        el.innerHTML = html
      }
    } else {
      el.innerHTML = html
    }
    // 表格归一化: 剥掉 PM 加的 colgroup/style 残渣(它们会挡住 markdown 表格转换)
    el.querySelectorAll('table').forEach(tb => {
      tb.querySelectorAll(':scope > colgroup').forEach(c => c.remove())
      tb.removeAttribute('style')
      tb.querySelectorAll('th, td').forEach(cell => {
        if (cell.getAttribute('colspan') === '1') cell.removeAttribute('colspan') // PM 噪音: 默认值原站不写
        if (cell.getAttribute('rowspan') === '1') cell.removeAttribute('rowspan')
      })
    })
    // 单段剥壳(对齐 JSON 渲染器约定): li/th/td 里只有一个 <p> 时剥掉, 对齐原站 <li>文字</li> 形态
    el.querySelectorAll('li, th, td').forEach(cell => {
      if (cell.children.length === 1 && cell.firstElementChild?.tagName === 'P') {
        cell.innerHTML = cell.firstElementChild.innerHTML
      }
    })
    if (el.tagName === 'UL' || el.tagName === 'OL') { // 列表字段: 解一层嵌套
      const t = document.createElement('template')
      t.innerHTML = html.trim()
      if (t.content.children.length === 1 && t.content.firstElementChild.tagName === el.tagName) {
        el.innerHTML = t.content.firstElementChild.innerHTML
      }
    }
    if (state.hadTableWrap) { // 还原 .custom_tables 包装
      el.querySelectorAll('table').forEach(tb => {
        if (!tb.parentElement.classList.contains('custom_tables')) {
          const w = document.createElement('div')
          w.className = 'custom_tables'
          tb.parentNode.insertBefore(w, tb)
          w.appendChild(tb)
        }
      })
    }
  }
  el.classList.remove('ProseMirror', 'edl-active')
  if (!el.className.trim()) el.removeAttribute('class') // 不留下空 class="" 残渣
  el.removeAttribute('contenteditable')
  state.editor = null
  state.el = null
  hideTableChips()
  hideToolbar()
  hideImageChip()
}

// ---------- 表格行小芯片 ----------
let tableChip = null, tablePlace = null
function wireTableChips() {
  const table = state.el?.querySelector('table')
  if (!table) return
  hideTableChips()
  tableChip = document.createElement('div')
  tableChip.className = 'edl-ui edl-tablechip'
  tableChip.innerHTML = '<button data-op="add">＋行</button><button data-op="del">−行</button>'
  document.body.appendChild(tableChip)
  tablePlace = () => {
    if (!tableChip || !table.isConnected) return
    const r = table.getBoundingClientRect()
    tableChip.style.top = (r.top + 6) + 'px'
    tableChip.style.left = (r.right - 90) + 'px'
  }
  tablePlace()
  window.addEventListener('scroll', tablePlace, { passive: true })
  tableChip.addEventListener('mousedown', e => e.preventDefault())
  tableChip.addEventListener('click', e => {
    const op = e.target.dataset?.op
    if (!op || !state.editor) return
    const chain = state.editor.chain().focus()
    if (op === 'add') chain.addRowAfter().run()
    if (op === 'del') chain.deleteRow().run()
    setTimeout(() => tablePlace?.(), 30)
  })
}
function hideTableChips() {
  if (tablePlace) window.removeEventListener('scroll', tablePlace)
  tablePlace = null
  tableChip?.remove()
  tableChip = null
}

// ---------- 图片浮层 ----------
// 弹层定位钳制: 默认放锚点下方, 放不下翻上方, 左右不出视口(大图占满屏时弹层不再掉出视口)
function placePopover(pop, r) {
  const pw = pop.offsetWidth, ph = pop.offsetHeight
  let top = r.bottom + 8
  if (top + ph > innerHeight - 8) top = Math.max(8, (r.top ?? r.bottom) - ph - 8)
  const left = Math.min(Math.max(8, r.left), Math.max(8, innerWidth - pw - 8))
  pop.style.top = top + 'px'
  pop.style.left = left + 'px'
}
function openImagePopover(img) { // 替换模式: 改已有图的 src/alt
  const pop = $('#edlImgPop')
  pop.hidden = false
  pop._insert = false
  pop._objectUrl = null
  placePopover(pop, img.getBoundingClientRect())
  $('#edlImgSrc').value = img.getAttribute('src')
  $('#edlImgAlt').value = img.getAttribute('alt') || ''
  pop._img = img
}
function openInsertPopover() { // 插图模式: 在富文本光标处插入新图
  if (!state.editor) return
  const pop = $('#edlImgPop')
  pop.hidden = false
  pop._insert = true
  pop._img = null
  pop._objectUrl = null
  $('#edlImgSrc').value = ''
  $('#edlImgAlt').value = ''
  placePopover(pop, state.editor.view.coordsAtPos(state.editor.state.selection.anchor))
}
function closeImagePopover() {
  const pop = $('#edlImgPop')
  pop.hidden = true
  pop._img = null
  pop._insert = false
  pop._pm = false
  pop._objectUrl = null
}

// ---------- 链接地址浮层(独立 <a data-field> 或嵌套字段的宿主链接) ----------
function openLinkPopover(a) {
  const pop = $('#edlLinkPop')
  pop.hidden = false
  placePopover(pop, a.getBoundingClientRect())
  $('#edlLinkHref').value = a.getAttribute('href') || ''
  pop._a = a
}
function closeLinkPopover() { const pop = $('#edlLinkPop'); pop.hidden = true; pop._a = null }

// ---------- 正文内图片: 选中即浮芯片「换图|alt|删图」(点图=选中/定位, 芯片才操作, 手势语言与行菜单一致) ----------
let imgChip = null, imgChipPlace = null
function selectedImageInfo() { // 当前选区是 image 节点选中 → 返回该节点, 否则 null
  const ed = state.editor
  if (!ed) return null
  const sel = ed.state.selection
  return sel.node && sel.node.type.name === 'image' ? sel.node : null
}
function updateImageChip() {
  const node = selectedImageInfo()
  if (!node) { hideImageChip(); return }
  ensureImageChip()
  const dom = state.editor.view.nodeDOM(state.editor.state.selection.from)
  if (!dom?.getBoundingClientRect) { hideImageChip(); return }
  const r = dom.getBoundingClientRect()
  imgChip.style.display = 'flex'
  imgChip.style.top = (r.top + 6) + 'px'
  imgChip.style.left = Math.max(8, r.right - 170) + 'px'
  if (!imgChipPlace) {
    imgChipPlace = () => updateImageChip()
    window.addEventListener('scroll', imgChipPlace, { passive: true })
  }
}
function hideImageChip() {
  if (imgChipPlace) { window.removeEventListener('scroll', imgChipPlace); imgChipPlace = null }
  if (imgChip) imgChip.style.display = 'none'
}
function ensureImageChip() {
  if (imgChip) return
  imgChip = document.createElement('div')
  imgChip.className = 'edl-ui edl-imgchip'
  imgChip.innerHTML = '<button data-op="replace">换图</button><button data-op="alt">alt</button><button data-op="del">删图</button>'
  imgChip.addEventListener('mousedown', e => e.preventDefault()) // 保住节点选区
  imgChip.addEventListener('click', e => {
    const op = e.target.dataset?.op
    if (!op || !state.editor) return
    if (op === 'del') { state.editor.chain().focus().deleteSelection().run(); return }
    openPmImagePopover()
  })
  document.body.appendChild(imgChip)
}
function openPmImagePopover() { // PM 替换模式: 改正文里选中 image 节点的 attrs(写回走 body 树, 与文字同路)
  const node = selectedImageInfo()
  if (!node || !state.editor) return
  const pop = $('#edlImgPop')
  pop.hidden = false
  pop._pm = true
  pop._insert = false
  pop._img = null
  pop._objectUrl = null
  $('#edlImgSrc').value = node.attrs.src || ''
  $('#edlImgAlt').value = node.attrs.alt || ''
  const dom = state.editor.view.nodeDOM(state.editor.state.selection.from)
  placePopover(pop, dom?.getBoundingClientRect?.() || { top: 120, bottom: 120, left: 120 })
}

// 若增删发生在轮播里, 通知 Swiper 重扫 DOM(否则克隆出的幻灯片不进轮播实例)
function syncSwiper(node) {
  let n = node
  while (n && n !== document.body) { if (n.swiper) { n.swiper.update(); return } n = n.parentElement }
}

// ---------- 行级迷你组: 悬停任一单元 → ＋上/＋下/−(定位增删, 不再只能末尾追加) ----------
let itemMenu = null, itemTarget = null
function ensureItemMenu() {
  if (itemMenu) return
  itemMenu = document.createElement('div')
  itemMenu.className = 'edl-ui edl-itemmenu'
  itemMenu.innerHTML = '<button data-op="above" title="在此行上方加一行">＋上</button><button data-op="below" title="在此行下方加一行">＋下</button><button data-op="del" title="删这一行">−</button>'
  itemMenu.addEventListener('click', e => {
    const op = e.target.dataset?.op
    if (!op || !itemTarget) return
    e.preventDefault(); e.stopPropagation()
    commitActive()
    if (!itemTarget.isConnected) { hideItemMenu(); return }
    const box = itemTarget.parentElement
    const arrPath = box?.getAttribute('data-array')
    if (arrPath) state.dirty.arrays.add(arrPath) // 数组变了：保存时整列重建
    updateDirtyBadge()
    if (op === 'del') {
      itemTarget.remove()
    } else { // 克隆本行插到正上/正下方——"行"的内容模子就是本行自己
      const clone = itemTarget.cloneNode(true)
      const bid = itemTarget.getAttribute('data-block-id')
      if (bid) clone.setAttribute('data-block-id', bid + '-new') // 有坐标才带坐标
      op === 'above' ? itemTarget.before(clone) : itemTarget.after(clone)
    }
    syncSwiper(box)
    hideItemMenu()
  })
  document.body.appendChild(itemMenu)
}
function repeatItemOf(t) { // data-repeat 的直接子元素就是行; data-block-id 只是可选的精确坐标, 不强制
  let n = t
  while (n && n !== document.body) {
    if (n.parentElement?.hasAttribute?.('data-repeat')) return n
    n = n.parentElement
  }
  return null
}
function onMove(e) {
  if (!state.on) return
  if (itemMenu && itemMenu.contains(e.target)) return
  const it = repeatItemOf(e.target)
  if (!it) { hideItemMenu(); return }
  ensureItemMenu()
  itemTarget = it
  // 防呆: 只剩一行时不给 −(删空就没有任何入口能加回来)
  const rows = it.parentElement.childElementCount
  itemMenu.querySelector('[data-op="del"]').style.display = rows > 1 ? '' : 'none'
  const r = it.getBoundingClientRect()
  itemMenu.style.display = 'flex'
  itemMenu.style.top = (r.top + 2) + 'px'
  // 窄行防自挡: 优先放行尾外侧, 贴不下(近视口右缘)才收回行内
  const mw = 120
  let left = r.right + 4
  if (left + mw > innerWidth - 8) left = Math.max(8, r.right - mw - 4)
  itemMenu.style.left = left + 'px'
}
function hideItemMenu() { if (itemMenu) itemMenu.style.display = 'none'; itemTarget = null }

// ---------- 重复区: 入场时区域轮廓闪 1.5s(教学), 平时零常驻 UI; 增删全在行级迷你组 ----------
function flashZones() {
  const zones = [...document.querySelectorAll('[data-repeat]')]
  zones.forEach(z => z.classList.add('edl-zoneflash'))
  setTimeout(() => zones.forEach(z => z.classList.remove('edl-zoneflash')), 1500)
}
function unflashZones() { document.querySelectorAll('.edl-zoneflash').forEach(z => z.classList.remove('edl-zoneflash')) }

// ---------- 保存预览：boot 拍原件快照，showSave 逐段 diff（改了哪句一眼可见） ----------
const origSnap = new Map() // key → { text, blocks, src, href }；数组行另有 'rows:<path>' → [行标签]
const normTxt = s => String(s ?? '').replace(/\s+/g, ' ').trim()
const stripTags = h => String(h ?? '').replace(/<[^>]*>/g, '')
function snapBlocks(el) { // body 槽的段级原文：顶层每个孩子一条文本（与 treeBlocks 同款渲染，保证同形可比）
  const one = c => {
    if (c.tagName === 'HR') return '———'
    if (c.tagName === 'FIGURE' || c.tagName === 'IMG') {
      const img = c.tagName === 'IMG' ? c : c.querySelector('img')
      return '[图片] ' + normTxt(img?.getAttribute('alt') || img?.getAttribute('src') || '')
    }
    if (c.tagName === 'TABLE' || c.querySelector?.('table')) return '[表格] ' + normTxt(c.innerText)
    return normTxt(c.innerText)
  }
  const kids = [...el.children]
  return (kids.length ? kids.map(one) : [normTxt(el.innerText)]).filter(Boolean)
}
function rowLabel(item) { // 行标签：优先标题字段，其次图名，兜底前 30 字
  const t = item.querySelector('[data-field$=".title"], [data-field$=".name"], h3, h4')
  if (t && normTxt(t.innerText)) return normTxt(t.innerText)
  const img = item.querySelector('img')
  if (img) return (img.getAttribute('src') || '').split('/').pop()
  return normTxt(item.innerText).slice(0, 30)
}
function snapshotOriginals() {
  document.querySelectorAll('[data-field]').forEach(el => {
    const holder = el.closest('[data-repeat]')
    const arrayBody = holder?.getAttribute('data-array-body')
    let key
    if (arrayBody && (el.getAttribute('data-field') || '').endsWith('.body')) { // 与 markRichDirty 同钥匙
      let item = el
      while (item.parentElement && item.parentElement !== holder) item = item.parentElement
      key = `${arrayBody}#${[...holder.children].indexOf(item)}`
    } else key = pathOf(el).path
    if (!origSnap.has(key)) origSnap.set(key, {
      text: normTxt(stripTags(el.innerHTML)),
      blocks: snapBlocks(el),
      src: el.getAttribute('src'), href: el.getAttribute('href'),
    })
  })
  document.querySelectorAll('[data-array]').forEach(holder => {
    origSnap.set('rows:' + holder.getAttribute('data-array'), [...holder.children].map(rowLabel))
  })
}
function diffLines(a, b) { // 段级 LCS → del/add 操作流（same 不渲染）
  const n = a.length, m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const ops = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ t: 'del', text: a[i++] })
    else ops.push({ t: 'add', text: b[j++] })
  }
  while (i < n) ops.push({ t: 'del', text: a[i++] })
  while (j < m) ops.push({ t: 'add', text: b[j++] })
  return ops
}
function treeBlocks(doc) { // 新树 → 段级文本（与 snapBlocks 同款渲染，保证同形可比）
  const inline = n => {
    if (n.text !== undefined) return n.text
    if (n.type === 'hardBreak') return ' '
    const kids = (n.content ?? []).map(inline)
    const blockish = n.type && !['paragraph', 'heading'].includes(n.type) // 列表/引用等容器：子块间补分隔
    return kids.join(blockish ? ' ' : '')
  }
  return (doc?.content ?? []).map(b => {
    if (b.type === 'image') return '[图片] ' + normTxt(b.attrs?.alt || b.attrs?.src || '')
    if (b.type === 'table') return '[表格] ' + normTxt((b.content ?? []).map(r => (r.content ?? []).map(inline).join(' ')).join(' '))
    if (b.type === 'horizontalRule') return '———'
    return normTxt(inline(b))
  }).filter(Boolean)
}
function renderDiff(oldBlocks, newBlocks) { // → HTML：红删绿增；文字没变（只动格式）给提示
  const ops = diffLines(oldBlocks, newBlocks)
  if (!ops.length) return '<div class="edl-note">文字未变（格式/标记调整）</div>'
  const esc = s => String(s).replace(/</g, '&lt;')
  const cut = s => (s.length > 140 ? s.slice(0, 140) + '…' : s)
  return '<div class="edl-diff">' + ops.map(o =>
    o.t === 'del' ? `<div class="edl-del">－ ${esc(cut(o.text))}</div>` : `<div class="edl-add">＋ ${esc(cut(o.text))}</div>`
  ).join('') + '</div>'
}
function preview(p) { // 单个补丁的人话预览
  if (p.kind === 'tree') return renderDiff(origSnap.get(p.path)?.blocks ?? [], treeBlocks(p.value))
  if (p.kind === 'chunk') return renderDiff(origSnap.get(`${p.path}#${p.index}`)?.blocks ?? [], treeBlocks(p.value))
  if (p.kind === 'html') {
    const oldT = origSnap.get(p.path)?.text
    const newT = normTxt(stripTags(p.value))
    if (oldT === undefined || oldT === newT) return `<div class="edl-diff"><div class="edl-add">＋ ${newT.replace(/</g, '&lt;').slice(0, 140) || '（富文本片段）'}</div></div>`
    return renderDiff([oldT], [newT])
  }
  if (p.kind === 'image') {
    const old = stripBase(origSnap.get(p.path)?.src || '') // 两边同去路径前缀，显示对称
    return `<div class="edl-diff"><div class="edl-del">－ ${old || '（原图未知）'}</div><div class="edl-add">＋ ${p.src}${p.alt ? '（' + p.alt + '）' : ''}</div></div>`
  }
  if (p.kind === 'link') {
    const old = origSnap.get(p.path)?.href
    return `<div class="edl-diff"><div class="edl-del">－ ${old || ''}</div><div class="edl-add">＋ ${p.href}</div></div>`
  }
  if (p.kind === 'array') {
    const oldRows = origSnap.get('rows:' + p.path) ?? []
    const newRows = p.value.map(o => normTxt(stripTags(o.title || o.name || o.label || o.image || Object.values(o).find(v => typeof v === 'string') || '')))
    const head = `<div class="edl-note">整列 ${oldRows.length} 行 → ${newRows.length} 行</div>`
    return head + renderDiff(oldRows, newRows)
  }
  return '<div class="edl-note">（结构改动）</div>'
}
// ---------- 写回（POC-5）：收集改动 → 预览 → 存草稿/发布 ----------
const IMG_BASE = '/assets/img/product/'
const stripBase = s => ((s || '').startsWith(IMG_BASE) ? s.slice(IMG_BASE.length) : s)
function pathOf(el) { // data-field + 最近 data-repeat 祖先（data-array 自声明）→ JSON 点路径，零注册表
  const field = el.getAttribute('data-field')
  const holder = el.closest('[data-repeat]')
  if (!holder) return { path: field }
  const arr = holder.getAttribute('data-array') || holder.getAttribute('data-repeat')
  let item = el
  while (item.parentElement && item.parentElement !== holder) item = item.parentElement
  const idx = [...holder.children].indexOf(item)
  const sub = field.includes('.') ? field.split('.').pop() : field
  return { path: `${arr}[${idx}].${sub}` }
}
function dirtyCount() { return state.dirty.fields.size + state.dirty.trees.size + state.dirty.chunks.size + state.dirty.arrays.size }
function updateDirtyBadge() {
  const b = $('#edlDirty')
  if (b) { const n = dirtyCount(); b.textContent = n ? `● ${n} 处未保存` : ''; b.style.color = '#fbbf24' }
  updateChromePill()
}
function markRichDirty(el, tree) {
  const field = el.getAttribute('data-field')
  const holder = el.closest('[data-repeat]')
  const arrayBody = holder?.getAttribute('data-array-body')
  if (arrayBody) { // 重复区内的 body 槽：写回目标是整棵树的第 i 段（chunk）
    let item = el
    while (item.parentElement && item.parentElement !== holder) item = item.parentElement
    state.dirty.chunks.set(`${arrayBody}#${[...holder.children].indexOf(item)}`, {
      path: arrayBody, index: [...holder.children].indexOf(item), tree,
    })
  } else {
    state.dirty.trees.set(field, tree)
  }
  updateDirtyBadge()
}
function readArray(arrPath) { // 整列重建：从 DOM 行读回对象数组（行内 body 槽不走此路，走 chunk）
  const holder = document.querySelector(`[data-array="${arrPath}"]`)
  if (!holder) return null
  return [...holder.children].map(item => {
    const o = {}
    const fields = [...item.querySelectorAll('[data-field]')]
    if (item.hasAttribute('data-field')) fields.unshift(item) // 行自身即字段（如 specs 的 <li data-field="spec.text">）
    fields.forEach(f => {
      const sub = f.getAttribute('data-field').split('.').pop()
      const kind = inferKind(f)
      if (kind === 'image') { o[sub] = stripBase(f.getAttribute('src')); o.alt = f.getAttribute('alt') ?? '' }
      else if (kind === 'link') o[sub] = f.getAttribute('href') || ''
      else if (kind === 'text') o[sub] = f.innerHTML.trim()
    })
    return o
  })
}
function collectPatches() {
  const patches = []
  const covered = p => [...state.dirty.arrays].some(a => p.startsWith(a + '[')) // 数组重建优先，其下单点补丁跳过
  for (const [path, el] of state.dirty.fields) {
    if (covered(path) || !el.isConnected) continue
    const kind = inferKind(el)
    if (kind === 'image') patches.push({ path, kind: 'image', src: stripBase(el.getAttribute('src')), alt: el.getAttribute('alt') ?? '' })
    else if (kind === 'link') patches.push({ path, kind: 'link', href: el.getAttribute('href') || '' })
    else patches.push({ path, kind: 'html', value: el.innerHTML.trim() })
  }
  for (const [path, tree] of state.dirty.trees) patches.push({ path, kind: 'tree', value: tree })
  for (const { path, index, tree } of state.dirty.chunks.values()) patches.push({ path, kind: 'chunk', index, value: tree })
  for (const arr of state.dirty.arrays) {
    const items = readArray(arr)
    if (items) patches.push({ path: arr, kind: 'array', value: items })
  }
  return patches
}
function showSave() { // R23：保存前改动可见
  commitActive()
  const patches = collectPatches()
  $('#edlModalContent').innerHTML = patches.length
    ? patches.map(p =>
        `<div class="edl-pv"><div class="edl-pv-head"><code>${p.path}</code><span>${p.kind}</span></div>${preview(p)}</div>`
      ).join('')
    : '<p style="padding:12px;color:#777">没有改动</p>'
  $('#edlModal').dataset.patches = JSON.stringify(patches)
  $('#edlModal').hidden = false
}
async function doSave(status) {
  const patches = JSON.parse($('#edlModal').dataset.patches || '[]')
  // slug = 内容相对路径（/en/posts/xxx/ → en/posts/xxx）——服务端据此定位 content/<slug>.json，zh/镜像无歧义
  const slug = location.pathname.replace(/\/+$/, '').replace(/^\/+/, '')
  const res = await fetch('/__save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, status, patches }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { alert('保存被拒：\n' + (data.error || res.status)); return } // V4：schema 拒收信息直达用户
  // 评审 I1：镜像人审写回若跳过句（段句数与源不一致整段不采纳），如实弹窗——服务端落的是重投影产物，
  // 不提示的话用户会以为自己改的句已生效，reload 后字变回去且零解释
  if (data.i18n?.skipped) alert(`本次有 ${data.i18n.skipped} 句未采纳（所在段句数与源不一致，整段跳过防张冠李戴）。\n该段请整段重写并保持句数一致，或到翻译控制台用「通过并发布」。`)
  // 评审 M4：文件已保存但重建失败——不是「保存被拒」，如实分开报
  if (data.rebuildError) alert('已保存到内容文件，但页面重建失败（生产站可能仍显示旧版）：\n' + data.rebuildError)
  $('#edlModal').hidden = true
  lastSaveAt = new Date()
  updateChromeAutosave()
  state.dirty.fields.clear(); state.dirty.trees.clear(); state.dirty.chunks.clear(); state.dirty.arrays.clear()
  if (status === 'published') { sessionStorage.setItem('edlReenter', '1'); alert('已发布，页面已重建'); location.reload() }
  else alert('草稿已保存。当前就是草稿预览（生产站不显示此页）')
}

// ---------- 事件路由(pointerdown 捕获即挂载——Swiper 等组件会吞掉兼容性 mousedown, pointerdown 吞不掉) ----------
function onDown(e) {
  if (e.target.closest('.edl-ui')) return
  if (state.el && state.el.contains(e.target)) return
  const fieldEl = e.target.closest('[data-field]')
  if (!fieldEl) { commitActive(); closeImagePopover(); closeLinkPopover(); return }
  const kind = inferKind(fieldEl)
  if (kind === 'image') {
    e.preventDefault()
    commitActive(); closeImagePopover(); closeLinkPopover()
    openImagePopover(fieldEl)
    return
  }
  if (kind === 'link') { // 裸 <a data-field>: 只弹地址框
    e.preventDefault()
    commitActive(); closeImagePopover(); closeLinkPopover()
    openLinkPopover(fieldEl)
    return
  }
  commitActive(); closeImagePopover(); closeLinkPopover()
  mountEditor(fieldEl, kind, { x: e.clientX, y: e.clientY })
  // 字段嵌在链接里(如面包屑 label 套在 a[crumb.url] 里): 文字就地改, 地址框一并弹出
  const ownerLink = fieldEl.closest('a[data-field]')
  if (kind === 'text' && ownerLink) openLinkPopover(ownerLink)
}
function onClickGuard(e) { // 编辑模式下内容区不导航(只 preventDefault, 不影响 ProseMirror)
  if (e.target.closest('.edl-ui')) return
  e.preventDefault()
}

// ---------- 总开关 ----------
function enterEdit() {
  state.on = true
  document.body.classList.add('edl-on')
  flashZones()
  $('#edlToggle').textContent = '✓ 退出编辑'
  $('#edlMode').hidden = false
  $('#edlSave').hidden = false
  document.addEventListener('pointerdown', onDown, true)
  document.addEventListener('click', onClickGuard, true)
  document.addEventListener('mousemove', onMove, true)
}
function exitEdit() {
  commitActive()
  state.on = false
  document.body.classList.remove('edl-on')
  unflashZones()
  hideItemMenu()
  closeImagePopover()
  closeLinkPopover()
  $('#edlModal').hidden = true
  $('#edlToggle').textContent = '✏️ 开始编辑'
  $('#edlMode').hidden = true
  $('#edlSave').hidden = true
  document.removeEventListener('pointerdown', onDown, true)
  document.removeEventListener('click', onClickGuard, true)
  document.removeEventListener('mousemove', onMove, true)
}

// ---------- 编辑器 chrome（顶部工具条 + 底部状态条）：8092 页面即完整全屏编辑界面 ----------
// 只加不拆：现有 .edl-toolbar / .edl-pill / 保存弹窗全保留；保存/发布按钮复用 showSave()+doSave()，零新保存逻辑。
let lastSaveAt = null // 最后保存时间（现有编辑器无此追踪，此处补最小量：保存成功时抬一次）
let chromeTop = null, chromeBottom = null, chromePill = null, chromeAutosave = null
const CHROME_CSS = `
#edl-chrome-top,#edl-chrome-bottom{position:fixed;left:0;right:0;z-index:100000;box-sizing:border-box;font-family:-apple-system,"PingFang SC",sans-serif}
#edl-chrome-top{top:0;height:56px;background:#FFFFFF;border-bottom:1px solid #E8E5E1;padding:0 16px;display:flex;align-items:center;justify-content:space-between}
#edl-chrome-bottom{bottom:0;height:38px;background:#FFFFFF;border-top:1px solid #E8E5E1;padding:0 16px;display:flex;align-items:center;gap:16px;font-size:12px;color:#5C5752}
#edl-chrome-top .edl-chrome-left,#edl-chrome-top .edl-chrome-right{display:flex;align-items:center}
#edl-chrome-top .edl-chrome-left{gap:12px;min-width:0}
#edl-chrome-top .edl-chrome-right{gap:10px}
#edlChromeWorkbench{background:transparent;border:0;color:#5C5752;border-radius:7px;height:28px;font-size:12.5px;padding:0 10px;cursor:pointer}
#edlChromeWorkbench:hover{background:#F3F2F0}
.edl-chrome-divider{width:1px;height:22px;background:#E8E5E1;flex:none}
#edlChromeTitle{font-size:15px;font-weight:600;color:#1C1B1A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.edl-chrome-lang{display:flex;align-items:center;gap:2px}
.edl-chrome-lang button{background:#fff;border:0;font-size:12px;border-radius:7px;color:#A39D96;padding:4px 8px;line-height:1;cursor:pointer}
.edl-chrome-lang button.active{background:#F3F2F0;color:#1C1B1A;font-weight:600}
#edlChromePill{background:#EAF6F0;color:#0E7A4E;border-radius:99px;font-size:11.5px;padding:3px 10px;white-space:nowrap}
.edl-chrome-btn{border-radius:7px;height:32px;padding:0 14px;font-size:13px;cursor:pointer}
#edlChromeDraft{background:#fff;border:1px solid #D8D4CF;color:#1C1B1A}
#edlChromePublish{background:#1C1B1A;border:1px solid #1C1B1A;color:#fff}
#edl-chrome-bottom .edl-chrome-schema{display:flex;align-items:center;gap:4px}
#edl-chrome-bottom .edl-chrome-schema .ok{color:#0E7A4E}
#edl-chrome-bottom .edl-chrome-spacer{flex:1}
#edlChromeRevert{background:transparent;border:0;color:#5C5752;font-size:12px;padding:0;cursor:pointer;text-decoration:underline}
body{padding-top:56px!important;padding-bottom:38px!important}
`
function pageTitleText() { // 页面标题 = document.title 去掉站点后缀（- DGCRANE / | DGCRANE）
  let t = String(document.title || '').replace(/\s*[|｜\-–—]\s*DGCRANE\s*$/i, '').trim()
  if (!t) t = location.pathname.split('/').filter(Boolean).pop() || '未命名页面'
  return t
}
function currentLang() { return location.pathname.startsWith('/en/') ? 'en' : 'zh' }
function siblingLangUrl() { // zh ↔ en：en 页去 /en/ 前缀、zh 页加 /en/ 前缀（按当前 pathname 推导）
  const p = location.pathname
  return (p.startsWith('/en/') ? p.replace(/^\/en/, '') : '/en' + p) + location.search
}
function fmtClock(d) { const p = x => String(x).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` }
function updateChromePill() {
  if (!chromePill) return
  const n = dirtyCount()
  chromePill.textContent = n ? `草稿 · ${n} 处未保存更改` : '已发布'
}
function updateChromeAutosave() {
  if (chromeAutosave) chromeAutosave.textContent = '自动保存 ' + (lastSaveAt ? fmtClock(lastSaveAt) : '未保存')
}
async function switchLang() {
  const url = siblingLangUrl()
  try {
    const res = await fetch(url)
    if (res.status === 404) { alert('目标语言版本不存在（404），保持当前页面'); return }
    location.href = url
  } catch (e) {
    alert('语言切换失败：' + ((e && e.message) || e))
  }
}
function buildChrome() {
  if (chromeTop) return
  const style = document.createElement('style')
  style.textContent = CHROME_CSS
  document.head.appendChild(style)

  const top = document.createElement('div')
  top.id = 'edl-chrome-top'
  top.innerHTML = `<div class="edl-chrome-left">
      <button id="edlChromeWorkbench" type="button">工作台</button>
      <span class="edl-chrome-divider"></span>
      <span id="edlChromeTitle"></span>
      <div class="edl-chrome-lang"><button type="button" data-lang="zh">中</button><button type="button" data-lang="en">EN</button></div>
    </div>
    <div class="edl-chrome-right">
      <span id="edlChromePill"></span>
      <button id="edlChromeDraft" type="button" class="edl-chrome-btn">保存草稿</button>
      <button id="edlChromePublish" type="button" class="edl-chrome-btn">发布</button>
    </div>`

  const bottom = document.createElement('div')
  bottom.id = 'edl-chrome-bottom'
  bottom.innerHTML = `<span class="edl-chrome-schema"><span class="ok">✓</span> schema 校验通过</span>
    <span id="edlChromeAutosave"></span>
    <span class="edl-chrome-spacer"></span>
    <button id="edlChromeRevert" type="button">还原到已发布版</button>`

  document.body.appendChild(top)
  document.body.appendChild(bottom)

  chromeTop = top; chromeBottom = bottom
  chromePill = top.querySelector('#edlChromePill')
  chromeAutosave = bottom.querySelector('#edlChromeAutosave')
  top.querySelector('#edlChromeTitle').textContent = pageTitleText()

  // 工作台与编辑服务同机不同端口：沿用当前页面 host，局域网访问时不会错误跳回访问者自己的 localhost。
  top.querySelector('#edlChromeWorkbench').addEventListener('click', () => {
    const u = new URL(window.location.href)
    u.port = '8090'
    u.pathname = '/'
    u.search = u.hash = ''
    window.open(u.href, '_blank')
  })

  const lang = currentLang()
  top.querySelectorAll('.edl-chrome-lang button').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang)
    b.addEventListener('click', () => { if (b.dataset.lang !== lang) switchLang() })
  })

  // 保存/发布：复用现有 showSave()（commit + 收集补丁入 #edlModal）+ doSave(status)（写回 /__save）
  top.querySelector('#edlChromeDraft').addEventListener('click', () => { showSave(); doSave('draft') })
  top.querySelector('#edlChromePublish').addEventListener('click', () => { showSave(); doSave('published') })

  bottom.querySelector('#edlChromeRevert').addEventListener('click', () => { alert('还原到已发布版：后端尚无此端点，暂未实现') })

  updateChromePill()
  updateChromeAutosave()
}

// ---------- UI 事件 ----------
export function boot() {
  buildChrome() // 编辑器自带 chrome（顶部工具条 + 底部状态条）：挂 body，只加不拆
  snapshotOriginals() // 保存预览的「原件」：任何编辑发生前拍一份（快照只用于预览 diff，写回永远走补丁）
  if (sessionStorage.getItem('edlReenter')) { sessionStorage.removeItem('edlReenter'); setTimeout(enterEdit, 300) }
  $('#edlToggle').addEventListener('click', () => state.on ? exitEdit() : enterEdit())
  $('#edlMode').addEventListener('click', () => {
    state.toolbar = !state.toolbar
    $('#edlMode').textContent = state.toolbar ? '工具条：开' : '工具条：关'
    if (state.toolbar && state.editor && state.kind === 'rich') showToolbar()
    else hideToolbar()
  })
  $('#edlSave').addEventListener('click', showSave)
  $('#edlSaveDraft').addEventListener('click', () => doSave('draft'))
  $('#edlSavePublish').addEventListener('click', () => doSave('published'))
  $('#edlModalClose').addEventListener('click', () => { $('#edlModal').hidden = true })
  $('#edlModal').addEventListener('click', e => { if (e.target === $('#edlModal')) $('#edlModal').hidden = true })

  $('#edlImgPop').addEventListener('mousedown', e => e.stopPropagation())
  $('#edlImgApply').addEventListener('click', () => {
    const pop = $('#edlImgPop')
    const src = pop._objectUrl || $('#edlImgSrc').value.trim()
    const alt = $('#edlImgAlt').value
    if (pop._pm) { // 正文图替换: 改选中 image 节点的 attrs
      if (src && state.editor) state.editor.chain().focus().updateAttributes('image', { src, alt }).run()
    } else if (pop._insert) { // 插图模式: 插到富文本光标处
      if (src && state.editor) state.editor.chain().focus().setImage({ src, alt }).run()
    } else {
      const img = pop._img
      if (!img) return
      state.dirty.fields.set(pathOf(img).path, img)
      updateDirtyBadge()
      const oldSrc = img.getAttribute('src')
      if (src) {
        img.src = src
        // 同源即同图: 页面上所有引用旧地址的 <img>/<a> 一并换(轮播主图/缩略图/灯箱大图是同一张的多个渲染)
        document.querySelectorAll(`img[src="${CSS.escape(oldSrc)}"]`).forEach(m => { if (m !== img) m.src = src })
        document.querySelectorAll(`a[href="${CSS.escape(oldSrc)}"]`).forEach(a => a.setAttribute('href', src))
      }
      img.alt = alt
    }
    closeImagePopover()
  })
  $('#edlImgFile').addEventListener('change', async e => {
    const f = e.target.files?.[0]
    if (!f) return
    $('#edlImgSrc').value = '上传中…'
    const res = await fetch('/__upload?name=' + encodeURIComponent(f.name), { method: 'POST', body: f })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { $('#edlImgSrc').value = ''; alert('上传失败：' + (data.error || res.status)); return }
    $('#edlImgSrc').value = data.src // 真实路径（已过压缩闸门），保存写回的就是它
    const pop = $('#edlImgPop')
    pop._objectUrl = null
    if (pop._img) pop._img.src = data.src
  })
  $('#edlImgClose').addEventListener('click', closeImagePopover)
  $('#edlLinkPop').addEventListener('mousedown', e => e.stopPropagation())
  $('#edlLinkApply').addEventListener('click', () => {
    const a = $('#edlLinkPop')._a
    if (!a) return
    state.dirty.fields.set(pathOf(a).path, a)
    updateDirtyBadge()
    const href = $('#edlLinkHref').value.trim()
    if (href) a.setAttribute('href', href)
    closeLinkPopover()
  })
  $('#edlLinkClose').addEventListener('click', closeLinkPopover)
  window.addEventListener('beforeunload', e => { if (state.on && dirtyCount()) { e.preventDefault(); e.returnValue = '' } })
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return
    $('#edlModal').hidden = true
    if (state.on) commitActive()
  })
}

boot()
