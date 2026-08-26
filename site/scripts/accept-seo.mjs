#!/usr/bin/env node
// accept-seo：SEO 模块验收（spec 2026-08-25 §6；纯逻辑全绿，无 key 无服务都能跑）。
// e2e（走真实 8092 编辑链）不在此文件——见计划 Task 10 手续。
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { scanPages, buildGroups, siblingsOf, pageUrl, isPublishable, SITE_ROOT } from '../src/i18n/kernel.mjs'

const cases = []
const test = (name, fn) => cases.push([name, fn])

// ---------- 夹具（accept-i18n2 同款惯例；t8 假语言对当隔离仓） ----------
const FIX = 'zz-seo-fixture'
const FIX_FILE = () => join(process.cwd(), 'content', 'posts', `${FIX}.json`)
const MIR_FILE = () => join(process.cwd(), 'content', 't8', 'posts', `${FIX}.json`)
const fixture = () => writeFileSync(FIX_FILE(), JSON.stringify({
  version: '1',
  page: { slug: `posts/${FIX}`, type: 'post', lang: 'zh-CN', title: 'SEO 夹具页', description: '夹具描述，用于 SEO 验收。', status: 'published' },
  title: '夹具标题',
  breadcrumb: { current: '夹具页', trail: [{ label: '首页', url: 'https://www.dgcrane.com/' }] },
  hero: { image: 'fixture-hero.jpg' },
  overview: { title: '概述', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '第一句。第二句。' }] }] } },
}, null, 2))
const cleanup = () => {
  for (const f of [FIX_FILE(), MIR_FILE()]) if (existsSync(f)) rmSync(f)
  const d = join(process.cwd(), 'content', 't8')
  if (existsSync(d)) rmSync(d, { recursive: true })
  for (const f of [join(process.cwd(), 'src', 'i18n', 'data', 'tm.zh-CN.t8.json')]) if (existsSync(f)) rmSync(f)
}

// ---------- D1：中文住根 ----------
test('URL:中文源住根（D1 翻转）', () => {
  const pages = scanPages({ withJson: true })
  const zh = pages.find(p => p.pageId === 'single-girder-eot-cranes' && !p.langDir)
  assert.equal(pageUrl(zh), SITE_ROOT + 'products/single-girder-eot-cranes/')
  // 镜像不受影响（slug 自带 en/ 前缀）
  const en = pages.find(p => p.pageId === 'single-girder-eot-cranes' && p.lang === 'en')
  if (en) assert.equal(pageUrl(en), SITE_ROOT + 'en/products/single-girder-eot-cranes/')
})

// ---------- 配置收拢 ----------
test('配置:SEO 常量齐备且口径自洽', async () => {
  const c = await import('../src/seo/config.mjs')
  assert.equal(c.X_DEFAULT_LANG, 'en')                       // D7：兜底英文
  assert.equal(c.BRAND, 'DGCRANE')
  assert.equal(c.TITLE_TEMPLATE, '')                          // 空=不套（page.title 已含品牌）
  assert.equal(c.DEFAULT_OG_IMAGE, '')                        // 空=无兜底图则不发 og:image
  assert.equal(c.OG_IMAGE_PREFIX, '/assets/img/product/')     // F14：两族同 namespace
  // OG_LOCALE 覆盖 deploy 语言全集
  for (const l of ['zh-CN', 'en']) assert.ok(c.OG_LOCALE[l], `OG_LOCALE 缺 ${l}`)
  assert.equal(c.OG_LOCALE['zh-CN'], 'zh_CN')                 // og:locale 下划线格式
  // 长度预算覆盖四个 SEO 字段
  for (const f of ['page.title', 'page.description', 'page.seo.og.title', 'page.seo.og.description'])
    assert.ok(c.LENGTH_BUDGET[f], `LENGTH_BUDGET 缺 ${f}`)
  assert.equal(c.LENGTH_BUDGET['page.title'], 60)
  assert.equal(c.LENGTH_BUDGET['page.description'], 160)
})

// ---------- 汇总 ----------
let pass = 0
for (const [name, fn] of cases) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`) }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`) }
  finally { try { cleanup() } catch {} }
}
console.log(`\naccept-seo: ${pass}/${cases.length}`)
process.exit(pass === cases.length ? 0 : 1)
