#!/usr/bin/env node
// POC-5 验收（R59 V2/V3/V4）：改字写回 / 改正文写回（树）/ schema 拒收 / 状态门。
// 跑完自动还原 JSON 并重建。
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const JSON_FILE = join(SITE, 'content/products/single-girder-eot-cranes.json')
const DIST_PAGE = join(SITE, 'dist/products/single-girder-eot-cranes/index.html')
const EDIT_PORT = process.env.EDIT_PORT || 8092 // 可让开被占的 8092 并行跑验收
const EDIT = `http://localhost:${EDIT_PORT}/products/single-girder-eot-cranes/`
const PUB = 'http://localhost:8091/products/single-girder-eot-cranes/'
const results = []
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`) }
const readJ = () => JSON.parse(readFileSync(JSON_FILE, 'utf8'))
if (existsSync(JSON_FILE + '.bak')) copyFileSync(JSON_FILE + '.bak', JSON_FILE) // 上次中断的残留先还原
copyFileSync(JSON_FILE, JSON_FILE + '.bak')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

async function saveAndPublish() {
  await page.click('#edlSave')
  await page.waitForSelector('#edlModal:not([hidden])')
  const [resp] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/__save'), { timeout: 30000 }),
    page.click('#edlSavePublish'),
  ])
  ok('保存端点 200', resp.status() === 200)
  await page.waitForTimeout(2500) // 重建 + 自动刷新
}

// ---- V2a：改标题文字 → 写回 JSON → 重建出新字 ----
await page.goto(EDIT, { waitUntil: 'networkidle' })
await page.click('#edlToggle')
await page.waitForTimeout(1800)
await page.click('h1[data-field="title"]')
await page.waitForTimeout(300)
await page.keyboard.press('Meta+a')
await page.keyboard.type('单梁桥式起重机POC5')
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
await saveAndPublish()
let j = readJ()
ok('V2a 标题写回 JSON', j.title === '单梁桥式起重机POC5', j.title)
ok('V2a 状态为 published', j.page.status === 'published')
ok('V2a dist 出新字', readFileSync(DIST_PAGE, 'utf8').includes('单梁桥式起重机POC5'))

// ---- V2b：正文末尾加一段 → 树写回（不经 DOM 反解）----
await page.goto(EDIT, { waitUntil: 'networkidle' })
await page.click('#edlToggle')
await page.waitForTimeout(1800)
await page.click('div[data-field="overview.body"] li:last-child')
await page.waitForTimeout(300)
await page.keyboard.press('End')
await page.keyboard.press('Enter') // 新列表项
await page.keyboard.press('Enter') // 空项再回车 → 脱出列表成新段
await page.keyboard.type('验收追加段POC5')
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
await saveAndPublish()
j = readJ()
ok('V2b 新段文字在树里', JSON.stringify(j.overview.body).includes('验收追加段POC5'))
ok('V2b 树尾无空段（规整生效）', j.overview.body.content.at(-1).content?.length > 0, JSON.stringify(j.overview.body.content.at(-1)).slice(0, 80))
ok('V2b dist 出新段', readFileSync(DIST_PAGE, 'utf8').includes('验收追加段POC5'))
const headingLevels = JSON.stringify(j.overview.body).match(/"level":\d/g)
ok('V2b heading 层级回退正确（无 level:4 落盘）', !headingLevels?.includes('"level":4'), headingLevels?.join(','))

// ---- V4：坏树直投端点 → schema 拒收，JSON 不被污染 ----
const bad = await page.request.post(`http://localhost:${EDIT_PORT}/__save`, {
  data: { slug: 'products/single-girder-eot-cranes', status: 'published', patches: [{ path: 'overview.body', kind: 'tree', value: { type: 'doc', content: [{ type: 'video', content: [] }] } }] },
})
ok('V4 坏树被拒（400）', bad.status() === 400)
const badMsg = (await bad.json()).error || ''
ok('V4 报错点名未知节点', /未知节点|不允许/.test(badMsg), badMsg.slice(0, 60))
ok('V4 JSON 未被污染', JSON.stringify(readJ().overview.body).includes('验收追加段POC5'))

// ---- V3：状态门 ----
const r1 = await page.request.post(`http://localhost:${EDIT_PORT}/__save`, { data: { slug: 'products/single-girder-eot-cranes', status: 'draft', patches: [] } })
ok('V3 存草稿端点 200', r1.status() === 200)
await page.waitForTimeout(2000)
ok('V3 draft 后 dist 页面消失', !existsSync(DIST_PAGE))
ok('V3 草稿预览仍在（8092 可见, R33）', existsSync(DIST_PAGE.replace('dist/', 'dist-edit/')))
ok('V3 JSON 状态 = draft', readJ().page.status === 'draft')
const r2 = await page.request.post(`http://localhost:${EDIT_PORT}/__save`, { data: { slug: 'products/single-girder-eot-cranes', status: 'published', patches: [] } })
ok('V3 发布端点 200', r2.status() === 200)
await page.waitForTimeout(2000)
ok('V3 published 后 dist 页面回来', existsSync(DIST_PAGE))

// ---- V5：本地上传 → 压缩闸门 → 真实路径 ----
{
  const sharp = (await import('sharp')).default
  const big = await sharp({ create: { width: 4000, height: 2000, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer()
  const up = await page.request.post(`http://localhost:${EDIT_PORT}/__upload?name=poc5-upload-test.png`, { data: big, headers: { 'Content-Type': 'application/octet-stream' } })
  const upData = await up.json()
  ok('V5 上传端点 200', up.status() === 200 && upData.ok)
  const upFile = join(SITE, '../public/assets/img/product', (upData.src || '').split('/').pop())
  const { width } = await sharp(upFile).metadata()
  ok('V5 压缩闸门生效（4000px → ≤2560px）', width <= 2560, `实际 ${width}px`)
  const { unlinkSync } = await import('node:fs')
  unlinkSync(upFile) // 清理测试图
}

await browser.close()

// ---- 还原 ----
copyFileSync(JSON_FILE + '.bak', JSON_FILE)
await fetch(`http://localhost:${EDIT_PORT}/__save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'products/single-girder-eot-cranes', status: 'published', patches: [] }) })
await new Promise(r => setTimeout(r, 2000))
console.log('\n（JSON 已还原，页面已重建）')

const failed = results.filter(r => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} 通过`)
process.exit(failed ? 1 : 0)
