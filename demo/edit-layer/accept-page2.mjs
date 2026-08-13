// 第二页面(overhead)试衣间冒烟: 编辑层零改动复用的专项回归
// 覆盖两页差异点: ①无 data-block-id 种子的行也能增删 ②.content div 规则下的标题不脱妆
import { chromium } from 'playwright-core'

const URL = 'http://localhost:8090/_edit-demo-overhead-cranes-for-sale/'
const results = []
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`) }

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const consoleErrors = []
const KNOWN_MISSING = ['Crane-electric-control-bo.jpg'] // §8 已知遗留: 原站亦缺的素材, 不算编辑层错误
page.on('pageerror', e => consoleErrors.push('pageerror: ' + (e.stack || e.message)))
page.on('console', m => {
  if (m.type() !== 'error') return
  const url = m.location()?.url || ''
  if (m.text().includes('Failed to load resource') && KNOWN_MISSING.some(k => url.includes(k))) {
    console.log('  [已知遗留] 缺图 404(原站亦缺):', url.split('/').pop())
    return
  }
  consoleErrors.push('console: ' + m.text())
})

await page.goto(URL, { waitUntil: 'networkidle' })
await page.click('#edlToggle')
await page.waitForTimeout(1800)

// 1. 无种子行(无 data-block-id)的 specs: 悬停出行菜单, ＋下生效
const li = page.locator('ul[data-repeat="specs"] li[data-field="spec.text"]')
const cntBefore = await li.count()
await li.first().hover()
await page.waitForTimeout(200)
ok('无种子行悬停出行菜单', await page.locator('.edl-itemmenu').isVisible())
await page.locator('.edl-itemmenu button[data-op="below"]').click()
await page.waitForTimeout(200)
ok('无种子行＋下生效', (await li.count()) === cntBefore + 1, `${cntBefore}→${await li.count()}`)

// 2. 标题编辑不脱妆(.content div 直接规则不得抢色): 编辑中 PM 与宿主逐值相等
const h3Before = await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('h3[data-field="overview.title"]'))
  return { font: cs.fontSize, color: cs.color }
})
await page.locator('h3[data-field="overview.title"]').click()
await page.waitForTimeout(400)
const h3During = await page.evaluate(() => {
  const pm = document.querySelector('h3[data-field="overview.title"] .ProseMirror')
  const cs = getComputedStyle(pm)
  return { font: cs.fontSize, color: cs.color }
})
ok('标题编辑不脱妆(字号颜色随宿主)', h3During.font === h3Before.font && h3During.color === h3Before.color, `${JSON.stringify(h3Before)} vs ${JSON.stringify(h3During)}`)
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
const h3After = await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('h3[data-field="overview.title"]'))
  return { font: cs.fontSize, color: cs.color }
})
ok('提交后标题样式原样', h3After.font === h3Before.font && h3After.color === h3Before.color)

// 3. 富文本(本页独有 spec_detail 大表)编辑往返
const sd = page.locator('div[data-field="spec_detail.body"]')
await sd.click()
await page.waitForTimeout(400)
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
ok('spec_detail 表格壳还原', await page.evaluate(() => !!document.querySelector('div[data-field="spec_detail.body"] .custom_tables table')))

ok('全程零 JS 报错', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

await browser.close()
const failed = results.filter(r => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} 通过`)
process.exit(failed ? 1 : 0)
