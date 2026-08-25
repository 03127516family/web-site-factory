#!/usr/bin/env node
// 编辑写回验收：改字 / 富文本树 / repeat / schema / 隔离草稿 / 上传。
// 跑完自动还原 JSON 并重建。
import { chromium } from 'playwright-core'
import { readFileSync, copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const JSON_FILE = join(SITE, 'content/products/single-girder-eot-cranes.json')
const MIRROR_FILE = join(SITE, 'content/en/products/single-girder-eot-cranes.json')
const TM_FILE = join(SITE, 'src/i18n/tm.zh-CN.en.json')
const DIST_PAGE = join(SITE, 'dist/products/single-girder-eot-cranes/index.html')
const EDIT_PORT = process.env.EDIT_PORT || 8092 // 可让开被占的 8092 并行跑验收
const EDIT = `http://localhost:${EDIT_PORT}/products/single-girder-eot-cranes/`
const results = []
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`) }
const readJ = () => JSON.parse(readFileSync(JSON_FILE, 'utf8'))
const hitTestable = async (page, selector) => page.locator(selector).first().evaluate(el => {
  const r = el.getBoundingClientRect()
  if (!r.width || !r.height) return false
  const points = [0.1, 0.25, 0.5, 0.75, 0.9]
  return points.some(x => points.some(y => {
    const hit = document.elementFromPoint(r.left + r.width * x, r.top + r.height * y)
    return !!hit && (hit === el || el.contains(hit))
  }))
})
const protectedFiles = [JSON_FILE, MIRROR_FILE, TM_FILE]
for (const file of protectedFiles) if (existsSync(file + '.poc5.bak')) copyFileSync(file + '.poc5.bak', file) // 上次中断残留
for (const file of protectedFiles) copyFileSync(file, file + '.poc5.bak')
process.on('exit', () => {
  for (const file of protectedFiles) if (existsSync(file + '.poc5.bak')) copyFileSync(file + '.poc5.bak', file)
})

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
let lastSavePayload = null
page.on('request', request => {
  if (request.url().includes('/__save') && request.method() === 'POST') {
    try { lastSavePayload = request.postDataJSON() } catch {}
  }
})

async function saveAndPublish() {
  const [preview] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/__preview-save'), { timeout: 30000 }),
    page.click('#edlChromePublish'),
  ])
  ok('发布预览端点 200', preview.status() === 200)
  await page.waitForSelector('#edlModal:not([hidden])')
  await page.waitForFunction(() => !document.querySelector('#edlConfirmSave')?.disabled)
  const [resp] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/__save'), { timeout: 30000 }),
    page.click('#edlConfirmSave'),
  ])
  ok('保存端点 200', resp.status() === 200)
  ok('保存使用 changes 协议', Array.isArray(lastSavePayload?.changes) && !('patches' in lastSavePayload))
  ok('保存使用显式 publish intent', lastSavePayload?.intent === 'publish')
  ok('保存携带 revision', typeof lastSavePayload?.revision === 'string' && lastSavePayload.revision.length > 10)
  await page.waitForTimeout(2500) // 给客户端的发布后 reload 留出启动时间
  await page.goto(EDIT, { waitUntil: 'networkidle' }) // 固定在重建后的新文档，避免上一轮 reload 与下一步竞争
}

async function ensureEditMode() {
  await page.waitForSelector('#edlToggle')
  const editing = await page.locator('body').evaluate(body => body.classList.contains('edl-on'))
  if (!editing) await page.click('#edlToggle')
  await page.waitForFunction(() => document.body.classList.contains('edl-on'))
}

// ---- V2a：改标题文字 → 写回 JSON → 重建出新字 ----
await page.goto(EDIT, { waitUntil: 'networkidle' })
const editContext = await page.evaluate(() => window.__EDIT_CONTEXT__)
ok('编辑上下文已注入', typeof editContext?.revision === 'string' && editContext.contract?.fields?.title?.type === 'text')
ok('浏览器契约含模板资源策略', editContext?.contract?.assets?.namespace === 'product'
  && editContext.contract.assets.valueFormat === 'filename'
  && editContext.contract.assets.publicPrefix === '/assets/img/product/')
const publicContractJson = JSON.stringify(editContext?.contract || {})
ok('浏览器契约不含 JSON path/prototype', !publicContractJson.includes('"path"') && !publicContractJson.includes('"prototype"'))
await ensureEditMode()
await page.waitForTimeout(1800)
ok('Hero 图片在编辑模式可点击', await hitTestable(page, '.banner [data-field="hero.image"]'))
ok('Hero 标题在编辑模式可点击', await hitTestable(page, '.banner [data-field="hero.headline"]'))
ok('Hero 列表在编辑模式可点击', await hitTestable(page, '.banner [data-field="hero.highlights"]'))

// ---- V2a2：stringList 原位编辑，不把 ul 挂成富文本容器 ----
const highlight = page.locator('[data-field="hero.highlights"] > li').nth(1)
const listMounted = await highlight.evaluate(el => {
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }))
  return el.getAttribute('contenteditable') === 'plaintext-only'
})
ok('V2a2 stringList 挂载具体 LI', listMounted)
await page.keyboard.press('Meta+a')
await page.keyboard.type('列表原位编辑POC5')
await page.keyboard.press('Escape')
const listShape = await page.locator('[data-field="hero.highlights"]').evaluate(el => ({
  tag: el.tagName,
  nestedLists: el.querySelectorAll('ul,ol').length,
  directItems: el.querySelectorAll(':scope > li').length,
}))
ok('V2a2 stringList 保留唯一外层 UL', listShape.tag === 'UL' && listShape.nestedLists === 0 && listShape.directItems > 0, JSON.stringify(listShape))

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
ok('V2a2 stringList 写回字符串数组', j.hero.highlights.includes('列表原位编辑POC5'), JSON.stringify(j.hero.highlights))

// ---- V2b：正文末尾加一段 → 树写回（不经 DOM 反解）----
await page.goto(EDIT, { waitUntil: 'networkidle' })
await ensureEditMode()
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

// ---- V2c：重复区按稳定 itemId 新增、编辑、删除 ----
const originalSpecIds = new Set(j.specs.map(item => item.id))
await page.goto(EDIT, { waitUntil: 'networkidle' })
await ensureEditMode()
await page.hover('[data-repeat-key="specs"] [data-item-id]:first-child')
await page.click('.edl-itemmenu [data-op="below"]')
const insertedSpecId = await page.locator('[data-repeat-key="specs"] [data-item-id]').evaluateAll(
  (items, ids) => items.map(item => item.dataset.itemId).find(id => !ids.includes(id)),
  [...originalSpecIds],
)
const insertedSpec = page.locator(`[data-repeat-key="specs"] [data-item-id="${insertedSpecId}"]`)
await insertedSpec.click()
await page.waitForFunction(id => {
  const item = document.querySelector(`[data-repeat-key="specs"] [data-item-id="${id}"]`)
  return item?.classList.contains('edl-active') && item.querySelector('[contenteditable="true"]') === document.activeElement
}, insertedSpecId)
await page.keyboard.type('稳定ID新增规格POC5')
await page.keyboard.press('Escape')
await saveAndPublish()
j = readJ()
ok('V2c 新增行生成稳定 itemId', typeof insertedSpecId === 'string' && insertedSpecId.length > 8, insertedSpecId)
ok('V2c 新增行按 itemId 写回', j.specs.some(item => item.id === insertedSpecId && item.text === '稳定ID新增规格POC5'))

await page.goto(EDIT, { waitUntil: 'networkidle' })
await ensureEditMode()
await page.hover(`[data-repeat-key="specs"] [data-item-id="${insertedSpecId}"]`)
await page.click('.edl-itemmenu [data-op="del"]')
await saveAndPublish()
j = readJ()
ok('V2c 删除行按同一 itemId 写回', !j.specs.some(item => item.id === insertedSpecId))

// ---- V4：坏树直投端点 → schema 拒收，JSON 不被污染 ----
const bad = await page.request.post(`http://localhost:${EDIT_PORT}/__save`, {
  data: {
    slug: 'products/single-girder-eot-cranes', intent: 'publish',
    revision: (await page.evaluate(() => window.__EDIT_CONTEXT__)).revision,
    publishedRevision: (await page.evaluate(() => window.__EDIT_CONTEXT__)).publishedRevision,
    changes: [{ targetId: 'overview.body', value: { type: 'doc', content: [{ type: 'video', content: [] }] } }],
  },
})
ok('V4 坏树被拒（400）', bad.status() === 400)
const badMsg = (await bad.json()).error || ''
ok('V4 报错点名未知节点', /未知节点|不允许/.test(badMsg), badMsg.slice(0, 60))
ok('V4 JSON 未被污染', JSON.stringify(readJ().overview.body).includes('验收追加段POC5'))

