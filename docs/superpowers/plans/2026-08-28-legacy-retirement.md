# 旧系统退役 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把根目录旧系统（MD 时代 render/build/edit 全套）正式退役：先把旧 dist 有而 site 没有的功能（free-standing 页、404、搜索、首页、列表页）补齐进 site，再切断 CI/钩子/geom 基准三根绳，最后删除旧目录并重写 CLAUDE.md。

**Architecture:** 补齐侧全部走 site 现行架构（Astro 静态路由 + `composeStatic` 静态 chrome 组装 + 构建期派生脚本）；geom 回归从「新旧 dist 实时比对」改为「快照基准比对」（基准 JSON 随 git 走，旧 dist 删后仍可回归）；删除侧纯 git rm。

**Tech Stack:** Astro 6（site/）、Node ≥22、playwright-core（geom）、无新增依赖。

**用户拍板（2026-08-28）：** ①搜索做完整（复刻旧站同款静态索引+页内 JS）；②先补再删；③历史文档（对话记录/demo/design/docs/blueprint）不动。

---

## 执行环境约定（每个任务都适用）

- 工作目录：仓库根 `/Users/vue/Documents/websitere-placement-system`，site 命令一律 `cd site &&` 前缀。
- **site 的 build/重建必须 node ≥22**（`nvm use 22` 或确认 `node -v` ≥22；node20 下 astro build 退出码 1）。
- 当前分支 `claude`，直接在上面按任务 commit。
- 每个任务的「验证」步骤输出必须与预期一致才算过，不许跳。

## 已查证事实（执行者不需要重新调查）

1. 旧 dist 有、site 没有的页面：`404.html`、`index.html`、`search/index.html`、`search-index.json`、`products/index.html`、`posts/index.html`，以及 **`products/free-standing-jib-cranes/`（zh 源从未迁入 site，en 镜像 JSON 成了孤儿）**。
2. `site/dist/`、`dist/` 均未被 git 跟踪（`git ls-files` 为空）——删 dist 不用 git rm。
3. 旧搜索页 = `search-index.json`（`[{slug,title,description,text≤3000}]`）+ 页内 JS（`fetch("/search-index.json")` 全词包含过滤）。site header 搜索框 `action="/search/"` 已就位，不用改。
4. 旧首页/列表页是**构建期派生**（`build.mjs::buildDerivedPages`）：卡片列表从内容派生，非手写 landing。助手函数 `cardHtml/listingSection/wrap/seoFor/ogImagePath/escAttr` 源码在本计划 Task 5 内嵌。
5. site Chrome.astro 强制要求 `j` 且在族谱内（`throw`），静态页不能走它 → 需要 `composeStatic`（Task 2）。
6. `kernel.mjs::langSwitcher(pg, siblings)` 只读 `pg.lang`；`langSwitcher({lang:'zh-CN'}, [])` 出「仅当前语言 pill」（与旧 dist 404 逐字同构）。
7. 内容 JSON 形态（python 实查）：product 顶层 `hero.image` 为裸文件名（需补 `/assets/img/product/` 前缀）；post 的图片在 `body.img_*`（已是 `/assets/img/post/` 绝对路径）；正文树 = 各段的 `{title, body:{type:'doc',content:[...]}}`，文本在 `type:'text'` 节点的 `.text`。
8. `sitemapXml(groups, _pages, pubSet)` 在 `site/src/seo/kernel.mjs:70`，行形如 `<url><loc>…</loc>[xhtml:link…]</url>`。
9. `seo-emit.mjs` 写法是双产物链模板：`BUILD_OUT` 环境变量定去向（默认 dist），edit-server.mjs:143-150 的 `runBuild` 链依次跑 `astro build → link-assets → seo-emit`。
10. `build-outputs.mjs` 的 stage 机制只调注入的 `runBuild`，所以新派生脚本只需挂进 package.json build 链 + edit-server runBuild 链两处。
11. `geom-check.mjs`（products，按 `[data-block-id]`）与 `geom-post.mjs`（posts，按选择器+#序号）现行都硬编码对比 `localhost:8090`（旧 dist）。geom-post 的选择器清单已在本计划 Task 6 内嵌。
12. 根 `.nvmrc`=20；`.githooks/pre-push` 跑根 `npm run check`；根 `package.json` 的 `prepare` 钩子负责 `core.hooksPath`——退役后根 package.json 须瘦身保留而非删除。
13. `md-to-json.mjs` 用法：`cd site && node scripts/md-to-json.mjs <md路径>`，产物 `content/<page.slug>.json`，frontmatter 直通。
14. `j.page` 字段：`slug/type/lang/title/description/template/status`（router 用 `j.page.template` 查 `components/<type>s/<template>/index.astro`）。
15. 旧 404 正文里有 `href="/zh/"`——D1 翻转后中文住根，新 404 改用 `href="/"`（有意修正，不是抄错）。

---

## Phase A：补齐（先补）

### Task 1: 补迁移 free-standing-jib-cranes 中文源

旧 dist 有这页、site 只有孤儿 en 镜像。用现成 md-to-json 直通转换补 zh 源，镜像自动配对。

**Files:**
- 源：`src/content/free-standing-jib-cranes.md`（旧，只读）
- 产出：`site/content/products/free-standing-jib-cranes.json`
- 可能改：产物里 `page.template`/`page.status` 两个字段

- [ ] **Step 1: 转换**

```bash
cd site && node -v   # 必须 ≥22，不是则 nvm use 22
node scripts/md-to-json.mjs ../src/content/free-standing-jib-cranes.md
```

预期输出末行类似 `✅ content/products/free-standing-jib-cranes.json`（schema 校验过才落盘；若抛错，读错误修 MD 侧映射，不改转换器）。

- [ ] **Step 2: 核对 template/status 与既有产品页一致**

```bash
cd site
python3 -c "import json;a=json.load(open('content/products/single-girder-eot-cranes.json'))['page'];b=json.load(open('content/products/free-standing-jib-cranes.json'))['page'];print('参照:',a.get('template'),a.get('status'));print('新页:',b.get('template'),b.get('status'))"
```

预期：`新页` 的 template 与参照完全一致（应为 `ProductPage`），status 应为 `published`。不一致就修：

```bash
cd site
python3 - <<'EOF'
import json
p='content/products/free-standing-jib-cranes.json'
j=json.load(open(p))
ref=json.load(open('content/products/single-girder-eot-cranes.json'))['page']
j['page']['template']=ref['template']
j['page']['status']='published'
json.dump(j,open(p,'w'),ensure_ascii=False,indent=2)
print('patched:',j['page']['template'],j['page']['status'])
EOF
```

- [ ] **Step 3: 族谱配对 + build 验证**

```bash
cd site
node scripts/i18n-registry.mjs --write && node scripts/i18n-registry.mjs --check
npm run build
ls dist/products/free-standing-jib-cranes/index.html dist/en/products/free-standing-jib-cranes/index.html
```

