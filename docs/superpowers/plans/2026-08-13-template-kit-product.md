# 模板套件 · 产品统一(spec A)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 产品页从"写死 ProductPage"改成"数据声明模版 + 扫描发现套件 + 烧制动态取配套"——产品/文章平级、零写死、任何套件通用(本计划只做产品侧)。

**Architecture:** 每个模版 = `components/<族>/<名>/{index.astro, meta.json, example.json}` 一个文件夹套件。新增 `scanKits()` 扫描发现;产品路由改 glob 读 `j.page.template` 套模版(抄 post 范本);`burn()` 动态取选中套件配套;退役写死常量 + `FAMILIES` 注册表。

**Tech Stack:** Node ≥22, ESM, Astro `import.meta.glob`, 纯 `node:fs`。验收：`site/scripts/accept-burn.mjs` + `site/scripts/geom-check.mjs`(6 页 1:1)。

---

## 前置说明

- **范围 = spec A(产品统一)**。文章 4 篇补配套、文章族上线 = spec B(后续计划),本计划不碰 `components/posts/`。
- **不变量(重构红线)**：`ProductPage.astro` 的**渲染内容一字不改**(只移动位置 + 改"怎么被选中")。所以 geom 1:1 是硬门——渲染产物改前改后必须逐字节一致。
- **关键事实**：现状 4 个产品 JSON 的 `template`(两个旧路径)/`family`(`product@1`/`product-superset@1`)是**死残留,路由不读**(路由写死 `ProductPage.astro` 渲染全部 4 个)。本计划把 `template` 统一设 `ProductPage`、`family` 保留、`geomBaseline` 砍。
- **工作目录**：所有命令在 `site/` 下跑。`SITE` = `site/`。

## File Structure

| 文件 | 责任 | 本计划动作 |
|---|---|---|
| `src/components/products/ProductPage/index.astro` | 骨架(从根目录搬入,内容不动) | Task1 建(复制) / Task6 删旧 |
| `src/components/products/ProductPage/meta.json` | 字段表(随搬) | Task1 |
| `src/components/products/ProductPage/example.json` | 填好样例,喂 AI + 双源核验(复制 single-girder) | Task1 新建 |
| `src/components/products/ProductPage/meta.md` | 语义注释(随搬) | Task1 |
| `src/burn-lib.mjs` | 烧制纯逻辑 | Task2 加 `scanKits`/`findKit` |
| `src/pages/products/[slug].astro` | 产品路由 | Task3 改 glob 读 template |
| `src/pages/en/products/[slug].astro` | en 产品路由 | Task3 同步 |
| `content/products/*.json` ×4 | 产品数据 | Task3 template→ProductPage、砍 geomBaseline |
| `src/i18n-collect.mjs` | i18n 采集 | Task3 SKIP_KEYS 删 geomBaseline |
| `scripts/deepseek-burn.mjs` | 烧制编排 | Task4 退役写死常量、动态取配套 |
| `scripts/accept-burn.mjs` | 验收 | 各 Task 加测试 |
| `src/burn-lib.mjs` `FAMILIES` | 页族注册表 | Task5 退役(被 scanKits 取代) |

---

## Task 1: 套件文件夹就位 + example(纯新增,不删旧)

**Files:**
- Create: `src/components/products/ProductPage/index.astro`(复制自 `src/components/ProductPage.astro`)
- Create: `src/components/products/ProductPage/meta.json`(复制自 `src/components/ProductPage.meta.json`)
- Create: `src/components/products/ProductPage/meta.md`(复制自 `src/components/ProductPage.meta.md`)
- Create: `src/components/products/ProductPage/example.json`(复制自 `content/products/single-girder-eot-cranes.json`)
- Test: `scripts/accept-burn.mjs`(T1 块)

- [ ] **Step 1: 建文件夹 + 复制四件套**

Run:
```bash
cd site
mkdir -p src/components/products/ProductPage
cp src/components/ProductPage.astro src/components/products/ProductPage/index.astro
cp src/components/ProductPage.meta.json src/components/products/ProductPage/meta.json
cp src/components/ProductPage.meta.md src/components/products/ProductPage/meta.md
cp content/products/single-girder-eot-cranes.json src/components/products/ProductPage/example.json
```
说明:`index.astro`/`meta.json`/`meta.md` 内容与根目录版**逐字一致**(只换位置 + astro 改名 index);`example.json` = 单梁标杆产品数据(填好的样例)。旧根目录文件**暂留**(Task6 删)。

