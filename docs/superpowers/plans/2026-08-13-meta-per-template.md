# Meta-per-Template（字段清单从中心数组挪到模板旁边）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把烧制台的字段清单从中心数组 `SECTION_CATALOG`（`burn-lib.mjs`）挪到模板旁边的 `ProductPage.meta.json`，让"模板需要哪些字段"就近、单一、可扩展（加新页族不用改中心）。

**Architecture:** 新增 `loadMeta(metaPath)` 读 meta 文件返回字段数组；`loadCatalog` 数据源从 `SECTION_CATALOG` 换成 `loadMeta(metaPath)`，**核验逻辑（meta 字段 ⊆ .astro data-field / 参照 JSON）一字不动**——防漂移命门保留；`previewHtml`/`writeDraft` 两处全局引用改传参/内部读 meta；最后删 `SECTION_CATALOG`，全链路验收。AI 提示词组包（`oneShotMessages`）、AI 返回格式、渲染、编辑、schema **全部不碰**。

**Tech Stack:** Node.js（≥22），ESM，无外部依赖（纯 `node:fs`）。验收：`site/scripts/accept-burn.mjs`（72 条，无 key 全链路 mock）+ `site/scripts/geom-check.mjs`（6 页 1:1）。

---

## 前置说明

- **范围**：只做"meta 喂 AI"（用途①）。`example.json`（预览模拟数据）+ 模板画廊（用途②）不在本计划，留后续计划。
- **不变量（重构红线）**：`loadCatalog` 返回的字段集合与重构前**完全一致**（只是来源从内存数组换成文件）。accept-burn 现有断言全程不得转红。
- **工作目录**：所有命令在 `site/` 下跑（`cd site && …`）。

## File Structure

| 文件 | 责任 | 本计划动作 |
|---|---|---|
| `site/src/components/ProductPage.meta.json`（新建） | 产品页字段清单 `[{key,shape,level}]` | 新建（数据从 SECTION_CATALOG 搬） |
| `site/src/burn-lib.mjs` | 烧制纯逻辑 | 删 SECTION_CATALOG；加 `loadMeta`；`loadCatalog` 改读 meta；`previewHtml` 加 catalog 参 |
| `site/scripts/deepseek-burn.mjs` | 烧制编排（问 AI + 裁决） | 加 META 常量；`loadCatalog(META,…)`；`writeDraft` 内部读 meta；`previewHtml(json, catalog)` |
| `site/scripts/accept-burn.mjs` | 验收脚本 | `loadCatalog(meta,…)`、`previewHtml(j, catalog)`、加 `loadMeta` 断言 |
| `site/scripts/edit-server.mjs` | 编辑/烧制 HTTP 服务 | **不改**（writeDraft 签名不变） |

---

## Task 1: 新建 meta 文件 + `loadMeta` 函数（TDD）

**Files:**
- Create: `site/src/components/ProductPage.meta.json`
- Modify: `site/src/burn-lib.mjs`（加 `loadMeta`，约插在 `SECTION_CATALOG` 定义后）
- Test: `site/scripts/accept-burn.mjs`（T2「字段目录」块内）

- [ ] **Step 1: 新建 meta 文件**

写入 `site/src/components/ProductPage.meta.json`（逐字照搬现 `SECTION_CATALOG` 的 16 项，去掉注释）：

```json
[
  { "key": "overview",       "shape": "section", "level": "verbatim" },
  { "key": "introduction",   "shape": "section", "level": "verbatim" },
  { "key": "advantages",     "shape": "section", "level": "verbatim" },
  { "key": "protection",     "shape": "section", "level": "verbatim" },
  { "key": "main_features",  "shape": "section", "level": "verbatim" },
  { "key": "basic_params",   "shape": "section", "level": "verbatim" },
  { "key": "spec_compare",   "shape": "section", "level": "verbatim" },
  { "key": "spec_detail",    "shape": "section", "level": "verbatim" },
  { "key": "which_better",   "shape": "section", "level": "verbatim" },
  { "key": "summary_intro",  "shape": "section", "level": "verbatim" },
  { "key": "installation",   "shape": "section", "level": "verbatim" },
  { "key": "specs",            "shape": "list",  "level": "verbatim" },
  { "key": "summary.intro",    "shape": "text",  "level": "verbatim" },
  { "key": "hero.headline",    "shape": "text",  "level": "similar"  },
  { "key": "hero.highlights",  "shape": "list",  "level": "similar"  },
  { "key": "page.description", "shape": "seo",   "level": "summary"  }
]
```

