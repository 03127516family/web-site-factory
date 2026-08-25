#!/usr/bin/env node
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const port = process.env.EDIT_PORT || 8094
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

try {
  await page.goto(`http://localhost:${port}/products/single-girder-eot-cranes/`, { waitUntil: 'networkidle' })
  await page.click('#edlToggle')

  const row = page.locator('[data-repeat-key="specs"] > [data-item-id]').nth(4)
  await row.scrollIntoViewIfNeeded()
  await row.hover()
  const rowBox = await row.boundingBox()
  const menu = page.locator('.edl-itemmenu')
  await menu.waitFor({ state: 'visible' })
  const menuBox = await menu.boundingBox()
  assert.ok(rowBox && menuBox)
  assert.ok(menuBox.x >= 8 && menuBox.x + menuBox.width <= 1432, '菜单必须留在视口内')

  await page.mouse.move(rowBox.x + rowBox.width + 2, rowBox.y + rowBox.height / 2)
  await page.waitForTimeout(80)
  assert.equal(await menu.isVisible(), true, '鼠标穿过行与菜单的空隙时菜单不能消失')

  await page.mouse.move(menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height / 2)
  await page.waitForTimeout(150)
  assert.equal(await menu.isVisible(), true, '鼠标进入菜单后必须保持显示')

  await page.mouse.move(20, 20)
  await page.waitForTimeout(350)
  assert.equal(await menu.isVisible(), false, '鼠标真正离开后菜单应隐藏')
  console.log('item-menu: 4/4')
} finally {
  await browser.close()
}