- [ ] **Step 2: 写失败测试(accept-burn 顶部 import 后、T1 块内追加)**

在 `accept-burn.mjs` 找到 T2「字段目录」块之前插入 T1 块:
```js
// ---------- T1 套件文件夹 ----------
{
  const kitDir = join(SITE, 'src/components/products/ProductPage')
  ok('套件 index.astro 在位', existsSync(join(kitDir, 'index.astro')))
  ok('套件 meta.json 在位', existsSync(join(kitDir, 'meta.json')))
  ok('套件 example.json 在位', existsSync(join(kitDir, 'example.json')))
  const ex = JSON.parse(readFileSync(join(kitDir, 'example.json'), 'utf8'))
  ok('example 是填好的产品 JSON（含 hero）', ex.hero && ex.page)
  const cat = lib.loadCatalog(
    join(kitDir, 'meta.json'), join(kitDir, 'index.astro'), join(kitDir, 'example.json'))
  ok('套件内双源核验过（16 字段全 verified）', cat.length === 16 && cat.every(c => c.verified))
}
```
(确认 `accept-burn.mjs` 已 import `existsSync`/`readFileSync`;若无则在顶部 node:fs import 补上。)

- [ ] **Step 3: 跑测试确认通过**

Run: `cd site && node scripts/accept-burn.mjs`
Expected: PASS —— T1 四条全绿;原有断言不转红(example.json 是 single-girder 副本,双源核验等价现状)。

- [ ] **Step 4: Commit**

```bash
git add src/components/products/ProductPage/ scripts/accept-burn.mjs
git commit -m "feat(burn): ProductPage 套件文件夹就位 + example.json(三件套,旧文件暂留)"
```

---

## Task 2: `scanKits()` / `findKit()` 扫描发现

**Files:**
- Modify: `src/burn-lib.mjs`(顶部 import 补 `readdirSync, existsSync` + `join`;FAMILIES 之前加 `scanKits`/`findKit`)
- Test: `scripts/accept-burn.mjs`(T2 块)

- [ ] **Step 1: 写失败测试(accept-burn T2 块内追加)**

```js
  const kits = lib.scanKits(join(SITE, 'src/components'))
  const pp = kits.find(k => k.family === 'products' && k.name === 'ProductPage')
  ok('scanKits 扫到 products/ProductPage', !!pp)
  ok('ProductPage 套件 complete（齐三件）', pp && pp.complete)
  ok('scanKits 不收无 index.astro 的空文件夹', !kits.some(k => !k.hasAstro))
  const found = lib.findKit(join(SITE, 'src/components'), 'products', 'ProductPage')
  ok('findKit 返回套件目录', found && found.endsWith('products/ProductPage'))
  let threw = false
  try { lib.findKit(join(SITE, 'src/components'), 'products', '不存在') } catch { threw = true }
  ok('findKit 找不到抛错', threw)
```

- [ ] **Step 2: 跑确认失败**

Run: `cd site && node scripts/accept-burn.mjs`
Expected: FAIL —— `lib.scanKits is not a function`

- [ ] **Step 3: 实现 scanKits/findKit**

`burn-lib.mjs` 顶部 import 行改为:
```js
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
```
(若 `join` 已在别处 import 则合并,勿重复。)