- [ ] **Step 2: 写失败测试（accept-burn 的 T2 块内追加）**

在 `accept-burn.mjs` 的 `// ---------- T2 字段目录 ----------` 块（约行 31-39）末尾、闭合 `}` 前追加：

```js
  const meta = lib.loadMeta(join(SITE, 'src/components/ProductPage.meta.json'))
  ok('loadMeta 返回 16 项', meta.length === 16, `${meta.length} 项`)
  ok('loadMeta 含 overview(section/verbatim)', meta.some(c => c.key === 'overview' && c.shape === 'section' && c.level === 'verbatim'))
  ok('loadMeta 含 page.description(seo/summary)', meta.some(c => c.key === 'page.description' && c.shape === 'seo' && c.level === 'summary'))
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd site && node scripts/accept-burn.mjs`
Expected: FAIL —— `lib.loadMeta is not a function`（还没实现）

- [ ] **Step 4: 实现 `loadMeta`**

在 `burn-lib.mjs` 的 `SECTION_CATALOG` 定义之后（约行 91）插入：

```js
// 读模板旁边的 meta 文件，返回字段清单 [{key,shape,level}]（取代中心 SECTION_CATALOG）
export function loadMeta(metaPath) {
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
  if (!Array.isArray(meta) || !meta.every(c => c.key && c.shape && c.level))
    throw new Error(`meta 格式非法（须为 [{key,shape,level}]）：${metaPath}`)
  return meta
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd site && node scripts/accept-burn.mjs`
Expected: PASS —— 三条 loadMeta 断言全绿（其余断言维持原状）

- [ ] **Step 6: Commit**

```bash
git add site/src/components/ProductPage.meta.json site/src/burn-lib.mjs site/scripts/accept-burn.mjs
git commit -m "feat(burn): 新增 ProductPage.meta.json + loadMeta，字段清单外置到模板旁（TDD）"
```

---

## Task 2: `loadCatalog` 数据源换成 meta

**Files:**
- Modify: `site/src/burn-lib.mjs:98-110`（`loadCatalog`）
- Modify: `site/scripts/deepseek-burn.mjs:11-12,120`
- Modify: `site/scripts/accept-burn.mjs:33-35`

- [ ] **Step 1: 改 `loadCatalog` 签名 + 数据源**

把 `burn-lib.mjs` 的 `loadCatalog`（行 98-110）改成：

```js
// 双源核验：字段清单读 meta；组件字段看 .astro data-field（specs 特判 spec.text）；page.* 等 chrome 层看参照 JSON 实际键
export function loadCatalog(metaPath, astroPath, refJsonPath) {
  const catalog = loadMeta(metaPath)
  const fields = new Set([...readFileSync(astroPath, 'utf8').matchAll(/data-field="([^"]+)"/g)].map(m => m[1]))
  const ref = JSON.parse(readFileSync(refJsonPath, 'utf8'))
  return catalog.map(c => {
    let verified
    if (c.key === 'summary_intro') verified = fields.has('summary_intro.body')
    else if (c.shape === 'section') verified = fields.has(`${c.key}.title`) && fields.has(`${c.key}.body`)
    else if (c.key === 'specs') verified = fields.has('spec.text')
    else verified = fields.has(c.key) || getIn(ref, c.key) !== undefined
    if (!verified) throw new Error(`目录键 ${c.key} 双源核验失败（.astro 与参照 JSON 都没有）——先对齐组件或 meta`)
    return { ...c, verified }
  })
}
```

（核验逻辑一字不动，仅 `SECTION_CATALOG` → `loadMeta(metaPath)`，错误信息「目录」→「meta」）

- [ ] **Step 2: 改 deepseek-burn 的 META 常量 + 调用**

`deepseek-burn.mjs` 行 11-12 后追加一行 META，并把行 120 的调用改签名：

```js
const ASTRO = join(SITE, 'src/components/ProductPage.astro')
const REF_JSON = join(SITE, 'content/products/single-girder-eot-cranes.json')
const META = join(SITE, 'src/components/ProductPage.meta.json')
```

行 120：
```js
  const catalog = lib.loadCatalog(META, ASTRO, REF_JSON)
```

- [ ] **Step 3: 改 accept-burn 的 loadCatalog 调用**

`accept-burn.mjs` 行 33-35 改成：

