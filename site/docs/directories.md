# 目录手册（site/ 全仓）

> 目的：按**目录**查——每个目录干什么、**什么时候被执行**、里面的逻辑一句话。
> 按**流程**读（内容→界面→修改→翻译→SEO 的旅程）请看 `architecture.md`；两本互补。
> 事实基准：2026-08-29 实际清点，非设计意图。路径相对 `site/`（标注「根」的在仓库根）。

---

## 0. 一张触发地图（谁在什么时候被执行）

```
你敲 npm run workbench ──→ scripts/workbench.mjs 起两个常驻服务（8090 + 8092）
你开浏览器改页面(8092) ──→ edit-layer/edit-layer.js（被注入页面）→ 点「发布」POST /__save
                            → scripts/edit-server.mjs 保存链 → 自动重翻 + 自动 build
你敲 npm run build ──────→ astro（src/pages 路由 + src/components kit + content JSON）
                            → link-assets → seo-emit → search-index 三个后处理
你敲 npm run check ──────→ i18n-registry --check + accept-i18n2 + accept-derived
你敲 npm run geom ───────→ geom-check.mjs（site/dist 实测 vs geom-baseline/ 基准）
git push ────────────────→ .githooks/pre-push（根）跑 check + geom
GitHub 收到 push ────────→ .github/workflows/check.yml（根）跑 build+check+机制验收+8092端到端
```

**只有三种执行时机：常驻服务（人开着就在跑）、命令触发（npm run / 保存动作）、CI/钩子（推送时）。**
其余一切（content/、模版 kit、i18n 数据、geom 基准）是**数据**，只被读/写、从不自己执行。

---

## 1. 顶层速查表

| 目录 | 一句话作用 | 何时被执行 |
|---|---|---|
| `content/` | **内容真相**（每页一个 JSON） | 构建时被读；8092 保存时被写 |
| `src/` | **全部逻辑**（引擎/i18n/SEO/写回，按功能族分文件夹） | 被上面各入口 import |
| `scripts/` | **命令行入口**（服务、构建后处理、验收） | `npm run <script>` 时 |
| `edit-layer/` | 浏览器端编辑器（TipTap 封装） | 打开 8092 页面时被注入 |
| `workbench/` | 8090 工作台（唯一管理界面） | 常驻服务 |
| `public/` | 静态素材真身（图片/CSS/字体/JS） | 构建时拷贝/软链进产物 |
| `dist/` `dist-edit/` | 构建产物：生产 / 草稿预览 | 从不执行，被生成（不入 git） |
| `geom-baseline/` | 几何回归基准快照（10 页） | `npm run geom` 时被读 |
| `.drafts/` | 草稿层存储（保存草稿≠发布） | 点「保存草稿」时被写 |
| `docs/` | 本手册 + 计划/spec 存档 | 不执行 |
| `.i18n-events.jsonl` | 翻译事件流水（追加型日志） | 翻译发生时被追加 |

---

## 2. `content/` —— 内容真相（资产）

| 子路径 | 存什么 |
|---|---|
| `products/<id>.json` `posts/<id>.json` | **中文源**：每页全部内容（标题/hero/正文树/规格/面包屑…） |
| `en/products/` `en/posts/` | **英文镜像**：同 pageId 配对，骨架恒≡源树，文字来自 TM |
| `raw/` | 裸文原料（烧制的输入，txt） |

**逻辑**：文件名 = pageId = 跨语言配对键（en 镜像靠同名配对）；`page.status`（published/draft）+ i18n 戳共同决定构建门禁（能不能进 dist/sitemap）。**改内容 = 改这里的 JSON**（人走 8092，AI 走烧制），别的任何地方都不是真相。

---

## 3. `src/` —— 全部逻辑（按功能族分文件夹，2026-08-25 收拢）

### `src/pages/`（Astro 路由 = 构建的总入口）

| 文件 | 作用 | 逻辑 |
|---|---|---|
| `products/[slug].astro` `posts/[slug].astro` | 中文内容页 | getStaticPaths 扫 content → 读 kit 渲染 |
| `[lang]/products|posts/[slug].astro` | 英文镜像页 | **双闸门**：状态门 + `isPublishable`（有从未翻译字段→不进生产 dist；已译但过期照发）；预览（dist-edit）全放行 |
| `index.astro` `products/index.astro` `posts/index.astro` | 派生页：首页/产品目录/案例列表 | 构建期从 content 现算列表卡片（`listing.mjs`），非内容页 |
| `search/index.astro` | 站内搜索页 | 读 dist/search-index.json，客户端 JS 过滤（`is:inline`） |

### `src/components/`（模版 kit —— 一 astro 一模版）

