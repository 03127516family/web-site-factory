# 站点工作台做实（site/workbench 转正 + 单界面收编）设计

> 状态：**已落地**（计划 docs/superpowers/plans/2026-08-26-workbench.md，8 任务内联 TDD 执行完，2026-08-26 当日）。
> 日期：2026-08-26。参与拍板：用户 + Claude。
> 前置：SEO 模块已落地（2026-08-26，spec 2026-08-25-seo-design.md + 计划同日）；本设计是 SEO 设计「步 4 管理界面」的落地形态演变——管理界面统一进工作台，不再建独立 `/__seo` 控制台。

---

## 一、已拍板决策

### W1 范围：收尾式一次到位
修断路径 + 数据层正源化 + SEO 屏 + toast 占位清零，一轮做完。不做最小式/分批。

### W2 转正：design/admin-ui → site/workbench
工作台是唯一长期管理界面，转正进 site/ 跟着维护、进验收矩阵；design/admin-ui/ 留档不动。`npm run workbench` 一键起 8090+8092。

### W3 界面形态：抄 WordPress/Yoast（用户明示「抄袭即可」）
- 全站体检 = **独立屏**（Yoast 顶级菜单 Overview 同构）+ 概览屏放汇总卡；
- 单页改内容 = 8092 页面编辑器（Yoast metabox 的对应物=页面上本就能编辑的 page.title/description，不另造面板）。

### W4 单界面收编（用户拍定：「以后只有一个界面就是目前这个 admin 中的，其他的都不要」）
| 界面 | 处置 |
|---|---|
| 工作台 | 唯一管理界面，转正 `site/workbench/` |
| 烧制台 `/__burn`（burn-console.html） | **退役**——工作台烧制屏已接同一对端点（/__burn、/__burn-save、/__templates 代理已有） |
| 翻译台 `/__i18n`（i18n-console.html + 审阅页 /__i18n/review） | **退役**——管理进工作台多语言屏；改句子=英文页就地改→发布→adoptMirror 自动收养（2026-08-26 已接线）；failed 句=工作台重送（retryFailed） |
| 页面即编辑器（8092 页面 ✏️ 层） | **留**——它是内容编辑本身，不是管理界面 |

edit-server 删 `/__burn`、`/__i18n`、`/__i18n/review/*` 三条 **HTML 服务路由**；`/__burn` POST、`/__i18n/*` 数据/写端点**全保留**（工作台代理依赖）。

### W5 数据层：读直算 + 写代理（方案一）
- **读=直算**：workbench server 直接 import site 正源模块现算（消灭「隔离侧抄本」这个病根——本次 TM 路径断裂即由此起）。
- **写=代理**：全部 POST 打 8092（单一写路径+其内部串行构建链，现架构保留）。

---

## 二、关键事实（2026-08-26 实查，带证据）

- **data.js 已接真读写**：11 个 POST（build/mirror/translate/translate-all/approve/terms-save/config-save/burn/burn-save/upload/tm-save）走 `/api/*` 代理（design/admin-ui/data.js:466-792）；注释「写回仍是演示 toast」已过时。仅零星小按钮是 toast 占位（:203,208）。
- **server.mjs 三处过时**：①TM/terms/config 读 `src/i18n/*.json`——2026-08-25 重构已挪 `src/i18n/data/`，现在返回空；②scanContent 自带实现硬编码 en、无发布门禁；③无 SEO 数据。写代理层（POST_PROXY 10 条 + upload + /api/i18n-data GET）工作正常。
- **工作台已有屏**：概览/产品/文章/媒体库/发布状态/询盘收件箱/多语言/设置 + 编辑器/烧制屏（index.html :556-572, :847, :992, :1092）。无 SEO 屏（全文件唯一 SEO 字样=设置屏旧「SEO 基址 /zh/」输入框 :1706，D1 已翻转为过时假设，本轮一并处理）。
- **旧翻译台独占功能=审阅页**（/__i18n/review，edit-server.mjs:555）：逐句审阅编辑。免审直发（2026-08-18）后 pending≈0；改句走镜像页就地改+收养（当日已接线）；failed 走重送。审阅页无不可替代功能，随翻译台退役。
- **8092 健康探测已有**：server.mjs pingEdit 每 5s，editAlive 并入 /api/overview。
- 素材路径：根 `public/assets` 是指回 `site/public/assets` 的软链（2026-08-24 反转），server.mjs 的 IMG 读经软链仍工作。

