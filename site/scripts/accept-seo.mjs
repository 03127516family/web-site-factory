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

// ---------- seoHead ----------
const pg = (over = {}, seo) => ({
  pageId: 'x', type: 'post', lang: 'zh-CN', langDir: null,
  slug: 'posts/x', status: 'published', file: 'posts/x.json',
  j: {
    page: { slug: 'posts/x', type: 'post', lang: 'zh-CN', title: '夹具"标题"&<测试>', description: '描述', status: 'published', ...(seo ? { seo } : {}) },
    breadcrumb: { current: '夹具页', trail: [{ label: '首页', url: 'https://www.dgcrane.com/' }] },
    hero: { image: 'h.jpg' },
    ...over,
  },
})
// 镜像页记录：与 pg() 同形（j 必须真实——seoHead 的 jsonLd/og 要读它），只换坐标三件
const mirPg = {
  pageId: 'x', type: 'post', lang: 'en', langDir: 'en', slug: 'en/posts/x', status: 'published',
  j: { page: { slug: 'en/posts/x', type: 'post', lang: 'en', title: 'Fixture EN', description: 'Desc EN', status: 'published' }, breadcrumb: { current: 'Fixture', trail: [] }, hero: {} },
}

test('seoHead:五行齐全+转义+og 兜底链', async () => {
  const { seoHead } = await import('../src/seo/kernel.mjs')
  const h = seoHead(pg(), [pg(), mirPg])
  assert.ok(h.includes('<link rel="canonical" href="https://www.dgcrane.com/posts/x/">'))
  assert.ok(h.includes('<link rel="alternate" hreflang="zh-CN" href="https://www.dgcrane.com/posts/x/">'))
  assert.ok(h.includes('<link rel="alternate" hreflang="en" href="https://www.dgcrane.com/en/posts/x/">'))
  assert.ok(h.includes('<link rel="alternate" hreflang="x-default" href="https://www.dgcrane.com/en/posts/x/">'))
  assert.ok(h.includes('<meta property="og:title" content="夹具&quot;标题&quot;&amp;&lt;测试&gt;">')) // 特殊字符转义
  assert.ok(h.includes('<meta property="og:image" content="https://www.dgcrane.com/assets/img/product/h.jpg">')) // hero 兜底
  assert.ok(h.includes('<meta property="og:type" content="article">'))
  assert.ok(h.includes('<meta property="og:locale" content="zh_CN">'))
  assert.ok(h.includes('"@type":"Article"'))
  assert.ok(h.includes('"@type":"BreadcrumbList"'))
  assert.ok(!h.includes('<title>'))          // F5：document.html 已发，不得重复
  assert.ok(!h.includes('<meta name="description"'))
})

test('seoHead:孤立镜像只指自己、无 x-default 重复行', async () => {
  const { seoHead } = await import('../src/seo/kernel.mjs')
  const h = seoHead(mirPg, [mirPg])
  assert.equal((h.match(/hreflang=/g) || []).length, 1) // 只自己一行
  assert.ok(!h.includes('x-default'))
})

test('seoHead:空 seo 块 ≡ 无 seo 块（逐字节同）', async () => {
  const { seoHead } = await import('../src/seo/kernel.mjs')
  const a = seoHead(pg(), [pg(), mirPg])
  const b = seoHead(pg({}, { og: { title: null, description: null, image: null }, canonical: null, noindex: false }), [pg(), mirPg])
  assert.equal(a, b)
})

test('seoHead:og 覆盖优先于兜底链', async () => {
  const { seoHead } = await import('../src/seo/kernel.mjs')
  const h = seoHead(pg({}, { og: { title: '社交标题', description: null, image: '/assets/img/og.jpg' } }), [pg(), mirPg])
  assert.ok(h.includes('<meta property="og:title" content="社交标题">'))
  assert.ok(h.includes('<meta property="og:image" content="https://www.dgcrane.com/assets/img/og.jpg">')) // 相对路径自动绝对化
  assert.ok(h.includes('<meta property="og:description" content="描述">')) // 空的复用
})

