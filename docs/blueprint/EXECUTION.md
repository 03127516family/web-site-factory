# EXECUTION——最终执行流程 + 看板（"自己跑"的唯一权威）

> **用法**：用户只看「等你的事」和「当前位置」；AI 任何会话读本文件即可零解释续跑。
> **续跑口令**：新会话说「看 EXECUTION 继续」；也可建定时任务自动续跑（用户说一声就建）。
> **更新纪律**：每次会话结束前更新本文件。执行状态以此为准，设计原理在蓝图各章。

最后更新：2026-07-04　当前位置：**阶段 1 进行中——1.0 真相源收敛 ✅、1.1 SEO ✅、地基化第一步 ✅、1.8 编辑器写回黑洞修复 ✅、1.2 面包屑 fragment ✅（trail 数据化 + 删 RDFa + BreadcrumbList 升 N 级 + 一份 fragment 治 5 拷贝；probe 483/483、geom 7 页 1:1）；下一个 = 1.3 图片闸门 / 1.4 表单 mock，随后 E-4 富文本存回结构漂移 / E-3 引擎纯化**

---

## 总流程（阶段 0 → 4，2026-07-03 定稿，用户已授权按 AI 自己的流程执行）

### 阶段 0 · 地基 ✅ 已完成
远端仓库（web-site-factory，claude 分支）、pre-push 钩子 + Actions CI 双质量门、Node 版本钉死、蓝图 15 篇 + 决策日志。

### 阶段 1 · 管线强化（一次性改造，之后每页自动受益；2026-07-03 按走查 15 章重排）
| # | 任务 | 验收 |
|---|---|---|
| ✅ **1.0** | **真相源收敛（走查 F1/F2）已完成 2026-07-03**：7 份 MD 获得 `page:` 登记块，登记表由目录派生，pages[] 手写数组与 verify-geom 第二份注册表**已删除**；验收达成——**改造前后 7/7 页产物逐字节一致** + 单测 3/3 + geom 1:1。未尽项转 1.0b：其余 5 页基准冻结（祝圣）后 geom 覆盖 7/7；verify-geom 的 compose 保留（功能性差异：A 面须保留 marker 供测量），fragment 注入同步责任缩至此一处（坑账#4） | ✅ |
| ✅ **1.1** | **SEO 生成器已完成 2026-07-03**（架在 1.0 单源上）：canonical / OG 全套 / JSON-LD（Product/Article + BreadcrumbList 两级）/ sitemap.xml（lastmod=MD 的 git 提交日期），全部从登记（=MD frontmatter）同源派生；robots 共存期不生成（根归老站）。验收达成：单测 7/7（含 canonical 唯一、JSON-LD 可解析、sitemap 不漏页、属性转义）+ geom 1:1 | ✅ |
| ✅ **1.2** | **面包屑数据化 + fragment 已完成 2026-07-04**：① 抽共享 fragment `src/fragments/breadcrumb.html`（一份治 5 份拷贝：2 产品模版 + 3 post 模版），`{{BREADCRUMB}}` 由 `composePage`/`verify-geom`/`edit-probe` **三处注入**（须在渲染器之前注入——片段自带 marker 由引擎填值；漏一处则脱测/脱渲）。② **trail 数据化**：中段不再硬编「Eot Cranes」，`breadcrumb-trail` 登记进 `REPEATS`/`REPEAT_FM_ARRAY`（登记法，决策②），按 MD `breadcrumb.trail` 克隆——free-standing 现正确显「旋臂起重机」而非「Eot Cranes」；3 个 post MD 补 trail（首页>案例）。③ **删 RDFa**：live 模版清空过时 Data-Vocabulary（geom 基准 `overhead-…html` 作为冻结原站保留 RDFa，不动）。④ **SEO 升级**：`jsonLdFor` 由硬编两级改为读 trail+current 出 **N 级 BreadcrumbList**（overhead 现三级）。只读驱动（`NO_STRUCT_EDIT`，无增删 UI；label/url 值仍可点改）。验收达成：**probe 483/483**（新增 28 trail 坐标全绿）、单测 7/7、**geom 7 页 1:1**（面包屑 section 盒不变） | ✅ geom 1:1 + probe 483 |
| 1.3 | 图片闸门：`npm run img` 压缩脚本 + 存量超标图清理（3–4MB 那批） | 全站图达标（08 章规格） |
| 1.4 | 表单 mock：`INQUIRY_ENDPOINT` 单点常量 + 前端四态（校验/加载/成功/失败）+ honeypot；订阅表单同治；请求协议按 Postmark 函数目标形态定（切真零改造） | 手测四态 |
| 1.7 | **抛弃 Python**：`serve`/`verify-geom` 的 `python3 -m http.server` 换 Node 静态服务器（总流程②，全栈 Node、无 Python） | check 全绿 |
| 1.5 | single-girder 切超集模版 + 退役 `product.html`（`overhead-…html` 保留作 geom 基准） | geom 1:1 |
| 1.6 | 404 页 + favicon 核对 | 人眼过一遍 |
| ✅ **1.8** | **编辑器写回黑洞修复已完成 2026-07-04**（2026-07-03 全坐标探针实测发现，用户问"是否真能准确改任何地方"）。① **name 写回黑洞（26 坐标）已修**——`component.name`/`crane_type.name` 坐标从 `fm:<数组>.N.name`（渲染侧不读）改指正文第 i 个 ### 标题行（新坐标 `mdhead:<block>#<i>`，md-write 加 `patchHeadItem`）；渲染与编辑现同取正文 ###，fm 数组只承载 image、其 name 字段沦为渲染侧不读的残迹（收单处）。E2E 实证：改「主梁」→出货页即显新名。② **`<p>` 槽拆裂（1 坐标）已修**——`applyValue` 按内容形态把「装块级内容（`<ul>`/`<table>`/`<h4>`/嵌套`<p>`）的 `<p>` 槽」就地改 `<div>`（内容驱动非段名特判，与原站列表组件用 `<div>` 一致）；纯文本组件仍 `<p>`，geom 未动。**探针 455/455 全绿、棘轮基线归零**、单测 7/7、geom 1:1。③ 富文本存回 MD 漂移 → 转 **E-4**（下条，视觉无损、独立于本次黑洞修复） | ✅ 探针 455/455 + 棘轮归零 + geom 1:1 |

