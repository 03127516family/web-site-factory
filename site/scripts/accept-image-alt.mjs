#!/usr/bin/env node
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const port = process.env.EDIT_PORT || 8094
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const pageErrors = []
page.on('pageerror', error => pageErrors.push(error.message))

try {
  await page.goto(`http://localhost:${port}/products/single-girder-eot-cranes/`, { waitUntil: 'networkidle' })
  await page.click('#edlToggle')

  const image = page.locator('[data-repeat-key="gallery"] [data-item-field="image"]').first()
  await image.scrollIntoViewIfNeeded()
  await image.dispatchEvent('pointerdown')
  await page.locator('#edlImgAlt').fill('图片 alt 保存回归测试')
  await page.click('#edlImgApply')
  const [previewResponse] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/__preview-save')),
    page.click('#edlChromeDraft'),
  ])
  assert.equal(previewResponse.status(), 200)

  assert.deepEqual(pageErrors, [], `修改图片 alt 后打开保存预览不能报错: ${pageErrors.join('; ')}`)
  await page.locator('#edlModal:not([hidden])').waitFor()
  assert.match(await page.locator('#edlModalContent').textContent(), /图片 alt 保存回归测试/)
  console.log('image-alt: 2/2')
} finally {
  await browser.close()
}