test('seoHead:草稿/noindex/预览 → robots noindex + canonical 覆盖', async () => {
  const { seoHead } = await import('../src/seo/kernel.mjs')
  assert.ok(seoHead({ ...pg(), status: 'draft' }, [pg(), mirPg]).includes('<meta name="robots" content="noindex">'))
  assert.ok(seoHead(pg({}, { noindex: true }), [pg(), mirPg]).includes('<meta name="robots" content="noindex">'))
  assert.ok(seoHead(pg(), [pg(), mirPg], { preview: true }).includes('<meta name="robots" content="noindex">'))
  const h = seoHead(pg({}, { canonical: 'https://example.com/canonical' }), [pg(), mirPg])
  assert.ok(h.includes('<link rel="canonical" href="https://example.com/canonical">'))
})

test('seoHead:seo 块类型写坏 → 当场抛（构建不静默）', async () => {
  const { seoHead } = await import('../src/seo/kernel.mjs')
  assert.throws(() => seoHead(pg({}, { noindex: 'yes' }), [pg(), mirPg]), /page\.seo\.noindex/)
  assert.throws(() => seoHead(pg({}, { og: { title: 123 } }), [pg(), mirPg]), /page\.seo\.og\.title/)
})

test('seoHead:互指一致性（谷歌硬规则）——组内各版本集合两两相等', async () => {
  const { seoHead } = await import('../src/seo/kernel.mjs')
  const zhH = seoHead(pg(), [pg(), mirPg]), enH = seoHead(mirPg, [pg(), mirPg])
  const setOf = h => [...h.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map(m => `${m[1]} ${m[2]}`).sort().join(' | ')
  assert.equal(setOf(zhH), setOf(enH))
})

// ---------- sitemap / robots / 体检 ----------
test('sitemap:条数=生产页、draft 排除、互认全列', async () => {
  const { sitemapXml } = await import('../src/seo/kernel.mjs')
  const g = new Map([['x', [pg(), mirPg]]]) // 一组两语言
  const pub = new Set(['posts/x', 'en/posts/x'])
  const sm = sitemapXml(g, null, pub)
  assert.equal((sm.match(/<loc>/g) || []).length, 2)
  assert.ok(sm.includes('<loc>https://www.dgcrane.com/posts/x/</loc>'))
  // 每条 url 都列全部两语言互认
  for (const u of ['https://www.dgcrane.com/posts/x/', 'https://www.dgcrane.com/en/posts/x/'])
    assert.equal((sm.split(`<loc>${u}</loc>`)[1].split('</url>')[0].match(/xhtml:link/g) || []).length, 2)
  assert.ok(sm.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
  assert.ok(sm.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'))
  // draft 排除
  const sm2 = sitemapXml(g, null, new Set(['posts/x']))
  assert.equal((sm2.match(/<loc>/g) || []).length, 1)
})

test('sitemap:孤立镜像组单行自指（真例 free-standing-jib-cranes 形态）', async () => {
  const { sitemapXml } = await import('../src/seo/kernel.mjs')
  const orphan = { pageId: 'o', type: 'product', lang: 'en', langDir: 'en', slug: 'en/products/o', status: 'published', j: null }
  const sm = sitemapXml(new Map([['o', [orphan]]]), null, new Set(['en/products/o']))
  assert.equal((sm.match(/<loc>/g) || []).length, 1)
  assert.equal((sm.match(/xhtml:link/g) || []).length, 1)
})

test('robots:3 行 + sitemap 绝对地址', async () => {
  const { robotsTxt } = await import('../src/seo/kernel.mjs')
  const r = robotsTxt()
  assert.equal(r, 'User-agent: *\nAllow: /\n\nSitemap: https://www.dgcrane.com/sitemap.xml\n')
})

test('healthData:超长/缺失/noindex 标记（体检数据）', async () => {
  const { healthData } = await import('../src/seo/kernel.mjs')
  const long = { pageId: 'l', type: 'post', lang: 'en', langDir: 'en', slug: 'en/posts/l', status: 'published',
    j: { page: { title: 'x'.repeat(61), description: 'y'.repeat(161), status: 'published' } } }
  const miss = { pageId: 'm', type: 'post', lang: 'zh-CN', langDir: null, slug: 'posts/m', status: 'draft',
    j: { page: { title: '', description: '', status: 'draft' } } }
  const rows = healthData([long, miss])
  assert.deepEqual(rows[0].issues, ['title-overlength', 'description-overlength'])
  assert.deepEqual(rows[1].issues, ['title-missing', 'description-missing', 'noindex'])
  assert.equal(rows[0].titleLength, 61)
})

// ---------- pin：人稿不被机翻冲掉（D5 锁定层） ----------
const mockAI = async messages => {
  const ss = JSON.parse(messages[1].content.match(/sentences：\n(.+?)\n\n返回/s)[1])
  const translations = {}
  let i = 0
  for (const s of ss) translations[s.id] = `EN translation ${++i}.`
  return { translations }
}

test('pin:镜像人改 title → TM 收养 + pin 记账 → 源 title 再改 → 机翻不冲人稿', async () => {
  const { runPipeline, adoptMirror, pinQueue } = await import('../src/i18n/pipeline.mjs')
  const { loadTm, saveTm } = await import('../src/i18n/tm.mjs')
  const { collectUnits } = await import('../src/i18n/collect.mjs')
  fixture()
  await runPipeline(FIX, { lang: 't8', callAI: mockAI })
  // ① 人在镜像页把 title 精修（模拟编辑器发布后的镜像文件）
  const mir = JSON.parse(readFileSync(MIR_FILE(), 'utf8'))
  mir.page.title = 'Human Polished Title'
  const srcJ = JSON.parse(readFileSync(FIX_FILE(), 'utf8'))
  const tm = loadTm('zh-CN', 't8')
  adoptMirror(mir, srcJ, tm, 't8')
  // pin 已记账：字段级 { srcFp, text }
  assert.equal(tm.pins['page.title'].text, 'Human Polished Title')
  assert.equal(tm.pins['page.title'].srcFp, collectUnits(srcJ).find(u => u.field === 'page.title').fp)
  // ② 源 title 改（fp 变）
  srcJ.page.title = 'SEO 夹具页（新标题）'
  writeFileSync(FIX_FILE(), JSON.stringify(srcJ, null, 2))
  saveTm('zh-CN', 't8', tm)
  await runPipeline(FIX, { lang: 't8', callAI: mockAI })
  // ③ 重投影后镜像 title 仍是人稿（pin 顶住），不是机翻 "EN translation N."
  const mir2 = JSON.parse(readFileSync(MIR_FILE(), 'utf8'))
  assert.equal(mir2.page.title, 'Human Polished Title')
  // ④ 待确认旗：pin.srcFp ≠ 源当前 fp
  const q = pinQueue('t8')
  assert.ok(q.some(x => x.pageId === FIX && x.field === 'page.title'))
})

test('pin:decidePins——keep 清旗并保人稿、refollow 删 pin 放行重翻', async () => {
  const { runPipeline, decidePins, adoptMirror } = await import('../src/i18n/pipeline.mjs')
  const { loadTm } = await import('../src/i18n/tm.mjs')
  const { collectUnits } = await import('../src/i18n/collect.mjs')
  fixture()
  await runPipeline(FIX, { lang: 't8', callAI: mockAI })
  const mir = JSON.parse(readFileSync(MIR_FILE(), 'utf8'))
  mir.page.title = 'Human Polished Title'
  const srcJ0 = JSON.parse(readFileSync(FIX_FILE(), 'utf8'))
  adoptMirror(mir, srcJ0, loadTm('zh-CN', 't8'), 't8')
  srcJ0.page.title = '新中文标题'
  writeFileSync(FIX_FILE(), JSON.stringify(srcJ0, null, 2))
  await runPipeline(FIX, { lang: 't8', callAI: mockAI }) // 触发复植（人稿顶住）
  // keep：清待确认旗（srcFp 抬到当前），人稿继续顶
  let r = decidePins('t8', [{ pageId: FIX, field: 'page.title', action: 'keep' }])
  assert.equal(r.kept, 1)
  const tm1 = loadTm('zh-CN', 't8')
  const curFp = collectUnits(JSON.parse(readFileSync(FIX_FILE(), 'utf8'))).find(u => u.field === 'page.title').fp
  assert.equal(tm1.pins['page.title'].srcFp, curFp)
  // refollow：删 pin + 删复植条 → 再跑流水线时机翻接管
  r = decidePins('t8', [{ pageId: FIX, field: 'page.title', action: 'refollow' }])
  assert.equal(r.refollowed, 1)
  const tm2 = loadTm('zh-CN', 't8')
  assert.ok(!tm2.pins['page.title'])
  assert.ok(!tm2.sentences[curFp])
  await runPipeline(FIX, { lang: 't8', callAI: mockAI })
  const mir3 = JSON.parse(readFileSync(MIR_FILE(), 'utf8'))
  assert.notEqual(mir3.page.title, 'Human Polished Title') // 机翻接管
  assert.ok(mir3.page.title.startsWith('EN translation'))
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