**阶段门（=14 章 G3 搬迁入口）**：1.1–1.5 全绿。每个任务一个 commit 即 push（钩子+CI 复验）。

### 阶段 S1 前置 · 编辑器上云就绪改造（2026-07-03 实测立项，用户问"之前写的 edit 能否支持后续流程"）
> 结论：**纯函数核心可原样上云**（`applyPatch`/`applyArrayOp`/`htmlToMd`/`render` 字符串进出，editor.js 派发只读 marker，站无关），但"单站/单人/本地"耦合三类须拆，否则 ⑥ 并发安全与 17 章 `engine diff=0` 都不成立。**这些是 S1(云端编辑) 的前置，不阻塞阶段 1–4 的本地搬迁**。

| # | 缺陷 | 出处 | 修法 | 阻塞 |
|---|---|---|---|---|
| E-1 | 保存协议**无基准版本号**，两人同改静默覆盖 | `editor.js:81` `{slug,coord,kind,value}` | 加 `baseVersion` 字段；edit-save 比对草稿版本不符则拒（蓝图 ⑥ 第6步已设计，代码未实现） | S1 多人编辑 |
| E-2 | 保存端点 `/api/save` 写死、无 auth token | `editor.js:22-23` | 端点可配置指向 API Gateway + 带 Cognito token | S1 |
| E-3 | 引擎名字表 11 处 + 图片基址 3 处（含 editor.js） | 见 17 章 §3 P-3~P-11、P-6 | B/C 类纯化：搬模版属性 + `NEW_ITEM` 改由模版首单元推导 | 17 章 `engine diff=0`；第二站 |
| E-4 | 富文本存回 MD 结构漂移（`hero.highlights` 数组→字符串等 10 处） | 1.8 拆出（黑洞两处已修，此为独立残项，视觉无损） | 写回侧保数组结构（`fm:` rich 存回时按现值形态：原为 YAML 序列→把 `<li>` 拆回数组） | ⑦ 字段级 diff 粒度 |

**验收**：E-1/E-2 用一个"模拟两客户端并发写"脚本证并发拒绝；E-3 用"造一个假第二站 fixture、跑 build，引擎目录 diff 必须为空"证；E-4 需给探针**加一维结构断言**（现 identity 只比视觉 innerHTML，查不出「数组存回退化成字符串」——视觉相同故 302/302 也不报，见 edit-probe 局限）。