// ---- V4b：未知 target / 陈旧 revision 都由新写回闸拒绝 ----
const freshContext = await page.evaluate(() => window.__EDIT_CONTEXT__)
const unknown = await page.request.post(`http://localhost:${EDIT_PORT}/__save`, {
  data: { slug: 'products/single-girder-eot-cranes', intent: 'publish', revision: freshContext.revision, publishedRevision: freshContext.publishedRevision, changes: [{ targetId: 'not_declared', value: 'x' }] },
})
ok('V4b 未声明 target 被拒（400）', unknown.status() === 400)
const stale = await page.request.post(`http://localhost:${EDIT_PORT}/__save`, {
  data: { slug: 'products/single-girder-eot-cranes', intent: 'publish', revision: 'stale-revision', publishedRevision: freshContext.publishedRevision, changes: [] },
})
ok('V4b 陈旧 revision 被拒（409）', stale.status() === 409)

// ---- V3：隔离草稿不改变正式 JSON / dist，随后可发布 ----
const beforeDraftJson = readFileSync(JSON_FILE)
const beforeDraftDist = readFileSync(DIST_PAGE)
const r1 = await page.request.post(`http://localhost:${EDIT_PORT}/__save`, { data: {
  slug: 'products/single-girder-eot-cranes', intent: 'draft', revision: freshContext.revision,
  publishedRevision: freshContext.publishedRevision, changes: [],
} })
ok('V3 存草稿端点 200', r1.status() === 200)
const draftSaved = await r1.json()
ok('V3 草稿不改正式 JSON', readFileSync(JSON_FILE).equals(beforeDraftJson))
ok('V3 草稿不改生产 dist', readFileSync(DIST_PAGE).equals(beforeDraftDist))
ok('V3 草稿预览仍在', existsSync(DIST_PAGE.replace('dist/', 'dist-edit/')))
ok('V3 正式 JSON 状态保持 published', readJ().page.status === 'published')
const r2 = await page.request.post(`http://localhost:${EDIT_PORT}/__save`, { data: {
  slug: 'products/single-girder-eot-cranes', intent: 'publish', revision: draftSaved.revision,
  publishedRevision: draftSaved.publishedRevision, changes: [],
} })
ok('V3 发布端点 200', r2.status() === 200)
ok('V3 发布后 dist 仍在', existsSync(DIST_PAGE))

