# 站点工作台做实实施计划（转正 site/workbench + 单界面收编）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 design/admin-ui 三件套转正为 `site/workbench/`（唯一管理界面）：数据层读=正源直算（修断路径）、写=代理 8092 不变，新增 SEO 体检屏，退役烧制/翻译两块旧控制台，toast 占位清零。

**Architecture:** 工作台 server 直接 import `site/src` 正源模块（i18n/kernel、seo/kernel、pipeline）现算读数据——口径与 8092 恒一致，无抄本可断；所有写请求照旧代理 8092（单一写路径+串行构建链）。界面沿用 index.html 九屏骨架，加 s-seo 屏、删 s-editor 设计稿屏。

**Tech Stack:** 纯 Node ESM（零新依赖）、既有工作台 HTML/JS、验收走自起服务 + fetch 断言（node ≥20 可跑读侧；起 8092 需要 node ≥22，nvm v22.23.2）。

**Spec:** `docs/superpowers/specs/2026-08-26-workbench-design.md`（2026-08-26 拍板）。

---

## 零上下文工程师必读（全部实查带证据）

| # | 事实 | 证据 |
|---|---|---|
| F1 | 工作台三件套在 `design/admin-ui/`：index.html（1934 行九屏壳）、data.js（接线层：init() 并发拉 8 个 /api/* 逐屏 render）、server.mjs（只读 API + POST 代理 + 8092 探测）；另有 start.mjs（一键起 8090+8092）、editor.html（8092 跳板）、data.js 同目录 | `design/admin-ui/` ls；data.js:404-437 |
| F2 | **server.mjs 两处断/旧**：①TM/terms/config 读 `site/src/i18n/*.json`——2026-08-25 重构已挪 `src/i18n/data/`，现在返回空（tmTotal=0）；②scanContent 自带实现硬编码 en（hasEn）、不知门禁 | server.mjs:16-17,29-61,234-235 |
| F3 | 写代理完好：POST_PROXY 10 条（mirror/burn/burn-save/approve/translate/translate-all/config-save/terms-save/build/tm-save）+ /api/upload 透传 + GET /api/i18n-data 代理；8092 探测 pingEdit 5s | server.mjs:175-204,283-333 |
| F4 | index.html 屏切换：navTo(name) 显隐 `#s-<name>`、NAV_TITLES 出面包屑；data-nav 属性绑侧栏 | index.html:1783-1810,1767 |
| F5 | data.js 全局：`$()`/`esc()`/`fmtTime()`/`EDIT_BASE=\`${proto}//${hostname}:8092/\``、init() 拉数据后 renderDash/renderPages/renderI18n/renderMedia/renderPublish/renderSettings/renderInbox；toast() 在 index.html | data.js:5-18,404-437 |
| F6 | 术语写回函数已有：`postTerms(lock, mapArr)` POST /api/terms-save（锁词数组+映射数组→对象）；addLock/addTerm 走它 | data.js:527-533,534+ |
| F7 | 旧控制台退役目标（edit-server.mjs）：GET /__burn（:490-497，服务 burn-console.html+无 key 横幅）、GET /__i18n（:504-507，服务 i18n-console.html）、GET /__i18n/review/*（:555-601，内联审阅页）、GET /__i18n/review-data（:536-553，只被审阅页用）。**保留**：POST /__burn（:379）、/__burn-preview/:pid（:500）、/__templates、/__i18n/tm|config|terms|translate|translate-all|approve|pin-decide|data 全部 | edit-server.mjs 逐行 |
| F8 | accept-burn.mjs **零处**引用 /__burn HTML（只测 burn 库）——删 GET /__burn 不伤验收 | grep accept-burn.mjs 空 |
| F9 | :620 `workbenchUrl: process.env.WORKBENCH_URL \|\| '/__burn'` 编辑层注入的工作台入口链接——退役后默认值须指 8090 | edit-server.mjs:620 |
| F10 | 占位 toast 全集：data.js:203（锁词行 × 移除）、:208（映射行 编辑/删除）；index.html s-editor 设计稿屏（:847-990）及其尾随脚本的 langAdd/langMenu/langEnTab 演示 toast（:1900-1929）；页面/概览的「编辑/继续编辑」链 `/editor.html?p=`（pagesRow :95、renderDash 草稿行） | 逐行 |
| F11 | pin 批量端点已存在：POST `8092/__i18n/pin-decide` `{lang, decisions:[{pageId,field,action:'keep'|'refollow'}]}`；SEO 数据函数 `healthData(pages)`（seo/kernel）、`pinQueue(lang)`（pipeline）——工作台直算复用它们 | 2026-08-26 SEO 落地，accept-seo 16/16 |
| F12 | kernel 的 CONTENT() 等以 `process.cwd()` 为基——workbench server 必须**以 site 为 cwd** 启动（启动器/验收 spawn 都保证） | site/src/i18n/kernel.mjs:20 |
| F13 | node ≥22 才能起 8092（astro build）；工作台读侧 node 20 即可 | CLAUDE.md 2026-08-10 |

**路径约定**：本计划所有相对路径以仓库根为基；`design/admin-ui/` 全程不动（留档），**复制**进 `site/workbench/`。

---

### Task 1: 转正落位 + 启动器（spec W2）

**Files:**
- Create: `site/workbench/`（index.html、data.js、server.mjs 从 design/admin-ui 复制）
- Create: `site/scripts/workbench.mjs`
- Modify: `site/package.json`

- [ ] **Step 1: 复制三件套**

```bash
cd /Users/vue/Documents/websitere-placement-system
mkdir -p site/workbench
cp design/admin-ui/index.html design/admin-ui/data.js design/admin-ui/server.mjs site/workbench/
```

（editor.html 不复制——Task 6 直连 EDIT_BASE 替代；design/admin-ui/ 原样留档。）

- [ ] **Step 2: server.mjs 最小修正（端口参数化 + 路径锚 site）**

`site/workbench/server.mjs` 头部（:10-23 区域）改为：

```js
const HERE = dirnameOfThis();
function dirnameOfThis() {
  const u = new URL(".", import.meta.url);
  return fileURLToPath(u);
}
const SITE = resolve(HERE, "..");                  // site 根（cwd 基准的正源模块要求，F12）
const CONTENT = join(SITE, "content");
const I18N = join(SITE, "src", "i18n");            // Task 2 整体换正源 import，此处先保路径可算
const DIST = join(SITE, "dist");
const IMG = join(SITE, "public", "assets", "img");
const EVENTS = join(SITE, ".i18n-events.jsonl");
const INBOX = join(SITE, "..", "app", "mock-cloud", "inbox.jsonl");
const PORT = Number(process.env.WORKBENCH_PORT || 8090);
```

（:369 `server.listen(PORT, HOST ...)` 不变——PORT 已参数化。原文件里 `ROOT` 的其余引用：scanKits 的 `join(ROOT,"site","src",...)` 改 `join(SITE,"src",...)`；searchContent/usedMedia 的 CONTENT 引用不变名。）

- [ ] **Step 3: 启动器 `site/scripts/workbench.mjs`**

```js
#!/usr/bin/env node
// 工作台总入口：一条命令起全部服务（8090 工作台 + 8092 编辑服务），退出全停。
// 要求 node ≥22（8092 的 astro build 需要）。
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bindHost, accessUrls } from "../lan.mjs";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = bindHost("0.0.0.0");
const PORT = process.env.WORKBENCH_PORT || "8090";

const children = [
  { name: `工作台 ${PORT}`, proc: spawn(process.execPath, ["workbench/server.mjs"], { cwd: SITE, stdio: "inherit", env: { ...process.env, WORKBENCH_PORT: PORT } }) },
  { name: "编辑服务 8092", proc: spawn("npm", ["run", "edit"], { cwd: SITE, stdio: "inherit", shell: true }) },
];

const shutdown = () => {
  console.log("\n[总入口] 停止全部服务…");
  for (const { proc } of children) { try { proc.kill("SIGTERM"); } catch { /* 已退出 */ } }
  setTimeout(() => process.exit(0), 2000);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