### 阶段 2 · 搬迁准备
| # | 任务 | 产出 |
|---|---|---|
| 2.1 | B0 盘点：WordPress MCP 拉全站页面/文章/媒体清单 | `migration-map.md`（每行：老 URL → 迁入 slug / 301 / 显式放弃） |
| 2.2 | L3 关键词→页面映射（AI 用真实 web 调研起草；商业优先级先按我的判断假设，用户回来可改） | `keyword-map.md`（每页目标词/标题措辞/内链计划） |
| 2.3 | 批次计划定稿 | B1 产品 → B2 文章 → B3 分类（先按七步法造 category 模版）→ B4 首页/联系 |

**阶段门**：映射表行行有归宿 + 关键词表覆盖 B1。

### 阶段 3 · 批量搬迁（主体工作，页页循环）
每页固定循环：
```
拉原文 → 烧 MD（带 L2 SEO：标题/描述/alt/内链按关键词表）→ 素材过闸门
→ 登记 pages[] → build → geom（族内基准）→ 入口自检（导航/相关产品/内链）
→ commit + push（CI 复验）→ 更新本看板进度
```
- **全程草稿态推进，无需逐页等审**（发布本来就延后了；一切成果在 git 上，用户随时可看预览清单）。
- 每批完成：攒一份预览清单放进「等你的事」，用户想看就看，不看不阻塞下一批**生产**（但不标"可发布"）。
- B3 前插入：category 页族模版（七步法 + 自检表归档）；B4 前插入：首页/联系页族。

**批次门（G3）**：该批映射表行全绿 + 自查抽样通过，才开下一批。

### 阶段 4 · 收尾与待命
全站内链检查、性能预算实测（Lighthouse）、13 章六透镜审计（M0 门前置）→ 产出 v1.0 清单勾选报告。
**终态**：`npm run serve` 一条命令起完整站；v1.0 清单上剩下的全是"等用户"项（AWS 授权包 → 发布线联调 → 真表单 → 上线冒烟 → Search Console 提交）。

### 贯穿纪律（执行时逐条生效）
1. 每步 check 全绿才 commit，每 commit 即 push（钩子 + CI 双验）。
2. 遇到要拍板的新事项：**不停下猜**——记入「等你的事」，绕过它继续能做的部分。
3. 实况与蓝图冲突：行为权威，改蓝图，记 DECISIONS。
4. 只有三种事会让我中断等人：危险操作（删数据/改历史）、红线（AWS/真实发布/对外发送）、真被阻塞。
5. SEO 按四层责任模型（08 章，2026-07-03 ⑭ 修订）：L1 技术层构建期自动、L2 页面语义层烧页时做、L3 关键词映射我起草、L4 外链不做；上线后监测分析我做（需用户给 Search Console 数据）。

### 用户在全流程里的角色（就这四件）
① 随时看本文件（唯一要看的）；② 想看就看每批预览清单；③ 回来后给"发布包"（AWS 授权 + Postmark + DNS 归属）；④ M0 最终验收。

---

## 等你的事

| # | 事项 | 状态 |
|---|---|---|
| 0 | **说一声"执行"**——我从 1.1 开跑，按上面流程走到阶段 4 待命 | ⏳ 唯一卡着的 |
| 1 | ~~Git 远端~~ | ✅ 完成 |
| 2 | AWS 授权包（账号/区域/"可以建"/DNS 归属） | 用户暂缓，阶段 4 后需要 |
| 3 | ~~Postmark~~ → 先 mock（1.4） | 转交 AI |
| 4 | 发布授权档 | 暂按最严：一切"发布"动作等用户点头（生产不受影响） |
| 5 | 上线前杂项（老站 WP 凭证确认 / 备案状态 / 缺图渠道） | 搬迁中后期零散要 |

## 已完成

