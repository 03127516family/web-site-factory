#!/usr/bin/env node
// 几何快照回归：新页（serve site/dist）vs 固化基准（geom-baseline/*.json）逐测点比包围盒，±2px。
// --write：从旧系统根 dist 采基准（一次性，旧 dist 删除前跑；此后基准只读、随 git 走）。
// 基准自描述（kind: blocks|post），产物页容「仅新」坐标增强，post 页容差外零增零缺——与旧两脚本判定语义一致。
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveStatic, MEASURE_BLOCKS, MEASURE_POST } from './geom-lib.mjs'

const site = join(dirname(fileURLToPath(import.meta.url)), '..')
const SNAP = join(site, 'geom-baseline')
const TOL = 2
// 采基准清单 = 旧 dist 与新 content 的交集页（派生页无坐标块，由 accept-derived 管，不在此列）。
const WRITE_LIST = [
  'products/single-girder-eot-cranes', 'products/overhead-cranes-for-sale', 'products/multi-point-suspension-cranes', 'products/free-standing-jib-cranes',
  'posts/32t-rail-mounted-container-gantry-crane-exported-to-russia', 'posts/5-ton-overhead-crane', 'posts/crane-lifting-safety-training', 'posts/gantry-cranes-for-sale',
  'en/posts/32t-rail-mounted-container-gantry-crane-exported-to-russia', 'en/posts/5-ton-overhead-crane',
]
const kindOf = slug => (slug.includes('posts/') ? 'post' : 'blocks')
const keyOf = slug => slug.replaceAll('/', '__') + '.json'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const measure = async (base, slug, kind) => {
  await page.goto(`${base}/${slug}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const boxes = await page.evaluate(kind === 'post' ? MEASURE_POST : MEASURE_BLOCKS)
  return Object.fromEntries(boxes.map(b => [b.id, { x: b.x, y: b.y, w: b.w, h: b.h }]))
}

if (process.argv.includes('--write')) {
  // --from-new：从 site/dist 采基准（特例：en 页内容真相归 TM，译文措辞与旧手写不同导致换行差异时，
  // 以当前生产渲染为新基准；zh 页永不该用——zh 的意义就是与旧产物 1:1）
  const fromNew = process.argv.includes('--from-new')
  const slugFilter = process.argv.find((a, i) => process.argv[i - 1] === '--slug')
  const oldDir = fromNew ? join(site, 'dist') : join(site, '..', 'dist')
  const list = slugFilter ? WRITE_LIST.filter(s => s === slugFilter) : WRITE_LIST
  if (slugFilter && !list.length) { console.error(`❌ --slug ${slugFilter} 不在 WRITE_LIST`); process.exit(1) }
  const old = await serveStatic(oldDir)
  mkdirSync(SNAP, { recursive: true })
  for (const slug of list) {
    const boxes = await measure(old.url, slug, kindOf(slug))
    if (!Object.keys(boxes).length) { console.error(`❌ ${slug} 采到 0 测点——dist 缺页或测量脚本失效，不写基准`); process.exit(1) }
    writeFileSync(join(SNAP, keyOf(slug)), JSON.stringify({ slug, kind: kindOf(slug), source: fromNew ? 'site-dist' : 'legacy-dist', boxes }, null, 1) + '\n')
    console.log(`baseline ← ${slug}（${Object.keys(boxes).length} 测点，源=${fromNew ? 'site/dist' : '旧 dist'}）`)
  }
  await old.close(); await browser.close()
  console.log('✅ 基准固化完成：geom-baseline/ 随 git 提交')
  process.exit(0)
}

const neo = await serveStatic(join(site, 'dist'))
let failed = 0
for (const f of readdirSync(SNAP).filter(f => f.endsWith('.json')).sort()) {
  const snap = JSON.parse(readFileSync(join(SNAP, f), 'utf8'))
  const B = snap.boxes
  const A = await measure(neo.url, snap.slug, snap.kind)
  const onlyA = Object.keys(A).filter(k => !B[k])
  const onlyB = Object.keys(B).filter(k => !A[k])
  const diffs = []
  for (const [id, a] of Object.entries(A)) {
    const b = B[id]; if (!b) continue
    const d = { x: a.x - b.x, y: a.y - b.y, w: a.w - b.w, h: a.h - b.h }
    if (Object.values(d).some(v => Math.abs(v) > TOL)) diffs.push({ id, d })
  }
  const pass = !diffs.length && !onlyB.length && (snap.kind === 'blocks' || !onlyA.length)
  console.log(`${pass ? '✅' : '❌'} ${snap.slug}：新 ${Object.keys(A).length} 测点 / 基准 ${Object.keys(B).length}${diffs.length ? `，超容差 ${diffs.length}` : ''}${onlyB.length ? `，缺 ${onlyB.length}` : ''}${onlyA.length && snap.kind === 'post' ? `，多 ${onlyA.length}` : ''}`)
  if (!pass) { failed = 1; for (const x of diffs.slice(0, 10)) console.log(`   ${x.id} Δx=${x.d.x} Δy=${x.d.y} Δw=${x.d.w} Δh=${x.d.h}`) }
}
await neo.close(); await browser.close()
process.exit(failed)
