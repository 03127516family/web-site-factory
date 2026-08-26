# SEO 模块实施计划（site/ 新架构）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地已拍板的 SEO 设计（spec：`docs/superpowers/specs/2026-08-25-seo-design.md`）——`src/seo/` 纯逻辑模块产出每页 head 片段 + sitemap + robots + 体检数据，长在 astro build 流水线上；外加翻译联动三件（pin 防冲、长度约束、体检端点）。

**Architecture:** 方案 A——构建流水线内照族谱现算。三样现成原料（页面 JSON、i18n 族谱、站点配置）→ `src/seo/kernel.mjs` 四个纯函数 → 三样成品（head 片段贴 `{{SEO}}` 槽、sitemap/robots 由 `scripts/seo-emit.mjs` 落产物、体检数据喂端点）。翻译侧补一条 pin 链：人精修过的字段记进 TM 的 `pins` 账本，源变更后机翻不许冲掉，人批量决定重不重跟。

**Tech Stack:** 纯 Node ESM（零新依赖）、Astro 6（既有）、现有验收脚本惯例（`scripts/accept-*.mjs`，cases 数组 + 逐条跑 + 汇总退出码）。

**范围边界：** spec §7 四步中的 **步 1~3**。步 4（管理界面：单页面板 + 体检台 UI）不在本计划——另立计划，本期只保数据接口（`/__seo/health`）。

---

## 零上下文工程师必读（本项目事实，全部带证据）

| # | 事实 | 证据 |
|---|---|---|
| F1 | 族谱不落盘：`scanPages` 扫 content 树现算，pageId=文件名=跨语言配对键 | `site/src/i18n/kernel.mjs:35-68` |
| F2 | URL：`pageUrl(pg)` = 源 `SITE_BASE+slug`，镜像 `SITE_ROOT+slug`（镜像 slug 自带 `<lang>/` 前缀） | `kernel.mjs:87` |
| F3 | `SITE_BASE = SITE_ROOT + 'zh/'` 是共存期旧值，**与 dist 拓扑不一致**（dist 里 zh 产物在 `/posts/`、`/products/`，无 `/zh/`；切换器 zh 链接指 `/zh/...` 在 dist 上 404） | `kernel.mjs:15`；`ls dist/` → `en posts products`；2026-08-26 实跑 `pageUrl(zh源)=https://www.dgcrane.com/zh/products/single-girder-eot-cranes/` |
| F4 | SEO 接线点：`Chrome.astro:46` `.replaceAll('{{SEO}}', '')` 空占位；同文件 :40 已消费 `siblingsOf` | `site/src/layouts/Chrome.astro` |
| F5 | `<title>`/`<meta description>` **已由** document.html 的 `{{TITLE}}`/`{{DESCRIPTION}}` 槽发出（Chrome.astro:44-45 填值）——seoHead **不得重复发**这两行 | `src/chrome/document.html:6-9` |
| F6 | 构建链：`edit-server.mjs:142-149` spawn `astro build` + `link-assets.mjs`，`BUILD_OUT` 参数化 dist/dist-edit；`package.json` build 同链 | `site/scripts/edit-server.mjs:142-153` |
| F7 | 预览信号：dist-edit 构建恒带 `INCLUDE_DRAFTS=1`（dist 从不带）——预览 noindex 直接用它，不新发明 `SEO_PREVIEW` | `src/build-outputs.mjs:66-69` |
| F8 | 页面 JSON 无 page 级 schema（`content/schema.mjs` 只校正文 doc 树）——seo 块的类型执法放 seoHead 里，改坏构建当场红 | `src/content/schema.mjs`（全文无 page 定义） |
| F9 | TM 句账按源文本指纹 `fp` 记；`origin`（engine/human/harvest）**句级有、字段级无独立账**。`loadTm` 只保留 `{pair, sentences}` 两键——**往 TM 对象塞新顶层键必须同步改 loadTm**，否则下轮读写就丢 | `src/i18n/tm.mjs:14-19` |
| F10 | **`adoptMirror`（人改镜像→收养进 TM）没有任何生产调用方**（grep 全站只有验收脚本调它）——镜像页就地改字保存后不进 TM，下次源页发布触发重投影 `writeJ(mirFile, mirror)` 整文件覆盖，人改**被冲掉**。2026-08-18 拍定的「改完存 TM 永不再犯」实际未接线 | `src/i18n/pipeline.mjs:113`（定义）；`scripts/edit-server.mjs:194-230`（/__save 镜像分支无收养）；grep 全站 |
| F11 | 机翻冲人稿路径（pin 要堵的洞）：源字段文本一改 → fp 变 → TM 新 fp 无条目 → `runPipeline` 判 missing → 机器重翻顶上；旧 fp 的人稿孤儿化 | `pipeline.mjs:58`（missing 判定按 fp） |
| F12 | `collectUnits` 自动把 `page.title`/`page.description` 收为 `kind:'field'` 单元；`page.seo.og.title/description` 会被**自动**收进翻译名册（键名不在 SKIP_KEYS），`seo.og.image`（键 `image`）、`canonical`（值是 URL 被 VALUE_SKIP）、`noindex`（布尔）天然不翻——**「seo 字段进名册」零代码** | `src/i18n/collect.mjs:5-10,36-57` |
| F13 | 翻译提示词在 `engine.mjs` `RULES` + `translateMessages`；sentences 只带 `{id,text,before,after}` | `src/i18n/engine.mjs:7-23` |
| F14 | `hero.image` 是裸文件名，组件侧拼 `/assets/img/product/` 前缀（product/post 两族同 namespace） | `src/components/products/ProductPage/index.astro:14,27`；`src/components/posts/PostPage/index.astro:15` |
| F15 | 验收脚本惯例：cases 数组 + `test(name, fn)` + 夹具页 `content/posts/zz-*.json` + 清理 + 汇总退出码；假语言对 `t9` 等当隔离仓 | `scripts/accept-i18n2.mjs:1-30,514-548` |
| F16 | **node ≥22 才能 astro build**（edit-server 全链）；纯逻辑验收脚本 node 20 也能跑 | CLAUDE.md 2026-08-10 决策；本机 nvm `~/.nvm/versions/node/v22.23.2/bin/node` |

**与 spec 的四处实施修正**（行为等价或更优，Task 11 会抄进 spec 附录）：
1. seoHead 不发 `<title>`/`<meta description>`（F5：document.html 已发，重复发 = 双标签）。spec §3 表中这两行的「来源」不变，只是发出者仍是 `{{TITLE}}`/`{{DESCRIPTION}}`。
2. 预览 noindex 用现成 `INCLUDE_DRAFTS` 信号（F7），不新加 `SEO_PREVIEW` 环境变量。
3. `DEFAULT_OG_IMAGE` 默认空串 = 无兜底图时**不发** `og:image`（指向 404 的死图比缺标签更伤）；站里放了默认图再改常量。
4. `TITLE_TEMPLATE` 默认空 = 不套模板（实证 `page.title` 烧制时已含品牌「- DGCRANE」，再套 = 双品牌）；模板只作用于 seoHead 所辖的 og:title/JSON-LD headline。