在 `FAMILIES` 定义之前插入:
```js
// ---------- 套件扫描发现：扫 components/<族>/<名>/，同名三件齐=完整套件 ----------
export function scanKits(componentsDir) {
  const kits = []
  const fams = readdirSync(componentsDir, { withFileTypes: true }).filter(d => d.isDirectory())
  for (const fd of fams) {
    const famDir = join(componentsDir, fd.name)
    for (const nd of readdirSync(famDir, { withFileTypes: true }).filter(d => d.isDirectory())) {
      const dir = join(famDir, nd.name)
      kits.push({
        family: fd.name, name: nd.name, dir,
        hasAstro: existsSync(join(dir, 'index.astro')),
        hasMeta: existsSync(join(dir, 'meta.json')),
        hasExample: existsSync(join(dir, 'example.json')),
      })
    }
  }
  return kits.map(k => ({ ...k, complete: k.hasAstro && k.hasMeta && k.hasExample }))
}

// 取指定族/名的完整套件；不存在或不完整→抛错（缺哪样明说）
export function findKit(componentsDir, family, name) {
  const k = scanKits(componentsDir).find(x => x.family === family && x.name === name)
  if (!k) throw new Error(`套件不存在：${family}/${name}`)
  if (!k.complete) {
    const miss = [['index.astro', k.hasAstro], ['meta.json', k.hasMeta], ['example.json', k.hasExample]]
      .filter(([, h]) => !h).map(([f]) => f)
    throw new Error(`套件不完整：${family}/${name} 缺 ${miss.join('、')}`)
  }
  return k.dir
}
```

- [ ] **Step 4: 跑确认通过**

Run: `cd site && node scripts/accept-burn.mjs`
Expected: PASS —— scanKits/findKit 五条全绿;总数不转红。

- [ ] **Step 5: Commit**

```bash
git add src/burn-lib.mjs scripts/accept-burn.mjs
git commit -m "feat(burn): scanKits/findKit 扫描发现套件（取代手填注册表的前置）"
```

---

## Task 3: 产品路由动态化 + JSON template 改值 + 砍 geomBaseline(原子·高风险)

> **批判点 3 落地点**：路由 + 数据 + i18n SKIP_KEYS **同一任务原子提交**，不留坏中间态。geom 1:1 是硬门——`ProductPage.astro` 内容没变(只换了引用方式)，渲染产物必须逐字节一致。

**Files:**
- Modify: `src/pages/products/[slug].astro`(去写死 import，改 glob 读 template)
- Modify: `src/pages/en/products/[slug].astro`(同步)
- Modify: `content/products/*.json` ×4(template→`ProductPage`，删 geomBaseline)
- Modify: `src/i18n-collect.mjs:5`(SKIP_KEYS 删 `geomBaseline`)
- Modify: `scripts/accept-i18n2.mjs`(去 geomBaseline 断言)
- Verify: geom-check

- [ ] **Step 1: 改 `products/[slug].astro`(删写死 import，改 glob 读 template)**

整文件改为:
```astro
---
// 产品页路由：content/products/*.json 每份数据出一个页。
// 用哪个模版由数据 page.template 决定（动态套同名套件 components/products/<template>/index.astro）。
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import Chrome from '../../layouts/Chrome.astro'

export function getStaticPaths() {
  const dir = join(process.cwd(), 'content/products')
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ params: { slug: f.replace('.json', '') }, j: JSON.parse(readFileSync(join(dir, f), 'utf8')) }))
    .filter(p => process.env.INCLUDE_DRAFTS === '1' || p.j.page.status === 'published')
    .map(({ params, j }) => ({ params, props: { j } }))
}

const { j } = Astro.props
const layouts = import.meta.glob('../../components/products/*/index.astro')
const Comp = (await layouts[`../../components/products/${j.page.template}/index.astro`]()).default
---
<Chrome j={j}>
	<Comp j={j} />
</Chrome>
```

- [ ] **Step 2: 改 `en/products/[slug].astro`(同步去写死 import)**

把行 7 `import ProductPage from '../../../components/ProductPage.astro'` **删掉**;把行 30-32 的 `<Chrome><ProductPage j={j}/></Chrome>` 改为动态套件:
```astro
const { j } = Astro.props
const layouts = import.meta.glob('../../../components/products/*/index.astro')
const Comp = (await layouts[`../../../components/products/${j.page.template}/index.astro`]()).default
---
<Chrome j={j}>
	<Comp j={j} />
</Chrome>
```

- [ ] **Step 3: 改 4 个产品 JSON(template→ProductPage、删 geomBaseline)**