预期：registry ✓；两个文件都存在。**若 en 镜像被门禁扣住（第二个 ls 失败）**：跑 `node scripts/i18n-status.mjs`（若存在）或在 node 里 `import('./src/i18n/kernel.mjs').then(...)` 查 translated_rev——根因只会是 md-to-json 直通的 i18n_rev 与 en 镜像的 translated_rev 对不上；此时对照 `content/en/products/free-standing-jib-cranes.json` 的 `i18n.translated_rev` 修正 zh 源 `i18n_rev` 同名键的值使译戳==源戳（这是既有配对数据的恢复，不是抬戳）。

- [ ] **Step 4: 回归 + commit**

```bash
cd site && npm run check && npm run accept:i18n2
cd .. && git add site/content/products/free-standing-jib-cranes.json site/src/i18n/data/registry.json
git commit -m "feat(content): 补迁 free-standing-jib-cranes 中文源——孤儿 en 镜像配对复原"
```

预期：check 全绿。**注意**：若有 accept 脚本硬编码页面总数（如「15 页」），先 `grep -rn "15" site/scripts/accept-*.mjs | grep -i "页\|page"` 找到并改为新数（16）。

### Task 2: 静态 chrome 组装器 composeStatic + 派生页验收骨架（先红）

**Files:**
- Create: `site/src/static-chrome.mjs`
- Create: `site/scripts/accept-derived.mjs`
- Modify: `site/package.json`（scripts 加 `accept:derived`，check 链尾追加）

- [ ] **Step 1: 写 composeStatic**

`site/src/static-chrome.mjs` 全文：

```js
// 静态派生页（404/搜索/首页/列表页）的 chrome 组装：这些页不在 content 树里、没有 j，
// 走不了 Chrome.astro（它强制族谱坐标）。document.html + header/footer 逐字复用，
// 语言切换器出「仅当前语言」pill（siblings 空 → 与旧 dist 派生页逐字同构）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { langSwitcher } from './i18n/kernel.mjs'

export function composeStatic(site, { lang = 'zh-CN', title, description, seo = '' }) {
  const doc = readFileSync(join(site, 'src/chrome/document.html'), 'utf8')
  const composed = doc
    .replaceAll('{{LANG}}', lang)
    .replaceAll('{{TITLE}}', title)
    .replaceAll('{{DESCRIPTION}}', description)
    .replaceAll('{{SEO}}', seo)
    .replace('{{HEADER}}', readFileSync(join(site, 'src/chrome/header.html'), 'utf8'))
    .replace('{{FOOTER}}', readFileSync(join(site, 'src/chrome/footer.html'), 'utf8'))
    .replaceAll('{{LANG_SWITCH}}', langSwitcher({ lang }, []))
  return composed.split('{{BODY}}') // [head, tail]
}
```

- [ ] **Step 2: 写验收骨架（此时应红——派生页还不存在）**

`site/scripts/accept-derived.mjs` 全文：

```js
#!/usr/bin/env node
// 派生页验收：dist 里 404/搜索/首页/列表页/搜索索引齐备且关键标记正确。
// 跑法：node scripts/accept-derived.mjs（须先 npm run build）
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const site = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = p => readFileSync(join(site, 'dist', p), 'utf8')
let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log(`✅ ${name}`) } else { fail++; console.log(`❌ ${name}`) } }

// 404
const nf = read('404.html')
ok('404 存在且 noindex', nf.includes('<meta name="robots" content="noindex">') && nf.includes('页面未找到'))
// 搜索页
const sp = read('search/index.html')
ok('搜索页存在且 noindex', sp.includes('<meta name="robots" content="noindex">') && sp.includes('id="search-results"'))
// 搜索索引
const idx = JSON.parse(read('search-index.json'))
ok('搜索索引 ≥16 条且字段齐', idx.length >= 16 && idx.every(e => e.slug && e.title && typeof e.text === 'string'))
ok('搜索索引含 free-standing', idx.some(e => e.slug === 'products/free-standing-jib-cranes'))
// 首页
const hp = read('index.html')
ok('首页存在且 canonical 指根', hp.includes('<link rel="canonical" href="https://www.dgcrane.com/">'))
ok('首页有产品区与案例区', hp.includes('产品（') && hp.includes('案例与文章（'))
// 列表页
ok('产品目录页存在', read('products/index.html').includes('全部产品'))
ok('案例列表页存在', read('posts/index.html').includes('案例与文章'))
// sitemap 收派生页
const sm = read('sitemap.xml')
ok('sitemap 含首页与两列表页', sm.includes('<loc>https://www.dgcrane.com/</loc>') && sm.includes('<loc>https://www.dgcrane.com/products/</loc>') && sm.includes('<loc>https://www.dgcrane.com/posts/</loc>'))
ok('sitemap 不含搜索页', !sm.includes('/search/'))

console.log(`\n${pass} 过 / ${fail} 挂`)
process.exit(fail ? 1 : 0)
```

- [ ] **Step 3: package.json 接线**

`site/package.json` scripts 块加一行（放 `accept:workbench` 后）：

```json
    "accept:derived": "node scripts/accept-derived.mjs",
```

并把 `check` 改为：

```json
    "check": "node scripts/i18n-registry.mjs --check && node scripts/accept-i18n2.mjs && node scripts/accept-derived.mjs",
```

- [ ] **Step 4: 跑验收确认红**

```bash
cd site && npm run build && node scripts/accept-derived.mjs
```

预期：❌ 一片（404.html 不存在，readFileSync 抛 ENOENT 直接崩也算红——红即对）。

- [ ] **Step 5: commit**

```bash
git add site/src/static-chrome.mjs site/scripts/accept-derived.mjs site/package.json
git commit -m "feat(site): composeStatic 静态 chrome 组装器 + 派生页验收骨架（先红）"
```

### Task 3: 404 页

**Files:**
- Create: `site/src/pages/404.astro`

- [ ] **Step 1: 写页面**

`site/src/pages/404.astro` 全文（正文从旧 `build.mjs::build404` 逐字平移，唯一改动：`/zh/` → `/`，D1 后中文住根）：

```astro
---
// 404：静态托管通用约定（S3/CloudFront、GH Pages 都认 dist/404.html）。
import { composeStatic } from '@src/static-chrome.mjs'
const [head, tail] = composeStatic(process.cwd(), {
  title: '页面未找到 | DGCRANE',
  description: '您访问的页面不存在。',
  seo: '<meta name="robots" content="noindex">',
})
---
<Fragment set:html={head} />
<div class="wrap" style="max-width:720px;margin:80px auto 120px;padding:0 20px;text-align:center">
  <p style="font-size:110px;font-weight:700;color:#001A4F;margin:0;line-height:1">404</p>
  <h1 style="font-size:24px;color:#001A4F;margin:14px 0 18px">页面未找到</h1>
  <p style="color:#666">您访问的页面不存在或已被移动。</p>
  <p style="margin-top:28px"><a href="/" style="color:#036AAE">返回首页 →</a></p>
</div>
<Fragment set:html={tail} />
```

- [ ] **Step 2: 验证**

```bash
cd site && npm run build && node scripts/accept-derived.mjs
```

预期：第 1 条 `404 存在且 noindex` 转 ✅，其余仍 ❌。

- [ ] **Step 3: commit**