---

## 文件结构（本计划动到的全部文件）

```
site/
  src/seo/                    ← 新家族目录（2026-08-25 拍定：新模块按族落文件夹）
    config.mjs                站点 SEO 配置常量（换站零改动的落点，纯常量零 import）
    kernel.mjs                seoHead / sitemapXml / robotsTxt / healthData（纯函数）
  scripts/
    seo-emit.mjs              build 后写 sitemap.xml + robots.txt（dist/dist-edit 双链）
    accept-seo.mjs            本计划验收（纯逻辑；e2e 段另跑）
  src/layouts/Chrome.astro    {{SEO}} 槽接 seoHead（:46）
  src/i18n/kernel.mjs         SITE_BASE 翻转（:15，D1）
  src/i18n/tm.mjs             loadTm 保留 pins 键（:14-19，F9）
  src/i18n/pipeline.mjs       adoptMirror 写 pin / runPipeline pin 复植 / pinQueue 导出
  src/i18n/engine.mjs         RULES 第 8 条 + sentences 带 budget
  scripts/edit-server.mjs     runBuild 挂 seo-emit；/__save 镜像收养；/__i18n/pin-decide；/__seo/health
  package.json                build 链 + accept:seo 脚本
CLAUDE.md                     决策日志追加（Task 11）
docs/superpowers/specs/2026-08-25-seo-design.md   附录：实施修正四条（Task 11）
```

**依赖方向**（禁环）：`seo/config.mjs` 零 import → `seo/kernel.mjs` import seo/config + i18n/kernel → `pipeline.mjs` import seo/config（只拿 LENGTH_BUDGET）→ edit-server import 全部。

---

### Task 1: 验收骨架 + D1 前缀翻转（spec 步 1）

**Files:**
- Create: `site/scripts/accept-seo.mjs`
- Modify: `site/src/i18n/kernel.mjs:15`
- Modify: `site/package.json`（scripts 加 accept:seo）

- [ ] **Step 1: 写失败测试——accept-seo 骨架 + URL 断言**

建 `site/scripts/accept-seo.mjs`：

```js
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

// ---------- 汇总 ----------
let pass = 0
for (const [name, fn] of cases) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`) }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`) }
  finally { try { cleanup() } catch {} }
}
console.log(`\naccept-seo: ${pass}/${cases.length}`)
process.exit(pass === cases.length ? 0 : 1)
```

`site/package.json` scripts 加一行：

```json
    "accept:seo": "node scripts/accept-seo.mjs",
```

- [ ] **Step 2: 跑测试确认红**

Run: `cd site && node scripts/accept-seo.mjs`
Expected: FAIL —— `URL:中文源住根` 报 not equal（现值 `https://www.dgcrane.com/zh/products/...` ≠ 期望根路径）。

- [ ] **Step 3: 翻转 SITE_BASE**

`site/src/i18n/kernel.mjs:15` 一行改：

```js
export const SITE_BASE = SITE_ROOT // D1（2026-08-25 拍定）：中文住根；旧 '/zh/' 前缀与 dist 拓扑本就不一致（dist zh 产物在 /posts/ 无前缀），翻转即修正切换器 zh 链接 404
```

（`:86` 的注释同步把「dist→/zh/ 部署拓扑」改成「dist 拓扑 = zh 住根」。）

- [ ] **Step 4: 跑测试确认绿 + 全量回归**

Run: `cd site && node scripts/accept-seo.mjs && npm run check`
Expected: accept-seo 1/1；check 全绿（SITE_BASE 全站唯一消费方是 pageUrl，grep 证据在计划 F 节）。

- [ ] **Step 5: Commit**

```bash
git add site/scripts/accept-seo.mjs site/src/i18n/kernel.mjs site/package.json
git commit -m "feat(seo): D1 前缀翻转——中文住根，修切换器 zh 链接与 dist 拓扑不一致"
```

---

### Task 2: `src/seo/config.mjs` 站点配置（spec 步 1 收拢）

**Files:**
- Create: `site/src/seo/config.mjs`
- Test: `site/scripts/accept-seo.mjs`（追加）

- [ ] **Step 1: 写失败测试**

accept-seo.mjs 在「D1」段后追加：

```js
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
```

- [ ] **Step 2: 跑测试确认红**

Run: `cd site && node scripts/accept-seo.mjs`
Expected: FAIL —— `Cannot find module '../src/seo/config.mjs'`。

- [ ] **Step 3: 建配置文件**

`site/src/seo/config.mjs`：

```js
// SEO 站点配置（spec §1）：换站零改动的落点——本文件纯常量、零 import（禁环：pipeline 也 import 它）。
// 与 i18n 配置（kernel.mjs 的 SITE_ROOT/DEPLOY_LANGS）同层，终态同迁 site.config。
export const BRAND = 'DGCRANE'
// 标题模板：空 = 不套（page.title 烧制时已含品牌「- DGCRANE」，再套=双品牌）。
// 换站标题不带品牌时可设 '{title} | {brand}'，只作用于 seoHead 所辖 og:title / JSON-LD headline。
export const TITLE_TEMPLATE = ''
// 站级默认分享图：空 = 页面无图时不发 og:image（死图比缺标签更伤）；站里放好图后填 '/assets/img/xxx.jpg'。
export const DEFAULT_OG_IMAGE = ''
export const X_DEFAULT_LANG = 'en' // D7：34 语言都不匹配的用户兜底送英文（外贸 B2B 受众）
export const OG_IMAGE_PREFIX = '/assets/img/product/' // F14：hero.image 裸文件名的前缀（product/post 同 namespace）
export const OG_LOCALE = { 'zh-CN': 'zh_CN', en: 'en_US' }
// 翻译长度预算（字符）：治存量 14 处英文超长（spec §8）——提示词级约束，非硬闸（2026-08-17 概率判定只提示 doctrine）。
export const LENGTH_BUDGET = {
  'page.title': 60,
  'page.description': 160,
  'page.seo.og.title': 60,
  'page.seo.og.description': 160,
}
```

- [ ] **Step 4: 跑测试确认绿**

Run: `cd site && node scripts/accept-seo.mjs`
Expected: 2/2 PASS。

- [ ] **Step 5: Commit**

```bash
git add site/src/seo/config.mjs site/scripts/accept-seo.mjs
git commit -m "feat(seo): 站点配置收拢 src/seo/config.mjs——品牌/兜底图/x-default/og:locale/长度预算"
```

---

### Task 3: `seoHead()` 每页信息卡（spec 步 2 核心）

**Files:**
- Create: `site/src/seo/kernel.mjs`
- Test: `site/scripts/accept-seo.mjs`（追加）

- [ ] **Step 1: 写失败测试**

