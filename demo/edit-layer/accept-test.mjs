// 试衣间自动化验收(一次性): 用系统 Chrome 无头跑真实点击流程
import { chromium } from 'playwright-core'

const URL = 'http://localhost:8090/_edit-demo/'
const results = []
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond, extra }); console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`) }

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const consoleErrors = []
page.on('pageerror', e => consoleErrors.push('pageerror: ' + (e.stack || e.message)))
page.on('console', m => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()) })
// prompt 应答队列 + 记录每次 prompt 的预填值(验"改链接时预填当前地址")
const dialogAnswers = []
const dialogDefaults = []
page.on('dialog', async d => { dialogDefaults.push(d.defaultValue()); await d.accept(dialogAnswers.length ? dialogAnswers.shift() : d.defaultValue()) })

await page.goto(URL, { waitUntil: 'networkidle' })

// 0. 加载即弹窗的回归检查(v1 bug 不得回来)
ok('加载后弹窗不裸奔', await page.locator('#edlModal').isHidden())

// 1. 进入编辑模式
await page.click('#edlToggle')
ok('编辑模式开启(edl-on)', await page.evaluate(() => document.body.classList.contains('edl-on')))
const flashNow = await page.evaluate(() => document.querySelectorAll('[data-repeat].edl-zoneflash').length)

// 1b. 轮播布局不被编辑 UI 挤坏(回归: 编辑 UI 不得进文档流)
const geom = await page.evaluate(() => {
  const t = document.querySelector('.gallery-thumbs').getBoundingClientRect()
  const g = document.querySelector('.gallery-top').getBoundingClientRect()
  return { ty: Math.round(t.top), gy: Math.round(g.top), tx: Math.round(t.left), gx: Math.round(g.left), tw: Math.round(t.width) }
})
ok('轮播布局未被编辑UI挤坏', Math.abs(geom.ty - geom.gy) < 5 && geom.tx < geom.gx && geom.tw > 200, JSON.stringify(geom))

// 1d. 入场轮廓闪后即收; 零常驻增删按钮(区域＋芯片机制已删, 只剩行级迷你组)
await page.waitForTimeout(1800)
ok('区域轮廓入场闪后即收', flashNow > 0 && (await page.evaluate(() => document.querySelectorAll('[data-repeat].edl-zoneflash').length)) === 0, `入场 ${flashNow} 区`)
ok('页面零常驻增删按钮', (await page.locator('.edl-addrow').count()) === 0)

// 2. 点 h1 中间位置 → 光标落在点击处 → 打字
const h1 = page.locator('h1[data-field="title"]')
const box = await h1.boundingBox()
await h1.click({ position: { x: Math.floor(box.width / 4), y: Math.floor(box.height / 2) } })
await page.waitForTimeout(300)
const isEditable = await page.evaluate(() => {
  const el = document.querySelector('h1[data-field="title"]')
  return !!el?.querySelector('.ProseMirror[contenteditable="true"]')
})
ok('h1 点击后就地变可编辑', isEditable)
// 2b. 单行字段 = 内联文档: 无寄生 <p>, 编辑时字号/颜色仍随宿主(不脱妆)
const h1Style = await page.evaluate(() => {
  const h1 = document.querySelector('h1[data-field="title"]')
  const pm = h1.querySelector('.ProseMirror')
  const cs = getComputedStyle(pm), hs = getComputedStyle(h1)
  return { hasP: !!pm.querySelector('p'), pmFont: cs.fontSize, h1Font: hs.fontSize, pmColor: cs.color, h1Color: hs.color }
})
ok('文本编辑不套<p>且样式随宿主', !h1Style.hasP && h1Style.pmFont === h1Style.h1Font && h1Style.pmColor === h1Style.h1Color, JSON.stringify(h1Style))
const before = await h1.textContent()
await page.keyboard.type('XYZ')
const mid = await h1.textContent()
ok('打字内容落在标题里', mid.replace(/\s/g,'').includes('XYZ'), mid.slice(0, 40))
// 点在 1/4 处, XYZ 不应全部落在末尾
ok('光标在点击处(非末尾)', !mid.trimEnd().endsWith('XYZ'), `末尾? ${mid.slice(-12)}`)

// 3. 点空白处提交 → 内容保留 + 无 <p> 残留
await page.mouse.click(30, 500)
await page.waitForTimeout(200)
const committed = await h1.textContent()
const hasP = await page.evaluate(() => !!document.querySelector('h1[data-field="title"] p'))
ok('离开后内容保留', committed.includes('XYZ'))
ok('h1 内无 <p> 残留', !hasP)

// 4. 规格行(li)编辑往返
const li = page.locator('ul[data-repeat="specs"] li[data-field="spec.text"]').first()
await li.click()
await page.waitForTimeout(200)
await page.keyboard.type('TEST')
await page.mouse.click(30, 500)
await page.waitForTimeout(200)
const liText = await li.textContent()
const liHasP = await page.evaluate(() => !!document.querySelector('ul[data-repeat="specs"] li[data-field="spec.text"] p'))
ok('规格行编辑保留', liText.includes('TEST'))
ok('li 内无 <p> 残留', !liHasP)

// 4b. 含行内样式的单行字段: 价格行 <span>(样式钩子) 编辑往返后不被削平
await page.locator('li[data-field="spec.text"][data-block-id="spec-7"]').click()
await page.waitForTimeout(250)
const spanInEditor = await page.evaluate(() => !!document.querySelector('li[data-block-id="spec-7"] .ProseMirror span'))
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
const spanAfter = await page.evaluate(() => {
  const li = document.querySelector('li[data-block-id="spec-7"]')
  const sp = li?.querySelector('span')
  return { hasSpan: !!sp, color: sp ? getComputedStyle(sp).color : null }
})
ok('行内<span>编辑中存活', spanInEditor)
ok('提交后<span>与橙色样式保留', spanAfter.hasSpan && spanAfter.color === 'rgb(245, 166, 35)', spanAfter.color)

// 5. 富文本(概述正文)编辑
const rich = page.locator('div[data-field="overview.body"]')
await rich.click()
await page.waitForTimeout(300)
await page.keyboard.type('尾注ABC')
await page.mouse.click(30, 500)
await page.waitForTimeout(200)
ok('富文本编辑保留', (await rich.textContent()).includes('尾注ABC'))

// 5b. 正文插图: 顶部工具条 🖼 → 弹层填路径/alt → 插入 → 提交后仍在
await rich.click()
await page.waitForTimeout(300)
ok('工具条随富文本编辑出现', await page.locator('.edl-toolbar').isVisible())
await page.locator('.edl-toolbar button[data-op="image"]').click()
await page.waitForTimeout(200)
ok('插图弹层打开', await page.locator('#edlImgPop').isVisible())
await page.fill('#edlImgSrc', '/assets/img/product/LDA-scaled.jpg')
await page.fill('#edlImgAlt', '验收插图')
await page.click('#edlImgApply')
await page.waitForTimeout(200)
const imgInEditor = await page.evaluate(() => !!document.querySelector('div[data-field="overview.body"] .ProseMirror img[src*="LDA-scaled"]'))
await page.mouse.click(30, 500)
await page.waitForTimeout(200)
const imgKept = await page.evaluate(() => {
  const img = document.querySelector('div[data-field="overview.body"] img[src*="LDA-scaled"]')
  return !!img && img.getAttribute('alt') === '验收插图'
})
ok('正文插图插入且提交后保留', imgInEditor && imgKept)
ok('提交后工具条收起', await page.locator('.edl-toolbar').isHidden())

// 5c. 链接字段: 点面包屑文字 → 就地改字 + 链接地址框一并弹出(预填当前地址)
const crumbLabel = page.locator('a[data-field="crumb.url"] span[data-field="crumb.label"]').first()
const oldHref = await page.locator('a[data-field="crumb.url"]').first().getAttribute('href')
await crumbLabel.scrollIntoViewIfNeeded()
await crumbLabel.click()
await page.waitForTimeout(300)
const linkPop = await page.evaluate(() => ({ visible: !document.querySelector('#edlLinkPop').hidden, prefilled: document.querySelector('#edlLinkHref').value }))
ok('点链接文字就地可改且地址框弹出预填', linkPop.visible && linkPop.prefilled === oldHref, linkPop.prefilled)
await page.keyboard.type('改')
await page.fill('#edlLinkHref', 'https://example.com/zh/')
await page.click('#edlLinkApply')
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
const crumbAfter = await page.evaluate(() => {
  const a = document.querySelector('a[data-field="crumb.url"]')
  return { href: a.getAttribute('href'), text: a.querySelector('span[data-field="crumb.label"]').textContent }
})
ok('链接地址已更换', crumbAfter.href === 'https://example.com/zh/', crumbAfter.href)
ok('链接文字就地改保留', crumbAfter.text.includes('改'), crumbAfter.text)

// 5d. 正文内链接: 选中设链接 → 光标进链接改地址(🔗 预填当前地址)
await rich.click()
await page.waitForTimeout(300)
await page.keyboard.press('ControlOrMeta+A')
dialogAnswers.push('https://a.example/')
await page.locator('.edl-toolbar button[data-op="link"]').click()
await page.waitForTimeout(200)
const linkSet = await page.evaluate(() => !!document.querySelector('div[data-field="overview.body"] .ProseMirror a[href="https://a.example/"]'))
await page.locator('div[data-field="overview.body"] .ProseMirror a').first().click()
await page.waitForTimeout(150)
dialogAnswers.push('https://b.example/')
await page.locator('.edl-toolbar button[data-op="link"]').click()
await page.waitForTimeout(200)
const linkChanged = await page.evaluate(() => !!document.querySelector('div[data-field="overview.body"] .ProseMirror a[href="https://b.example/"]'))
ok('正文选中文字设链接', linkSet)
ok('改链接时预填当前地址', dialogDefaults[dialogDefaults.length - 1] === 'https://a.example/', JSON.stringify(dialogDefaults))
ok('正文链接地址已更换', linkChanged)
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
ok('提交后正文链接保留', await page.evaluate(() => !!document.querySelector('div[data-field="overview.body"] a[href="https://b.example/"]')))

// 5e. 轮播图换图: 点主图 → 弹层预填 → 换 src → 同源缩略图一并换(双处结构同步; Swiper 吞 mousedown 回归)
await page.evaluate(() => document.querySelector('.gallery-top').scrollIntoView({ block: 'center' }))
await page.waitForTimeout(300)
const oldGallerySrc = await page.locator('.gallery-top .swiper-slide-active img').getAttribute('src')
await page.locator('.gallery-top .swiper-slide-active img').click({ position: { x: 300, y: 200 } })
await page.waitForTimeout(300)
const galleryPop = await page.evaluate(() => ({ visible: !document.querySelector('#edlImgPop').hidden, prefilled: document.querySelector('#edlImgSrc').value }))
ok('轮播图弹层打开且预填', galleryPop.visible && galleryPop.prefilled === oldGallerySrc, galleryPop.prefilled)
await page.fill('#edlImgSrc', '/assets/img/product/LDA-scaled.jpg')
await page.click('#edlImgApply')
await page.waitForTimeout(200)
const synced = await page.evaluate(() => [...document.querySelectorAll('.gallery-thumbs .swiper-slide img, .gallery-top .swiper-slide img')].filter(i => i.getAttribute('src') === '/assets/img/product/LDA-scaled.jpg').length)
ok('换图同源同步(主图+缩略图)', synced >= 2, `${synced} 处同新图`)

// 5f. 正文内图片: 点图 → 芯片「换图/alt/删图」→ 弹层预填 → 换 → 删(正文原有 30+ 张图, 断言全动态)
await rich.click()
await page.waitForTimeout(300)
const firstBodyImg = page.locator('div[data-field="overview.body"] .ProseMirror img').first()
const origSrc = await firstBodyImg.getAttribute('src')
const origAlt = (await firstBodyImg.getAttribute('alt')) || ''
const bodyImgBefore = await page.locator('div[data-field="overview.body"] .ProseMirror img').count()
await firstBodyImg.click()
await page.waitForTimeout(250)
ok('点正文图芯片出现', await page.locator('.edl-imgchip').isVisible())
await page.locator('.edl-imgchip button[data-op="replace"]').click()
await page.waitForTimeout(200)
const pmPop = await page.evaluate(() => ({ visible: !document.querySelector('#edlImgPop').hidden, src: document.querySelector('#edlImgSrc').value, alt: document.querySelector('#edlImgAlt').value }))
ok('换图弹层预填当前图', pmPop.visible && pmPop.src === origSrc && pmPop.alt === origAlt, JSON.stringify(pmPop))
await page.fill('#edlImgSrc', '/assets/img/product/1-Incoming-material-sample-test-1.jpg')
await page.fill('#edlImgAlt', '改过的alt')
await page.click('#edlImgApply')
await page.waitForTimeout(200)
const pmImg = await page.evaluate(() => { const i = document.querySelector('div[data-field="overview.body"] .ProseMirror img'); return i ? { src: i.getAttribute('src'), alt: i.getAttribute('alt') } : null })
ok('正文图已换且alt已改', pmImg && pmImg.src === '/assets/img/product/1-Incoming-material-sample-test-1.jpg' && pmImg.alt === '改过的alt', JSON.stringify(pmImg))
await page.locator('div[data-field="overview.body"] .ProseMirror img').first().click()
await page.waitForTimeout(250)
await page.locator('.edl-imgchip button[data-op="del"]').click()
await page.waitForTimeout(200)
ok('芯片删图生效', (await page.locator('div[data-field="overview.body"] .ProseMirror img').count()) === bodyImgBefore - 1)
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
ok('提交后正文图改动保留', (await page.locator('div[data-field="overview.body"] img').count()) === bodyImgBefore - 1)

// 5g. 关键形态往返门禁(全字段审计的常驻版): 挂载→Escape提交→规范化比对; 容忍: 属性序/标签间空白/空div壳/b→strong
const rtSels = [
  'h1[data-field="title"]', 'li[data-block-id="spec-7"]',
  'div[data-field="overview.body"]', 'div[data-field="introduction.body"]',
  'div[data-field="spec_compare.body"]', 'div[data-field="crane_type.body"]',
  'p[data-field="installation.body"]',
]
const rtBad = []
for (const sel of rtSels) {
  const loc = page.locator(sel).first()
  const before = await loc.evaluate(el => el.outerHTML)
  await loc.scrollIntoViewIfNeeded()
  await loc.click()
  await page.waitForTimeout(250)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  const after = await loc.evaluate(el => el.outerHTML).catch(() => null)
  const same = after !== null && (await page.evaluate(([b, a]) => {
    const canon = (html) => {
      const t = document.createElement('template')
      t.innerHTML = html
      const walk = (n) => {
        if (n.nodeType === 3) return n.textContent.replace(/\s+/g, ' ')
        if (n.nodeType !== 1) return ''
        let tag = n.tagName.toLowerCase()
        if (tag === 'strong') tag = 'b'
        if (tag === 'em') tag = 'i'
        const attrs = [...n.attributes].map(x => `${x.name}="${x.value}"`).sort().join(' ')
        return `<${tag}${attrs ? ' ' + attrs : ''}>${[...n.childNodes].map(walk).join('')}</${tag}>`
      }
      return [...t.content.childNodes].map(walk).join('').replace(/<div><\/div>/g, '').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
    }
    return canon(b) === canon(a)
  }, [before, after]))
  if (!same) rtBad.push(sel)
}
ok('关键形态往返无损', rtBad.length === 0, rtBad.join(' | '))

// 6. 表格单元格编辑 + ＋行(带堆栈侦察)
const cell = page.locator('div[data-field="spec_compare.body"] td').first()
await cell.click()
await page.waitForTimeout(400)
const mountState = await page.evaluate(() => {
  const b = document.querySelector('div[data-field="spec_compare.body"]')
  return { htmlHead: b.innerHTML.slice(0, 120), hasPM: !!b.querySelector('.ProseMirror'), hasTable: !!b.querySelector('table') }
})
console.log('  [侦察] 挂载后 spec_compare.body:', JSON.stringify(mountState))
await page.keyboard.type('改')
const rowsBefore = await page.locator('div[data-field="spec_compare.body"] tr').count()
await page.click('.edl-tablechip button[data-op="add"]')
await page.waitForTimeout(200)
const rowsAfter = await page.locator('div[data-field="spec_compare.body"] tr').count()
ok('表格 ＋行 生效', rowsAfter === rowsBefore + 1, `${rowsBefore}→${rowsAfter}`)
await page.mouse.click(30, 500)
await page.waitForTimeout(200)
ok('表格改字保留且 custom_tables 还原', await page.evaluate(() => {
  const b = document.querySelector('div[data-field="spec_compare.body"]')
  return b.textContent.includes('改') && !!b.querySelector('.custom_tables table')
}))

// 7. 末尾追加 = 悬停末行 → ＋下(区域＋芯片已删, 行级一套管全部位置)
const specSel = 'ul[data-repeat="specs"] li[data-field="spec.text"]'
const specCountBefore = await page.locator(specSel).count()
const lastSpecText = await page.locator(specSel).last().textContent()
await page.locator(specSel).last().hover()
await page.waitForTimeout(150)
await page.locator('.edl-itemmenu button[data-op="below"]').click()
await page.waitForTimeout(150)
const specCountAfter = await page.locator(specSel).count()
const newLastText = await page.locator(specSel).last().textContent()
ok('末行＋下=末尾追加', specCountAfter === specCountBefore + 1 && newLastText === lastSpecText, `${specCountBefore}→${specCountAfter}`)

// 7b. 定位增删: 悬停某行 → ＋上/＋下/− 作用于被点行(不是只能末尾)
let specTexts = await page.locator(specSel).allTextContents()
const n7b = specTexts.length
await page.locator(specSel).nth(1).hover()
await page.waitForTimeout(150)
await page.locator('.edl-itemmenu button[data-op="below"]').click()
await page.waitForTimeout(150)
specTexts = await page.locator(specSel).allTextContents()
ok('＋下插在被点行正后方', specTexts.length === n7b + 1 && specTexts[2] === specTexts[1] && specTexts.at(-1) !== specTexts[1], `末行: ${specTexts.at(-1)?.slice(0, 12)}`)
await page.locator(specSel).nth(1).hover()
await page.waitForTimeout(150)
await page.locator('.edl-itemmenu button[data-op="above"]').click()
await page.waitForTimeout(150)
specTexts = await page.locator(specSel).allTextContents()
ok('＋上插在被点行正前方', specTexts.length === n7b + 2 && specTexts[1] === specTexts[2])
await page.locator(specSel).nth(1).hover()
await page.waitForTimeout(150)
await page.locator('.edl-itemmenu button[data-op="del"]').click()
await page.waitForTimeout(150)
ok('− 删被点行', (await page.locator(specSel).count()) === n7b + 1)

// 7c. 防呆: 删到只剩 1 行 → − 隐藏(删空将无任何入口加回), ＋上/＋下仍在
let cnt7c = await page.locator(specSel).count()
while (cnt7c > 1) {
  await page.locator(specSel).last().hover()
  await page.waitForTimeout(120)
  await page.locator('.edl-itemmenu button[data-op="del"]').click()
  await page.waitForTimeout(120)
  cnt7c = await page.locator(specSel).count()
}
await page.locator(specSel).first().hover()
await page.waitForTimeout(150)
const menuState = await page.evaluate(() => {
  const m = document.querySelector('.edl-itemmenu')
  const vis = el => el && el.style.display !== 'none'
  return { menu: m.style.display !== 'none', del: vis(m.querySelector('[data-op="del"]')), above: vis(m.querySelector('[data-op="above"]')), below: vis(m.querySelector('[data-op="below"]')) }
})
ok('最后一行不显示−', menuState.menu && !menuState.del)
ok('＋上/＋下仍可用', menuState.above && menuState.below)

// 8. 写回预览: 弹窗能开能关, 表格是管道表格
await page.click('#edlPreview')
await page.waitForTimeout(300)
ok('预览弹窗打开', await page.locator('#edlModal').isVisible())
const pvBlocks = await page.locator('.edl-pv').allTextContents()
console.log('  [侦察] body 预览块:', JSON.stringify(pvBlocks.find(t => t.includes('spec_compare.body'))?.slice(0, 300)))
console.log('  [侦察] 含管道符的块数:', pvBlocks.filter(t => t.includes('|')).length, '/', pvBlocks.length)
const pv = await page.locator('#edlModalContent').textContent()
ok('预览含管道表格', /\|.*\|/.test(pv))
ok('预览含图片标记', /!\[[^\]]*\]\(/.test(pv))
await page.click('#edlModalClose')
await page.waitForTimeout(100)
ok('预览弹窗能关', await page.locator('#edlModal').isHidden())

// 9. 零 JS 报错
ok('全程零 JS 报错', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

await page.screenshot({ path: '/tmp/edl-final.png', fullPage: false })
await browser.close()
const failed = results.filter(r => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} 通过`)
process.exit(failed ? 1 : 0)