for (const { name, proc } of children) proc.on("exit", (code) => console.log(`[总入口] ${name} 退出（code ${code}）`));
console.log("[总入口] 全部服务启动中 → 工作台 " + accessUrls(Number(PORT), "/", HOST).join("  ") + " · 编辑服务 " + accessUrls(8092, "/", HOST).join("  "));
```

- [ ] **Step 4: package.json 脚本**

`site/package.json` scripts 加：

```json
    "workbench": "node scripts/workbench.mjs",
    "accept:workbench": "node scripts/accept-workbench.mjs",
```

- [ ] **Step 5: 冒烟 + Commit**

```bash
cd site && WORKBENCH_PORT=8090 node scripts/workbench.mjs > /tmp/wb-smoke.log 2>&1 &
sleep 3
curl -s -o /dev/null -w '%{http_code}\n' localhost:8090/            # 预期 200
curl -s localhost:8090/api/pages | head -c 120; echo                 # 预期 JSON 数组
curl -s -o /dev/null -w '%{http_code}\n' localhost:8092/__i18n/data  # 预期 200（8092 同起）
kill %1 2>/dev/null; lsof -ti :8090 :8092 | xargs kill 2>/dev/null
```

```bash
git add site/workbench/index.html site/workbench/data.js site/workbench/server.mjs site/scripts/workbench.mjs site/package.json
git commit -m "feat(workbench): 三件套转正 site/workbench——启动器一键起 8090+8092"
```

---

### Task 2: 数据层正源化 + 验收脚本（spec §2，TDD）

**Files:**
- Create: `site/scripts/accept-workbench.mjs`
- Modify: `site/workbench/server.mjs`（读侧重写）

- [ ] **Step 1: 写验收脚本（此刻断言红——TM 路径断着）**

`site/scripts/accept-workbench.mjs`：

```js
#!/usr/bin/env node
// accept-workbench：工作台数据层验收——自起 workbench server（随机端口），断言 API 口径与正源一致。
// 只读直算不依赖 8092；写代理冒烟用「8092 未起 → 502」形态（真写在 accept-seo/poc5 覆盖）。
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { scanPages, buildGroups, isPublishable } from '../src/i18n/kernel.mjs'
import { healthData } from '../src/seo/kernel.mjs'
import { pinQueue } from '../src/i18n/pipeline.mjs'
import { loadConfig } from '../src/i18n/tm.mjs'

const PORT = process.env.WB_TEST_PORT || 8790
const base = `http://localhost:${PORT}`
const results = []
const ok = (name, cond, extra = '') => { results.push(!!cond); console.log(`${cond ? '  ✓' : '  ✗'} ${name}${extra ? ' — ' + extra : ''}`) }
const j = async (p, opts) => (await fetch(base + p, opts)).json()

const srv = spawn(process.execPath, ['workbench/server.mjs'], { cwd: process.cwd(), env: { ...process.env, WORKBENCH_PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] })
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('server 15s 未就绪')), 15000)
  const poll = async () => { try { const r = await fetch(base + '/api/overview'); if (r.ok) { clearTimeout(t); res() } else setTimeout(poll, 250) } catch { setTimeout(poll, 250) } }
  poll()
})