accept-seo.mjs 追加（纯伪造对象，不碰真实 content——seoHead 吃 `pg`/`siblings` 参数，正是为可测设计）：

```js
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
```

- [ ] **Step 2: 跑测试确认红**

Run: `cd site && node scripts/accept-seo.mjs`
Expected: FAIL —— `Cannot find module '../src/seo/kernel.mjs'`。

- [ ] **Step 3: 实现 `site/src/seo/kernel.mjs`**

```js
// SEO 内核（spec 2026-08-25）：三样现成原料（页面 JSON/族谱/站点配置）→ 三样成品。
// 纯 Node、零 Astro 依赖（与 i18n/kernel 同款纪律）；长在构建流水线上，无独立生命周期。
import { pageUrl, SITE_ROOT } from '../i18n/kernel.mjs'
import { BRAND, TITLE_TEMPLATE, DEFAULT_OG_IMAGE, X_DEFAULT_LANG, OG_IMAGE_PREFIX, OG_LOCALE } from './config.mjs'

const escAttr = (s = '') => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const absolutize = (s, root = SITE_ROOT) => (/^https?:\/\//.test(s) ? s : root + s.replace(/^\//, ''))
const applyTemplate = t => (TITLE_TEMPLATE ? TITLE_TEMPLATE.replaceAll('{title}', t).replaceAll('{brand}', BRAND) : t)

// seo 块类型执法（F8：无 page 级 schema，改坏构建当场红）
function readSeo(pg) {
  const seo = pg.j?.page?.seo ?? {}
  if (typeof seo !== 'object' || Array.isArray(seo)) throw new Error(`page.seo 须为对象: ${pg.slug}`)
  if (seo.canonical != null && typeof seo.canonical !== 'string') throw new Error(`page.seo.canonical 须为字符串: ${pg.slug}`)
  if (seo.noindex !== undefined && typeof seo.noindex !== 'boolean') throw new Error(`page.seo.noindex 须为布尔: ${pg.slug}`)
  for (const k of ['title', 'description', 'image'])
    if (seo.og?.[k] != null && typeof seo.og?.[k] !== 'string') throw new Error(`page.seo.og.${k} 须为字符串: ${pg.slug}`)
  return seo
}

function ogImageUrl(pg) {
  const s = readSe(pg).og?.image
  if (s) return absolutize(s)
  if (pg.j.hero?.image) return absolutize(OG_IMAGE_PREFIX + pg.j.hero.image)
  if (DEFAULT_OG_IMAGE) return absolutize(DEFAULT_OG_IMAGE)
  return null
}

function jsonLd(pg, { title, desc, img }) {
  const j = pg.j, url = pageUrl(pg)
  const main = pg.type === 'post'
    ? { '@type': 'Article', headline: title, description: desc, ...(img ? { image: img } : {}), url }
    : { '@type': 'Product', name: title, description: desc, ...(img ? { image: img } : {}), url }
  const items = [
    ...(j.breadcrumb?.trail ?? []).map(t => ({ '@type': 'ListItem', name: t.label, item: t.url })),
    { '@type': 'ListItem', name: j.breadcrumb?.current ?? j.page.title, item: url },
  ].map((it, i) => ({ ...it, position: i + 1 }))
  return { '@context': 'https://schema.org', '@graph': [main, { '@type': 'BreadcrumbList', itemListElement: items }] }
}

// 每页 head 片段，贴 document.html 的 {{SEO}} 槽。不发 <title>/<meta description>（{{TITLE}}/{{DESCRIPTION}} 已发，F5）。
// siblings = siblingsOf(pg, groups, publishable) 的返回（生产=过门禁集合；预览=全集合）。
export function seoHead(pg, siblings, opts = {}) {
  const seo = readSe(pg)
  const self = pageUrl(pg)
  const L = []
  if (pg.status !== 'published' || seo.noindex === true || opts.preview)
    L.push('<meta name="robots" content="noindex">')
  L.push(`<link rel="canonical" href="${escAttr(seo.canonical || self)}">`)
  for (const m of siblings)
    L.push(`<link rel="alternate" hreflang="${escAttr(m.lang)}" href="${escAttr(pageUrl(m))}">`)
  const xd = siblings.find(m => m.lang === X_DEFAULT_LANG)
  if (xd && siblings.length > 1) // 集合=1 且恰为兜底语言时省略（防重复行）
    L.push(`<link rel="alternate" hreflang="x-default" href="${escAttr(pageUrl(xd))}">`)
  const title = applyTemplate(seo.og?.title || pg.j.page.title)
  const desc = seo.og?.description || pg.j.page.description
  const img = ogImageUrl(pg)
  L.push(`<meta property="og:title" content="${escAttr(title)}">`)
  if (desc) L.push(`<meta property="og:description" content="${escAttr(desc)}">`)
  if (img) L.push(`<meta property="og:image" content="${escAttr(img)}">`)
  L.push(`<meta property="og:url" content="${escAttr(self)}">`)
  L.push(`<meta property="og:type" content="${pg.type === 'post' ? 'article' : 'product'}">`)
  if (OG_LOCALE[pg.lang]) L.push(`<meta property="og:locale" content="${OG_LOCALE[pg.lang]}">`)
  L.push(`<script type="application/ld+json">${JSON.stringify(jsonLd(pg, { title, desc, img }))}</script>`)
  return L.join('\n')
}
```

- [ ] **Step 4: 跑测试确认绿**

Run: `cd site && node scripts/accept-seo.mjs`
Expected: 全部 PASS（新增 7 条）。

- [ ] **Step 5: Commit**

```bash
git add site/src/seo/kernel.mjs site/scripts/accept-seo.mjs
git commit -m "feat(seo): seoHead 每页信息卡——canonical/hreflang/x-default/og 兜底链/JSON-LD/noindex"
```

---

### Task 4: `sitemapXml` + `robotsTxt` + `healthData`（spec 步 2）

**Files:**
- Modify: `site/src/seo/kernel.mjs`（追加三个导出）
- Test: `site/scripts/accept-seo.mjs`（追加）

- [ ] **Step 1: 写失败测试**

accept-seo.mjs 追加：

```js
// ---------- sitemap / robots / 体检 ----------
test('sitemap:条数=生产页、draft 排除、互认全列', async () => {
  const { sitemapXml } = await import('../src/seo/kernel.mjs')
  const g = new Map([['x', [pg(), { ...mirPg, j: undefined }]]]) // 一组两语言
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
```

- [ ] **Step 2: 跑测试确认红**

Run: `cd site && node scripts/accept-seo.mjs`
Expected: FAIL —— `seo/kernel.mjs` 无 `sitemapXml` 导出（SyntaxError: The requested module does not provide an export）。

- [ ] **Step 3: 实现（kernel.mjs 追加）**

