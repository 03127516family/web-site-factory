#!/usr/bin/env node
// MD → JSON 迁移（POC-2）：frontmatter 直通；## <!--block:KEY--> 正文块 → 语义 type 树。
// 烧完即过 schema 校验（R11）——判错语义人工兜底，烧出畸形树当场拒收。
// 用法: node scripts/md-to-json.mjs <md路径>   产物: content/<page.slug>.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { mdToDoc } from '../src/render/mdast-tree.mjs'
import { validateDoc } from '../src/content/schema.mjs'
import { migratePageWritebackV1 } from '../src/writeback/migrate.mjs'
import { probe } from './img-probe.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------- MD 拆解 ----------
const mdPath = process.argv[2]
if (!mdPath) { console.error('用法: node scripts/md-to-json.mjs <md路径>'); process.exit(1) }
const raw = readFileSync(mdPath, 'utf8')
const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
if (!fmMatch) throw new Error('frontmatter 没找到')
const fm = yaml.load(fmMatch[1])
const bodyMd = fmMatch[2]

// 按 ## 标题 <!--block:KEY--> 切块（validateBlocks 已保证每个 ## 都带合法 KEY）
const heads = [...bodyMd.matchAll(/^## (.+?)\s*<!--block:([\w-]+)-->\s*$/gm)]
const stats = {}
for (let i = 0; i < heads.length; i++) {
  const [, title, keyRaw] = heads[i]
  const from = heads[i].index + heads[i][0].length
  const to = i + 1 < heads.length ? heads[i + 1].index : bodyMd.length
  const tree = mdToDoc(bodyMd.slice(from, to))
  const key = keyRaw.replaceAll('-', '_') // 块 KEY 规范化：与 frontmatter 命名习惯一致（production-flow → production_flow）
  validateDoc(tree, `${key}.body`)
  // 同名 frontmatter 对象存在 → 并入（如 introduction 已有 image 字段）；否则新建
  fm[key] = { ...(typeof fm[key] === 'object' && fm[key] !== null ? fm[key] : {}), title, body: tree }
  // 统计
  const walk = n => { stats[n.type] = (stats[n.type] ?? 0) + 1; n.content?.forEach(walk) }
  walk(tree)
  console.log(`  ✓ ${key}.body — ${tree.content.length} 个顶层块`)
}

const out = migratePageWritebackV1({ version: 1, ...fm })

// 图片尺寸落数据：hero（横幅固有尺寸）、components（部件图按固有尺寸展示）、flow（PhotoSwipe data-size）
if (out.hero?.image) Object.assign(out.hero, await probe(out.hero.image))
for (const c of out.components?.items ?? []) if (c.image) Object.assign(c, await probe(c.image))
for (const s of out.production_flow?.steps ?? []) {
  if (!s.image) continue
  const { width, height } = await probe(s.image)
  if (width) s.dataSize = `${width}x${height}`
}

out.page.status ??= 'published' // 状态门（R29）：存量页默认已发布；新页由 AI 烧时显式给 draft
const slug = fm.page?.slug
if (!slug) throw new Error('frontmatter 缺 page.slug')
const outPath = join(root, 'content', `${slug}.json`)
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n')

console.log(`\nOK → content/${slug}.json`)
console.log('节点统计:', Object.entries(stats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join('  '))