```bash
git add site/src/pages/404.astro
git commit -m "feat(site): 404 页（旧 build404 平移，/zh/ 链接按 D1 修为 /）"
```

### Task 4: 站内搜索（索引生成器 + 搜索页 + 双产物链接线）

**Files:**
- Create: `site/scripts/search-index.mjs`
- Create: `site/src/pages/search/index.astro`
- Modify: `site/package.json`（build 链尾追加）
- Modify: `site/scripts/edit-server.mjs:150`（runBuild 链尾追加）

- [ ] **Step 1: 写索引生成器**

`site/scripts/search-index.mjs` 全文：

```js
#!/usr/bin/env node
// build 后写 search-index.json 进产物目录（BUILD_OUT 定去向，双产物链同 seo-emit）。
// 收录口径 = 生产门禁（published 且过 isPublishable），与 seo-emit 的 pubSet 同源。
// 文本来源 = 页面 JSON 里所有 {type:'doc'} 正文树的 text 节点——字段名无关，守引擎铁律 §2.1。
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanPages, buildGroups, isPublishable } from '../src/i18n/kernel.mjs'

const site = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = process.env.BUILD_OUT || 'dist'

const docText = (node, acc = []) => {
  if (node && typeof node === 'object') {
    if (node.type === 'text' && typeof node.text === 'string') acc.push(node.text)
    for (const c of node.content ?? []) docText(c, acc)
  }
  return acc
}
// 收集对象里所有 doc 树的纯文本（遇到 doc 即提取、不再深入，防嵌套重复）
const collectDocs = (v, acc = []) => {
  if (v && typeof v === 'object') {
    if (v.type === 'doc' && Array.isArray(v.content)) { acc.push(docText({ content: v.content }).join(' ')); return acc }
    if (Array.isArray(v)) for (const item of v) collectDocs(item, acc)
    else for (const k of Object.keys(v)) collectDocs(v[k], acc)
  }
  return acc
}

const pages = scanPages({ withJson: true })
const groups = buildGroups(pages)
const entries = pages
  .filter(p => p.status === 'published' && p.j && isPublishable(p, groups, pages))
  .map(p => ({
    slug: p.slug,
    title: p.j.page.title.split('|')[0].trim(),
    description: p.j.page.description,
    text: collectDocs(p.j).join(' ').replace(/\s+/g, ' ').trim().slice(0, 3000),
  }))
mkdirSync(join(site, out), { recursive: true })
writeFileSync(join(site, out, 'search-index.json'), JSON.stringify(entries))
console.log(`search-index: ${entries.length} 条 → ${out}/search-index.json`)
```

- [ ] **Step 2: 写搜索页**

`site/src/pages/search/index.astro` 全文。正文/JS 从旧 `build.mjs` 搜索页**逐字平移**，两个适配点：①旧代码在 JS 模板字符串里所以是 `\\s+`，落 .astro 还原成 `\s+`；②Astro 会打包 `<script>`，必须加 `is:inline` 保持原样输出。

```astro
---
// 站内搜索结果页（noindex，不进 sitemap）：自包含 HTML + 页内 JS 读静态索引，零运行时组装。
import { composeStatic } from '@src/static-chrome.mjs'
const [head, tail] = composeStatic(process.cwd(), {
  title: '站内搜索 | DGCRANE',
  description: 'DGCRANE 站内搜索',
  seo: '<meta name="robots" content="noindex">',
})
---
<Fragment set:html={head} />
<div class="wrap" style="max-width:900px;margin:40px auto 80px;padding:0 20px">
  <h1 style="font-size:26px;color:#001A4F;margin:0 0 24px">站内搜索</h1>
  <div id="search-results"><p style="color:#666">加载中…</p></div>
</div>
<script is:inline>
(function () {
  var q = (new URLSearchParams(location.search).get("s") || "").trim();
  var box = document.getElementById("search-results");
  var input = document.getElementById("s");
  if (input) input.value = q;
  if (!q) { box.innerHTML = '<p style="color:#666">请输入关键词后搜索。</p>'; return; }
  fetch("/search-index.json").then(function (r) { return r.json(); }).then(function (idx) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    var hits = idx.filter(function (e) {
      var hay = (e.title + " " + e.description + " " + e.text).toLowerCase();
      return terms.every(function (t) { return hay.indexOf(t) !== -1; });
    });
    box.textContent = "";
    var head = document.createElement("p");
    head.style.cssText = "color:#666;margin:0 0 20px";
    head.textContent = "“" + q + "” 共 " + hits.length + " 条结果";
    box.appendChild(head);
    hits.forEach(function (e) {
      var item = document.createElement("div");
      item.style.cssText = "margin:0 0 22px";
      var a = document.createElement("a");
      a.href = "/" + e.slug + "/";
      a.style.cssText = "font-size:17px;color:#036AAE;font-weight:600";
      a.textContent = e.title;
      var snip = document.createElement("p");
      snip.style.cssText = "margin:6px 0 0;color:#555;font-size:13px;line-height:1.7";
      var hay = e.text || e.description, pos = hay.toLowerCase().indexOf(terms[0]);
      snip.textContent = pos >= 0 ? (pos > 40 ? "…" : "") + hay.slice(Math.max(0, pos - 40), pos + 90) + "…" : e.description.slice(0, 130);
      item.appendChild(a); item.appendChild(snip); box.appendChild(item);
    });
  }).catch(function () { box.innerHTML = '<p style="color:#c62828">索引加载失败，请刷新重试。</p>'; });
})();
</script>
<Fragment set:html={tail} />
```

- [ ] **Step 3: build 链接线（两处）**

`site/package.json` 的 build 改为：

```json
    "build": "astro build && node scripts/link-assets.mjs && node scripts/seo-emit.mjs && node scripts/search-index.mjs",
```

`site/scripts/edit-server.mjs` 找到 runBuild 链（约 149-150 行）：

```js
    .then(() => run([join(SITE, 'scripts/link-assets.mjs')]))
    .then(() => run([join(SITE, 'scripts/seo-emit.mjs')]))
```

在 seo-emit 行后追加一行：

```js
    .then(() => run([join(SITE, 'scripts/search-index.mjs')]))
```

- [ ] **Step 4: 验证**

```bash
cd site && npm run build && node scripts/accept-derived.mjs
```

预期：搜索相关 4 条（搜索页/索引/索引含 free-standing）转 ✅，剩首页、列表页、sitemap 3 条 ❌。

冒烟搜索功能（可选但推荐）：

```bash
cd site && npx astro preview --port 8099 &
sleep 2 && curl -s "http://localhost:8099/search/?s=5吨" | grep -c "search-results" && curl -s http://localhost:8099/search-index.json | python3 -c "import json,sys;print(len(json.load(sys.stdin)),'条')"
kill %1
```

- [ ] **Step 5: commit**

```bash
git add site/scripts/search-index.mjs site/src/pages/search/index.astro site/package.json site/scripts/edit-server.mjs
git commit -m "feat(site): 站内搜索平移——静态索引(doc树文本,字段名无关)+搜索页+双产物链接线"
```