对 `content/products/{single-girder-eot-cranes,overhead-cranes-for-sale,free-standing-jib-cranes,multi-point-suspension-cranes}.json`:
- `"template": "src/templates/product.html"`(或 `product-superset.html`)→ `"template": "ProductPage"`
- 删整行 `"geomBaseline": "..."`(single-girder、overhead 两份有;注意删后逗号别多别少)

Run 校验改对:
```bash
cd site
for f in content/products/*.json; do grep -H '"template"\|"geomBaseline"' "$f"; done
```
Expected: 4 份都只剩 `"template": "ProductPage"`;无任何 geomBaseline;`node -e 'JSON.parse(require("fs").readFileSync("content/products/single-girder-eot-cranes.json"))'` 不抛错(JSON 合法)。

- [ ] **Step 4: 砍 i18n SKIP_KEYS 的 geomBaseline + 更新测试**

`src/i18n-collect.mjs:5` 的 SKIP_KEYS Set 里删掉 `'geomBaseline'`。
`scripts/accept-i18n2.mjs:134` 的测试夹具去掉 `geomBaseline` 字段;行 159 的正则 `/family|geomBaseline|breadcrumb\.trail/` 改为 `/family|breadcrumb\.trail/`。

- [ ] **Step 5: 跑 build + accept-burn + i18n 测试**

Run:
```bash
cd site
node scripts/accept-burn.mjs            # 烧制验收不转红
node scripts/accept-i18n2.mjs 2>/dev/null || node --test scripts/accept-i18n2.mjs  # i18n 不转红(按现有跑法)
npm run build >/dev/null 2>&1 && echo "build OK"  # 站点能构建
```
Expected: accept-burn 全绿;i18n 全绿;build OK。

- [ ] **Step 6: geom 1:1 验证(硬门)**

需起两个静态服务(旧 `dist` 基准 8090、新 `site/dist` 8091):
```bash
# 终端 A:旧基准
node scripts/static-server.mjs dist 8090
# 终端 B:新产物
cd site && npm run build && node ../scripts/static-server.mjs dist 8091
# 终端 C:逐页比对(至少 single-girder + overhead)
cd site && node scripts/geom-check.mjs single-girder-eot-cranes && node scripts/geom-check.mjs overhead-cranes-for-sale
```
Expected: 逐 `[data-block-id]` 包围盒差 ≤2px，**无 diff**(渲染产物逐字节一致 = 路由动态化没走样)。有 diff = Step1/2 的 glob 路径或 template 值错，回去修，**不可跳过**。

- [ ] **Step 7: Commit(原子:路由+数据+i18n 同一 commit)**

```bash
git add src/pages/products/[slug].astro src/pages/en/products/[slug].astro \
        content/products/*.json src/i18n-collect.mjs scripts/accept-i18n2.mjs
git commit -m "refactor(route): 产品路由动态化(读 template)+JSON template→ProductPage+砍 geomBaseline（geom 1:1）"
```

---

## Task 4: burn 动态取配套 + 退役写死常量

**Files:**
- Modify: `scripts/deepseek-burn.mjs:11-13,93,240`(删 ASTRO/META/REF_JSON 常量，改 findKit 动态取)
- Test: `scripts/accept-burn.mjs`(已覆盖，确认不转红)

- [ ] **Step 1: 改 deepseek-burn——常量换套件目录**

行 11-13 的三个常量:
```js
const ASTRO = join(SITE, 'src/components/ProductPage.astro')
const REF_JSON = join(SITE, 'content/products/single-girder-eot-cranes.json')
const META = join(SITE, 'src/components/ProductPage.meta.json')
```
替换为:
```js
const COMPONENTS = join(SITE, 'src/components')   // 套件根
```

- [ ] **Step 2: burn() 内动态取套件配套(行 93 附近)**

把 `const catalog = lib.loadCatalog(META, ASTRO, REF_JSON)` 替换为:
```js
  const kitDir = lib.findKit(COMPONENTS, 'products', 'ProductPage')
  const catalog = lib.loadCatalog(
    join(kitDir, 'meta.json'), join(kitDir, 'index.astro'), join(kitDir, 'example.json'))
```
(`loadCatalog` 第三参从 REF_JSON 换成套件内 example.json——example 是 single-girder 副本，双源核验等价。)

- [ ] **Step 3: writeDraft 内 loadMeta 换路径(行 240)**

