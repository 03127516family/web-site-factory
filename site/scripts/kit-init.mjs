#!/usr/bin/env node
// kit-init —— 把一份扁平 .astro 布局组件一条命令升格成「模板套件」（一 astro 一模版）。
// 用法: node scripts/kit-init.mjs posts/<name>
//   前提: src/components/posts/<name>.astro（扁平布局）+ content/posts/<name>.json（真实内容，当 example）
//   产物: src/components/posts/<name>/{index.astro, meta.json, example.json}
//     index.astro  = 扁平件拷贝（相对 import 加一层深度；../src/fragments 改指站内 src/chrome）
//     meta.json    = 按标记顺序自动配对的字段草稿（人审分级）
//     example.json = 内容 JSON 原样拷贝（chrome 值与提示词示例的真值源）
// 生成后当场跑 loadCatalog 双源核验自检；不齐/不过即退出非零，不留半成品目录。
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as lib from '../src/burn-lib.mjs'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const [, , target] = process.argv
if (!target || !/^[a-z-]+\/[a-z0-9-]+$/.test(target)) {
  console.error('用法: node scripts/kit-init.mjs posts/<name>（如 posts/gantry-cranes-for-sale）')
  process.exit(1)
}
const [family, name] = target.split('/')
const flatAstro = join(SITE, `src/components/${family}/${name}.astro`)
const contentJson = join(SITE, 'content', family, `${name}.json`)
const kitDir = join(SITE, `src/components/${family}`, name)
for (const [label, p] of [['扁平布局组件', flatAstro], ['内容 JSON', contentJson]]) {
  if (!existsSync(p)) { console.error(`❌ 找不到${label}: ${p}`); process.exit(1) }
}
if (existsSync(kitDir)) { console.error(`❌ 套件目录已存在: ${kitDir}（要重建先删它）`); process.exit(1) }

// ---------- ① index.astro：拷贝 + 两处机械改写 ----------
// 相对 import 路径整体加一层 ../（套件目录比扁平件深一级）；旧仓 fragment 引用改指站内 chrome（S3）
const astro = readFileSync(flatAstro, 'utf8')
const fixedImports = astro
  .replace(/(from\s+')((?:\.\.\/)+)/g, (m, pre, ups) => `${pre}../${ups}`) // 整段 ../ 前缀捕获后统一加一层
  .replace(/`\.\.\/src\/fragments\//g, '`src/chrome/')

// ---------- ② meta.json：按 data-field 标记顺序自动配对 ----------
// 规则（与人工配对一致）：
//   body.h_X 后随 <key>.body → section（titlePath=body.h_X）
//   孤立 <key>.body（前面无待配标题）→ section（titlePath=null，title 落 <key>.title 当结构对齐死数据）
//   孤立 body.h_X（后面跟的是另一个标题）→ text（path=body.h_X，标题位）
//   其余标记（图/crumb/inquiry/author…）v1 不烧，跳过
function deriveMeta(astroSrc, exampleJson) {
  const tokens = [...astroSrc.matchAll(/data-field="([^"]+)"/g)].map(m => m[1])
  const meta = []
  if (tokens.includes('title')) meta.push({ key: 'title', shape: 'text', level: 'similar' })
  if (exampleJson?.page?.description !== undefined) meta.push({ key: 'page.description', shape: 'seo', level: 'summary' })
  let pendingHeading = null
  for (const t of tokens) {
    if (/^body\.h_[a-z0-9_]+$/.test(t)) {
      if (pendingHeading) meta.push({ key: pendingHeading.slice('body.'.length), shape: 'text', level: 'similar', path: pendingHeading })
      pendingHeading = t
    } else if (/^[a-z0-9_]+\.body$/.test(t) && t !== 'body.body') {
      const key = t.slice(0, -'.body'.length)
      if (pendingHeading) { meta.push({ key, shape: 'section', level: 'verbatim', titlePath: pendingHeading }); pendingHeading = null }
      else meta.push({ key, shape: 'section', level: 'verbatim', titlePath: null })
    }
  }
  if (pendingHeading) meta.push({ key: pendingHeading.slice('body.'.length), shape: 'text', level: 'similar', path: pendingHeading })
  return meta
}

const example = JSON.parse(readFileSync(contentJson, 'utf8'))
const meta = deriveMeta(astro, example)
if (meta.length <= 2) { console.error(`❌ 自动配对结果过少（${meta.length} 项），先人工看一眼标记形态`); process.exit(1) }

// ---------- 落盘 + 自检 ----------
mkdirSync(kitDir)
try {
  writeFileSync(join(kitDir, 'index.astro'), fixedImports)
  writeFileSync(join(kitDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
  writeFileSync(join(kitDir, 'example.json'), JSON.stringify(example, null, 2) + '\n')
  lib.loadCatalog(join(kitDir, 'meta.json'), join(kitDir, 'index.astro'), join(kitDir, 'example.json')) // 双源核验（不过即 throw）
  const kit = lib.scanKits(join(SITE, 'src/components')).find(k => k.family === family && k.name === name)
  if (!kit?.complete) throw new Error('scanKits 未认出完整套件')
} catch (e) {
  rmSync(kitDir, { recursive: true, force: true }) // 不留半成品
  console.error(`❌ 自检未过，已回滚：${e.message}`)
  process.exit(1)
}

// ---------- 人审清单 ----------
const paired = meta.filter(c => c.shape === 'section' && c.titlePath)
const bodyOnly = meta.filter(c => c.shape === 'section' && !c.titlePath)
const headingOnly = meta.filter(c => c.shape === 'text' && c.path)
console.log(`✅ 套件已生成：src/components/${family}/${name}/（三件 + 双源核验 + scanKits 自检过）
配对 ${paired.length} 段：${paired.map(c => `${c.key}←${c.titlePath}`).join('、')}
无标题槽 ${bodyOnly.length}：${bodyOnly.map(c => c.key).join('、') || '无'}
孤立标题位 ${headingOnly.length}：${headingOnly.map(c => `${c.key}(${c.path})`).join('、') || '无'}
人审三件事：① 分级是否合理（默认 section=verbatim/标题=similar）；② v1 不烧的槽（图/author/卡片组）确认放弃；
③ 首次烧制跑一遍 accept:burn。改完 meta 记得套件同目录补 meta.md 存语义。`)