- 2026-07-04：**1.2 收尾纠错 + `data-required` 必填校验**（用户"再看看还有什么问题"催出）。① **纠 ⑭.3 越界**：1.2 曾把面包屑 JSON-LD 改成读 trail 出 N 级，但中段分类 URL（`/zh/overhead-cranes/` 等）本系统未构建=死链，结构化数据不该断言 404——退回两级（首页>当前，首页项取 trail[0] 与可见同源），可见面包屑仍 N 级（其中段死链是既有问题，随 B3 解）。② **补 `data-required` marker**（与 `data-optional` 互为反义）：`validateRequired` 在 render 里强制"声明必填的点缺数据即抛错"，堵住"MD 漏字段→静默出模版占位上线"（面包屑 `current`/`trail`、h1 `title` 已挂）；负例实测（删 breadcrumb/title 的 MD）现报错、正例 build/check 全绿。marker 登记进契约（16 章表 + 装配十律#5）。普查结论：其余"占位符上线"字段多为良性 shared chrome（品牌语/CTA/表单标题），非泄漏，不挂。
- 2026-07-04：**1.2 面包屑数据化 + fragment**（用户先审设计后放行：①只读驱动 ②登记法）。抽 `src/fragments/breadcrumb.html`（`data-repeat="breadcrumb-trail"`，登记进 `REPEATS`/`REPEAT_FM_ARRAY`/`NO_STRUCT_EDIT`），`{{BREADCRUMB}}` 三处注入（`composePage`/`verify-geom`/`edit-probe`，须在引擎前注入——片段自带 marker）；中段由 MD `breadcrumb.trail` 驱动（删硬编「Eot Cranes」，free-standing 现正确显「旋臂起重机」）；3 post MD 补 trail；删 live 模版 RDFa（geom 基准保留）；`jsonLdFor` 升 N 级 BreadcrumbList；顺手清 related-products 区旧词汇（`data-dynamic`/`data-template`/`data-slot`/`data-category`，台账#8，保留 `data-block-id`/`data-repeat`）。**probe 483/483、单测 7/7、geom 7 页 1:1**（面包屑 section 盒不变）。
- 2026-07-04：**1.8 编辑器写回黑洞修复**（用户"修改后自己再测试"）。两处清零：① **name 黑洞**——`tagUnitField` 对 components/crane-types 的 `name` 键改发坐标 `mdhead:<block>#<i>`（原 `fm:<数组>.N.name` 渲染侧不读），md-write 加 `patchHeadItem` 改第 i 个 ### 标题行；渲染与编辑同取正文 ###，收单处（fm 数组只留 image）。② **`<p>` 槽拆裂**——`applyValue` 按内容形态把装块级内容的 `<p>` 就地改 `<div>`（内容驱动，非段名特判；纯文本仍 `<p>`，geom 未动）。`edit-probe` 棘轮基线 `KNOWN_BROKEN` 归零：token 428→**455 全绿**、identity 302、arrays 36；单测 7/7；geom overhead 81/81、single-girder 78/78 逐元素 1:1；E2E 实证改组件名出货页即显。③ 富文本存回结构漂移未动 → 独立残项 E-4（视觉无损）。
- 2026-07-03：**地基化第一步——引擎字符串入口 + 编辑链路回归门**（用户"最好变成地基后续复用"）。① `render.mjs` 抽出 `renderBodyFromString(template, mdString, opts)`，原 `renderBodyFromMarkdown` = readFile + 委托，**dist 逐字节一致**（stash 前后 shasum 全等证明）；这是云端 edit-save/render-page Lambda 所需形态（拿到的 MD 是 S3/git 字符串而非路径）。② 一次性探针收编为常驻门 `scripts/edit-probe.mjs`，**纯内存跑**（不写任何真实文件，崩了不脏工作区），进 `npm run check`（pre-push + CI 自动复验）；455 坐标 token 428 过 / identity 302/302 / arrays 36/36，27 个已知缺陷做成**棘轮基线**（`KNOWN_BROKEN`，只能变好不能变坏；修好会提示摘除）。从此"编辑器能否准确改任何地方"是被 CI 守住的属性，不再靠人肉抽查。
- 2026-07-03：**编辑链路全坐标实测**（455 坐标真实写回验证）：identity 无损 302/302、增删 36/36 全过；定位 3 类缺陷（name 写回黑洞 26 / p 槽拆裂 1 / 富文本存回漂移 10 视觉无损）→ 立项 1.8 + E-4。
- 2026-07-03：**最终执行流程定稿**（本文件，阶段 0–4 + 页循环 + 纪律；用户授权按 AI 自己的流程执行，SEO 边界改四层责任模型）。
- 2026-07-03：**P0 解除**——GitHub 远端建立、全历史推送；check 聚合 + pre-push 钩子 + Node 钉版本 + Actions CI（含完整 geom）。
- 2026-07-03：开跑前实况盘点（DECISIONS ⑬）：修正蓝图三处漂移；single-girder 切超集提前；related 旧词汇入台账。
- 2026-07-03：蓝图 v2 全 15 篇 + DECISIONS；拍定表单=Postmark、托管=S3+CloudFront（实施暂缓）；多站多语言转主线。