```js
// sitemap：pubSet 逐成员 <url>，全员 xhtml:link 互认（WPML+Yoast 同款单文件合并式，D8-2）。
// 无 lastmod（无可靠时间源，瞎填有害——spec §8 已知限制）。
export function sitemapXml(groups, _pages, pubSet) {
  const rows = []
  for (const [, g] of groups) {
    const live = g.filter(m => pubSet.has(m.slug))
    for (const m of live)
      rows.push(['  <url>', `    <loc>${pageUrl(m)}</loc>`,
        ...live.map(s => `    <xhtml:link rel="alternate" hreflang="${escAttr(s.lang)}" href="${escAttr(pageUrl(s))}"/>`),
        '  </url>'].join('\n'))
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n  xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + rows.join('\n') + '\n</urlset>\n'
}

// robots：允许全站 + sitemap 指路。部署注意（spec §3）：与老站共存同域时 robots.txt 归域名根所有者，此文件不上传——代码照产。
export function robotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ROOT}sitemap.xml\n`
}

// 体检数据（总览台直接吃）：一行=一页，异常机器算（族谱+长度+状态），零人工登记。
export function healthData(pages) {
  return pages.map(p => {
    const title = p.j?.page?.title ?? '', desc = p.j?.page?.description ?? ''
    const issues = []
    if (!title) issues.push('title-missing')
    else if (title.length > 60) issues.push('title-overlength')
    if (!desc) issues.push('description-missing')
    else if (desc.length > 160) issues.push('description-overlength')
    if (p.status !== 'published') issues.push('noindex')
    if (p.j?.page?.seo?.noindex) issues.push('noindex-manual')
    return { pageId: p.pageId, lang: p.lang, slug: p.slug, type: p.type, title, titleLength: title.length, description: desc, descriptionLength: desc.length, issues }
  })
}
```

- [ ] **Step 4: 跑测试确认绿**

Run: `cd site && node scripts/accept-seo.mjs`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add site/src/seo/kernel.mjs site/scripts/accept-seo.mjs
git commit -m "feat(seo): sitemapXml/robotsTxt/healthData——地图互认/指路/体检数据三纯函数"
```

---

### Task 5: 接线——Chrome.astro + seo-emit + 构建链（spec 步 2 收口）

**Files:**
- Create: `site/scripts/seo-emit.mjs`
- Modify: `site/src/layouts/Chrome.astro`（:8 import、:40-46 接线）
- Modify: `site/scripts/edit-server.mjs:148`（runBuild 链）
- Modify: `site/package.json`（build 链）

- [ ] **Step 1: Chrome.astro 接线**

`site/src/layouts/Chrome.astro` 三处改：

① import 行（:8 附近）加：

```js
import { seoHead } from '../seo/kernel.mjs'
```

② :40 `const switcher = langSwitcher(me, siblingsOf(me, groups, publishable))` 改为：

```js
const siblings = siblingsOf(me, groups, publishable)
const switcher = langSwitcher(me, siblings)
// SEO 头（spec 2026-08-25）：与切换器同源同位置的第二个消费者。
// 预览构建（dist-edit 恒带 INCLUDE_DRAFTS=1，build-outputs.mjs:66）统一 noindex——防收录草稿预览。
const seoBits = seoHead(me, siblings, { preview: process.env.INCLUDE_DRAFTS === '1' })
```

③ :46 `.replaceAll('{{SEO}}', '')` 改为：

```js
  .replaceAll('{{SEO}}', seoBits)
```

（注意：INCLUDE_DRAFTS 分支下 `me` 可能是 :17-32 拼的 draft 记录，`me.j` 存在、`page.seo` 走 `?? {}` 兜底，不炸。）

- [ ] **Step 2: seo-emit.mjs**

`site/scripts/seo-emit.mjs`（link-assets 同款形态：吃 BUILD_OUT、build 后跑）：

```js
#!/usr/bin/env node
// build 后写 sitemap.xml + robots.txt 进产物目录（dist 与 dist-edit 双链都跑；BUILD_OUT 定去向）。
// pubSet 口径 = 生产门禁（status published 且过 isPublishable）——与 Chrome.astro 生产分支同一套函数；
// 预览产物里的 sitemap 也按生产口径（看「将上线什么」，不为草稿虚增条目）。
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanPages, buildGroups, isPublishable } from '../src/i18n/kernel.mjs'
import { sitemapXml, robotsTxt } from '../src/seo/kernel.mjs'

const site = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = process.env.BUILD_OUT || 'dist'
const pages = scanPages({ withJson: true })
const groups = buildGroups(pages)
const pubSet = new Set(pages.filter(p => p.status === 'published' && isPublishable(p, groups, pages)).map(p => p.slug))
mkdirSync(join(site, out), { recursive: true })
writeFileSync(join(site, out, 'sitemap.xml'), sitemapXml(groups, pages, pubSet))
writeFileSync(join(site, out, 'robots.txt'), robotsTxt())
console.log(`seo-emit: sitemap ${pubSet.size} 条 + robots.txt → ${out}/`)
```

- [ ] **Step 3: 构建链挂接（两处）**

① `site/package.json` `"build"`：

```json
    "build": "astro build && node scripts/link-assets.mjs && node scripts/seo-emit.mjs",
```

② `site/scripts/edit-server.mjs:147-149` runBuild 的 promise 链加一节：

```js
  return run([join(SITE, 'node_modules/astro/bin/astro.mjs'), 'build'])
    .then(() => run([join(SITE, 'scripts/link-assets.mjs')]))
    .then(() => run([join(SITE, 'scripts/seo-emit.mjs')]))
```

（BUILD_OUT 已由 :153 注入 env，seo-emit 自动跟着 dist / dist-edit 走。）

- [ ] **Step 4: 验证（node22 build，F16）**

Run:
```bash
cd site && ~/.nvm/versions/node/v22.23.2/bin/node_modules/.bin/../.. 2>/dev/null; export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" && npm run build
ls dist/sitemap.xml dist/robots.txt
head -8 dist/products/single-girder-eot-cranes/index.html | grep -E 'canonical|hreflang' || grep -o '<link rel="canonical"[^>]*>' dist/products/single-girder-eot-cranes/index.html
grep -c 'hreflang' dist/products/single-girder-eot-cranes/index.html
```
Expected: build 绿；`seo-emit: sitemap N 条` 日志；dist/sitemap.xml + dist/robots.txt 存在；zh 页 canonical=`https://www.dgcrane.com/products/single-girder-eot-cranes/`、hreflang 至少 2 行（zh-CN+en+x-default=3）；en 页同。

再跑 `node scripts/accept-seo.mjs`（node20 即可，纯逻辑）——仍全绿。

- [ ] **Step 5: Commit**

```bash
git add site/src/layouts/Chrome.astro site/scripts/seo-emit.mjs site/scripts/edit-server.mjs site/package.json
git commit -m "feat(seo): 全站接线——{{SEO}} 贴卡 + sitemap/robots 落产物（dist/dist-edit 双链，预览 noindex）"
```

---

### Task 6: 换站冒烟 + 存量数据体检（spec §6 check 7 + §8 治理基线）

