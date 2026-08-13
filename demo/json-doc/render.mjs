#!/usr/bin/env node
// JSON 文档 → HTML 遍历器(模拟, 全量就这么大)
import { readFileSync } from 'node:fs'

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// 文本上的"记号"(加粗/斜体/链接) → 包裹标签
function renderMarks(text, marks = []) {
  return marks.reduce((out, m) => {
    if (m.type === 'bold') return `<strong>${out}</strong>`
    if (m.type === 'italic') return `<em>${out}</em>`
    if (m.type === 'link') return `<a href="${esc(m.attrs.href)}">${out}</a>`
    throw new Error('未知记号: ' + m.type)
  }, esc(text))
}

// 节点 → HTML(递归; 站点 class 约定集中在此)
function render(node) {
  const inner = (node.content || []).map(render).join('')
  switch (node.type) {
    case 'doc': return inner
    case 'text': return renderMarks(node.text, node.marks)
    case 'paragraph': return `<p>${inner}</p>`
    case 'heading': return `<h${node.attrs.level}>${inner}</h${node.attrs.level}>`
    case 'bulletList': return `<ul>${inner}</ul>`
    case 'orderedList': return `<ol>${inner}</ol>`
    case 'listItem':
    case 'tableHeader':
    case 'tableCell': {
      // 约定: 单元格里只有一段时, 剥掉这层 <p>(对齐原站 <li>文字</li> 形态)
      const single = node.content?.length === 1 && node.content[0].type === 'paragraph'
      const body = single ? (node.content[0].content || []).map(render).join('') : inner
      const tag = node.type === 'listItem' ? 'li' : node.type === 'tableHeader' ? 'th' : 'td'
      return `<${tag}>${body}</${tag}>`
    }
    case 'image': {
      const a = node.attrs
      return `<img src="${esc(a.src)}" alt="${esc(a.alt || '')}" width="${a.width}" height="${a.height}">`
    }
    case 'table': return `<div class="custom_tables"><table>${inner}</table></div>` // ← 约定: 表格统一套壳
    case 'tableRow': return `<tr>${inner}</tr>`
    default: throw new Error('未知节点: ' + node.type) // ← 外观锁执法: 不认识的一律报错, 不静默放行
  }
}

// --- 页面装配(演示: 渲染单梁页的两个正文段) ---
const page = JSON.parse(readFileSync(new URL('./single-girder.json', import.meta.url), 'utf8'))

const html = [
  `<h1>${esc(page.title)}</h1>`,
  `<img src="${esc(page.hero.image.src)}" alt="${esc(page.hero.image.alt)}" width="${page.hero.image.width}" height="${page.hero.image.height}">`,
  `<p>${esc(page.summary.intro)}</p>`,
  `<ul>${page.specs.map(s => `<li>${esc(s.text)}</li>`).join('')}</ul>`,
  `<section class="pro-info clearfix"><h3>${esc(page.overview.title)}</h3><div>${render(page.overview.body)}</div></section>`,
  `<section class="pro-info clearfix"><h3>${esc(page.spec_compare.title)}</h3><div>${render(page.spec_compare.body)}</div></section>`,
].join('\n')

console.log(html)