### Task 5: 首页 + 产品/案例列表页 + sitemap 收派生页

**Files:**
- Create: `site/src/listing.mjs`
- Create: `site/src/pages/index.astro`
- Create: `site/src/pages/products/index.astro`
- Create: `site/src/pages/posts/index.astro`
- Modify: `site/src/seo/kernel.mjs:70`（sitemapXml 加第 4 参 extraLocs）
- Modify: `site/scripts/seo-emit.mjs`（传派生页 loc）

- [ ] **Step 1: 写 listing.mjs**

`site/src/listing.mjs` 全文（旧 build.mjs 助手平移；`ogImagePath` 适配 JSON 载体改名 `cardImage`——product 读 `hero.image`/`gallery[0].image` 补 product 前缀，post 读 `body.img_hero`/首个 `img_*`（已是绝对路径），与旧逻辑语义一致）：

```js
// 派生列表页助手（旧 build.mjs cardHtml/listingSection/wrap 平移，JSON 载体适配）。
export const escAttr = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// 卡片题图（旧 ogImagePath 同源语义）：product → hero.image / gallery[0].image（裸文件名补
// /assets/img/product/ 前缀）；post → body.img_hero 或首个 body.img_*（已是 /assets/img/post/ 绝对路径）。
export function cardImage(j) {
  if (j.page.type === 'post') {
    const body = j.body ?? {}
    const v = body.img_hero ?? Object.keys(body).filter(k => k.startsWith('img_')).map(k => body[k])[0] ?? null
    return v && String(v).startsWith('/') ? String(v) : null
  }
  const v = j.hero?.image ?? j.gallery?.[0]?.image ?? null
  return v ? (String(v).startsWith('/') ? String(v) : '/assets/img/product/' + v) : null
}

export function cardHtml(j) {
  const img = cardImage(j)
  const title = escAttr(j.page.title.split('|')[0].trim())
  const href = '/' + j.page.slug + '/'
  return `<a href="${href}" style="display:block;width:270px;text-decoration:none;color:inherit;border:1px solid #e3e7ec;border-radius:4px;overflow:hidden;background:#fff">
  ${img ? `<img src="${img}" alt="${title}" width="270" height="180" style="display:block;width:100%;height:180px;object-fit:cover">` : `<div style="height:180px;background:#f2f5f8"></div>`}
  <div style="padding:12px 14px 16px">
    <p style="margin:0 0 6px;font-size:16px;font-weight:600;color:#001A4F;line-height:1.4">${title}</p>
    <p style="margin:0;font-size:13px;color:#666;line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${escAttr(j.page.description)}</p>
  </div>
</a>`
}

export function listingSection(heading, cards) {
  return `<section style="margin:0 0 50px">
  <h2 style="font-size:22px;color:#001A4F;border-left:4px solid #036AAE;padding-left:12px;margin:0 0 20px">${heading}</h2>
  <div style="display:flex;flex-wrap:wrap;gap:20px">${cards.join('\n')}</div>
</section>`
}

export function wrap(inner, h1, intro) {
  return `<div class="wrap" style="max-width:1200px;margin:40px auto 80px;padding:0 20px">
  <h1 style="font-size:26px;color:#001A4F;margin:0 0 8px">${h1}</h1>
  <p style="color:#666;margin:0 0 34px">${intro}</p>
  ${inner}
</div>`
}

// 派生页收录口径 = 生产门禁（published 且过 isPublishable）的 zh 源页——与 seo-emit pubSet 同源。
import { scanPages, buildGroups, isPublishable } from './i18n/kernel.mjs'
export function listedPages() {
  const pages = scanPages({ withJson: true })
  const groups = buildGroups(pages)
  return pages.filter(p => p.lang === 'zh-CN' && p.status === 'published' && p.j && isPublishable(p, groups, pages))
}
```

- [ ] **Step 2: 写三个页面**

`site/src/pages/index.astro` 全文：

```astro
---
// 首页：构建期从内容派生（旧 buildDerivedPages 平移）。
import { composeStatic } from '@src/static-chrome.mjs'
import { listedPages, cardHtml, listingSection, wrap, escAttr } from '@src/listing.mjs'
import { SITE_BASE } from '@src/i18n/kernel.mjs'

const listed = listedPages()
const products = listed.filter(p => p.j.page.type === 'product')
const posts = listed.filter(p => p.j.page.type === 'post')
const t = 'DGCRANE 起重机——桥式/门式/悬臂起重机制造商'
const d = 'DGCRANE 起重机制造商与出口商：桥式起重机、门式起重机、悬臂起重机与电动葫芦，产品销往120多个国家。'
const seo = [
  `<link rel="canonical" href="${SITE_BASE}">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:title" content="${escAttr(t)}">`,
  `<meta property="og:description" content="${escAttr(d)}">`,
  `<meta property="og:url" content="${SITE_BASE}">`,
  `<meta property="og:locale" content="zh_CN">`,
].join('\n  ')
const body = wrap(
  [
    products.length ? listingSection(`产品（${products.length}）`, products.map(({ j }) => cardHtml(j))) : '',
    posts.length ? listingSection(`案例与文章（${posts.length}）`, posts.map(({ j }) => cardHtml(j))) : '',
  ].join('\n'),
  '起重机制造商和出口商',
  '10年以上起重机出口经验 · 产品销往120多个国家',
)
const [head, tail] = composeStatic(process.cwd(), { title: t, description: d, seo })
---
<Fragment set:html={head} />
<Fragment set:html={body} />
<Fragment set:html={tail} />
```

`site/src/pages/products/index.astro` 全文：

```astro
---
// 产品目录页（旧 buildDerivedPages products 分支平移）。
import { composeStatic } from '@src/static-chrome.mjs'
import { listedPages, cardHtml, listingSection, wrap, escAttr } from '@src/listing.mjs'
import { SITE_BASE } from '@src/i18n/kernel.mjs'

const products = listedPages().filter(p => p.j.page.type === 'product')
const t = '起重机产品目录 | DGCRANE'
const d = `DGCRANE 起重机产品目录：${products.map(p => p.j.page.title.split('|')[0].trim()).join('、')}。`
const seo = [
  `<link rel="canonical" href="${SITE_BASE}products/">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:title" content="${escAttr(t)}">`,
  `<meta property="og:description" content="${escAttr(d)}">`,
  `<meta property="og:url" content="${SITE_BASE}products/">`,
  `<meta property="og:locale" content="zh_CN">`,
].join('\n  ')
const body = wrap(listingSection('全部产品', products.map(({ j }) => cardHtml(j))), '产品目录', `共 ${products.length} 个产品`)
const [head, tail] = composeStatic(process.cwd(), { title: t, description: d, seo })
---
<Fragment set:html={head} />
<Fragment set:html={body} />
<Fragment set:html={tail} />
```

`site/src/pages/posts/index.astro` 全文：

```astro
---
// 案例与文章列表页（旧 buildDerivedPages posts 分支平移）。
import { composeStatic } from '@src/static-chrome.mjs'
import { listedPages, cardHtml, listingSection, wrap, escAttr } from '@src/listing.mjs'
import { SITE_BASE } from '@src/i18n/kernel.mjs'