**Files:**
- Modify: 无代码改动（验证性任务；发现存量问题记进 spec §8）

- [ ] **Step 1: 换站冒烟——改一个常量全站变、代码零 diff**

```bash
cd site
sed -i '' "s|export const SITE_ROOT = 'https://www.dgcrane.com/'|export const SITE_ROOT = 'https://smoke-test.example.com/'|" src/i18n/kernel.mjs
node scripts/accept-seo.mjs && echo '冒烟：URL 断言在新域名下重算通过'   # 预期红（断言写死 dgcrane）→ 证明全链吃同一常量
git checkout -- src/i18n/kernel.mjs
node scripts/accept-seo.mjs   # 还原后全绿
```

Expected: 中间那次 accept-seo 的 URL 断言失败（错误信息里出现 `smoke-test.example.com`）= 证好「改常量→全部 URL 变」；还原后全绿。

- [ ] **Step 2: 存量体检基线（14 处超长的机器复核）**

```bash
cd site && node --input-type=module -e "
const { scanPages } = await import('./src/i18n/kernel.mjs')
const { healthData } = await import('./src/seo/kernel.mjs')
const rows = healthData(scanPages({ withJson: true }))
const bad = rows.filter(r => r.issues.length)
console.log('全站', rows.length, '页；异常', bad.length, '页')
for (const r of bad) console.log(' ', r.lang, r.pageId, r.issues.join(','), `title=${r.titleLength} desc=${r.descriptionLength}`)
"
```

Expected: 输出与 spec §三「6 处标题 + 8 处简介超长」吻合（数字对上 = healthData 口径与设计演示一致）。把实跑输出贴进 spec §8 的治理条目（Task 11 一并做）。

- [ ] **Step 3: Commit（如有 spec 数据补充，无则跳过）**

```bash
git add docs/superpowers/specs/2026-08-25-seo-design.md
git commit -m "docs(seo): 存量体检基线实跑数字回填 spec"
```

---

### Task 7: 镜像收养接线 + pin 记账（spec 步 3 地基，堵 F10/F11 两个洞）

**Files:**
- Modify: `site/src/i18n/tm.mjs:14-19`（loadTm 保留 pins）
- Modify: `site/src/i18n/pipeline.mjs:113-133`（adoptMirror 写 pin）
- Modify: `site/scripts/edit-server.mjs`（/__save 镜像发布分支收养）
- Test: `site/scripts/accept-seo.mjs`（追加）

- [ ] **Step 1: 写失败测试**

accept-seo.mjs 追加（需要 pipeline 全链，用夹具 + t8 假语言 + mockAI——accept-i18n2 同款）：

```js
// ---------- pin：人稿不被机翻冲掉（D5 锁定层） ----------
const mockAI = async messages => {
  const ss = JSON.parse(messages[1].content.match(/sentences：\n(.+?)\n\n返回/s)[1])
  const translations = {}
  let i = 0
  for (const s of ss) translations[s.id] = `EN translation ${++i}.`
  return { translations }
}

test('pin:镜像人改 title → TM 收养 + pin 记账 → 源 title 再改 → 机翻不冲人稿', async () => {
  const { runPipeline, adoptMirror } = await import('../src/i18n/pipeline.mjs')
  const { loadTm, saveTm } = await import('../src/i18n/tm.mjs')
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
  assert.equal(tm.pins['page.title'].srcFp, (await import('../src/i18n/collect.mjs')).collectUnits(srcJ).find(u => u.field === 'page.title').fp)
  // ② 源 title 改（fp 变）
  srcJ.page.title = 'SEO 夹具页（新标题）'
  writeFileSync(FIX_FILE(), JSON.stringify(srcJ, null, 2))
  saveTm('zh-CN', 't8', tm)
  await runPipeline(FIX, { lang: 't8', callAI: mockAI })
  // ③ 重投影后镜像 title 仍是人稿（pin 顶住），不是机翻 "EN translation N."
  const mir2 = JSON.parse(readFileSync(MIR_FILE(), 'utf8'))
  assert.equal(mir2.page.title, 'Human Polished Title')
  // ④ 待确认旗：pin.srcFp ≠ 源当前 fp
  const { pinQueue } = await import('../src/i18n/pipeline.mjs')
  const q = pinQueue('t8')
  assert.ok(q.some(x => x.pageId === FIX && x.field === 'page.title'))
})
```

- [ ] **Step 2: 跑测试确认红**

Run: `cd site && node scripts/accept-seo.mjs`
Expected: FAIL —— `tm.pins` 为 undefined（loadTm 丢键，F9）或 adoptMirror 不写 pin。

- [ ] **Step 3: 实现（三处）**

① `site/src/i18n/tm.mjs:14-19` loadTm 保留 pins：

```js
export function loadTm(src, tgt) {
  const f = tmPath(src, tgt)
  if (!existsSync(f)) return { pair: `${src}>${tgt}`, sentences: {}, pins: {} }
  const j = JSON.parse(readFileSync(f, 'utf8'))
  return { pair: j.pair ?? `${src}>${tgt}`, sentences: j.sentences ?? {}, pins: j.pins ?? {} }
}
```

② `site/src/i18n/pipeline.mjs` adoptMirror 两处收养分支补 pin 记账（:124 与 :128 的 upsert 之后各加一行；两处共用一个局部 helper）：

```js
  const pinField = (u, cur) => { tm.pins = { ...tm.pins, [u.field]: { srcFp: u.fp, text: cur } } } // 人精修过的字段记账（D5 pin）：srcFp=收养时的源指纹
```

分支内：

```js
      upsert(tm, u.fp, { translation: cur, status: 'approved', origin: 'human' })
      delete tm.sentences[u.fp].error // 人审转正清旧 error 键（评审 D1：引擎路 2c5be01 清了，人审两条路漏同款）
      if (u.kind === 'field') pinField(u, cur)
      n++
    } else if (!sameish(cur, u.text)) {
      upsert(tm, u.fp, { text: u.text, translation: cur, status: 'approved', origin: 'human' }); n++
      if (u.kind === 'field') pinField(u, cur)
    }
```

③ `site/src/i18n/pipeline.mjs` runPipeline 在 `const units = collectUnits(srcJ)`（:57）之后、`const missing = ...`（:58）之前插 pin 复植：

```js
  // pin 复植（D5 锁定层）：人精修字段在源变更后顶住机翻——人稿按当前 fp 注入 TM（origin human，不送翻），
  // 镜像照发人稿；srcFp ≠ 当前 fp = 待确认（pinQueue / 体检台）。
  let pinned = 0
  for (const u of units) {
    const pin = u.kind === 'field' ? tm.pins?.[u.field] : null
    if (pin && !tm.sentences[u.fp]) {
      upsert(tm, u.fp, { text: u.text, translation: pin.text, status: 'approved', origin: 'human' })
      pinned++
    }
  }
  if (pinned) saveTm(srcJ.page.lang, lang, tm)
```