- `products/ProductPage/`、`posts/<各篇>/`：**四件套** = `index.astro`（骨架+`data-field` 坐标）+ `meta.json`（烧制元信息）+ `example.json`（示例值，烧制提示词自取）+ `edit-contract.json`（**哪些字段可写**的契约）。
- `shared/InquiryForm.astro`：询盘表单共享件。
- **逻辑**：加新页族 = 加一套 kit（`kit-init` 可把散装 .astro 一键升格四件套），引擎零改动；缺席槽由守卫裁掉、逐字闸防编造。

### `src/layouts/Chrome.astro` + `src/chrome/`

每页都一样的外壳。`chrome/` 五件 HTML：document（head 骨架）/header/footer/inquiry-form/photoswipe（点图灯箱）。Chrome.astro 装配它们并留 `{{SEO}}`、`{{LANG_SWITCH}}` 槽按页注入。派生页（无 kit）用 `static-chrome.mjs` 直接组装同款外壳。

### 引擎与写回（8092「发布」按钮背后的确定性链）

| 文件 | 逻辑 |
|---|---|
| `render/render.mjs` + `render/tree-utils.mjs` | 树→HTML 的 walker；**不认任何具体字段名/产品名**，只认 schema 注册表+节点 type |
| `content/schema.mjs` | 节点/标记注册表 + 写时校验（validateDoc）——未知节点即拒 |
| `writeback/core.mjs` `writeback/request.mjs` | 写回核心：契约校验→normalizeTree→validateDoc→ensurePath→原子落盘。**未声明路径拒写**；boolean/ensurePath 类型行为由契约驱动 |
| `content/revision.mjs` `content/source.mjs` `content/diff.mjs` | revision（版本戳+原子写）/内容读取/发布前 diff 弹层 |
| `edit-contract.mjs` `edit-context.mjs` | 契约装载+浏览器契约脱敏；原值上呈（DOM 里没有的值如 SEO 覆盖键） |
| `draft/store.mjs` `draft/workflow.mjs` | 草稿层：保存草稿写 `.drafts/`，发布走 changes 对比正式版 |

### `src/i18n/`（翻译流水线，8-18 起免审直发）

| 文件 | 逻辑 |
|---|---|
| `kernel.mjs` | **全站唯一一份族谱逻辑**：scanPages/buildGroups/siblingsOf/langSwitcher/isPublishable/productionJson/SITE_ROOT。四个消费方共用：路由门禁、chrome 切换器、i18n 脚本、edit-server |
| `collect.mjs` | 全树扫可翻字段（SKIP_KEYS/值形态排除） |
| `tm.mjs` + `data/tm.zh-CN.en.json` | **TM 句账 = 英文内容真相**：机翻直发、人改收养（origin:human 永远压过 machine）、pin 锁定 |
| `terms.mjs` + `data/terms.zh-CN.en.json` | 术语表（lock 原样保留 / map 固定译法）——**翻译质量唯一杠杆** |
| `engine.mjs` | 机翻引擎（DeepSeek 调用） |
| `pipeline.mjs` | 流水线：runPipeline 机翻投影 / adoptMirror 收养 / pin 决策 |
| `project.mjs` `sent.mjs` | 镜像投影（骨架≡源树，run 制回植）/句子切分+指纹 |
| `checks.mjs` | 数字/型号守恒硬查 |
| `data/config.json` | `review.en: "auto"`（免审直发档） |
| `events.mjs` | 事件留痕 → `.i18n-events.jsonl` |

### `src/seo/`（构建时现算，不入内容文件）

`kernel.mjs`（canonical/hreflang/og/JSON-LD/noindex/sitemap 的纯函数）+ `config.mjs`（常量）。注入点 = Chrome 的 `{{SEO}}` 槽；编辑入口 = 8092 SEO 面板与 8090 体检屏。

### `src/` 根的散件

`deepseek.mjs`（AI 调用客户端）、`burn-lib.mjs`（烧制纯逻辑：防编/防漏/白名单）、`asset-config.mjs`+`build-outputs.mjs`（素材策略/双产物）、`listing.mjs`+`static-chrome.mjs`（派生页助手）。

---

## 4. `scripts/` —— 命令行入口（每个文件何时跑）

### 常驻服务

| 脚本 | 触发 | 干什么 |
|---|---|---|
| `workbench.mjs` | `npm run workbench` | 总入口：起 8090 工作台 + 8092 编辑服，退出全停（须 node≥22） |
| `edit-server.mjs` | `npm run edit`（或被 workbench 拉起） | **8092 心脏**：服务编辑页；`/__save` 写回链（校验→落盘→抬戳→自动机翻→重建双产物）；`/__burn` 烧制数据端点；上传压缩闸门（sharp）；`/__seo/health` 体检 |

### 构建后处理（`npm run build` 的 && 链，保存发布后自动同跑）