// ---- V5：本地上传 → 压缩闸门 → 真实路径 ----
{
  const sharp = (await import('sharp')).default
  const big = await sharp({ create: { width: 4000, height: 2000, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer()
  const up = await page.request.post(`http://localhost:${EDIT_PORT}/__upload?slug=products/single-girder-eot-cranes&name=poc5-upload-test.png`, { data: big, headers: { 'Content-Type': 'application/octet-stream' } })
  const upData = await up.json()
  ok('V5 产品上传按合同返回文件名', up.status() === 200 && upData.ok
    && upData.publicUrl === '/assets/img/product/poc5-upload-test.png'
    && upData.storageValue === 'poc5-upload-test.png', JSON.stringify(upData))
  const upFile = join(SITE, 'public/assets/img/product', (upData.publicUrl || '').split('/').pop())
  const { width } = await sharp(upFile).metadata()
  ok('V5 压缩闸门生效（4000px → ≤2560px）', width <= 2560, `实际 ${width}px`)
  unlinkSync(upFile) // 清理测试图

  const postUp = await page.request.post(`http://localhost:${EDIT_PORT}/__upload?slug=posts/32t-rail-mounted-container-gantry-crane-exported-to-russia&name=poc5-post-upload.png`, { data: big, headers: { 'Content-Type': 'application/octet-stream' } })
  const postData = await postUp.json()
  ok('V5 文章上传按合同返回公共路径', postUp.status() === 200 && postData.ok
    && postData.publicUrl === '/assets/img/post/poc5-post-upload.png'
    && postData.storageValue === '/assets/img/post/poc5-post-upload.png', JSON.stringify(postData))
  if (postData.publicUrl) unlinkSync(join(SITE, 'public/assets/img/post', postData.publicUrl.split('/').pop()))
}

// ---- V6：旧文章负层级顶部在编辑模式可点击 ----
await page.goto(`http://localhost:${EDIT_PORT}/posts/32t-rail-mounted-container-gantry-crane-exported-to-russia/`, { waitUntil: 'networkidle' })
await ensureEditMode()
ok('V6 文章顶部标题可点击', await hitTestable(page, '.toptitle [data-field="title"]'))
ok('V6 文章当前面包屑可点击', await hitTestable(page, '.toptitle [data-field="breadcrumb.current"]'))

await browser.close()

// ---- 还原 ----
for (const file of protectedFiles) copyFileSync(file + '.poc5.bak', file)
await fetch(`http://localhost:${EDIT_PORT}/__build`, { method: 'POST' })
await new Promise(r => setTimeout(r, 2000))
for (const file of protectedFiles) unlinkSync(file + '.poc5.bak')
console.log('\n（JSON 已还原，页面已重建）')

const failed = results.filter(r => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} 通过`)
process.exit(failed ? 1 : 0)