（放 missing 之前 → 复植后的字段有 TM 条目 → 不进 missing → 不送机翻。）

同文件追加导出（文件尾部）：

```js
// pin 待确认队列（体检台/批量端点数据源）：pin 的 srcFp ≠ 源当前 fp = 源已变、人稿顶住中、等人决定。
export function pinQueue(lang) {
  const out = []
  for (const pg of scanPages().filter(p => !p.langDir)) {
    const srcJ = readJ(pg.file)
    if (srcJ.page.lang === lang) continue
    const tm = loadTm(srcJ.page.lang, lang)
    for (const u of collectUnits(srcJ)) {
      if (u.kind !== 'field') continue
      const pin = tm.pins?.[u.field]
      if (pin && pin.srcFp !== u.fp) out.push({ pageId: pg.pageId, lang, field: u.field, sourceText: u.text, pinnedText: pin.text })
    }
  }
  return out
}
```

（`scanPages` 已在 :5 import；`readJ` 已有。）④ `site/scripts/edit-server.mjs` /__save 分支：在现有 `if (segments.length !== 3 && payload.intent === 'publish')` 块（:208-229）之后加镜像分支：

```js
      if (segments.length === 3 && payload.intent === 'publish') {
        // 镜像发布 = 人审写回（2026-08-18「改完存 TM 永不再犯」落点，F10 补线）：
        // 收养人改进 TM + pin 记账。失败不炸保存响应（内容已落盘），留事件供体检台看到。
        const [mirLang] = segments
        try {
          const pageId = segments.at(-1)
          const srcPg = scanPages().find(p => p.pageId === pageId && !p.langDir)
          if (!srcPg) throw new Error(`镜像 ${payload.slug} 找不到源页 ${pageId}`)
          const srcJ = JSON.parse(readFileSync(join(SITE, 'content', srcPg.file), 'utf8'))
          const mirJ = JSON.parse(readFileSync(join(SITE, 'content', `${payload.slug}.json`), 'utf8'))
          const tm = loadTm(srcJ.page.lang, mirLang)
          const r = adoptMirror(mirJ, srcJ, tm, mirLang)
          logEvent(payload.slug, 'mirror-adopt', { lang: mirLang, ...r })
        } catch (e) {
          console.error(`  [i18n] 镜像收养失败 ${payload.slug}: ${e.message}`)
          logEvent(payload.slug, 'mirror-adopt-error', { lang: mirLang, error: e.message })
        }
      }
```

（edit-server.mjs 头部 import 行补 `adoptMirror`：`:9` 的 pipeline import 里加；`loadTm` 若未 import 则一并加——`:9` 现为 `import { runPipeline, approvePage, translateAll, consoleData } from '../src/i18n/pipeline.mjs'`，另有 `loadConfig` 已 import。）

- [ ] **Step 4: 跑测试确认绿 + 回归**

Run: `cd site && node scripts/accept-seo.mjs && npm run check`
Expected: accept-seo 全绿（含 pin 新例）；accept-i18n2 不回归（loadTm 多个 pins 键是加法，deepEqual 断言若撞上需按新形状更新——只许更新断言形状，不许改行为）。

- [ ] **Step 5: Commit**

```bash
git add site/src/i18n/tm.mjs site/src/i18n/pipeline.mjs site/scripts/edit-server.mjs site/scripts/accept-seo.mjs
git commit -m "feat(i18n): 镜像收养接线+pin 记账——人精修字段顶住机翻（2026-08-18 免审直发补线）"
```

---

### Task 8: 批量决定端点 `/__i18n/pin-decide`（spec 步 3）

**Files:**
- Modify: `site/scripts/edit-server.mjs`（新 POST 路由）
- Test: `site/scripts/accept-seo.mjs`（追加——函数级测 decide 语义；端点级在 Task 10 e2e）

pin 的 keep/refollow 语义收进 pipeline 一个纯函数，端点只做 IO 包装——可测且端点薄：

- [ ] **Step 1: pipeline.mjs 加 `decidePins`（先写测试）**

accept-seo.mjs 追加：

```js
test('pin:decidePins——keep 清旗并保人稿、refollow 删 pin 放行重翻', async () => {
  const { runPipeline, decidePins } = await import('../src/i18n/pipeline.mjs')
  const { loadTm } = await import('../src/i18n/tm.mjs')
  const { collectUnits } = await import('../src/i18n/collect.mjs')
  fixture()
  await runPipeline(FIX, { lang: 't8', callAI: mockAI })
  const mir = JSON.parse(readFileSync(MIR_FILE(), 'utf8'))
  mir.page.title = 'Human Polished Title'
  const srcJ0 = JSON.parse(readFileSync(FIX_FILE(), 'utf8'))
  const { adoptMirror } = await import('../src/i18n/pipeline.mjs')
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
```

- [ ] **Step 2: 跑测试确认红**

Run: `cd site && node scripts/accept-seo.mjs`
Expected: FAIL —— pipeline 无 `decidePins` 导出。

- [ ] **Step 3: 实现 `decidePins`（pipeline.mjs 追加）**

```js
// pin 批量决定（体检台「全部重跟 / 全部保持 / 挑选」的数据层，WPML Translation Dashboard 同款交互）。
// keep = 认可人稿顶住新源：srcFp 抬到当前 + 复植条补齐（防投影露中文）。
// refollow = 跟源重翻：删 pin + 只删「复植条」（origin human 且译文=pinnedText 的那条；真机翻/真人审条不动）。
// 返回 { kept, refollowed, pages: [pageId] }——调用方对 refollow 页再跑 runPipeline。
export function decidePins(lang, decisions) {
  let kept = 0, refollowed = 0
  const touched = new Set()
  for (const d of decisions) {
    if (!d?.pageId || !d?.field || !['keep', 'refollow'].includes(d.action))
      throw new Error(`决定项非法: ${JSON.stringify(d)}`)
    const srcPg = scanPages().find(p => p.pageId === d.pageId && !p.langDir)
    if (!srcPg) throw new Error(`页面不存在: ${d.pageId}`)
    const srcJ = readJ(srcPg.file)
    const u = collectUnits(srcJ).find(x => x.field === d.field)
    const tm = loadTm(srcJ.page.lang, lang)
    const pin = tm.pins?.[d.field]
    if (!pin || !u) continue
    if (d.action === 'keep') {
      pin.srcFp = u.fp
      if (!tm.sentences[u.fp]) upsert(tm, u.fp, { text: u.text, translation: pin.text, status: 'approved', origin: 'human' })
      kept++
    } else {
      const e = tm.sentences[u.fp]
      if (e?.origin === 'human' && e?.translation === pin.text) delete tm.sentences[u.fp] // 只删复植条
      delete tm.pins[d.field]
      refollowed++
    }
    saveTm(srcJ.page.lang, lang, tm)
    touched.add(d.pageId)
  }
  return { kept, refollowed, pages: [...touched] }
}
```