| 脚本 | 干什么 |
|---|---|
| `link-assets.mjs` | dist/assets → public/assets 软链（产物不重复存图） |
| `seo-emit.mjs` | 写 sitemap.xml（noindex 自动除名）+ robots.txt 进双产物 |
| `search-index.mjs` | 全站 JSON 抽 doc 树文本 → search-index.json（字段名无关的 walker） |

### 质量闸门

| 脚本 | 触发 | 干什么 |
|---|---|---|
| `i18n-registry.mjs` | `npm run check` | 族谱快照 --check（registry.json ≡ 现算，防漂移） |
| `geom-check.mjs`（+`geom-lib.mjs`） | `npm run geom`（pre-push 本地） | 起静态服务实测 dist 各页测点 vs `geom-baseline/` ±2px。**基准冻结于 macOS 字体环境，故不进 CI**（Linux 中文字体不同恒假红，2026-08-29 实证） |
| `accept-*.mjs`（12 个） | `npm run accept:<名>` | 各机制验收：poc5（8092 端到端 56）、burn（155）、writeback（34）、i18n2（84）、seo（17）、workbench（7）、drafts、content-diff、derived、item-menu、image-alt、draft-server/ui。CI 与 pre-push 跑其中大部分 |

### 工具（按需手跑）

`deepseek-burn.mjs`（烧制编排 CLI）、`kit-init.mjs`（散装 astro→四件套升格）、`md-to-json.mjs`（旧 MD 一次性迁移，历史使命已完成）、`i18n-harvest.mjs`（存量译文收割进 TM）、`img-probe.mjs`（图片尺寸探测）、`lan.mjs`（局域网地址提示，被服务共用）。

---

## 5. `edit-layer/` —— 浏览器里的编辑器

`edit-layer.js`（源码）+ `dist/`（esbuild 产物，`npm run edit` 先 bundle）。**何时执行**：8092 页面打开时由 edit-server 注入。**逻辑**：TipTap 封装出「可见即可编辑」——点哪挂哪（`data-field` 坐标）；4 条 dirty 通道（text/rich/repeat/**meta**，meta 是 SEO 面板）；**commit 时缓存 getJSON()，保存永不 DOM 反解**；顶栏=草稿/发布/SEO 按钮。

## 6. `workbench/` —— 8090 工作台（唯一管理界面）

`server.mjs`（**读=直算 import 正源**（kernel/tm/terms/seo/pipeline），**写=POST 全代理 8092**）+ `index.html`（单页界面）+ `data.js`。新管理功能只长在这里，不再建独立控制台（8-26 拍定）。

## 7. `public/` 与产物

`public/assets/`：css/cssimg/fonts/js/img/{header,footer,product,post}——**素材真身**（8-24 从仓库根反转进 site，site 自包含）。构建时 Astro 拷贝 + link-assets 接管 assets 软链。`dist/`=生产产物、`dist-edit/`=草稿预览（INCLUDE_DRAFTS+BUILD_OUT），均不入 git。

---

## 8. 仓库根（site/ 之外）

| 路径 | 作用 | 何时执行 |
|---|---|---|
| `package.json`（根） | **代理壳**：build/edit/workbench/check/geom 全转发 `npm --prefix site`；`prepare` 钩子装 git hooksPath | 你在根目录敲命令时 |
| `.githooks/pre-push` | push 前跑 site 的 check + geom | `git push` 时 |
| `.github/workflows/check.yml` | CI：build + check + 机制验收 + 8092 端到端（geom 不进 CI，见上） | GitHub 收到 push 时 |
| `.nvmrc` | 锁 node 22（CI 与本地一致） | setup-node 读 |
| `app/` | **表单 mock 收件箱**（工作台询盘屏在用，真后端未定——**不是旧系统，勿删**） | 手动起，收 inquiry/subscribe |
| `docs/`（根） | superpowers 的 plans/specs 历史存档 | 不执行 |
| `demo/` `design/` | 界面设计稿与早期 demo 存档 | 不执行 |
| `对话记录-*.md` `需求定稿.md` `CLAUDE.md` | 会话史/需求/工作规范 | 不执行（CLAUDE.md 每次会话自动加载） |

---

## 9. 已知的「不执行」陷阱（读代码时别找错地方）

- **改页面内容** → 只有 `content/**.json` 变；不要去 dist 找真相（那是产物）。
- **改页面骨架** → 只有 kit 的 `index.astro` 变；引擎里没有按产品名写的分支（铁律）。
- **改翻译** → 不直接改 en JSON（会被下次投影覆盖）：改镜像页 8092（收养进 TM）或补 `terms` 术语表修一片。
- **`registry.json` 是快照不是真相**：族谱每次现算，快照漂移会红。
- **TM 是英文内容真相**：en 镜像 JSON 是投影产物，重投影以 TM 为准（8-18 拍定）。
