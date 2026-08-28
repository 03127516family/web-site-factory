#!/usr/bin/env node
// build 后写 search-index.json 进产物目录（BUILD_OUT 定去向，双产物链同 seo-emit）。
// 收录口径 = 生产门禁（published 且过 isPublishable），与 seo-emit 的 pubSet 同源。
// 文本来源 = 页面 JSON 里所有 {type:'doc'} 正文树的 text 节点——字段名无关，守引擎铁律 §2.1。
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanPages, buildGroups, isPublishable } from '../src/i18n/kernel.mjs'

const site = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = process.env.BUILD_OUT || 'dist'

const docText = (node, acc = []) => {
  if (node && typeof node === 'object') {
    if (node.type === 'text' && typeof node.text === 'string') acc.push(node.text)
    for (const c of node.content ?? []) docText(c, acc)
  }
  return acc
}
// 收集对象里所有 doc 树的纯文本（遇到 doc 即提取、不再深入，防嵌套重复）
const collectDocs = (v, acc = []) => {
  if (v && typeof v === 'object') {
    if (v.type === 'doc' && Array.isArray(v.content)) { acc.push(docText({ content: v.content }).join(' ')); return acc }
    if (Array.isArray(v)) for (const item of v) collectDocs(item, acc)
    else for (const k of Object.keys(v)) collectDocs(v[k], acc)
  }
  return acc
}

const pages = scanPages({ withJson: true })
const groups = buildGroups(pages)
const entries = pages
  .filter(p => p.status === 'published' && p.j && isPublishable(p, groups, pages))
  .map(p => ({
    slug: p.slug,
    title: p.j.page.title.split('|')[0].trim(),
    description: p.j.page.description,
    text: collectDocs(p.j).join(' ').replace(/\s+/g, ' ').trim().slice(0, 3000),
  }))
mkdirSync(join(site, out), { recursive: true })
writeFileSync(join(site, out, 'search-index.json'), JSON.stringify(entries))
console.log(`search-index: ${entries.length} 条 → ${out}/search-index.json`)