```js
  const catalog = lib.loadCatalog(
    join(SITE, 'src/components/ProductPage.meta.json'),
    join(SITE, 'src/components/ProductPage.astro'),
    join(SITE, 'content/products/single-girder-eot-cranes.json'))
```

- [ ] **Step 4: 跑验收确认通过**

Run: `cd site && node scripts/accept-burn.mjs`
Expected: PASS —— T2 全绿（含 Task 1 加的 loadMeta 三条 + 原有「目录含 X 且已核验」七条）；总 72 条不转红

- [ ] **Step 5: Commit**

```bash
git add site/src/burn-lib.mjs site/scripts/deepseek-burn.mjs site/scripts/accept-burn.mjs
git commit -m "refactor(burn): loadCatalog 数据源从 SECTION_CATALOG 换成 meta 文件（核验逻辑不变）"
```

---

## Task 3: `previewHtml` 改传 catalog 参

**Files:**
- Modify: `site/src/burn-lib.mjs:277-281`（`previewHtml` 签名 + 行 280）
- Modify: `site/scripts/deepseek-burn.mjs:218`
- Modify: `site/scripts/accept-burn.mjs:93`

- [ ] **Step 1: 改 `previewHtml` 签名 + 行 280**

`burn-lib.mjs` 行 277 签名加 `catalog`，行 280 用传入的 catalog：

```js
export function previewHtml(j, catalog) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const escAttr = s => esc(s).replace(/"/g, '&quot;')
  const sections = catalog.filter(c => c.shape === 'section' && j[c.key])
    .map(c => `<section><h3>${esc(j[c.key].title)}</h3>${renderDoc(j[c.key].body)}</section>`).join('\n')
```

（仅 `SECTION_CATALOG` → `catalog`，其余 previewHtml 函数体不动）

- [ ] **Step 2: 改 deepseek-burn 调用传 catalog**

`deepseek-burn.mjs` 行 218：

```js
  return { json, report, previewHtml: lib.previewHtml(json, catalog) }
```

- [ ] **Step 3: 改 accept-burn 调用传 catalog**

`accept-burn.mjs` 行 93（`catalog` 变量在 T2 块行 33 已定义，作用域可达——若不在同块则在该测试块顶部补 `const catalog = lib.loadCatalog(META, ASTRO, REF_JSON)`）：

```js
  const html = lib.previewHtml(j, catalog)
```

- [ ] **Step 4: 跑验收确认通过**

Run: `cd site && node scripts/accept-burn.mjs`
Expected: PASS —— T4「近似预览」相关断言（行 93 附近）全绿；总 72 条不转红

- [ ] **Step 5: Commit**

```bash
git add site/src/burn-lib.mjs site/scripts/deepseek-burn.mjs site/scripts/accept-burn.mjs
git commit -m "refactor(burn): previewHtml 改收 catalog 参，去 SECTION_CATALOG 直接引用"
```

---

## Task 4: `writeDraft` 内部读 meta（签名不变）

**Files:**
- Modify: `site/scripts/deepseek-burn.mjs:267`（`writeDraft` 内的 SECTION_CATALOG 引用）

> 设计取舍：`writeDraft` 签名保持 `(json, slug)` 不变（edit-server / accept-burn 调用零改动），内部用 `loadMeta(META)` 取 section keys。

- [ ] **Step 1: 改 writeDraft 行 267**

`deepseek-burn.mjs` 行 267（`writeDraft` 内）：

```js
  for (const c of lib.loadMeta(META).filter(c => c.shape === 'section' && json[c.key]))
    lib.validateDoc(json[c.key].body, `${c.key}.body`)
```

（`lib.SECTION_CATALOG` → `lib.loadMeta(META)`；`META` 常量在 Task 2 Step 2 已加）

- [ ] **Step 2: 跑验收确认通过**

Run: `cd site && node scripts/accept-burn.mjs`
Expected: PASS —— T5.1「writeDraft 撞名序号 / 强制 draft / 非法 slug」三条（行 163/164/167）全绿；总 72 条不转红

- [ ] **Step 3: Commit**

```bash
git add site/scripts/deepseek-burn.mjs
git commit -m "refactor(burn): writeDraft 内部用 loadMeta(META) 取 section keys，去全局引用"
```

---

## Task 5: 删 `SECTION_CATALOG` + 全链路验收

**Files:**
- Modify: `site/src/burn-lib.mjs:68-91`（删 SECTION_CATALOG 定义）