try {
  const expectPages = scanPages()
  const apiPages = await j('/api/pages')
  ok('① /api/pages 行数 = scanPages（口径一致）', Array.isArray(apiPages) && apiPages.length === expectPages.length, `${apiPages?.length ?? '?'}/${expectPages.length}`)
  ok('① 行含过门禁语言覆盖 langs', Array.isArray(apiPages) && apiPages.every(p => Array.isArray(p.langs)))

  const ov = await j('/api/overview')
  ok('② /api/overview TM 统计非空（断路径已修）', ov.tmTotal > 0, `tmTotal=${ov.tmTotal}`)

  const seo = await j('/api/seo-health')
  const rows = healthData(scanPages({ withJson: true }))
  const pins = Object.keys(loadConfig().review).flatMap(l => pinQueue(l))
  ok('③ /api/seo-health rows = healthData 直算', Array.isArray(seo.rows) && seo.rows.length === rows.length && seo.summary.flagged === rows.filter(r => r.issues.length).length, `${seo.rows?.length ?? '?'} 行 / 异常 ${seo.summary?.flagged}`)
  ok('③ pins = pinQueue 直算一致', Array.isArray(seo.pins) && seo.pins.length === pins.length, `${seo.pins?.length ?? '?'}`)

  ok('④ 语言覆盖非硬编码（镜像行数=族谱镜像行数）', apiPages.filter(p => p.langDir).length === expectPages.filter(p => p.langDir).length)

  const bad = await fetch(base + '/api/pin-decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: '../x', decisions: [] }) }).then(r => r.json()).catch(() => null)
  ok('⑤ 写代理活着（8092 未起→502 错误体）', bad && typeof bad.error === 'string', JSON.stringify(bad).slice(0, 60))
} finally { srv.kill('SIGTERM') }

const pass = results.filter(Boolean).length
console.log(`\naccept-workbench: ${pass}/${results.length}`)
process.exit(pass === results.length ? 0 : 1)
```

- [ ] **Step 2: 跑验收确认红**

Run: `cd site && node scripts/accept-workbench.mjs`
Expected: ② 红（tmTotal=0，断路径）、③ 红（无 /api/seo-health → rows undefined）、①④ 视 hasEn 兼容字段可能红。至少 ②③ 必红。

- [ ] **Step 3: 重写 server.mjs 读侧（正源直算）**

`site/workbench/server.mjs` 头部 import 区替换为：

```js
import http from "node:http";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { bindHost, accessUrls } from "../scripts/lan.mjs";
import { scanPages, buildGroups, isPublishable } from "../src/i18n/kernel.mjs";
import { loadTm, loadConfig } from "../src/i18n/tm.mjs";
import { loadTerms } from "../src/i18n/terms.mjs";
import { consoleData, pinQueue } from "../src/i18n/pipeline.mjs";
import { healthData } from "../src/seo/kernel.mjs";
```

删掉：`scanContent` 整函数、`writeFileSync/mkdirSync` import（读侧不写盘）、`const I18N = ...` 行。`readJson/readJsonSafe` 保留（distFacts/inbox 等还用）。

新增 pagesData（替代 scanContent，插在原位置）：

```js
// 页面清单（正源）：scanPages 全语言 + 门禁口径（与 8092 出页同一条规则）。
// hasEn 为兼容字段（data.js pagesRow 现渲染它），Task 6 换 langs 后删。
function pagesData() {
  const pages = scanPages({ withJson: true });
  const groups = buildGroups(pages);
  const pubSet = new Set(pages.filter(p => p.status === "published" && isPublishable(p, groups, pages)).map(p => p.slug));
  return pages.map(p => {
    const fam = (groups.get(p.pageId) || []).filter(m => pubSet.has(m.slug));
    return {
      pageId: p.pageId,
      type: p.type === "product" ? "products" : "posts",
      file: p.file, slug: p.slug,
      title: typeof p.j.title === "string" ? p.j.title : (p.j.page.title || p.pageId),
      family: p.j.page.family || "",
      status: p.status, lang: p.lang, langDir: p.langDir,
      langs: fam.map(m => m.lang),
      hasEn: fam.some(m => m.lang === "en"),
      publishable: pubSet.has(p.slug),
      mtime: statSync(join(SITE, "content", p.file)).mtimeMs,
    };
  });
}
```

`api` 表逐项替换：

```js
const api = {
  "/api/overview": () => {
    const pages = pagesData();
    const tm = loadTm("zh-CN", "en");
    const terms = loadTerms("zh-CN", "en");
    const sources = pages.filter(p => !p.langDir);
    const withMirror = sources.filter(p => pages.some(m => m.langDir && m.pageId === p.pageId));
    const enOf = pid => pages.find(m => m.langDir && m.pageId === pid);
    return {
      pages: sources.length,
      published: sources.filter(p => p.status === "published").length,
      draft: sources.filter(p => p.status === "draft").length,
      products: sources.filter(p => p.type === "products").length,
      posts: sources.filter(p => p.type === "posts").length,
      mirrors: withMirror.map(m => ({ pageId: m.pageId, title: m.title, status: m.status, enStatus: enOf(m.pageId)?.status ?? null })),
      mirrorless: sources.filter(p => !pages.some(m => m.langDir && m.pageId === p.pageId)).length,
      tmTotal: Object.keys(tm.sentences).length,
      tmApproved: Object.values(tm.sentences).filter(s => s.status === "approved").length,
      termsMap: Object.keys(terms.map || {}).length,
      termsLock: (terms.lock || []).length,
      dist: distFacts(),
      editAlive,
      events: recentEvents(5),
    };
  },
  "/api/pages": () => pagesData(),
  "/api/terms": () => {
    const t = loadTerms("zh-CN", "en");
    return { lock: t.lock || [], map: Object.entries(t.map || {}).map(([zh, en]) => ({ zh, en })) };
  },
  "/api/tm": () => {
    const tm = loadTm("zh-CN", "en");
    const items = Object.values(tm.sentences).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    return { pair: tm.pair, total: items.length, items: items.slice(0, 300) };
  },
  "/api/config": () => loadConfig(),
  "/api/templates": () => scanKits(),
  "/api/seo-health": () => {
    const rows = healthData(scanPages({ withJson: true }));
    const pins = Object.keys(loadConfig().review).flatMap(l => pinQueue(l));
    return { ok: true, rows, pins, summary: { pages: rows.length, flagged: rows.filter(r => r.issues.length).length, pinsPending: pins.length } };
  },
  "/api/media": () => {
    const items = mediaList().sort((a, b) => b.mtime - a.mtime);
    return { total: 0, items, used: usedMedia(items) };
  },
  "/api/search": (q) => searchContent(q || ""),
  "/api/inbox": () => inboxList(),
};
```

POST_PROXY 加一条（:193-204 区域）：

```js
  "/api/pin-decide": "/__i18n/pin-decide",
```

注意：`/api/i18n-data` GET 代理（:328-333）保留不动——其正源即 8092 内 consoleData（同模块直算，口径不分叉）。scanKits 内 `join(ROOT, "site", ...)` 已在 Task 1 改为 `join(SITE, "src", ...)`。

- [ ] **Step 4: 跑验收确认绿**

Run: `cd site && node scripts/accept-workbench.mjs`
Expected: 5/5 全绿。

- [ ] **Step 5: Commit**

```bash
git add site/workbench/server.mjs site/scripts/accept-workbench.mjs
git commit -m "feat(workbench): 数据层正源化——读直算 import 正源（修 TM 断路径+门禁口径），/api/seo-health + pin-decide 代理"
```

---

### Task 3: SEO 体检屏（spec §3，抄 Yoast Overview）

**Files:**
- Modify: `site/workbench/index.html`（侧栏项、NAV_TITLES、新屏 section）
- Modify: `site/workbench/data.js`（SEO 状态 + render/bind + init 挂载）

- [ ] **Step 1: index.html 三处**

① 侧栏「发布」组、多语言项之后（:568 后）加：

```html
        <div class="nav-item" data-nav="seo"><svg><use href="#i-eye"/></svg><span>SEO 体检</span><span class="nav-badge" id="navCountSeo" style="display:none"></span></div>
```

② NAV_TITLES（:1767 起）加一行：

```js
  seo:["发布","SEO 体检"],
```

③ `s-i18n` 的 `</section>`（:1490 附近）与 `<!-- ============ 屏 · 媒体库 ============ -->`（:1496）之间插入：

```html
        <!-- ============ 屏 · SEO 体检 ============ -->
        <section class="screen" id="s-seo" hidden>
          <div class="screen-head">
            <div>
              <h1>SEO 体检</h1>
              <p class="sub">一行=一篇逻辑页 · 异常机器算（长度/缺失/noindex/pin 待确认）· 数据与构建同源，无人工登记</p>
            </div>
            <div class="head-actions">
              <button class="btn btn-secondary" id="seoShowAll"><svg><use href="#i-list"/></svg>显示全部</button>
              <button class="btn btn-ghost" onclick="pinDecideAll('keep')"><svg><use href="#i-check"/></svg>全部保持</button>
              <button class="btn btn-primary" onclick="pinDecideAll('refollow')"><svg><use href="#i-spark"/></svg>全部重跟</button>
            </div>
          </div>
          <div class="stats-strip" id="seoStats"></div>
          <div class="table-card">
            <table class="table">
              <thead><tr><th style="width:34%">页面</th><th>语言</th><th>标题长度</th><th>简介长度</th><th>旗</th><th style="width:80px"></th></tr></thead>
              <tbody id="seoTbody"></tbody>
            </table>
          </div>
        </section>
```

（`.table-card`/`.table` 类名若与页内既有表格容器不一致，照 s-pages 屏的表格容器写法对齐——以能吃到既有样式为准；不一致时直接用 s-pages 的容器类名。）

- [ ] **Step 2: data.js 三段**

① 文件头部全局区（:36 `bound` 附近）加：

```js
let SEO = { rows: [], pins: [], summary: { pages: 0, flagged: 0, pinsPending: 0 } };
const seoState = { showAll: false };
```

② renderI18n 之后加 SEO 渲染段：

```js
/* ============ SEO 体检屏 ============ */
const SEO_FLAG = { "title-missing": "标题缺失", "title-overlength": "标题超长", "description-missing": "简介缺失", "description-overlength": "简介超长", "noindex": "未收录", "noindex-manual": "已关收录" };
function seoAgg() {
  const by = new Map();
  for (const r of SEO.rows) {
    const g = by.get(r.pageId) || { pageId: r.pageId, langs: [], flags: [], pinCount: 0 };
    g.langs.push(r.lang);
    for (const i of r.issues) if (!g.flags.includes(i)) g.flags.push(i);
    by.set(r.pageId, g);
  }
  for (const p of SEO.pins) { const g = by.get(p.pageId); if (g) g.pinCount++; }
  return [...by.values()];
}
function seoTitle(pageId) {
  const p = PAGES.find(x => x.pageId === pageId && !x.langDir) || PAGES.find(x => x.pageId === pageId);
  return p ? p.title : pageId;
}
function drawSeo() {
  if ($("seoStats")) $("seoStats").innerHTML = `
    <div class="sstat"><div class="v">${SEO.summary.pages}<span class="u">页</span></div><div class="l">全站逻辑页</div></div>
    <div class="sstat"><div class="v">${SEO.summary.flagged}<span class="u">页</span></div><div class="l">体检异常（长度/缺失/收录）</div></div>
    <div class="sstat"><div class="v">${SEO.summary.pinsPending}<span class="u">条</span></div><div class="l">人稿待确认（源已变·顶住中）</div></div>`;
  const badge = $("navCountSeo");
  if (badge) { const n = SEO.summary.flagged + SEO.summary.pinsPending; badge.textContent = n; badge.style.display = n ? "" : "none"; }
  const btn = $("seoShowAll");
  if (btn) btn.innerHTML = seoState.showAll ? "只显异常" : "显示全部";
  const rows = seoAgg();
  const show = seoState.showAll ? rows : rows.filter(g => g.flags.length || g.pinCount);
  if ($("seoTbody")) $("seoTbody").innerHTML = show.map(g => {
    const detail = SEO.rows.filter(r => r.pageId === g.pageId);
    const pins = SEO.pins.filter(p => p.pageId === g.pageId);
    return `<tr>
      <td><div class="t-title">${esc(seoTitle(g.pageId))}</div><div class="t-sub">${esc(g.pageId)}</div></td>
      <td>${g.langs.map(l => `<span class="tag">${esc(l)}</span>`).join(" ")}</td>
      <td class="mono" style="font-size:12px">${detail.map(r => r.titleLength > 60 ? `<span style="color:var(--bad)">${r.titleLength}</span>` : r.titleLength).join(" / ")}</td>
      <td class="mono" style="font-size:12px">${detail.map(r => r.descriptionLength > 160 ? `<span style="color:var(--bad)">${r.descriptionLength}</span>` : r.descriptionLength).join(" / ")}</td>
      <td>${g.flags.map(f => `<span class="pill pill-warn">${SEO_FLAG[f] || esc(f)}</span>`).join(" ")}${g.pinCount ? ` <span class="pill pill-bad">待确认 ${g.pinCount}</span>` : ""}</td>
      <td><button class="btn btn-sm btn-ghost" onclick="seoToggle('${esc(g.pageId)}')">展开</button></td>
    </tr>
    <tr id="seoDetail-${esc(g.pageId)}" hidden><td colspan="6" style="background:var(--surface-2)">
      ${detail.map(r => `<div style="display:flex;gap:10px;align-items:center;padding:4px 8px"><span class="tag">${esc(r.lang)}</span><a class="btn btn-sm btn-ghost" href="${EDIT_BASE}${esc(r.slug)}/" target="_blank">编辑</a><span style="font-size:12px;color:var(--ink-2)">标题 ${r.titleLength} · 简介 ${r.descriptionLength}</span>${r.issues.map(i => `<span class="pill pill-warn">${SEO_FLAG[i] || esc(i)}</span>`).join(" ")}</div>`).join("")}
      ${pins.map(p => `<div style="display:flex;gap:10px;align-items:center;padding:4px 8px;border-top:1px dashed var(--line)"><span class="tag">${esc(p.lang)}</span><span class="mono" style="font-size:11px;color:var(--ink-3)">${esc(p.field)}</span><span style="font-size:12px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">源已改「${esc(p.sourceText.slice(0, 36))}」· 人稿顶住「${esc(p.pinnedText.slice(0, 36))}」</span><button class="btn btn-sm btn-ghost" onclick="pinDecideOne('${esc(p.pageId)}','${esc(p.field)}','${esc(p.lang)}','keep')">保持</button><button class="btn btn-sm btn-danger" onclick="pinDecideOne('${esc(p.pageId)}','${esc(p.field)}','${esc(p.lang)}','refollow')">重跟</button></div>`).join("")}
    </td></tr>`;
  }).join("") || `<tr><td colspan="6" style="color:var(--ok);padding:22px;text-align:center">✓ 没有异常——全站体检通过</td></tr>`;
}
function seoToggle(pageId) { const el = $("seoDetail-" + pageId); if (el) el.hidden = !el.hidden; }
async function postPinDecisions(action, list) {
  if (!list.length) { toast("没有待确认项"); return; }
  if (action === "refollow" && !confirm(`将 ${list.length} 条人稿改为跟源重翻（会产生翻译花费）——确认？`)) return;
  const byLang = new Map();
  for (const p of list) { if (!byLang.has(p.lang)) byLang.set(p.lang, []); byLang.get(p.lang).push({ pageId: p.pageId, field: p.field, action }); }
  let kept = 0, refollowed = 0, retranslated = 0, err = null;
  for (const [lang, decisions] of byLang) {
    const r = await fetch("/api/pin-decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang, decisions }) }).then(x => x.json()).catch(() => ({ error: "请求失败" }));
    if (r.ok) { kept += r.kept || 0; refollowed += r.refollowed || 0; retranslated += r.retranslated || 0; } else err = r.error || "未知";
  }
  toast(err ? "失败：" + err : `${action === "keep" ? "已保持人稿（旗已清）" : "已重跟源"}：保持 ${kept} · 重跟 ${refollowed} · 重译 ${retranslated} 句`);
  init();
}
async function pinDecideOne(pageId, field, lang, action) { await postPinDecisions(action, [{ pageId, field, lang }]); }
async function pinDecideAll(action) { await postPinDecisions(action, SEO.pins); }
```

③ init()（:404）：`Promise.all` 数组加第 9 项 `j("/api/seo-health")`，解构加 `s`，赋值区加 `SEO = s || SEO;`，渲染调用区加 `drawSeo();`（renderDash 之后）。文件尾 window 导出区（:802 附近）加：

```js
window.seoToggle = seoToggle; window.pinDecideOne = pinDecideOne; window.pinDecideAll = pinDecideAll;
```

④ `seoShowAll` 绑定（init 内、渲染调用之前一次性绑）：

```js
  const sw = $("seoShowAll");
  if (sw && !bound.seo) { bound.seo = true; sw.addEventListener("click", () => { seoState.showAll = !seoState.showAll; drawSeo(); }); }
```

（`bound` 对象加 `seo: false` 键。）

- [ ] **Step 3: 冒烟验证（node22 起真服务）**

```bash
cd site && export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" && npm run workbench > /tmp/wb-t3.log 2>&1 &
sleep 4
curl -s localhost:8090/api/seo-health | python3 -c "import json,sys; d=json.load(sys.stdin); print('summary:', d['summary'])"
curl -s localhost:8090/ | grep -c 's-seo'          # 预期 ≥1（屏 section 在）
curl -s localhost:8090/ | grep -c 'data-nav="seo"' # 预期 1
lsof -ti :8090 :8092 | xargs kill 2>/dev/null
node scripts/accept-workbench.mjs
```

Expected: summary 与 Task 2 直算一致；grep 命中；accept-workbench 仍 5/5。（浏览器人工过屏在 Task 7。）

- [ ] **Step 4: Commit**

```bash
git add site/workbench/index.html site/workbench/data.js
git commit -m "feat(workbench): SEO 体检屏——异常行表/语言明细/pin 批量保持与重跟（抄 Yoast Overview 形态）"
```

---

### Task 4: 概览汇总卡 + 设置屏旧 SEO 基址清除（spec §3）

**Files:**
- Modify: `site/workbench/data.js`（renderDash 加卡）
- Modify: `site/workbench/index.html`（设置屏 :1706）

- [ ] **Step 1: renderDash 的 dashTodo rows 顶部插入 SEO 卡**

`renderDash`（data.js:41）`if ($("dashTodo"))` 块内、`const rows = [];` 之后加：

```js
    const seoBad = (SEO.summary.flagged || 0) + (SEO.summary.pinsPending || 0);
    if (seoBad > 0)
      rows.push(`<div class="todo-row"><div class="todo-main"><div class="t">SEO 体检：${SEO.summary.flagged} 页异常 · ${SEO.summary.pinsPending} 条人稿待确认</div><div class="s">标题超长会被谷歌截断 · 待确认=源已改而人稿顶住中</div></div><span class="pill pill-warn"><span class="dot"></span>${seoBad}</span><button class="btn btn-sm btn-secondary" onclick="navTo('seo')">去体检</button></div>`);
```

（SEO 已在 init 里先于 renderDash 赋值——Task 3 保证。）

- [ ] **Step 2: 设置屏删旧「SEO 基址」输入框**

index.html :1706 该行整块 field div 删除，原位换成说明行：

```html
                  <div class="field w-full"><label>SEO 基址</label><div class="help" style="padding:8px 0">内置于代码常量（中文住根，2026-08-26 D1）——canonical/sitemap 全站一致；换站改 <span class="mono">src/i18n/kernel.mjs</span> 的 SITE_ROOT 即全站生效（冒烟已验证）。</div></div>
```

- [ ] **Step 3: 验证 + Commit**

```bash
cd site && node scripts/accept-workbench.mjs   # 仍 5/5
curl -s localhost:8090/ >/dev/null 2>&1 || (export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" && npm run workbench > /tmp/wb-t4.log 2>&1 & sleep 4)
curl -s localhost:8090/ | grep -c 'SEO 基址'   # 预期 1（说明行）
lsof -ti :8090 :8092 | xargs kill 2>/dev/null
```

```bash
git add site/workbench/data.js site/workbench/index.html
git commit -m "feat(workbench): 概览 SEO 汇总卡 + 设置屏旧 SEO 基址输入框换常量说明"
```

---

### Task 5: 退役旧控制台（spec W4/§6）

**Files:**
- Modify: `site/scripts/edit-server.mjs`（删 4 条 GET 路由 + workbenchUrl 默认值）
- Delete: `site/edit-layer/burn-console.html`、`site/edit-layer/i18n-console.html`

- [ ] **Step 1: 删 edit-server 四条只读路由**

① GET `/__burn`（:490-497，读 burn-console.html + 无 key 横幅）整块删。
② GET `/__i18n`（:504-507，读 i18n-console.html）整块删。
③ GET `/__i18n/review-data`（:536-553）整块删（只被审阅页用，grep 证：edit-server 自身 + i18n-console 之外零引用）。
④ GET `/__i18n/review/*`（:555-601，内联审阅页 HTML）整块删。
**保留**：POST `/__burn`（:379）、`/__burn-preview/:pid`（:500）、`/__templates`、全部 `/__i18n/*` 写/数据端点、`/__seo/health`。

- [ ] **Step 2: workbenchUrl 默认指工作台**

:620 一行改为（req 在作用域内——该行就在页面请求处理器里）：

```js
          workbenchUrl: process.env.WORKBENCH_URL || `http://${(req.headers.host || `localhost:${EDIT_PORT}`).replace(/:8092$/, "")}:8090/`,
```

（EDIT_PORT 若非现成常量则用字面量 `:8092`；host 无端口时不追加——局域网 IP 访问自动同主机跳 8090。）

- [ ] **Step 3: 删两份旧控制台 HTML**

```bash
git rm site/edit-layer/burn-console.html site/edit-layer/i18n-console.html
```

- [ ] **Step 4: 验证（起 8092 断言 404/200 分野）**

```bash
cd site && node --check scripts/edit-server.mjs && export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH" && npm run edit > /tmp/wb-t5.log 2>&1 &
sleep 4
curl -s -o /dev/null -w '%{http_code} /__burn GET\n' localhost:8092/__burn            # 预期 404
curl -s -o /dev/null -w '%{http_code} /__i18n GET\n' localhost:8092/__i18n             # 预期 404
curl -s -o /dev/null -w '%{http_code} /__i18n/data\n' localhost:8092/__i18n/data       # 预期 200（保留）
curl -s -X POST localhost:8092/__i18n/pin-decide -H 'content-type: application/json' -d '{"lang":"!!","decisions":[]}' -o /dev/null -w '%{http_code} pin-decide\n'  # 预期 400（端点活，校验拦）
curl -s localhost:8092/products/single-girder-eot-cranes/ | grep -o 'http://[^"]*:8090/' | head -1   # 预期工作台链接注入
lsof -ti :8092 | xargs kill 2>/dev/null
```

- [ ] **Step 5: Commit**

```bash
git add site/scripts/edit-server.mjs site/edit-layer/
git commit -m "feat(workbench): 退役烧制/翻译旧控制台——HTML 路由与审阅页删除，POST 端点全保留；编辑层工作台入口指 8090"
```

---

### Task 6: 占位清零（spec §5）

**Files:**
- Modify: `site/workbench/data.js`（术语行内编辑/删除接真、编辑链接直连 8092、pagesRow 用 langs）
- Modify: `site/workbench/index.html`（删 s-editor 设计稿屏 + 其尾随演示脚本）

- [ ] **Step 1: 术语表行内接活（data.js drawTerms :199-214）**

锁词 × 按钮与映射行 编辑/删除 换成真调用（postTerms 已有，:527）：

```js
  if ($("lockRows")) $("lockRows").innerHTML = lockHit.map((w) => `<div class="lrow"><span>${esc(w)}</span><button class="x" title="移除" onclick="lockDel('${esc(w)}')">×</button></div>`).join("") || `<div class="lrow" style="color:var(--ink-3);justify-content:center">无匹配</div>`;
  if ($("mapTbody")) $("mapTbody").innerHTML = mapHit.map((t) => `
    <tr>
      <td style="font-weight:550">${esc(t.zh)}</td>
      <td style="color:var(--ink-2)">${esc(t.en)}</td>
      <td><div class="cell-actions"><button class="btn btn-sm btn-ghost" onclick="termEdit('${esc(t.zh)}')">编辑</button><button class="btn btn-sm btn-danger" onclick="termDel('${esc(t.zh)}')">删除</button></div></td>
    </tr>`).join("") || `<tr><td colspan="3" style="color:var(--ink-3);padding:18px">无匹配</td></tr>`;
```

函数（postTerms 之后加）+ window 导出：

```js
function lockDel(w) { if (!confirm(`移除锁词「${w}」？`)) return; postTerms(TERMS.lock.filter(x => x !== w), TERMS.map); }
function termDel(zh) { if (!confirm(`删除译法「${zh}」？`)) return; postTerms(TERMS.lock, TERMS.map.filter(t => t.zh !== zh)); }
function termEdit(zh) {
  const t = TERMS.map.find(x => x.zh === zh); if (!t) return;
  const en = prompt("英文译法：", t.en); if (en === null || !en.trim()) return;
  postTerms(TERMS.lock, TERMS.map.map(x => x.zh === zh ? { zh, en: en.trim() } : x));
}
```

- [ ] **Step 2: 编辑链接直连 8092、pagesRow 语言列用 langs**

data.js pagesRow（:84-97）：`p.hasEn ? ...` 列换 `${(p.langs || []).map(l => `<span class="tag">${esc(l === "zh-CN" ? "中" : esc(l))}</span>`).join(" ")}`；编辑按钮 `href="/editor.html?p=..."` 换 `href="${EDIT_BASE}${esc(slugOf(p))}/"`。
renderDash 草稿行「继续编辑」同样换 `href="${EDIT_BASE}${esc(slugOf(p))}/"`。

- [ ] **Step 3: 删 s-editor 设计稿屏**

index.html：`<!-- ============ 屏 3 · 页面编辑器 ============ -->`（:846）至其 `</section>`（:990）整段删除；尾随 `<script>` 里 langAdd/langMenu/langEnTab 三段演示绑定（:1900-1929）删除；NAV_TITLES 里 editor 条目（如有）删除。**编辑功能不丢**：页面屏每行「编辑」直开 8092 页面即编辑器（本就是它）。

- [ ] **Step 4: 断言占位清零**

```bash
cd site
grep -rn '待接' workbench/ && echo '仍有占位' || echo '✓ 待接=0'
grep -rn 'editor.html' workbench/ && echo '仍有跳板引用' || echo '✓ editor.html=0'
grep -c 's-editor' workbench/index.html   # 预期 0
node scripts/accept-workbench.mjs          # 仍 5/5
```

（server.mjs 兼容字段 hasEn 此时已无消费方，顺手从 pagesData 删掉。）

- [ ] **Step 5: Commit**

```bash
git add site/workbench/data.js site/workbench/index.html site/workbench/server.mjs
git commit -m "feat(workbench): 占位清零——术语行内编辑/删除接 terms-save、编辑直连 8092、删 s-editor 设计稿屏"
```

---

### Task 7: 全量验收 + 人工过屏（spec §7）

**Files:** 无新改动（验证任务）

- [ ] **Step 1: 自动矩阵**

```bash
cd site && export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
node scripts/accept-workbench.mjs      # 5/5
npm run check                          # registry + i18n2 84/84
npm run accept:seo                     # 16/16
npm run accept:burn                    # 155/155（F8：不碰 /__burn HTML）
npm run accept:writeback               # 34/34
npm run build                          # 15 页 + sitemap/robots（确认 SEO 链未被 edit-server 改动所伤）
```

- [ ] **Step 2: accept:poc5（8092 已改路由，必回归）**

```bash
npm run workbench > /tmp/wb-t7.log 2>&1 &
sleep 4 && npm run accept:poc5        # 56/56（poc5 只打页面/编辑链，不打退役路由）
lsof -ti :8090 :8092 | xargs kill 2>/dev/null
```

若 poc5 引用了被删路由（grep `scripts/accept-poc5.mjs` 含 `/__burn\|/__i18n'` 先核）——实测它只打页面与 /__save 链，预期直过；万一命中则按「HTML 路由已退役」语义改测试打新去处，不允许复活路由。

- [ ] **Step 3: 人工过屏手续（用户执行，spec §7.8）**

```bash
cd site && npm run workbench
```

浏览器开 8090：①概览有 SEO 汇总卡且数字=SEO 屏；②SEO 体检默认只显异常（现存量 8 页英文超长）、「显示全部」切换；③展开行「编辑」新开 8092 编辑页；④多语言屏数字与 8092 直开一致；⑤烧制屏贴一段裸文走通（有 key 时）；⑥页面屏「编辑」直开 8092；⑦侧栏不再有旧控制台入口（本来就没有）。

- [ ] **Step 4: Commit（如有微调）**

---

### Task 8: 收口（CLAUDE.md + spec 状态）

**Files:**
- Modify: `CLAUDE.md`（决策日志追加）
- Modify: `docs/superpowers/specs/2026-08-26-workbench-design.md`（状态行翻「已落地」+ 实施偏差如有）

- [ ] **Step 1: CLAUDE.md 决策日志追加**

```markdown
- **2026-08-26（晚）** **工作台做实转正（spec 2026-08-26，方向 A；用户拍定单界面收编：「以后只有一个界面就是目前这个 admin 中的，其他的都不要」）**。design/admin-ui 三件套复制转正 `site/workbench/`（原目录留档）；`npm run workbench` 一键起 8090+8092。**数据层正源化**：读=直算 import 正源（scanPages 门禁口径、loadTm/loadTerms/loadConfig、healthData/pinQueue/consoleData——修掉 8-25 重构漏改的 TM 断路径，消灭「隔离侧抄本」病根）；写=照旧全代理 8092（单一写路径+串行链），新增 /api/pin-decide。**SEO 体检屏**（抄 Yoast Overview）：一行=一逻辑页、默认只显异常、行展开语言明细+pin 单条/批量保持与重跟、概览汇总卡、侧栏徽章。**退役**：烧制台 /__burn、翻译台 /__i18n（含审阅页 /__i18n/review、review-data）四条 HTML 路由删、两份 console html 删——POST/数据端点全保留（工作台代理依赖）；改句子=镜像页就地改+收养（同日接线），failed=工作台重送。**占位清零**：术语行内编辑/删除接 terms-save、编辑链接直连 8092（删 editor.html 跳板）、删 s-editor 设计稿屏。编辑层 workbenchUrl 默认指 8090。验收 accept-workbench 5/5 + 全矩阵回归（check 84/84、seo 16/16、burn 155/155、writeback 34/34、poc5 56/56、build 15 页）。**残留**：媒体库/搜索仍 server 自带实现（无正源模块）；询盘收件箱读 mock 后端（真后端未定）；工作台无鉴权（本机/局域网定位，上公网前必须加）。
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-08-26-workbench-design.md
git commit -m "docs(workbench): 决策日志+spec 收口——工作台转正单界面落地"
```

---

## Self-Review 记录（计划自检，执行者不必重跑）

1. **Spec 覆盖**：W1 收尾式→T1-T8 全列；W2 转正→T1；W3 抄 Yoast→T3/T4；W4 单界面收编→T5（退役）+T6（编辑直连）；W5 读直算写代理→T2；§3 SEO 屏→T3/T4；§5 占位清零→T6（grep 断言）；§6 退役施工→T5；§7 验收 9 条→T2（1-5）+T6（7）+T7（6/8/9）；§8 已知限制→T8 残留清单。无漏项。
2. **占位符扫描**：所有代码块完整；无 TBD/TODO；T3 表格容器类名给了对齐规则（若 .table-card 不在则照 s-pages 容器写法）——这是显式对齐指令非占位。
3. **类型一致性**：`pagesData()` 产物（langs/hasEn/publishable）与 data.js pagesRow 消费对齐（T2 兼容字段 hasEn、T6 切 langs 后删）；`postPinDecisions(list)` 元素形状 `{pageId, field, lang}` 与 /__i18n/pin-decide 的 decisions（多带 action）一致；accept-workbench 的 `bound.seo` 与 data.js bound 对象形状一致。
4. **执行风险**：①edit-server :620 的 EDIT_PORT 字面量需现场核（该文件 8092 以字面量出现）；②accept:poc5 若意外依赖被删路由，按退役语义改测试不改路由；③`.table-card` 类名以 index.html 实际样式清单为准对齐。
