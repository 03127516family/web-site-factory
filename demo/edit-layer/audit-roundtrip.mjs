// 全字段往返审计(一次性工具): 每个 data-field 挂载→提交, DOM 前后比对, 揪出"编辑器吃掉的东西"
import { chromium } from 'playwright-core'

const URL = process.argv[2] || 'http://localhost:8090/_edit-demo/'
const norm = s => s.replace(/\s+/g, ' ').trim()

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', e => console.log('PAGEERROR:', e.message))
await page.goto(URL, { waitUntil: 'networkidle' })
await page.click('#edlToggle')
await page.waitForTimeout(1800) // 等入场闪现结束

const fields = await page.evaluate(() =>
  [...document.querySelectorAll('[data-field]')].map((el, i) => ({
    i,
    field: el.getAttribute('data-field'),
    tag: el.tagName.toLowerCase(),
    block: el.getAttribute('data-block-id') || '',
  }))
)
console.log(`共 ${fields.length} 个 data-field\n`)

const reports = []
for (const f of fields) {
  const sel = `[data-field="${f.field}"]` + (f.block ? `[data-block-id="${f.block}"]` : '')
  // 同 field 可能有多个(如 crumb.label), 按 block-id 精确; 无 block-id 的取第 n 个
  const loc = f.block ? page.locator(sel) : page.locator(`[data-field="${f.field}"]`).nth(await page.evaluate(([fld, idx]) => {
    const all = [...document.querySelectorAll(`[data-field="${fld}"]`)]
    return all.findIndex(el => !el.getAttribute('data-block-id') && [...document.querySelectorAll('[data-field]')].indexOf(el) === idx)
  }, [f.field, f.i]))
  const before = await loc.evaluate(el => el.outerHTML).catch(() => null)
  if (before === null) { reports.push({ ...f, status: '定位失败' }); continue }
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  await loc.click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  // 清弹层(图片/链接字段开的是弹层, Escape 不关)
  await page.evaluate(() => { document.querySelector('#edlImgPop').hidden = true; document.querySelector('#edlLinkPop').hidden = true })
  const after = await loc.evaluate(el => el.outerHTML).catch(() => null)
  if (after === null) { reports.push({ ...f, status: '提交后丢失', before: norm(before).slice(0, 150) }); continue }
  if (norm(before) === norm(after)) { reports.push({ ...f, status: 'OK' }); continue }
  // 找出差异片段
  const b = norm(before), a = norm(after)
  let p = 0
  while (p < Math.min(b.length, a.length) && b[p] === a[p]) p++
  reports.push({ ...f, status: 'DIFF', before: b.slice(Math.max(0, p - 40), p + 120), after: a.slice(Math.max(0, p - 40), p + 120) })
}

const diffs = reports.filter(r => r.status !== 'OK')
console.log(`OK: ${reports.length - diffs.length} / ${reports.length}\n`)
for (const r of diffs) {
  console.log(`--- [${r.status}] ${r.field}${r.block ? ' (' + r.block + ')' : ''} <${r.tag}>`)
  if (r.before) console.log(`  前: …${r.before}…`)
  if (r.after) console.log(`  后: …${r.after}…`)
}
await browser.close()