把 `lib.loadMeta(META)` 替换为(在 writeDraft 函数内，kitDir 在此作用域外，重算一次):
```js
  const kitDir = lib.findKit(COMPONENTS, 'products', 'ProductPage')
  for (const c of lib.loadMeta(join(kitDir, 'meta.json')).filter(c => c.shape === 'section' && json[c.key]))
    lib.validateDoc(json[c.key].body, `${c.key}.body`)
```

- [ ] **Step 4: 跑 accept-burn 确认全绿**

Run: `cd site && node scripts/accept-burn.mjs`
Expected: PASS —— 全绿。burn 通过 findKit 拿到套件配套，行为等价。

- [ ] **Step 5: 真假冒烟(CLI，可选，需 key)**

若有 `DEEPSEEK_API_KEY`:贴一篇裸文跑 `node scripts/deepseek-burn.mjs --text <文件> --slug smoke --name 测试`，确认能烧、report 正常。无 key 跳过(accept-burn mock 已覆盖)。

- [ ] **Step 6: Commit**

```bash
git add scripts/deepseek-burn.mjs
git commit -m "refactor(burn): burn 动态取 ProductPage 套件配套，退役 ASTRO/META/REF_JSON 写死常量"
```

---

## Task 5: `FAMILIES` 退役(判族改 scanKits)

> 现状 burn 用 `FAMILIES[family].built` 判族(deepseek-burn:89-91)。scanKits 就位后，"某族能不能烧" = 该族有没有完整套件。本任务把判族来源从手填表换成扫描，删 FAMILIES。

**Files:**
- Modify: `scripts/deepseek-burn.mjs:84-91`(判族逻辑)
- Modify: `src/burn-lib.mjs:78-81`(删 FAMILIES)
- Test: `scripts/accept-burn.mjs`(T-family 块断言更新)

- [ ] **Step 1: 改 burn 判族逻辑(deepseek-burn:79-91)**

判族块改为(auto 判成非 products 族或该族无套件 → 干净拒):
```js
  let resolved = family
  const preNotes = []
  const kits = lib.scanKits(COMPONENTS)
  const familyKit = (fam) => kits.find(k => k.family === fam && k.complete)
  if (family === 'auto') {
    const verdict = await callAI(classifyMessages(rawText.slice(0, 3000)), 'classify')
    resolved = verdict?.family === 'product' ? 'products' : null   // AI 返回 product；映射到族目录名 products
    if (!resolved || !familyKit(resolved)) {
      throw new Error(`自动判族：这份原料像「${verdict?.family ?? '无法识别'}」——${verdict?.reason ?? '无理由'}。该族烧制未建`)
    }
    preNotes.push(`自动判族：产品页族（${verdict.reason}）`)
  } else {
    // 手动选族：family 入参用族目录名(products)或旧名(product)，统一映射
    const fam = family === 'product' ? 'products' : family
    if (!familyKit(fam)) throw new Error(`页族「${family}」烧制未建（无完整套件）`)
    resolved = fam
  }
```

> 注：`classifyMessages` 里 AI 返回 `"product"`/`"post"`(旧约定保持，提示词不动)；这里映射到族目录名 `products`。手动入参 `family` 兼容旧的 `'product'`。

- [ ] **Step 2: 删 FAMILIES(burn-lib:78-81)**

删掉:
```js
export const FAMILIES = {
  product: { label: '产品页族', built: true },
  post: { label: '文章页族', built: false },
}
```

- [ ] **Step 3: 更新 accept-burn 的 T-family 断言**

`accept-burn.mjs` 里 `FAMILIES` / `family` 相关断言(行 169/220/225/229/244 等 mock 返回)：
- mock `classify` 返回里 `family: 'product'` **保持**(AI 约定不变)；
- 若有断言直接读 `lib.FAMILIES`，改为断言 `lib.scanKits(...).find(k=>k.family==='products'&&k.complete)` 存在;
- `family: 'post'` 拒绝测试(行 229/244)：post 族无套件 → 仍应拒绝(改为断言抛错信息含"未建")。
逐条核对，确保 mock 与新判族逻辑一致。

