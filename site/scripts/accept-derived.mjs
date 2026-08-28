#!/usr/bin/env node
// 派生页验收：dist 里 404/搜索/首页/列表页/搜索索引齐备且关键标记正确。
// 跑法：node scripts/accept-derived.mjs（须先 npm run build）
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const site = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = p => readFileSync(join(site, 'dist', p), 'utf8')
let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log(`✅ ${name}`) } else { fail++; console.log(`❌ ${name}`) } }

// 404
const nf = read('404.html')
ok('404 存在且 noindex', nf.includes('<meta name="robots" content="noindex">') && nf.includes('页面未找到'))
// 搜索页
const sp = read('search/index.html')
ok('搜索页存在且 noindex', sp.includes('<meta name="robots" content="noindex">') && sp.includes('id="search-results"'))
// 搜索索引
const idx = JSON.parse(read('search-index.json'))
ok('搜索索引 ≥16 条且字段齐', idx.length >= 16 && idx.every(e => e.slug && e.title && typeof e.text === 'string'))
ok('搜索索引含 free-standing', idx.some(e => e.slug === 'products/free-standing-jib-cranes'))
// 首页
const hp = read('index.html')
ok('首页存在且 canonical 指根', hp.includes('<link rel="canonical" href="https://www.dgcrane.com/">'))
ok('首页有产品区与案例区', hp.includes('产品（') && hp.includes('案例与文章（'))
// 列表页
ok('产品目录页存在', read('products/index.html').includes('全部产品'))
ok('案例列表页存在', read('posts/index.html').includes('案例与文章'))
// sitemap 收派生页
const sm = read('sitemap.xml')
ok('sitemap 含首页与两列表页', sm.includes('<loc>https://www.dgcrane.com/</loc>') && sm.includes('<loc>https://www.dgcrane.com/products/</loc>') && sm.includes('<loc>https://www.dgcrane.com/posts/</loc>'))
ok('sitemap 不含搜索页', !sm.includes('/search/'))

console.log(`\n${pass} 过 / ${fail} 挂`)
process.exit(fail ? 1 : 0)
