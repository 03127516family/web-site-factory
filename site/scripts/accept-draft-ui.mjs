#!/usr/bin/env node
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const port = process.env.EDIT_PORT || 8094
const base = `http://localhost:${port}`
const path = '/products/single-girder-eot-cranes/'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

try {
  await page.goto(base + path, { waitUntil: 'networkidle' })
  const originalTitle = (await page.locator('h1[data-field="title"]').textContent()).trim()
  assert.equal(await page.locator('#edlSave').count(), 0, '不能保留重复的通用保存按钮')
  assert.equal(await page.locator('#edlChromeDraft').textContent(), '保存草稿')
  assert.match(await page.locator('#edlChromePublish').textContent(), /更新发布|首次发布/)
  assert.equal((await page.locator('#edlChromeAutosave').textContent()).includes('自动保存'), false)

  await page.click('#edlToggle')
  await page.click('h1[data-field="title"]')
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('草稿工作流验收一')
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }), true, '存在浏览器内未保存改动时必须触发离开警告')

  const [previewResponse] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/__preview-save')),
    page.click('#edlChromeDraft'),
  ])
  assert.equal(previewResponse.status(), 200)
  await page.locator('#edlModal:not([hidden])').waitFor()
  assert.match(await page.locator('#edlModalTitle').textContent(), /保存草稿前确认/)
  const firstSummary = await page.locator('#edlModalContent').textContent()
  assert.ok(firstSummary.includes(originalTitle) && firstSummary.includes('草稿工作流验收一'))

  const [saveResponse] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/__save')),
    page.click('#edlConfirmSave'),
  ])
  assert.equal(saveResponse.status(), 200)
  await page.waitForFunction(() => window.__EDIT_CONTEXT__?.hasDraft === true)
  assert.match(await page.locator('#edlChromePill').textContent(), /草稿已保存/)

  const cleanDraft = await (await page.request.get(base + path + '?view=draft')).text()
  const cleanPublished = await (await page.request.get(base + path + '?view=published')).text()
  assert.equal(cleanDraft.includes('edl-chrome-top'), false)
  assert.equal(cleanDraft.includes('/__edit/edit-layer.js'), false)
  assert.equal(cleanPublished.includes('edl-chrome-top'), false)
  assert.ok(cleanDraft.includes('草稿工作流验收一'))
  assert.ok(cleanPublished.includes(originalTitle))

  await page.click('h1[data-field="title"]')
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('草稿工作流验收二')
  await page.keyboard.press('Escape')
  const [publishPreviewResponse] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/__preview-save')),
    page.click('#edlChromePublish'),
  ])
  assert.equal(publishPreviewResponse.status(), 200)
  await page.locator('#edlModal:not([hidden])').waitFor()
  assert.match(await page.locator('#edlModalTitle').textContent(), /更新发布前确认/)
  const fullSummary = await page.locator('#edlModalContent').textContent()
  assert.ok(fullSummary.includes(originalTitle) && fullSummary.includes('草稿工作流验收二'), `发布摘要必须始终对比正式版: ${fullSummary}`)
  await page.click('#edlModalClose')

  page.once('dialog', dialog => dialog.accept())
  const [discardResponse] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/__discard-draft')),
    page.click('#edlChromeDiscard'),
  ])
  assert.equal(discardResponse.status(), 200)
  await page.waitForFunction(() => window.__EDIT_CONTEXT__?.hasDraft === false)
  assert.equal((await page.locator('h1[data-field="title"]').textContent()).trim(), originalTitle)
  console.log('accept-draft-ui: 20/20')
} finally {
  try {
    const html = await (await fetch(base + path)).text()
    const match = html.match(/window\.__EDIT_CONTEXT__=(.*?)<\/script>/)
    const context = match ? JSON.parse(match[1]) : null
    if (context?.hasDraft) await fetch(base + '/__discard-draft', {
      method: 'POST', body: JSON.stringify({ slug: context.slug, revision: context.revision }),
    })
  } catch {}
  await browser.close()
}
