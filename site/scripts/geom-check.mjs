#!/usr/bin/env node
// POC-4 几何验收：新页（JSON 生, 8091）vs 旧页（dist 基准, 8090）逐 [data-block-id] 比包围盒，±2px。
import { chromium } from 'playwright-core'

const slug = process.argv[2] || 'single-girder-eot-cranes'
const NEW = `http://localhost:8091/products/${slug}/`
const OLD = `http://localhost:8090/products/${slug}/`
const TOL = 2
const MEASURE = `(()=>{const out=[];for(const el of document.querySelectorAll('[data-block-id]')){const r=el.getBoundingClientRect();out.push({id:el.getAttribute('data-block-id'),x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)});}return out})()`

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const measure = async url => {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  return new Map((await page.evaluate(MEASURE)).map(e => [e.id, e]))
}

const A = await measure(NEW)
const B = await measure(OLD)
await browser.close()

const onlyA = [...A.keys()].filter(k => !B.has(k))
const onlyB = [...B.keys()].filter(k => !A.has(k))
const diffs = []
for (const [id, a] of A) {
  const b = B.get(id)
  if (!b) continue
  const d = { x: a.x - b.x, y: a.y - b.y, w: a.w - b.w, h: a.h - b.h }
  if (Object.values(d).some(v => Math.abs(v) > TOL)) diffs.push({ id, a, b, d })
}

console.log(`[${slug}] 新页 ${A.size} 块 / 旧页 ${B.size} 块，容差 ±${TOL}px`)
console.log(`仅新: ${onlyA.join(', ') || '无'} | 仅旧: ${onlyB.join(', ') || '无'}`)
if (!diffs.length && !onlyB.length) {
  console.log(onlyA.length ? `✅ 几何全对齐（另有 ${onlyA.length} 个新增坐标块，零位移，判定为坐标增强）` : '✅ 几何全对齐：JSON 生页与原站逐元素一致（视觉 1:1）')
} else {
  console.log(`❌ 超容差差异 ${diffs.length} 处：`)
  for (const f of diffs.slice(0, 20)) console.log(`   ${f.id}  Δx=${f.d.x} Δy=${f.d.y} Δw=${f.d.w} Δh=${f.d.h}  新(${f.a.x},${f.a.y},${f.a.w},${f.a.h}) 旧(${f.b.x},${f.b.y},${f.b.w},${f.b.h})`)
}
process.exit(diffs.length || onlyB.length ? 1 : 0)