- [ ] **Step 4: edit-server 端点（/__i18n/approve 附近加路由）**

`site/scripts/edit-server.mjs` 在 `/__i18n/approve` 路由（:325）之后加：

```js
    if (req.method === 'POST' && req.url === '/__i18n/pin-decide') {
      let body = ''
      for await (const chunk of req) body += chunk
      const { lang = 'en', decisions = [] } = JSON.parse(body)
      if (!/^[\w-]+$/.test(lang)) throw new Error('lang 非法')
      if (!Array.isArray(decisions) || !decisions.length) throw new Error('decisions 须为非空数组')
      const r = decidePins(lang, decisions)
      // refollow 页重翻（有 key 才真翻；无 key 只清账，下轮送翻补）
      const callAI = process.env.DEEPSEEK_API_KEY ? createDeepseekCaller() : null
      let retranslated = 0
      for (const pageId of r.pages) {
        const didRefollow = decisions.some(d => d.pageId === pageId && d.action === 'refollow')
        if (!didRefollow || !callAI) continue
        const out = await runPipeline(pageId, { lang, translate: true, callAI })
        retranslated += out.translated
      }
      await queueRebuild()
      logEvent(`pin-decide:${lang}`, 'pin-decide', { ...r, retranslated })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, ...r, retranslated })); return
    }
```

（import 行补 `decidePins`。）

- [ ] **Step 5: 跑测试确认绿 + Commit**

Run: `cd site && node scripts/accept-seo.mjs && npm run check`

```bash
git add site/src/i18n/pipeline.mjs site/scripts/edit-server.mjs site/scripts/accept-seo.mjs
git commit -m "feat(i18n): pin 批量决定——decidePins keep/refollow + /__i18n/pin-decide 端点"
```

---

### Task 9: 翻译长度约束（spec 步 3，治存量 14 处超长）

**Files:**
- Modify: `site/src/i18n/engine.mjs`（RULES 第 8 条 + sentences 带 budget）
- Modify: `site/src/i18n/pipeline.mjs`（runPipeline 标注 budget）
- Test: `site/scripts/accept-seo.mjs`（追加）

- [ ] **Step 1: 写失败测试**

accept-seo.mjs 追加：

```js
test('长度预算:SEO 字段送翻带 budget，提示词可见', async () => {
  fixture()
  const seen = []
  const spyAI = async messages => {
    seen.push(messages[1].content)
    const ss = JSON.parse(messages[1].content.match(/sentences：\n(.+?)\n\n返回/s)[1])
    const translations = {}
    let i = 0
    for (const s of ss) translations[s.id] = `EN translation ${++i}.`
    return { translations }
  }
  const { runPipeline } = await import('../src/i18n/pipeline.mjs')
  await runPipeline(FIX, { lang: 't8', callAI: spyAI })
  const blob = seen.join('\n')
  assert.ok(/"budget":\s*60/.test(blob), 'page.title 句应带 budget:60')
  assert.ok(/"budget":\s*160/.test(blob), 'page.description 句应带 budget:160')
  assert.ok(blob.includes('不得超过该字符数'), 'RULES 应含长度约束条')
})
```

- [ ] **Step 2: 跑测试确认红**

Run: `cd site && node scripts/accept-seo.mjs`
Expected: FAIL —— budget 未出现在提示词。

- [ ] **Step 3: 实现（两处）**

① `site/src/i18n/engine.mjs`：RULES（:7-14）加第 8 条：

```
8. 带 budget 的字段句：译文长度不得超过该字符数——措辞从简、保关键词、可舍修饰语，但不许截断句子。`;
```

`translateMessages`（:17）sentences 映射带 budget：

```js
  const sentences = batch.map(s => ({ id: s.id, text: s.text, before: s.before ?? null, after: s.after ?? null, ...(s.budget ? { budget: s.budget } : {}) }))
```

② `site/src/i18n/pipeline.mjs` runPipeline：`const missing = ...`（:58）之后加一行标注：

```js
  missing.forEach(u => { const b = LENGTH_BUDGET[u.field]; if (b) u.budget = b }) // SEO 字段长度预算（提示词级，非硬闸）
```

文件头 import 加：

```js
import { LENGTH_BUDGET } from '../seo/config.mjs'
```

- [ ] **Step 4: 跑测试确认绿 + 回归 + Commit**

Run: `cd site && node scripts/accept-seo.mjs && npm run check`（accept-i18n2 的 mockAI 解析 `sentences：\n(.+?)\n\n返回` 正则——budget 字段追加在句对象尾部，正则不受影响；若撞上按新形状更新夹具断言）。

```bash
git add site/src/i18n/engine.mjs site/src/i18n/pipeline.mjs site/scripts/accept-seo.mjs
git commit -m "feat(i18n): SEO 字段翻译长度预算——budget 进提示词，治英文标题/简介超长"
```

---

### Task 10: `/__seo/health` 体检端点 + e2e 手续（spec 步 3 收口 + §6 check 6）

**Files:**
- Modify: `site/scripts/edit-server.mjs`（GET 路由）
- Test: e2e 为操作手续（需 8092 服务 + node22），不进自动脚本

- [ ] **Step 1: 端点（/__i18n 数据路由附近加）**

`site/scripts/edit-server.mjs` 在 `if (req.url === '/__i18n/data')`（:469）附近加：

```js
    if (req.url === '/__seo/health') {
      // 体检数据（spec §4 管理层接口预留：本期只出数据，UI 在步 4 另立计划）。
      // rows = 每页长度/缺失/noindex 旗；pins = 各 review 语言 pin 待确认队列。
      const pages = scanPages({ withJson: true })
      const rows = healthData(pages)
      const pins = Object.keys(loadConfig().review).flatMap(lang => pinQueue(lang))
      const summary = { pages: rows.length, flagged: rows.filter(r => r.issues.length).length, pinsPending: pins.length }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, summary, rows, pins })); return
    }