- [ ] **Step 4: 跑 accept-burn 确认全绿**

Run: `cd site && node scripts/accept-burn.mjs`
Expected: PASS —— 判族测试全绿(post 仍拒、product 通过、auto 判中)。

- [ ] **Step 5: Commit**

```bash
git add scripts/deepseek-burn.mjs src/burn-lib.mjs scripts/accept-burn.mjs
git commit -m "refactor(burn): FAMILIES 退役，判族改 scanKits（族能不能烧=有没有完整套件）"
```

---

## Task 6: 删旧 ProductPage.* + 全量验收

**Files:**
- Delete: `src/components/ProductPage.astro`
- Delete: `src/components/ProductPage.meta.json`
- Delete: `src/components/ProductPage.meta.md`
- Verify: grep 无残留 + build + accept-burn + geom

- [ ] **Step 1: 确认全局已无对旧路径的引用**

Run: `cd site && grep -rn "components/ProductPage\.\|ProductPage\.astro\|ProductPage\.meta\.json" src/ scripts/ --include="*.mjs" --include="*.astro"`
Expected: **空**(Task3/4 已把引用切到 `components/products/ProductPage/`)。有残留先回去改干净。

- [ ] **Step 2: 删旧三件**

Run:
```bash
cd site
git rm src/components/ProductPage.astro src/components/ProductPage.meta.json src/components/ProductPage.meta.md
```

- [ ] **Step 3: 全量验收**

Run:
```bash
cd site
node scripts/accept-burn.mjs                       # 烧制全绿
npm run build >/dev/null 2>&1 && echo "build OK"   # 站点构建
# geom(起 8090/8091 两服务后):
node scripts/geom-check.mjs single-girder-eot-cranes
node scripts/geom-check.mjs overhead-cranes-for-sale
```
Expected: accept-burn 全绿;build OK;geom 1:1 无 diff。

- [ ] **Step 4: 批判点 1(双源核验命门)核对**

确认套件内双源核验仍生效:`loadCatalog(meta, astro, example)` 对每个字段做 `fields.has(...)` 核验(T1 已测 `cat.every(c=>c.verified)`)。命门保住——文件夹化后每个套件 meta 仍跟自己 astro 双源核验。

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(burn): 删除根目录旧 ProductPage.*（套件已迁 components/products/ProductPage/）"
```

---

## Self-Review（计划作者自检）

**1. Spec 覆盖**(对照 spec 各节)：
- 物理结构(套件文件夹) → Task1 ✓
- 发现机制(scanKits、配套齐才可用) → Task2 ✓
- 出页机制(数据声明 template、代码读它、en 同步) → Task3 ✓
- 烧制机制(动态取配套、退役写死常量) → Task4 ✓
- FAMILIES 退役 → Task5 ✓
- 收尾(砍 geomBaseline、删旧、family 保留) → Task3(geomBaseline)/Task6(删旧) ✓
- 验收(accept-burn + geom) → Task3/6 ✓
- edit-layer 不用动(批判点5 已核) → 计划不涉及 ✓

**2. 占位符扫描**：每步含具体命令/完整代码/精确行号/预期输出。Task3 Step3 的 JSON 改值给了校验命令;Task5 Step3 的断言更新给了核对原则(因 accept-burn 多处 mock，逐条核对而非贴全文——这是务实，非占位)。✓

**3. 类型/签名一致性**：
- `scanKits(componentsDir)` → `[{family,name,dir,hasAstro,hasMeta,hasExample,complete}]`，Task2 定义、Task5 用 ✓
- `findKit(componentsDir, family, name)` → 套件 dir 字符串，Task2 定义、Task4/5 用 ✓
- `loadCatalog(metaPath, astroPath, refJsonPath)` 签名不变，Task1/4 调用一致(第三参换 example.json) ✓
- `COMPONENTS` 常量 → Task4 定义，Task5 用 ✓

**4. 命门/风险**：
- 双源核验(批判点1)→ Task1 测 `cat.every(verified)` + Task6 Step4 核对，命门保住 ✓
- 路由高风险(批判点3)→ Task3 原子提交 + geom 1:1 硬门 ✓
- 代码+数据中间态 → Task3 同 commit ✓