const posts = listedPages().filter(p => p.j.page.type === 'post')
const t = '案例与文章 | DGCRANE'
const d = 'DGCRANE 起重机案例与技术文章列表。'
const seo = [
  `<link rel="canonical" href="${SITE_BASE}posts/">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:title" content="${escAttr(t)}">`,
  `<meta property="og:description" content="${escAttr(d)}">`,
  `<meta property="og:url" content="${SITE_BASE}posts/">`,
  `<meta property="og:locale" content="zh_CN">`,
].join('\n  ')
const body = wrap(listingSection('案例与文章', posts.map(({ j }) => cardHtml(j))), '案例与文章', `共 ${posts.length} 篇`)
const [head, tail] = composeStatic(process.cwd(), { title: t, description: d, seo })
---
<Fragment set:html={head} />
<Fragment set:html={body} />
<Fragment set:html={tail} />
```

- [ ] **Step 3: sitemap 收派生页**

`site/src/seo/kernel.mjs` 第 70 行 `sitemapXml` 改为（加第 4 参，默认空 = 现有调用零影响）：

```js
export function sitemapXml(groups, _pages, pubSet, extraLocs = []) {
  const rows = []
  for (const [, g] of groups) {
    const live = g.filter(m => pubSet.has(m.slug))
    for (const m of live)
      rows.push(['  <url>', `    <loc>${pageUrl(m)}</loc>`,
        ...live.map(s => `    <xhtml:link rel="alternate" hreflang="${escAttr(s.lang)}" href="${escAttr(pageUrl(s))}"/>`),
        '  </url>'].join('\n'))
  }
  for (const loc of extraLocs) rows.push(['  <url>', `    <loc>${loc}</loc>`, '  </url>'].join('\n'))
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n  xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + rows.join('\n') + '\n</urlset>\n'
}
```

`site/scripts/seo-emit.mjs` 两处改动：import 行加 `SITE_BASE`：

```js
import { scanPages, buildGroups, isPublishable, SITE_BASE } from '../src/i18n/kernel.mjs'
```

writeFileSync 那行改为：

```js
writeFileSync(join(site, out, 'sitemap.xml'), sitemapXml(groups, pages, pubSet, [SITE_BASE, SITE_BASE + 'products/', SITE_BASE + 'posts/']))
```

- [ ] **Step 4: 验证（accept-derived 全绿）**

```bash
cd site && npm run build && node scripts/accept-derived.mjs
```

预期：`10 过 / 0 挂`。再跑既有矩阵防回归：

```bash
cd site && npm run check && npm run accept:seo
```

预期全绿。**若 accept:seo 有 sitemap 条目数断言被新 3 行打破**：读失败断言更新数目（这是预期内变化）。

- [ ] **Step 5: commit**

```bash
git add site/src/listing.mjs site/src/pages/index.astro site/src/pages/products/index.astro site/src/pages/posts/index.astro site/src/seo/kernel.mjs site/scripts/seo-emit.mjs site/scripts/accept-seo.mjs
git commit -m "feat(site): 首页+产品/案例列表页平移（构建期派生），sitemap 收派生页"
```

### Task 6: geom 快照化（切断「新页 vs 旧 dist」活依赖）

旧 dist 删除后 geom 就瞎了——先把基准固化成随 git 走的快照。合并 geom-check/geom-post 两个比较器进一个脚本。

**Files:**
- Create: `site/scripts/geom-lib.mjs`
- Modify: `site/scripts/geom-check.mjs`（整体重写）
- Delete: `site/scripts/geom-post.mjs`
- Create: `site/geom-baseline/*.json`（--write 生成，10 页）

- [ ] **Step 0: 查 geom-post 引用**

```bash
grep -rn "geom-post" site/ --include="*.mjs" --include="*.json" --include="*.md" | grep -v node_modules
```

有引用的文件一并改/注。预期只有 package.json 无 script 登记（已查无），文档提及处更新。

- [ ] **Step 1: 写 geom-lib.mjs**

`site/scripts/geom-lib.mjs` 全文：

```js
// geom 共享件：内嵌静态服务（零依赖）+ 两套测量脚本（products 用坐标块，posts 用选择器）。
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.gif': 'image/gif', '.mp4': 'video/mp4', '.xml': 'application/xml', '.txt': 'text/plain' }

export function serveStatic(dir) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let fp = join(dir, normalize(url).replace(/^([/\\])+/, ''))
    if (!fp.startsWith(dir)) { res.writeHead(403); res.end(); return }
    if (url.endsWith('/')) fp = join(fp, 'index.html')
    let data
    try { data = readFileSync(fp) } catch { res.writeHead(404); res.end('not found'); return }
    res.writeHead(200, { 'content-type': MIME[extname(fp)] ?? 'application/octet-stream' })
    res.end(data)
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () =>
    resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })))
}

export const POST_SELECTORS = ['.toptitle h1', '.breadcrumb .crumb', '.breadcrumb .current', '.craneinfo', '.craneinfo > *', '.craneinfo img', '.craneinfo table', '.craneinfo tr', '#rank-math-toc', '.post-inquiry']

export const MEASURE_BLOCKS = `(()=>{const out=[];for(const el of document.querySelectorAll('[data-block-id]')){const r=el.getBoundingClientRect();out.push({id:el.getAttribute('data-block-id'),x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)});}return out})()`

export const MEASURE_POST = `(()=>{const out=[];for(const sel of ${JSON.stringify(POST_SELECTORS)}){document.querySelectorAll(sel).forEach((el,i)=>{const r=el.getBoundingClientRect();out.push({id:sel+'#'+i,x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)})})}return out})()`
```

- [ ] **Step 2: 重写 geom-check.mjs**

`site/scripts/geom-check.mjs` 整文件替换为：

```js
#!/usr/bin/env node
// 几何快照回归：新页（serve site/dist）vs 固化基准（geom-baseline/*.json）逐测点比包围盒，±2px。
// --write：从旧系统根 dist 采基准（一次性，旧 dist 删除前跑；此后基准只读、随 git 走）。
// 基准自描述（kind: blocks|post），产物页容「仅新」坐标增强，post 页容差外零增零缺——与旧两脚本判定语义一致。
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveStatic, MEASURE_BLOCKS, MEASURE_POST } from './geom-lib.mjs'

const site = join(dirname(fileURLToPath(import.meta.url)), '..')
const SNAP = join(site, 'geom-baseline')
const TOL = 2
// 采基准清单 = 旧 dist 与新 content 的交集页（派生页无坐标块，由 accept-derived 管，不在此列）。
const WRITE_LIST = [
  'products/single-girder-eot-cranes', 'products/overhead-cranes-for-sale', 'products/multi-point-suspension-cranes', 'products/free-standing-jib-cranes',
  'posts/32t-rail-mounted-container-gantry-crane-exported-to-russia', 'posts/5-ton-overhead-crane', 'posts/crane-lifting-safety-training', 'posts/gantry-cranes-for-sale',
  'en/posts/32t-rail-mounted-container-gantry-crane-exported-to-russia', 'en/posts/5-ton-overhead-crane',
]
const kindOf = slug => (slug.includes('posts/') ? 'post' : 'blocks')
const keyOf = slug => slug.replaceAll('/', '__') + '.json'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const measure = async (base, slug, kind) => {
  await page.goto(`${base}/${slug}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const boxes = await page.evaluate(kind === 'post' ? MEASURE_POST : MEASURE_BLOCKS)
  return Object.fromEntries(boxes.map(b => [b.id, { x: b.x, y: b.y, w: b.w, h: b.h }]))
}

if (process.argv.includes('--write')) {
  const oldDir = join(site, '..', 'dist')
  const old = await serveStatic(oldDir)
  mkdirSync(SNAP, { recursive: true })
  for (const slug of WRITE_LIST) {
    const boxes = await measure(old.url, slug, kindOf(slug))
    if (!Object.keys(boxes).length) { console.error(`❌ ${slug} 采到 0 测点——旧 dist 缺页或测量脚本失效，不写基准`); process.exit(1) }
    writeFileSync(join(SNAP, keyOf(slug)), JSON.stringify({ slug, kind: kindOf(slug), boxes }, null, 1) + '\n')
    console.log(`baseline ← ${slug}（${Object.keys(boxes).length} 测点）`)
  }
  await old.close(); await browser.close()
  console.log('✅ 基准固化完成：geom-baseline/ 随 git 提交，此后旧 dist 可删')
  process.exit(0)
}

const neo = await serveStatic(join(site, 'dist'))
let failed = 0
for (const f of readdirSync(SNAP).filter(f => f.endsWith('.json')).sort()) {
  const snap = JSON.parse(readFileSync(join(SNAP, f), 'utf8'))
  const B = snap.boxes
  const A = await measure(neo.url, snap.slug, snap.kind)
  const onlyA = Object.keys(A).filter(k => !B[k])
  const onlyB = Object.keys(B).filter(k => !A[k])
  const diffs = []
  for (const [id, a] of Object.entries(A)) {
    const b = B[id]; if (!b) continue
    const d = { x: a.x - b.x, y: a.y - b.y, w: a.w - b.w, h: a.h - b.h }
    if (Object.values(d).some(v => Math.abs(v) > TOL)) diffs.push({ id, d })
  }
  const pass = !diffs.length && !onlyB.length && (snap.kind === 'blocks' || !onlyA.length)
  console.log(`${pass ? '✅' : '❌'} ${snap.slug}：新 ${Object.keys(A).length} 测点 / 基准 ${Object.keys(B).length}${diffs.length ? `，超容差 ${diffs.length}` : ''}${onlyB.length ? `，缺 ${onlyB.length}` : ''}${onlyA.length && snap.kind === 'post' ? `，多 ${onlyA.length}` : ''}`)
  if (!pass) { failed = 1; for (const x of diffs.slice(0, 10)) console.log(`   ${x.id} Δx=${x.d.x} Δy=${x.d.y} Δw=${x.d.w} Δh=${x.d.h}`) }
}
await neo.close(); await browser.close()
process.exit(failed)
```

- [ ] **Step 3: 固化基准（旧 dist 还在，最后机会）**

```bash
cd site && npm run build && node scripts/geom-check.mjs --write
```

预期：10 行 `baseline ← …` + `✅ 基准固化完成`。**每行测点数必须非 0**（脚本已硬闸；products 页应几十到上百测点，posts 页十几到几十）。

- [ ] **Step 4: 快照回归验证**

```bash
cd site && node scripts/geom-check.mjs
```

预期：10 行全 ✅，退出码 0。

- [ ] **Step 5: 删 geom-post.mjs + commit**

```bash
cd site && git rm scripts/geom-post.mjs
git add scripts/geom-lib.mjs scripts/geom-check.mjs geom-baseline/
git commit -m "feat(site): geom 快照化——基准固化 geom-baseline/（10页），切断对旧 dist 的活依赖"
```

### Task 7: CI 切换到 site 矩阵

**Files:**
- Modify: `.nvmrc`（20→22）
- Modify: `.github/workflows/check.yml`（整体重写）

- [ ] **Step 1: .nvmrc**

```bash
echo "22" > .nvmrc
```

- [ ] **Step 2: 重写 check.yml**

`.github/workflows/check.yml` 全文：

```yaml
# CI 质量门（site 时代）：push/PR 即跑 site 构建 + 检查矩阵 + 几何快照回归。
# geom 用 runner 预装的 Google Chrome（playwright channel:'chrome' 自动找到 /usr/bin/google-chrome）。
name: check
on:
  push:
    branches: ["**"]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: site
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: site/package-lock.json
      - run: npm ci
      - name: 构建
        run: npm run build
      - name: 检查矩阵（registry + i18n2 + derived）
        run: npm run check
      - name: 机制验收
        run: npm run accept:writeback && npm run accept:burn && npm run accept:seo && npm run accept:drafts && npm run accept:content-diff && npm run accept:workbench
      - name: 8092 端到端
        run: npm run accept:poc5
      - name: 几何快照回归
        run: npm run geom
```

- [ ] **Step 3: 本地模拟 CI 全流程**

```bash
cd site && npm ci && npm run build && npm run check && npm run accept:writeback && npm run accept:burn && npm run accept:seo && npm run accept:drafts && npm run accept:content-diff && npm run accept:workbench && npm run accept:poc5 && npm run geom
```

预期：全绿。**已知 flake**：accept:poc5 的 `#edlToggle` 偶发超时（2026-08-24 记录），重跑即过；其测试污染（en 镜像/TM/.bak）跑完 `git checkout` 还原。

- [ ] **Step 4: commit + 推一次看真 CI**

```bash
git add .nvmrc .github/workflows/check.yml
git commit -m "ci: 质量门切换到 site 矩阵（node22 + build + 全验收 + geom 快照）"
git push
gh run watch
```

预期：远端 CI 绿。**若 accept:poc5/workbench 在 CI 因端口/时序挂**：先确认本地绿，再把该步挪为单独 job 或加重试——不许直接删步骤。

## Phase B：退役（再删）

### Task 8: pre-push 钩子改跑 site 检查

**Files:**
- Modify: `.githooks/pre-push`

- [ ] **Step 1: 重写**

`.githooks/pre-push` 全文：

```sh
#!/bin/sh
# G0 改动门：site 检查矩阵全绿（registry+i18n2+derived）+ geom 快照回归才许推送。
# 紧急绕行：git push --no-verify —— 显式留痕动作，事后必须补账（修掉或挂账）。
echo "[pre-push] site 检查（check + geom；绕行用 --no-verify）..."
npm --prefix site run check && npm --prefix site run geom
```

- [ ] **Step 2: 验证 + commit**

```bash
git add .githooks/pre-push
git commit -m "chore(hooks): pre-push 改跑 site 检查矩阵"
```

（下一次 push 自然生效；也可手动 `sh .githooks/pre-push` 验一遍。）

### Task 9: 根 package.json 瘦身为代理

**Files:**
- Modify: `package.json`（整体替换）
- Delete: `package-lock.json`（重新生成）

- [ ] **Step 1: 替换**

根 `package.json` 全文：

```json
{
  "name": "dgcrane-placement-system",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "build": "npm --prefix site run build",
    "edit": "npm --prefix site run edit",
    "workbench": "npm --prefix site run workbench",
    "check": "npm --prefix site run check",
    "geom": "npm --prefix site run geom",
    "prepare": "git config core.hooksPath .githooks || true"
  }
}
```

- [ ] **Step 2: 重生成 lock + 清旧依赖**

```bash
rm -rf node_modules package-lock.json && npm install
```

预期：prepare 钩子照常跑（输出 `core.hooksPath` 配置或无输出），lock 重新生成（几乎空）。`npm run check` 从根可调。

- [ ] **Step 3: commit**

```bash
git add package.json package-lock.json
git commit -m "chore: 根 package.json 瘦身为 site 代理（prepare 钩子保留）"
```

### Task 10: 删除旧系统

**前置确认（先跑，不满足就停手回报）**：

```bash
cd site && npm run check && npm run geom && ls geom-baseline/ | wc -l
```

预期：check/geom 全绿，geom-baseline 恰 10 个 json。**不绿不删。**

**Files:**
- Delete: `scripts/`（16 个旧脚本，git rm -r）
- Delete: `src/`（templates/fragments/layouts/i18n/content 全目录，git rm -r）
- Delete: `public/`（软链壳；先查 git 跟踪状态）
- Delete: `.i18n-events.jsonl`（根，git rm）
- Delete: `dist/`（未跟踪，rm -rf）

- [ ] **Step 1: 查 public/ 跟踪状态**

```bash
git ls-files public/ | head -5
```

空 → `rm -rf public/`；非空 → `git rm -r public/`。

- [ ] **Step 2: 删除**

```bash
git rm -r scripts src
git rm .i18n-events.jsonl
rm -rf dist
# public/ 按 Step 1 结果二选一
```

- [ ] **Step 3: 删后全量验证**

```bash
cd site && npm run build && npm run check && npm run geom && npm run accept:poc5 && npm run accept:workbench
```

预期：全绿——site 自包含（2026-08-24 素材归位已保证），删旧目录对它零影响。再确认没有活引用：

```bash
grep -rn "\.\./scripts\|\.\./src/\|\.\./public\|\.\./dist" site/src site/scripts site/workbench site/edit-layer --include="*.mjs" --include="*.js" | grep -v node_modules
```

预期：空（或仅注释提及，逐一人工确认无害）。

- [ ] **Step 4: commit**

```bash
git add -A
git commit -m "chore: 旧系统正式退役——scripts/src/dist/public/根i18n事件 全删（geom基准已快照化，CI/钩子已切site）"
```

### Task 11: CLAUDE.md 重写 + architecture.md 状态更新 + 对话记录

**Files:**
- Modify: `CLAUDE.md`（MD 时代 doctrine 作废重写）
- Modify: `site/docs/architecture.md`（§4 状态刷新）
- Create: `对话记录-2026-08-28-旧系统退役.md`

- [ ] **Step 1: CLAUDE.md 重写**

操作清单（精确到节）：

1. **§1 核心架构**整节替换为：

```markdown
## 1. 核心架构：JSON 内容 + Astro kit + 双界面

```
裸文章 → 【AI 烧制·烧一次】→ site/content/<type>/<id>.json（持久工件，落盘进 git，这才是资产）
JSON 内容 → 【代码装配·确定性,零 AI】→ Astro kit 渲染 → dist/
```

- **AI 负责**：把裸文章烧成合规 JSON（判断归类）；翻译节点出手翻字段。
- **代码负责**：渲染/写回/翻译流水线/SEO 头——确定性、可重现。
- **关键认知**：能脱离对话上下文还原页面的是 **JSON 内容文件**。上下文是耗材，JSON 是资产。
- **两个界面**：8092 编辑页（所见即所得改页面）、8090 工作台（翻译/SEO/烧制/收件箱）。**唯一管理界面是工作台，新管理功能只长在工作台里。**
- 全景导览（文件级）：`site/docs/architecture.md`。
```

2. **§2 引擎铁律**整节替换为：

```markdown
## 2. 引擎铁律：一个 render + 一个写回，通用、永不写死

| 层 | 是什么 | 几个 |
|---|---|---|
| 引擎 `site/src/render/render.mjs` + `site/edit-layer/edit-layer.js` + `site/src/writeback/` | 纯逻辑，**不认任何具体名字** | 永远 1 |
| 模版 kit `site/src/components/<type>s/<名>/` | 四件套：index.astro + meta.json + example.json + edit-contract.json | 每页族/每篇 post 1 |
| 内容 `site/content/**.json` | 内容真相 | 每页 1 |

**守这套，引擎就不会烂**：
1. **禁止在引擎里按字段名/产品名/段名写 `if` 分支或白名单表**。引擎判断只许靠：schema 声明（content-schema 注册表）+ 节点 type + edit-contract 声明。
2. **写回走契约**：可写字段 = 该页 kit 的 edit-contract.json 声明；未声明路径拒写；boolean/ensurePath 等类型行为由契约类型驱动。
3. **加新页族 = 加一套 kit（`kit-init` 升格），引擎零改动**；之后该族每页只写 JSON。
4. **body 树在编辑 commit 时缓存 TipTap getJSON()，保存永不 DOM 反解**；写回端点 normalizeTree → validateDoc → 落盘 → astro build。HTML→树方向的解析不存在。
5. 翻译骨架恒 ≡ 源树（run 制克隆回植），译文永远爆不了骨架。
```

3. **§3 用户工作流协议**整节替换为：

```markdown
## 3. 用户工作流协议

- **加页面**：工作台烧制台贴裸文/URL → 预览 → 落 draft → 8092 精修 → 发布。（或照旧给 AI：文章+产品名+slug。）
- **改页面**：`npm run edit` → 8092 所见即可编辑 → 发布走同一链（写回契约校验 → JSON 落盘 → 自动重翻 → 重建）。
- **翻译/SEO/体检**：`npm run workbench` → 8090。
- **用户不用碰**：JSON 结构、字段名、模版裁剪、术语表机制（发现译错补 `site/src/i18n/data/terms.zh-CN.en.json` 修一片）。
```

4. **§4 模版方针**整节替换为：

```markdown
## 4. 模版方针：一 astro 一模版 + 换站零改动（2026-08-14 拍定）

- 一 astro 一模版：配齐 index/meta/example/edit-contract 四件即入烧制可选列表（`kit-init` 升格）。
- 自己套自己；通用件不吞并；对不上就空着（缺席槽由守卫裁掉，逐字闸防编造）。
- **换站验收标准**：换站 = 只带模版套件 + 内容 JSON + 站点 chrome（site/src/chrome/），引擎/脚本零 diff。
```

5. **§5 MD 规范**整节删除（载体已换 JSON；schema 权威 = `site/src/content/schema.mjs` + 各 kit edit-contract）。

6. **§6 命令**整节替换为：

```markdown
## 6. 命令（都在 site/ 下；根 package.json 有同名代理）

| 命令 | 作用 |
|---|---|
| `npm run build` | 生产构建 dist/（astro build + link-assets + seo-emit + search-index；须 node ≥22） |
| `npm run edit` | 8092 所见即可编辑服务（写回走契约，保存自动抬戳+重翻+重建双产物） |
| `npm run workbench` | 一键起 8090 工作台 + 8092（唯一管理界面） |
| `npm run check` | registry 校验 + accept-i18n2 + accept-derived |
| `npm run geom` | 几何快照回归（对 geom-baseline/，±2px） |
| `npm run accept:*` | 各机制验收（poc5/writeback/burn/seo/drafts/content-diff/workbench/derived） |
```

7. **§7 铁律（结构）**：保留「结构只许存在于内容」一条，改写为：「**结构只许存在于 JSON 内容与 kit**：某产品多/少段只改 JSON；页面骨架只改 kit。改完必验：`npm run check` + `npm run geom`。」其余子条（#product 包裹等 MD 时代规则）删除。沟通记录条保留。

8. **§8 已知遗留**整节替换为：

```markdown
## 8. 已知遗留

- **表单后端仍是 mock**：站侧已接线（询盘 `/api/inquiry`、订阅 `/api/subscribe`），本地由 mock 接收器（`app/`，不入库）落收件箱；真实后端未定。**环境里挂着真实 AWS 凭证（账号 125131361182/aws-cn），未经用户明确指示，不要往这个真实账号创建任何云资源。**
- 个别素材缺失需补图；**历史大图未回压**（上传闸门已建，存量 3-4MB/张的图未处理，拖 LCP）。
- `robots.txt` 代码照产但**共存期不上传**（域名根归老 WordPress 管），整站切换后再接管。
- 导航大菜单/语言切换器里的分类与栏目链接仍指旧站 `https://www.dgcrane.com/zh/...` 绝对地址（那些页面未迁入，迁入后改相对路径）。
- **部署未接**：本仓库无 deploy workflow，dist 产物等待首次上线。
- 旧系统已退役（2026-08-28）：geom 基准 = `site/geom-baseline/` 快照；旧代码历史在 git。
```

9. **§9 真实页→模版转换规则**整节删除（MD 时代造模版规则；新规则 = §4 + kit-init）。

10. **决策日志**：全部历史条目保留（它们是历史），文末追加：

```markdown
- **2026-08-28** **旧系统正式退役（先补再删）**。补齐：free-standing-jib-cranes zh 源（孤儿 en 镜像复原）、404/搜索/首页/产品目录/案例列表五个派生页（`static-chrome.mjs` 静态 chrome 组装 + `listing.mjs` 卡片助手平移 + `search-index.mjs` 进双产物链）、sitemap 收派生页。断绳：geom 改快照回归（`geom-baseline/` 10 页固化，geom-post 并入 geom-check）、CI 切 site 矩阵（node22 + 全验收）、pre-push 改 site 检查、根 package.json 瘦身为代理。删除：根 `scripts/`、`src/`、`dist/`、`public/`、`.i18n-events.jsonl`。**此后仓库只有一个系统：site/**。MD 时代 doctrine（本文件旧 §2/§4/§5/§9）作废，以现行文件为准。架构导览落盘 `site/docs/architecture.md`。
```

- [ ] **Step 2: architecture.md §4 刷新**

`site/docs/architecture.md` §4 整节替换为：

```markdown
## 4. 当前状态（2026-08-28 旧系统退役后）

**仓库只有一个系统：site/**。根目录旧系统（MD 时代）已删除：派生页（404/搜索/首页/两列表页）已补齐进 site，geom 基准已快照化（`site/geom-baseline/`），CI/pre-push 已切 site 矩阵。

仍真实的缺口：
- **部署未接**：无 deploy workflow，dist 等待首次上线。
- 表单后端 mock（真后端未定，AWS 禁令见 CLAUDE.md §8）。
- 历史大图未回压；导航分类链接指旧站。

不再缺的：404 ✅、首页 ✅、站内搜索 ✅（search-index.json + /search/ 页）、free-standing-jib-cranes zh 源 ✅。
```

- [ ] **Step 3: 写对话记录**

`对话记录-2026-08-28-旧系统退役.md` 骨架：背景（用户「系统看不懂」→ 复杂度三笔账）→ 决策三点（搜索做全/先补再删/历史不动）→ 执行摘要（按任务列 commit 哈希）→ 偏差记录（执行中与计划的每一处出入及原因）→ 残留。

- [ ] **Step 4: commit**

```bash
git add CLAUDE.md site/docs/architecture.md 对话记录-2026-08-28-旧系统退役.md
git commit -m "docs: CLAUDE.md 重写（MD时代doctrine作废）+架构导览状态刷新+退役对话记录"
```

### Task 12: 终验矩阵

- [ ] **Step 1: 全量跑**

```bash
cd site
npm ci && npm run build
npm run check
npm run accept:writeback && npm run accept:burn && npm run accept:seo && npm run accept:drafts && npm run accept:content-diff && npm run accept:workbench && npm run accept:poc5
npm run geom
```

预期：全绿。

- [ ] **Step 2: 双界面冒烟**

```bash
cd site && npm run workbench &
# 浏览器或 curl 验：
curl -s http://localhost:8090/ | head -5          # 工作台首页 200
curl -s http://localhost:8092/products/single-girder-eot-cranes/ | grep -c "edl"   # 编辑页带编辑层
curl -s http://localhost:8092/ | head -3           # 新首页
curl -s "http://localhost:8092/search/?s=龙门" | grep -c search-results
kill %1
```

- [ ] **Step 3: push 确认 CI 绿**

```bash
git push && gh run watch
```

- [ ] **Step 4: 向用户报账**：逐任务实际结果（含偏差）、CI 链接、删除前后仓库文件数对比（`git ls-files | wc -l`）。

---

## Self-Review 记录（计划作者已跑）

- **Spec 覆盖**：用户三拍板 → 搜索做全=Task 4（+索引+接线）；先补再删=Phase A(Task1-7)→B(Task8-12) 顺序；历史不动=删除清单无 demo/design/docs/对话记录。发现的隐藏缺口 free-standing=Task 1；geom/CI/钩子三根绳=Task 6/7/8。
- **类型一致性**：`composeStatic(site, {lang,title,description,seo})` 返回 `[head, tail]`——404/search/index/两列表页五个调用方签名一致；`listedPages()` 返回 registry records（带 `.j`），三个页面都用 `p.j.page.type`/`cardHtml(j)` 解构一致；sitemapXml 第 4 参 `extraLocs` 默认 `[]` 不影响现有 accept-seo 调用。
- **风险点**：①Task 1 的 i18n_rev 配对（Step 3 有硬验证+修法）；②accept-seo 可能断言 sitemap 条目数（Task 5 Step 4 有处置）；③geom --write 测点数为 0 有硬闸；④accept 脚本硬编码页数（Task 1 Step 4 grep 兜底）；⑤ Astro `<script>` 打包坑已用 `is:inline` 规避；⑥旧搜索页 JS 的 `\\s+`→`\s+` 反转义已标注。