- [ ] **Step 1: 确认全局已无 SECTION_CATALOG 引用**

Run: `cd site && grep -rn "SECTION_CATALOG" src/ scripts/ --include="*.mjs"`
Expected: 仅剩 `burn-lib.mjs:68` 的定义本身（行 101/280 已在前序任务改掉）。若有残留，先回去改干净再继续。

- [ ] **Step 2: 删前先存注释，再删 SECTION_CATALOG 定义**

(a) 先建 `site/src/components/ProductPage.meta.md`，把 `SECTION_CATALOG`（burn-lib.mjs:68-91）的字段语义注释逐条搬过去（JSON 不能带注释，删了就丢知识）：
  - `summary_intro`：组件只渲 body（无 title 槽，loadCatalog 特判 `c.key === 'summary_intro'`）——**特判依据，最关键**
  - `specs`：`[{text}]`，规格数字逐字
  - `hero.headline`：允许等于产品名（similar 级）
  - `page.description`：概括豁免 + 报告标出（summary 级）
  - 「v1 不烧」排除清单：gallery 以外的图组、related_products、case、production_flow、components_images、crane_types_images、breadcrumb.trail、inquiry_form

(b) 删 accept-burn 里 Task 1 加的过渡期交叉校验断言（`meta.json ≡ SECTION_CATALOG`，标注了「Task 5 删」）——SECTION_CATALOG 没了，这条断言会报错。

(c) 删 `burn-lib.mjs` 行 68-91（`export const SECTION_CATALOG = […]` 整段）。

- [ ] **Step 3: 跑全量验收（无 key mock 全链路）**

Run: `cd site && node scripts/accept-burn.mjs`
Expected: PASS —— 72 条全绿。任一转红 = 删除过早或有遗漏引用，回去修。

- [ ] **Step 4: 跑几何验收（6 页 1:1）**

需先起两个静态服务（旧 `dist` 基准 8090、新 `site/dist` 8091），各跑一个产品页比对：

Run:
```bash
# 终端 A（旧基准）
node scripts/static-server.mjs dist 8090
# 终端 B（新产物，需先 cd site && npm run build）
cd site && npm run build && node ../scripts/static-server.mjs dist 8091
# 终端 C（比对，任选一页）
cd site && node scripts/geom-check.mjs single-girder-eot-cranes
```
Expected: 逐 `[data-block-id]` 包围盒差 ≤2px，无 diff 输出（或仅已知差异）。geom 是"搬页没走样"的工程验证，重构不应改变渲染产物。

> 若起服务不便，本步可后置到人工确认；Task 5 的硬门是 Step 3（accept-burn 72 条全绿）。

- [ ] **Step 5: Commit**

```bash
git add site/src/burn-lib.mjs
git commit -m "refactor(burn): 删除中心 SECTION_CATALOG，字段清单单一真相收归模板旁 meta 文件"
```

---

## Self-Review（计划作者自检）

**1. Spec 覆盖**（用途① = 字段清单从中心挪到模板旁 meta）：
- 新建 meta 文件 → Task 1 ✓
- loadCatalog 读 meta → Task 2 ✓
- previewHtml / writeDraft 两处全局引用 → Task 3 / Task 4 ✓
- 删 SECTION_CATALOG → Task 5 ✓
- edit-server 不改（writeDraft 签名不变）→ 确认 ✓
- oneShotMessages / 渲染 / 编辑 / schema 不碰 → 确认（计划未涉及）✓

**2. 占位符扫描**：每步含完整代码 / 精确行号 / 确切命令 + 预期输出，无 TBD/TODO/"类似 Task N"。✓

**3. 类型/签名一致性**：
- `loadMeta(metaPath)` —— Task 1 定义，Task 2/4 调用一致 ✓
- `loadCatalog(metaPath, astroPath, refJsonPath)` —— Task 2 定义，Task 2 调用方（deepseek-burn:120、accept-burn:33）一致 ✓
- `previewHtml(j, catalog)` —— Task 3 定义，调用方（deepseek-burn:218、accept-burn:93）一致 ✓
- `writeDraft(json, slug)` 签名不变 ✓
- `META` 常量 —— Task 2 Step 2 加，Task 4 用 ✓

**4. 命门**：双源核验（meta 字段 ⊆ .astro data-field / 参照 JSON）在 Task 2 保留（核验逻辑一字不动）。✓