---

## 三、设计正文

### §0 一句话
把 design/admin-ui 三件套转正为 `site/workbench/`：数据层换正源直算（读）、代理保持（写），新增 SEO 体检屏，退役两块旧控制台——此后全站管理只有这一个界面。

### §1 落位与启动

```
site/workbench/
  index.html    从 design/admin-ui 挪入（+SEO 屏、概览汇总卡）
  data.js       从 design/admin-ui 挪入（+SEO 屏接线、占位清零、多语言泛化渲染）
  server.mjs    从 design/admin-ui 挪入后重写数据层（§2）
site/package.json  加 "workbench": "node scripts/workbench.mjs"（= 现 start.mjs 逻辑：起 8090+8092，退出全停；要求 node ≥22）
site/scripts/workbench.mjs   启动器（从 design/admin-ui/start.mjs 平移，路径改内）
design/admin-ui/  留档不动
```

server.mjs 挪入后以 site 为 cwd（启动器保证），`kernel.CONTENT()` 等 `process.cwd()` 基准的函数天然工作。

### §2 数据层正源化（server.mjs 重写对照表）

| 现状（删） | 换成（import 正源） |
|---|---|
| scanContent（硬编码 en、无门禁、自带遍历） | `i18n/kernel.scanPages({withJson:true})` + `buildGroups` + `isPublishable` |
| TM 旧路径直读（已断） | `i18n/tm.loadTm/loadConfig` |
| terms 旧路径直读（已断） | `i18n/terms.loadTerms` |
| distFacts（walk dist 数 index.html） | 保留（这是产物统计，无正源函数；路径改 `site/dist`） |
| mediaList/usedMedia/searchContent | 保留自带（素材/搜索无正源模块；路径 IMG 改 `site/public/assets/img`，删软链依赖） |
| recentEvents/inboxList | 保留（路径不变） |
| —（无） | 新增 `/api/seo-health`：`seo/kernel.healthData(pages)` + `i18n/pipeline.pinQueue(lang)`（按 `loadConfig().review` 语言全集），返回 `{summary, rows, pins}`（与 8092 `/__seo/health` 同形——同模块直算，口径恒一致） |
| —（无） | `/api/pages` 换正源后行结构对齐 data.js 期望（title/type/status/lang/语言覆盖/门禁态），多语言由数据带出 |

**写代理不动 + 新增 1 条**：`POST_PROXY` 加 `"/api/pin-decide": "/__i18n/pin-decide"`；GET `/api/i18n-data` 代理保留（其正源即 8092 内 consoleData，同模块直算，口径不分叉）。

### §3 SEO 体检屏（抄 Yoast Overview）

- 侧栏新项「SEO 体检」（data-nav="seo"，位于「多语言」后）。
- 屏顶汇总条：页面总数 / 异常页数 / pin 待确认条数（吃 `/api/seo-health.summary`）。
- 大表：**一行=一逻辑页**（pageId 聚合，非语言行）：页面标题、语言覆盖（各族谱成员过门禁的 ✓ 旗）、标题超长（>60 红）/简介超长（>160 红）任一语言命中即旗、noindex、pin 待确认数。
- **默认只显异常行**（issues 非空或 pin 待确认>0）；「显示全部」开关（同屏记忆）。
- 行展开两级：①语言明细（该 pageId 每语言一行：title/desc 长度、状态、点「编辑」跳 8092 页面）；②pin 明细（源新文本 vs 顶住人稿 对照 + 单条「保持」「重跟」）。
- 顶部批量：「全部保持」「全部重跟」（POST `/api/pin-decide`，decisions 全量；重跟会真送翻——按钮带确认弹层，注明花费）。
- 概览屏：新增汇总卡「SEO 体检：异常 N 页 · 待确认 N 条 →」点击进 SEO 屏。
- 设置屏旧「SEO 基址 /zh/」输入框：删除（D1 中文住根已翻转，SITE_ROOT 是代码常量非运行时配置；换站改常量=已验证冒烟路径）。