```

（import 行补 `healthData`（seo/kernel）与 `pinQueue`（pipeline）。）

- [ ] **Step 2: e2e 手续（spec §6 check 6/3——真实编辑链，需 node22 服务）**

```bash
# 起服务（node22，F16）
cd site && export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" && npm run edit &
# ① 体检端点
curl -s localhost:8092/__seo/health | python3 -m json.tool | head -20
#   预期：summary.flagged ≈ 14（超长存量）、pinsPending = 0（尚无人精修）
# ② 镜像就地改 → pin → 源再改 → 人稿顶住（走真实编辑链）
#    浏览器开 localhost:8092/en/products/single-girder-eot-cranes/，就地改页面标题为精修文案，点发布
curl -s localhost:8092/__seo/health | python3 -c "import json,sys; d=json.load(sys.stdin); print('pins:', d['summary']['pinsPending'])"
#   预期：pinsPending = 1，pins[0].field = 'page.title'
# ③ zh 源标题改一个字再发布（编辑器 zh 页）→ en 页 head 的 og:title 仍是人稿
curl -s localhost:8092/en/products/single-girder-eot-cranes/ | grep -o '<meta property="og:title" content="[^"]*"'
#   预期：精修文案（未被机翻冲掉）
# ④ 批量 refollow 后机翻接管
curl -s -X POST localhost:8092/__i18n/pin-decide -d '{"lang":"en","decisions":[{"pageId":"single-girder-eot-cranes","field":"page.title","action":"refollow"}]}'
curl -s localhost:8092/en/products/single-girder-eot-cranes/ | grep -o '<meta property="og:title" content="[^"]*"'
#   预期：机翻新标题（≤60 字符，长度预算生效）
# ⑤ sitemap 实物
curl -s localhost:8092/sitemap.xml | head -12
#   预期：每 <url> 带 xhtml:link 互认；条数 = 生产页数
```

注：步骤 ②③ 的「就地改+发布」用真实浏览器（chromium 打开编辑页）——与 accept-poc5 同一交互；若 subagent 执行无浏览器，等价 curl 直发 `/__save`（changes 协议，参考 accept-poc5.mjs:168 的 payload 形状）。

- [ ] **Step 3: Commit**

```bash
git add site/scripts/edit-server.mjs
git commit -m "feat(seo): /__seo/health 体检端点——长度/缺失/noindex + pin 待确认，管理层接口就位"
```

---

### Task 11: 全量回归 + CLAUDE.md 决策日志 + spec 附录

**Files:**
- Modify: `CLAUDE.md`（决策日志追加）
- Modify: `docs/superpowers/specs/2026-08-25-seo-design.md`（附录：实施修正四条 + 体检基线数字）

- [ ] **Step 1: 全量验证矩阵**

```bash
cd site
node scripts/accept-seo.mjs          # 本计划验收全绿
npm run check                        # registry + accept-i18n2
npm run accept:burn                  # 155/155（edit-server 动过，必须回归）
npm run accept:writeback             # 34/34
npm run accept:poc5                  # 56/56（8092 端到端，需 node22 起服务）
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" && npm run build   # 15 页 + sitemap/robots
```

Expected: 全绿。任何一项红：修完再进下一步，不许带病收工（协作规则第 8 条）。

- [ ] **Step 2: CLAUDE.md 决策日志追加**

```markdown
- **2026-08-26** **SEO 模块落地（spec 2026-08-25，方案 A 构建流水线内现算）**。`src/seo/`（config+kernel 纯函数）产出每页 head 片段（canonical/hreflang/x-default/og 兜底链/JSON-LD/noindex）+ sitemap/robots（`scripts/seo-emit.mjs` 双产物链）+ 体检数据（`/__seo/health`）。`<title>`/`<meta description>` 仍走 document.html `{{TITLE}}`/`{{DESCRIPTION}}`（seoHead 不重复发）。**顺手修两处旧账**：①D1 前缀翻转（SITE_BASE=SITE_ROOT，中文住根——旧 `/zh/` 值与 dist 拓扑本就不一致，切换器 zh 链接 404）；②adoptMirror 补线（此前无生产调用方，镜像人改不进 TM、重投影整文件覆盖冲掉人改——2026-08-18「改完存 TM」承诺实际未接线）。**pin 机制（D5）**：TM 新增 `pins` 字段账本（loadTm 同步保留该键），镜像发布即收养+记账；runPipeline 复植（人稿按当前 fp 注入，不送机翻）；`decidePins`+`/__i18n/pin-decide` 批量 keep/refollow。**长度预算**：SEO 四字段 budget 进翻译提示词（提示级非硬闸，2026-08-17 doctrine）。管理界面（面板/体检台 UI）另立计划，本期只保数据接口。
```

- [ ] **Step 3: spec 附录追加**

spec 文末加：

```markdown
---

## 附录：实施修正（2026-08-26，计划期核出的地基事实所致，行为等价或更优）

1. seoHead 不发 `<title>`/`<meta description>`——document.html `{{TITLE}}`/`{{DESCRIPTION}}` 已发（重复发=双标签）。
2. 预览 noindex 用现成 `INCLUDE_DRAFTS` 信号（dist-edit 恒 1），不新加 `SEO_PREVIEW` 环境变量。
3. `DEFAULT_OG_IMAGE` 默认空=无兜底图不发 `og:image`（死图比缺标签伤）。
4. `TITLE_TEMPLATE` 默认空=不套（page.title 烧制已含品牌「- DGCRANE」，再套=双品牌）；只作用于 og:title/JSON-LD。
5. §7 步 1「验证字段级 origin」核出两个真缺口并一并修：adoptMirror 无生产调用方（镜像人改不进 TM，F10）；SITE_BASE '/zh/' 与 dist 拓扑不一致（F3）。
6. 「seo 字段进名册」零代码——collectUnits 按 key/值形态自动收 `seo.og.title/description`、自动排除 `image/canonical/noindex`（F12）。
7. 体检基线实跑：〔Task 6 Step 2 贴实跑输出〕。
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-08-25-seo-design.md
git commit -m "docs(seo): 决策日志+spec 实施附录——SEO 模块落地收口"
```

---

## Self-Review 记录（计划自检，执行者不必重跑）

1. **Spec 覆盖**：D1→Task 1；D2（多语言矩阵）→ 零代码（族谱/DEPLOY_LANGS 已数据驱动，sitemap/hreflang 遍历 siblings 天然扩展）；D3 管理界面→范围外（数据接口 Task 10）；D4→Task 5 接线；D5→Task 7/8；D6→Task 3（og 兜底链/noindex/canonical 覆盖）；D7→Task 2 X_DEFAULT_LANG + Task 3 x-default 行；D8-1 JSON-LD→Task 3；D8-2 sitemap→Task 4；D8-3 og 兜底链→Task 3；D8-4 防收录→Task 3/5；D8-5 配置收拢→Task 2。§6 验收 7 条→Task 3（1/2/4/5）、Task 4（3）、Task 10（6）、Task 6（7）。§2 翻译名册→F12 零代码；pin→Task 7/8；§3 表逐行→Task 3/4。无漏项。
2. **占位符扫描**：所有代码块完整可抄；无 TBD/TODO。
3. **类型一致性**：`seoHead(pg, siblings, opts)` 三任务一致；`decidePins(lang, decisions)` 端点与函数一致；`tm.pins[field] = {srcFp, text}` 在 Task 7/8 一致；`pinQueue(lang)` Task 7/10 一致；`LENGTH_BUDGET` 键名与 F12 字段路径一致。
4. **已知风险**（执行者留意）：Task 7 改 loadTm 返回形状（+pins 键），accept-i18n2 若有 `deepEqual(tm, {pair, sentences})` 全形状断言会红——按新形状更新断言是唯一允许的改法；Task 9 在 sentences 对象追加 budget 字段，accept-i18n2 的 mockAI 正则 `sentences：\n(.+?)\n\n返回` 不受追加尾键影响，但若其断言译文 JSON 精确形状则同理更新。