### §4 单页 SEO（2026-08-26 晚已落地标题/简介；og/高级区后补）
**已落地**：SEO 体检屏展开行 = Yoast metabox 同构（标题/简介输入 + 长度计数 + 谷歌预览 + 保存发布）；写回走 `/api/seo-save` → 8092 `/__save`（两族 edit-contract 已注册 page.title/page.description；改中文源自动重翻镜像、改英文镜像自动收养+pin，e2e 全链实证）。
~~原表述「page.title/description 已是 8092 页面编辑器的可编辑字段」~~——**此句当时不属实**（契约未注册、`<head>` 字段所见即所得编辑器物理够不着），本次以 SEO 屏面板形式兑现；8092 视觉编辑器仍不编辑 head 字段（符合「所见即所得」语义，无需改）。
**后补**（数据模型与渲染已就绪，UI 未做）：og 覆盖块（page.seo.og.*）、canonical 覆盖、noindex 开关——触发条件不变：真有人要改社交卡文案/特殊收录需求时。

### §5 占位清零
data.js 全部 `toast('待接')` 占位点逐一处理：有端点的接（术语行内移除/行删除=收集现值整表 POST terms-save）；无端点的按钮删除。清零后 grep `待接` 零命中为验收线。

### §6 退役施工
edit-server.mjs：删 `/__burn` HTML、`/__i18n` HTML、`/__i18n/review/*` 三条路由及其内联 HTML 资产；POST `/__burn`、`/__i18n/tm|config|terms|translate|translate-all|approve|pin-decide`、`/__i18n/data` 全保留。`edit-layer/burn-console.html`、`i18n-console.html` 删文件（git 历史在）。

### §7 验收（`site/scripts/accept-workbench.mjs` 新增，自起服务可参数化端口）
1. `/api/pages` 行数 = `scanPages()` 行数（口径一致）。
2. `/api/overview` 的 tmTotal>0（断路径修复回归）。
3. `/api/seo-health`：rows 数=scanPages 数、pins 与 `pinQueue` 直算一致、summary.flagged 与 healthData 直算一致。
4. 语言覆盖非硬编码：结构里含全 DEPLOY_LANGS×族谱成员。
5. 写代理冒烟：8092 起时 POST `/api/pin-decide` 带非法 lang → 400（代理透传 edit-server 校验）；8092 停时同 POST → 502 结构 `{error:"8092 编辑服务未启动…"}`。
6. 退役断言：8092 GET `/__burn`、`/__i18n` 404；POST `/__burn`、`/__i18n/data` 200。
7. `grep -r '待接' site/workbench/` 零命中。
8. 人工手续（spec 记录，不入自动脚本）：`npm run workbench` → 过 9 屏（含新 SEO 屏）→ 概览卡数字与 SEO 屏一致。
9. 全站矩阵回归：check / accept:burn / accept:poc5 / accept:seo 全绿（edit-server 动了路由必须回归）。

### §8 已知限制
- 单页 SEO 面板（og 覆盖/谷歌预览）后补（§4）。
- 媒体库/搜索仍是 server 自带实现（无正源模块可 import；等哪天 site 出内容索引模块再换）。
- 「询盘收件箱」读 app/mock-cloud（mock 后端，§8 旧系统遗留同源）；表单真后端方案未定，屏保持只读。
- workbench 无鉴权（本机/局域网工具定位，与 8092 同级；上公网前必须加——届时一并处理两服务）。

---

## 四、与既有决策的关系
- SEO spec（2026-08-25）§7 步 4「管理界面」的落地形态从「独立 /__seo 控制台」**改判**为本设计 W4 单界面收编（用户 2026-08-26 拍定）；SEO 数据接口（/__seo/health、/__i18n/pin-decide）不变，消费方从独立控制台换成工作台。
- 免审直发（2026-08-18）「改完存 TM」的完整闭环 = 镜像页就地改 + adoptMirror 收养（已接线）+ 本设计退役审阅页——三条腿齐。
