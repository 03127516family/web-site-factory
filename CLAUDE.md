# CLAUDE.md — 项目工作规范（每次会话自动加载）

> 本文件固化已达成的规范，避免每次重复交代。**遇到新讨论拍定的约定，追加到文末「决策日志」。**
> 项目：`websitere-placement-system` —— 从零设计的内容驱动静态建站系统（新架构、通用；替代 WordPress 是动机，不迁移/还原任何既有站点）。
> 只放长期有用的规范；进度/历史在 git 与 `对话记录-*.md`，不进本文件。

---

## 1. 核心架构：「两个都要」（AI 创作 + 代码装配）

```
纯文章(内容方给的, 散文零格式)
   │  ← 【AI 创作 · 烧一次】判断归类 → 结构化 MD
src/content/<slug>.md  (持久工件, 落盘进 git, 这才是资产)
   │  ← 【代码装配 · 确定性, 零 AI, 每次 build 免费】
产品页 HTML
```

- **AI(我)负责**：把裸文章映射成合规 MD（判断哪段是概述/简介/规格/组件…，这步需要判断，不是机械转换）。
- **代码负责**：渲染器读 MD → 填字段 / 克隆重复项 / 裁可选段 → 出页面。确定性、可重现。
- **关键认知**：能脱离对话上下文还原页面的，是 **MD**，不是裸文章。MD→页面才是确定性的。**上下文是耗材，MD 是资产。**

## 2. 引擎铁律：一个 render + 一个 edit，通用、永不写死

三层分离，**引擎永远只有 1 个、不动；会变多的只是「模版」这种 HTML 声明文件**：

| 层 | 是什么 | 几个 |
|---|---|---|
| 引擎 `scripts/render.mjs` + `public/assets/js/editor.js` | 纯逻辑，**不认任何具体名字** | 永远 1 |
| 模版 `src/templates/*.html` | 用 markers 自报结构 | 每页族 1 |
| 内容 `src/content/*.md` | 内容 | 每页 1 |

**标记词汇表**（模版自声明结构，引擎只读这些、不读名字）：

| 声明 | 含义 |
|---|---|
| `data-field="点路径"` | 内容点，数据取 MD 该路径 |
| `data-edit="text\|rich\|image\|link"` | 该点如何编辑/填 |
| `data-repeat="名"`（目标加 `data-array="md.路径"`） | 重复区，按该 MD 数组克隆首个单元 |
| `data-optional="key"` | MD 无该 key → 删整段 |
| `data-no-add` | 该重复区不显示增删 UI |
| MD `<!--block:KEY-->` ↔ 模版 `data-field="KEY.body"` | 富文本长正文块（KEY 任意，自动映射） |

**守这套，引擎就不会烂**：
1. **禁止在引擎里按字段名/产品名/段名写 `if` 逻辑分支或白名单表**。引擎判断只许靠两类信息：**markers（上表）+ 内容形态**（`value.includes("<")`→rich、body 含 `<table>`→套 `.custom_tables`、列表/多段→rich）。
2. **渲染侧与编辑侧对称**：写回坐标由 `buildData` 在「字段实际取自哪」就地产出（取自 `## 块`→`mdhead:/mdbody:`，取自 frontmatter→`fm:`），`classifyField` 查这张随数据同源的动态表，不写死白名单。`htmlToMd` 与 `mdToHtml` 互逆（含 `<table>`↔管道表格）。
3. **加新页族（文章/分类…）= AI 写一个自声明模版（一次），引擎零改动**；之后该页族每页只写 MD。新增/改名一个段，只要模版有对应 `data-optional/data-field`，即「能渲染也能编辑」，**不改 render.mjs**。
4. **多段富文本用 `<div data-field="X.body">` + 一个 `## 块`，不用 `<p data-field>`**（`<p>` 装不下多个 `<p>`，浏览器会拆成兄弟节点致只有首段可编辑）。
5. `editor.js` 已是此标准（只读 `data-md/edit/group/idx`）。`render.mjs` 残留的名字注册表（`REPEAT_FM_ARRAY`/`NO_STRUCT_EDIT`）属声明式配置、非产品特判，可暂留；**搬到模版属性（`data-array` 等）的时机 = 做第二个页族时**；在此之前先守规矩、不新增名字逻辑。

## 3. 用户工作流协议（用户只需说三件事）

用户要加/改一个产品页时，只需给：① **文章**（路径或直接贴）② **产品名** ③ **slug**（网址用英文标识）。
默认用标准超集模版，无需指定。例：

> "把 `src/content/raw/<slug>.txt` 这篇做成产品页。产品名:XXX，slug:xxx。"

**我(AI)负责剩下全部**：烧 MD → 接模版 → `npm run build` → `npm run verify:geom` 验 1:1 → 给页面，不对再改。
**用户不用碰**：MD 格式、字段名、模版裁剪。裸文章原料放 `src/content/raw/<slug>.txt`；成品 MD 放 `src/content/<slug>.md`。

## 4. 模版方针：一份超集，按 MD 裁剪（2026-06-25 拍定）

- **同一网站同一风格 → 只用一份超集模版**，所有产品共用；渲染器按 MD「数据在不在」用 `data-optional` 裁出不同产品页。**加同风格产品 = 只写一份 MD，零新模版。**
- 真出现**别的风格**，才另起一份超集。
- 超集模版：`src/templates/product-superset.html`（单梁 12 段 + overhead 独有 5 段 = 17 段，每可省段带 `data-optional`）。
- 收敛中：单梁/overhead 历史上各有独立模版（`product.html` / `overhead-cranes-for-sale.html`），目标是都改指向超集后退役它们。

## 5. MD 规范要点（权威细节见 `src/templates/product.contract.md`）

- MD = **YAML frontmatter + markdown 正文**，`---` 分隔；自带 `slug` 与 `template`。
- `data-field="a.b"` → frontmatter 点路径 `a.b`；正文块 `## 标题 <!--block:KEY-->`，KEY 对模版 `.body` 字段。
- 重复块 `data-repeat="X"` → frontmatter 一个数组（目标加 `data-array` 自声明，现暂登记于 `render.mjs` 的 `REPEAT_FM_ARRAY`）。
- `components`/`crane-types` 暂为**双处结构**（frontmatter `*_images` + 正文 `###` 同 index，待收单处）。
- ⚠ **契约文档会漂移**：最终权威 = `render.mjs` 实际行为 + 现行 `single-girder-eot-cranes.md`；契约当设计意图参考。

## 6. 命令

| 命令 | 作用 |
|---|---|
| `npm run build` | 生产构建（产物零 `data-*`，干净 HTML） |
| `npm run edit` | 可见即可编辑服务 → localhost:8081（原位改文字/图/链接、增删重复项，写回 MD） |
| `npm run verify:geom` | 几何回归：逐元素比对「渲染产物 vs 原静态模版」，1:1 即无损（支持 `baseline` 跨模版比对） |
| `npm run serve` | build + 本地预览 localhost:8080 |

> CDP 用端口 9456（避开系统 Chrome/Edge 的 9222，**勿杀** Edge 进程）。

## 7. 不可破坏的铁律（结构）

- **结构只许存在于 MD**：模版固定、不可编辑；某产品多/少段、多/少行，只改 MD。
- **`#product` 包裹关系**：须从标题一直包到询盘表单才闭合（`main.css` 89 条 `#product xxx` 作用域规则依赖它，提前闭合整片塌过两次）；`related-products` 在 `#product` 外（全宽）。
- **改完必验**：动了渲染器/模版/MD，跑 `verify:geom` 确认仍 1:1。
- **沟通记录**：重要会话存 `对话记录-YYYY-MM-DD-主题.md`（仓库根）。

## 8. 已知遗留

> 2026-07-11 核账：原列的「面包屑未 data 化」「SEO 技术 hygiene 全面缺失」两条已**过时销账**——
> trail 已由 MD 驱动（`{{BREADCRUMB}}` fragment + 渲染器填值，含 en 镜像英文 trail；single-girder
> 显示「Eot Cranes」是忠实原站的**数据**，非缺口）；canonical/OG/JSON-LD（含 BreadcrumbList）/
> sitemap.xml/hreflang/favicon/404 均已实现。仍真实的遗留如下：

- 个别素材缺失需补图（如 overhead 组件 `Crane-electric-control-bo.jpg`，原站亦缺）。
- **图片落盘未压缩**（如 crane-lifting-safety-training 的图 3-4MB/张），拖 LCP；以后素材落 `public/assets/img/` 前应先压缩（图片闸门未建）。
- `robots.txt` 共存期有意不生成（域名根归老站管，蓝图 08 §2.3），整站切换后再接管。
- **表单后端仍是假发送**（2026-07-11 起）：站侧已接线——`assets/js/form-submit.js` 拦截提交 fetch 到相对端点（询盘 `/api/inquiry`、订阅 `/api/subscribe`），本地由 mock 接收器（`app/`，不入库）落收件箱；**真实后端方案未定、未接**——曾讨论自建 Lambda（环境里有真实 AWS 凭证，账号 `125131361182`/`aws-cn`），用户明确"先别真发"，**不要在没有进一步明确指示前，往这个真实 AWS 账号里创建任何云资源**。生产期把端点换成真实 URL 即可，页面与 JS 零改动。
- header 站内搜索框 action 仍指旧 WP 站（待站内搜索实现后接管）。
- 语言切换/导航大菜单里的分类与栏目链接仍指旧站 `https://www.dgcrane.com/zh/...` 绝对地址（那些页面尚未迁入本系统，链接过去仍可用；迁入后应改相对路径）。

---

## 9. 真实页 → 模版转换规则（页族无关，所有页族通用）

> 与 §2 对称的另一面：§2 说**引擎**不认页族、只读 marker + 内容形态；§9 说**造模版的人（AI）**也不认页族、只按内容形态挂 marker。
> **这套规则对 product / category / post / 任何未来页族一字不改**——变的只是切出来的块、起的名，规则本身恒定。若某页族要"特殊切法"，即等于在规则层重新引入 §2.1 禁止的页族特判，自相矛盾。
> 触发：每次「加新页族」或「把一张真实页做成自声明模版」，照这 7 步走，**先按此规则、再动手生模版**，不靠记忆。

**7 步流程：**

```
① 切块   真实页正文从上到下切成段，每段单独判定
② 判形   每段归入 4 形态之一（决定挂哪种 marker，见下表）
③ 命名   按「同名接线」起名；跨页族复用的照搬产品模版（hero / inquiry_form /
           related_products / breadcrumb.trail），不另起
④ 抽模子 重复区只保留第 1 个单元当克隆模子，其余删
⑤ 复 chrome  head/header/nav/footer/photoswipe 从现成产物页逐字复制，不重写
⑥ 守硬约束  多段富文本用 <div data-field> 不用 <p>（§2.4）；#product 包到询盘才闭合（§7）
⑦ 验      落基准 MD → validateBlocks 过 → npm run build → npm run verify:geom 1:1
```

**形态 → marker 速查表（②③的依据，4 形态穷尽任何页面）：**

| 看到这种内容 | 判为 | 挂这对 marker（成对，缺一不可） |
|---|---|---|
| 一个标题 / 一张图 / 一个链接 | 单值 | `data-field="路径"` + `data-edit="text\|rich\|image\|link"` |
| 连续好几段说明文字 | 长正文 | `<div data-field="KEY.body">` + MD `<!--block:KEY-->`（同 KEY） |
| 同结构出现 N 次（子型号 / 案例 / FAQ / 组件 / 章节） | 重复 | `data-repeat="名"` + 容器 `data-array="md.数组路径"` |
| 本页有、同族别页可能没有 | 可选 | `data-optional="key"` |

**命名唯一铁律（接线，非审美）：模版的名 = MD 的路径，一字不差**。`data-field="hero.title"`→去 MD 取 `hero.title`；`data-repeat`+`data-array="md.subtypes"`→对 frontmatter `subtypes:` 数组；单元内字段用单数相对名（`title`/`body`/`image`）。起名习惯：语义英文小写、点分层、重复区用复数名。

> 状态：本规则首次固化于做 category 页族（`double-girder-overhead-crane` 等品类页，结构区别于单产品页 product@1——子型号各自带规格表 + FAQ + 案例，不是"一张总表"）时。先用它实跑 category 当试金石，证明够用后此规则即所有页族通用方法论。

---

## 决策日志（新拍定的约定往这里追加，带日期）

- **2026-06-25** 模版走「单超集 + 按 MD 裁剪」，不走「每产品一模版」。
- **2026-06-25** 用户工作流：「给文章+产品名+slug，AI 负责到 1:1」；裸文章放 `src/content/raw/`。
- **2026-06-25** 引擎铁律：禁名字驱动逻辑/白名单；渲染侧与编辑侧对称、皆从实际 `blocks` 推导；加新页族 = 加自声明模版，引擎不动（详见 §2）。
- **2026-06-25** 再平衡：刹「往深做工具」，提「把产品搬进来」；引擎纯化重构（注册表搬模版属性）等第二个页族再做。
- **2026-06-26** MD 兜底校验（`render.mjs::validateBlocks`，build/verify 共用）：① 每个 `^##` 二级标题必须带合法 `<!--block:KEY-->`；② 每个 block KEY 规范化后须在模版出现（`data-field`/`data-optional`）。违反即抛错中止，**改坏不再静默退默认**。起因：编辑器全局 markdown 格式化扩展把 `<!--block:KEY-->` 改写成链接 `[!--block--](...)`，致正文整段失效却 build 不报错。配置防护（`.vscode` 关 markdown formatOnSave）只是辅助；编辑器无关的兜底是这道校验（可进 CI）。

- **2026-06-26** 「AI 生成 HTML」第二条生成路的规范（与「函数/引擎生成」并存，避免每次返工）。**两条生成路**：①函数路 = `render.mjs`+`npm run build`，MD→HTML 确定性；②AI 路 = 我（AI）按 MD 手写成品 HTML 直接落 `dist/`，**不经 render/build**。**编辑两路统一走老编辑器 `npm run edit` 写回 MD**（`patchMarkdown` 确定性）；**MD 永远是源真相**。AI 路出货 HTML 必须守下面 5 条，否则编辑器（超集渲染版）与出货页会漂移：
  1. **MD 先行且对超集合法**：先落结构化 MD，`validateBlocks` 要过。选正文 block 的 KEY 三看——**语义**对得上、**body 是 `<div data-field>`**（多段富文本禁选 `<p data-field>` 槽，如 `installation.body` 是 `<p>`，塞「h4+多段 p」会触发 §2.4 拆裂只剩首段可编辑）、**模版内位置**（决定渲染顺序，须与文章原序一致）。本页实例：功能→`overview`、比较→`main_features`、案例→`which_better`（位置 110<166<290，且都是 div）。
  2. **HTML = 共享 chrome 逐字复用 + 仅重写产品正文**：head/header/nav/footer/photoswipe 从现成产物页（如 `single-girder-eot-cranes`）逐字复制（那部分天然 1:1）；只重写 hero/面包屑/`#product`/related。`#product` 须从标题包到询盘表单才闭合（§7），related 在其外（全宽）。语言切换/订阅表单 action 里的产品路径替换为本页 slug。
  3. **正文结构与超集渲染同形**：每段写成 `<section class="pro-info clearfix"><h3>…</h3><div>… h4/p/ul 同级 …</div></section>`，与 `render.mjs` 从同一 MD 的输出同构——保证编辑器所见与出货页结构对齐、改动可一一对应。
  4. **缺图按 known-leftover**：`<img>` 带 `width/height`，缺图不破几何，后补素材即可。
  5. **铁律：AI 路页面不准 `npm run build`**（引擎产物会覆盖 AI 产物）。登记进 `build.mjs::pages` 只为让编辑器能服务该 slug（加数据≠跑 build）。编辑写回 MD → 要更新出货页时**再走 AI 路按最新 MD 重出 HTML**对齐。验证 = 标签平衡 + 与参照产物页结构比对（不跑 build）。

  > 术语白话：**chrome** = 每页都一样的外壳——顶部语言切换、导航大菜单、页脚、以及 `photoswipe`；整段从现成产物页复制、一字不改。**photoswipe** = 产物页 footer 前那段 `<div id="gallery" class="pswp" aria-hidden="true">…</div>`，是默认隐藏的全屏看图灯箱，点正文产品图才弹出，所有页相同（平时不显示，所以容易没注意到它）。**同形** = 手写正文的 HTML 骨架（`section.pro-info > h3 + div`，h4/p/ul 与 div 平级、不把内容嵌进 `<p>`）要与引擎从同一 MD 渲染出的结构一致。**known-leftover（已知遗留，缺图占位）** = `<img>` 带 `width/height`，图 404 也按框预留、版面不塌；后补素材按同名文件丢进 `assets/img/product/` 即显示，HTML 不改。

- **2026-06-29** **post（文章/案例）页族实施方案（实跑验证中，俄罗斯门机案例当试金石）。** 文章与产品/分类的本质区别：正文是**自由散文 + 逐图自定义排版**（这段两列、下段单列），不是固定 schema。但用户硬约束「**body 必须可见即可编辑**」。结论链（物理定律）：① 「可编辑」⊕「任意自由 HTML」互斥——能就地改的前提是内容符合编辑器认得的坐标，故自由 HTML 出局；② 但把**布局**与**值**切开即两全：**布局 = AI 烧一次的死骨架**（带 marker，不在编辑器改，要改=重烧），**值 = 落 MD 的活文字/图**（可见即可编辑）。改值不碰骨架 → `htmlToMd↔mdToHtml` round-trip 不会烂版式。
  - **内容槽约定（复用现有坐标，零新机制）**：长正文段→`## 块`（坐标 `mdbody:KEY`，editor 当 rich 改）；标题/图文件名→frontmatter `body.<语义id>`（坐标 `fm:body.*`）。骨架里每个文字/图槽挂 `data-field`+`data-edit`；同一版式容器多图用 `body.<段>_img<n>`，**排版由父容器 class（`fig-full`/`fig-2col`/`fig-grid`）决定，逐段自由、不需固定结构**。editor.js / patchMarkdown **零改动**即可就地改值写回 MD。
  - **一套槽约定 + 两条同步路（呼应 2026-06-26 两条生产路）**：**A 路（默认 ~95%）**＝骨架当「每篇一份模版」存 `src/templates/posts/<slug>.html`，引擎按 MD 填值 → 改文字 `build` **自动重渲**（严格优于 AI 路：白赚可编辑 + 免重烧）；**B 路（逃生舱，极少）**＝骨架只手写进 `dist/`，改文字后手动重烧对齐（套 2026-06-26 AI 路 5 条）。选路规则：body 由标准件（段/标题/图/表）搭成→A；需「填骨架表达不了」的一次性特殊视觉→才降 B。**两路编辑体验一致**（都是改 `body.*`），只差出货页靠引擎重渲还是 AI 重烧。
  - **A 路前提**：每篇 post 的 slug 在 `build.mjs::pages` 指向自己那份 `posts/<slug>.html`——`pages` 本就是 slug→模版映射，**配置层即可，不动引擎**（`render.mjs` 按 marker 填值通用、不认页族）。落地时先验证此条。
  - **TOC（左栏目录）**：JS 扫 body 里 h2/h3 自动生成 + 锚点，从原站逐字复制当 chrome，零引擎介入；只需保证骨架渲染出带 id 的真实 h2/h3。**改版式 = 重烧骨架**（A 重存模版 / B 重写 dist），非日常编辑。

- **2026-06-26** 固化 **§9「真实页→模版转换规则」**（页族无关、与 §2 对称的通用方法论）：切块→判形→命名→抽模子→复 chrome→守硬约束→验，7 步 + 形态→marker 速查表。起因：要做 category 页族（品类页 `double-girder` 结构异于单产品 product@1），怕生模版时不照规则——故**先把规则钉进 CLAUDE.md，再按规则生模版**，不靠记忆。生模版交付时附 7 步自检对照表，`verify:geom` 兜底。

- **2026-07-01** **SEO 工作范围拍定**：SEO 分两层——①**技术 hygiene**（meta/canonical/OG/JSON-LD/sitemap/robots/图片压缩/内部链接）是代码工作，归 AI 负责，可清单化、可验证；②**内容策略、关键词/竞品调研、外链积累、多语言（hreflang，依赖尚未拍板的 i18n 架构）、监测运营**不是代码能解决的，AI 不做、也不该拍脑袋硬做。做完①不等于能提升排名——那要靠②，是运营/内容侧的判断，不在本系统范围内。具体缺口清单见 §8。

- **2026-07-01** **询盘表单去重为共享 fragment**：巡检发现表单在 5 份模版里逐字复制（产品家族/文章家族各一份变体，字段集还不一致），且都是 WordPress+WPForms 的死快照、无真实提交后端。抽成 `src/fragments/inquiry-form.html`，`build.mjs::composePage` 与 `verify-geom.mjs`（独立维护一份 `compose()`，两处都要接 `{{INQUIRY_FORM}}` marker 替换，改一处忘了另一处会导致 A/B 几何假性不对齐——已踩过这个坑）统一注入；两个家族字段集合并取并集（含文件上传）。**后端提交方案明确暂缓，不实现**：过程中发现本环境挂着真实 AWS 凭证（账号 `125131361182`，`aws-cn` 分区），一度讨论自建 Lambda，用户明确"先别真发，后续再定是接第三方还是自建"——**未经用户进一步明确指示，不要往这个真实账号创建任何云资源**（哪怕看起来只是"随便建个测试用的"）。

- **2026-07-02** `pages[]` 每条加 `type`（`product`/`post`）与 `mode`（现只有 `"render"`）两个字段，作为"页面登记层"的路由标记。**mode 判断权归调用方，不进 `composePage`**：`composePage` 只专心做 render（template+MD→HTML），是否调用它由 `build()`（已有）和 `edit-server.mjs`（新加）各自按 `page.mode` 分流决定——`composePage` 内部不再有无条件 `throw`。原因：`composePage` 结构上就做不出"非 render 页面"该有的行为（比如未来若真出现 static/AI 手写页面，编辑器该读现成 `dist` HTML 注入编辑器，这跟 `renderBodyFromMarkdown` 是完全不同的代码路径），硬把判断塞在 `composePage` 里只会让编辑器在该走另一条路时直接炸（之前 `composePage` 无条件 throw，`edit-server.mjs` 对任何已注册页面都无脑调用它，非 render 页面会导致编辑器 500）。**目前 7 个页面全是 `mode: "render"`**，这次改动是打地基、不改变任何现有页面输出（`verify:geom` 已跑过确认 1:1）。顺手删掉了 `multi-point-suspension-cranes` 那条过时的"AI 生成出货 HTML，勿 build 覆盖 dist"注释——实测其 `dist` 产物已和现算 render 输出逐字节一致，早已收敛成真正的 render 页面，注释是历史遗留。

- **2026-07-02** **SEO base URL 拍板**：生产环境中文站走 `/zh/` 子路径（`https://www.dgcrane.com/zh/...`），不是根路径。**Why**：为以后接多语言（英文站等）预留位置，不用等真要做 i18n 时再迁移路径、动所有已发布 URL。**How to apply**：canonical / Open Graph / JSON-LD / sitemap.xml 里所有绝对 URL 都要拼上 `/zh/` 前缀；`§8` SEO 技术 hygiene 缺口现在可以动手补了（此前卡在这个决策上）。

- **2026-07-07** **i18n:apply 接通翻译写回链路（本地版 M3 translate）**：回路 寻找→翻译→写回→抬戳 的写回段此前只有悬空库函数 `markTranslated`、无调用方。新增 `scripts/i18n-apply.mjs` 两阶段驱动，强制边界（用户拍定）：**代码找活 + 代码写回，AI 只在中间「翻译」一个节点出手，既不选址也不落盘**。`--emit` 调 `i18nStatus()` 找过期字段、`fieldValue` 判 fm/块得坐标+取源文本吐 JSON（零 AI）；`--from <译文json>` 代码重算坐标（不信外部传入）、`patchMarkdown` 逐字写回（固定 `"text"` 不触发 `htmlToMd`，因译文是 MD 非编辑器 HTML）、`markTranslated` 抬戳记事件。顺带修 `setTranslatedRev`「名册外字段静默 no-op → 源新增段永久 stale」隐性 bug（改为按缩进插入）。产品期翻译节点换 Lambda、emit/apply 代码原样上云。

- **2026-07-07** **i18n 检测路径彻底去 git（决策㉗ 落地到代码）**：`i18n-touch.mjs::touch` 原用 `git show HEAD:<file>` 当"上次状态"基准比对字段变化——违背"git 只是代码仓、内容真相不在 git"。改为 **MD 自存指纹**：frontmatter 新增 `i18n_fp:` 段（扁平点键，镜像 `i18n_rev` 结构），存「上次抬戳时各字段值的 sha1 前 12 位」。**不变式**：`i18n_fp[字段] == 上次 i18n_rev 抬戳时刻的字段值指纹`，由 `stampOnSave`（编辑器保存路）与 `touch`（编辑器绕过的兜底）共同维护——两者抬戳时都把该字段指纹刷到当前值，故混用两条路也不会重复抬戳（已四场景验证：baseline 不抬 / 手改抬 / 幂等 / 编辑器保存后 touch 不重抬）。首次运行（无 `i18n_fp`）只落基准、不抬戳。指纹写回走 YAML CST 往返（`writeFingerprints`，`lineWidth:0` 保注释/flow、diff 干净），`setIn` 用显式二元路径避免点键被拆。**残留**：`gitActor()` 仍读 `git config user.name` 取操作者名——那是归因、非变更检测，不违反本约定（产品期由 auth 提供 actor）。至此 i18n「找改动」全链零 git。

- **2026-07-07** **i18n 翻译策略 U-1/U-2/U-3 拍定并落地（DECISIONS #7/#8/#9 从 OPEN 转 RESOLVED；引擎/渲染零改动，全落站点层+i18n 脚本）**。三条：
  - **U-1 不翻译字段**分两层。①**整字段**（图路径/URL）：可翻译名册 = 推导集合 `{模版 data-edit∈text/rich 的坐标→字段} ∪ SEO白名单[page.title/description] − {image/link}`；`image`/`link` 由 `render.mjs` 按标签判、天然排除（非字段名白名单，守 §2.1）。**"先校验、后推导"**：名册仍手埋 `i18n_rev`，`scripts/i18n-validate.mjs` 校验它 ≡ 推导集合（挂进 `npm run check`，误加 image / 漏加新 text 段即红）；站点层策略常量 `SEO_ALLOWLIST` + `STRUCTURAL_EXCLUDE=[breadcrumb.trail]`（trail 逐镜像手写、分语言结构，label 虽 text 也不走戳）。②**行内保护词**（型号 HD/CD、品牌）：嵌在 rich 块里没法按字段排除，走站点层 terms 表 `lock` 段。
  - **U-2 术语表**与 U-1 行内保护词**合一**：`src/i18n/terms.<src>.<tgt>.yaml`（`lock:` 原样保留 / `map:` 中文→固定英文）。`i18n:apply --emit` 把本页相关术语（`relevantTerms` 选料）注入翻译提示，交翻译节点（AI）遵守——**纯提示词，不做后置硬校验**。（**2026-07-08 简化**：初版曾加 `lock-lost`/`map-residual` 的 lint + 独立 `i18n:lint` 门禁，用户指出对"能读指令的 AI 翻译节点"属过度设计——AI 看提示就遵守、lint 每次都过；且逐字校验误报率高（初版对合法变体误报 81 次）。故删除整个 lint 层（`i18n-lint.mjs`、`lintField`/`lintTarget`、`--lint`），terms 表回归纯提示词。**日后若把翻译节点换成 Google 翻译这类读不懂提示的笨 MT，再把 lint 加回**——彼时它才有价值。）
  - **U-3 部分翻译态 = 上次英文 + 发布门禁**（**否决蓝图原"藏掉"倾向**——会藏有效旧译）。**字段过期**（`0<译戳<源戳`）照渲上次翻好的英文，**渲染层一字节不动**（`render` 纯从目标 MD 出，不读戳）；**有从未翻译字段**（源有戳、`translated_rev` 缺/为 0）的目标页 → `build.mjs::isPublishable` 判不可发 → 跳写 `dist` + 不进 sitemap/hreflang（build 层读戳决定出不出，与 render 分离）。**源新增段**用 `i18n:apply --sync-structure` 把源文本灌进目标当占位（不写 `translated_rev` → 从未翻译 → 被门禁挡），保镜像结构完整、build 不因必填缺段中止；译文由 `--from` 逐字转正。**How to apply**：术语/锁词增补改 `src/i18n/terms.*.yaml`（走评审）；新页族/新段落如引入分语言结构字段，加进 `i18n-validate.mjs` 的 `STRUCTURAL_EXCLUDE`；这些站点层常量终态迁 `site.config`。**未动**：语言切换器仍是死的 WordPress 残留（独立缺口，另办）。

- **2026-07-08** **语言切换器接活（前一条"未动"缺口清零；数据驱动、守 §2.1）**。原状：header/footer 两个 fragment 各写死 34 种语言的 TranslatePress 残留（`trp-language-switcher`），`href` 全指向旧站 `single-girder-eot-cranes` 页且带抓取追踪参数 `?sa=X&ved=`，与当前页无关；en 镜像页上"当前语言"还错标成简体中文。改法：① `build.mjs` 抽出共享 `siblingsOf(page)` = `i18nGroups ∩ DEPLOY_LANGS ∩ publishableSlugs`（**`seoHead` 的 hreflang 也改为复用它** → 切换器可切语言 ≡ hreflang 互指语言，永不"能切但悬空"）；② 新增 `langSwitcher(page)` 生成器（当前语言=禁用 pill，其余=各自 `pageUrl` 真链接；只 1 种语言→只出当前 pill、无死链）+ 站点层语言标签表 `LANG_LABEL`（同 `DEPLOY_LANGS`/`OG_LOCALE` 属 i18n 配置、非内容特判，终态迁 `site.config`）；③ 两 fragment 的死块换成 `{{LANG_SWITCH}}` marker（净删 236 行），`composePage` 用 `.replaceAll` 按页注入。**几何不破**：`verify:geom` 只测 `[data-block-id]`（切换器无此属性、不被测），且 A/B 同注入同一 marker → diff 恒 0；但坑账#4 要求 `verify-geom.mjs` 自带的 `compose()` 也同步认识 `{{LANG_SWITCH}}`（已改，签名加 `page`）。**效果**（dist 已验）：zh 5-ton→可切 English 指 `/en/...`；en 5-ton→当前正确显示 English、可切简体中文指 `/zh/...`；zh-only 页只显当前语言无死链。**数据驱动**：以后加 en 镜像，切换器自动多出选项，零改动。`npm run check` 全绿（8 测试 + i18n:validate + edit:probe + verify:geom 1:1）。**残留**：footer 订阅表单（`wpforms-780`）`action` 仍带 `single-girder...?sa=X` 死链——那是 §8"订阅表单无后端"另案，未碰。

- **2026-07-08** **丢 Python（phase 1 缺口）**：`verify:geom` 与 `npm run serve` 原各起一个 `python3 -m http.server` 服务 dist——给 CI/后台平添系统依赖。新增 `scripts/static-server.mjs`（极简 Node 静态服务：MIME 表 + 目录→index.html + 防目录穿越，`startServer(dir,port)` resolve 到已监听的 server）。`verify-geom.mjs` 改 import 它、`server.kill()`→`close()`；`serve` 脚本换成 `node scripts/static-server.mjs dist 8080`。**至此仓库零 Python 依赖**。验证：verify:geom 两页仍 1:1、serve 冒烟（页面/资产 200、root 外文件取不到）、`npm run check` 全绿。
- **2026-08-07** **新系统（JSON + Astro）POC 五条验收全绿（V1 geom 1:1 / V2 写回 / V3 状态门 / V4 schema 执法，20/20），需求定稿 v2 §9+§11 拍定，转正式工程。**
  - **T1** body 存法 = 语义 type 树（C）；**T2** post 版式 = 每篇独立布局组件（倾向），第一篇迁移时落定；**T3** 内容 = 本地 git 仓先行、终态 S3；**T4** 批量人工界面 = 缓建。
  - **§11**：D1 HTML=原料+证人非真相（只有 HTML 时：AI 读→烧 JSON→geom 验→退场）；D2 HTML→组件先判族（见过只烧 JSON，没见过才烧组件）；D3 模版纪律（组件跟族不跟页、全站个位数封顶；族级分文件+段级小组件+页级装配清单；禁按页出模版）。
  - **POC 落地物（site/）**：`scripts/md-to-json.mjs`（MD→JSON：烧树+schema 验+sharp 探测尺寸）、`src/content-schema.mjs`（节点/标记注册表+写时校验）、`src/render-doc.mjs`（walker：树→HTML，站点约定集中一处）、`src/tree-utils.mjs`（切块/规整/写路径，组件与端点共用）、`src/components/ProductPage.astro`（product.html 逐标签移植）、`scripts/edit-server.mjs`（8092：写回端点+上传压缩闸门 R24+双产物 dist 生产/dist-edit 草稿预览 R33）、`edit-layer/`（demo 移植+保存流：commit 时缓存 getJSON、保存永不 DOM 反解）、`scripts/geom-check.mjs`、`scripts/accept-poc5.mjs`。
  - **写回链铁律（新）**：body 树在编辑 commit 时缓存 TipTap getJSON()，写回端点 normalizeTree（树→树：层级回退/剥前缀/清空段）→ validateDoc → 落盘 → astro build。**HTML→树方向的解析在新系统不存在**（htmlToMd 退役）。
  - **旧系统处置按定稿 §10**：render.mjs/build.mjs/edit-server.mjs/editor.js/md-write.mjs 进入退役倒计时（新站功能对齐后正式下线）；本文件 §2/§4/§5/§9 等 MD 时代 doctrine 随之失效，正式迁移完成后重写本文件。在那之前，旧系统的 build/verify 仍是 dist 现行产物的维护线，别混用两套引擎改同一页。
  - **下一步顺序**：overhead 超集扩段（表格路径实跑）→ 余 8 页迁移 → i18n 平移（族谱 registry.json，R35-R45）→ SEO 头平移（R46）→ 搜索/首页/目录平移（R47）。

- **2026-08-07（晚）** **F3 i18n 平移落地（R35-R45 全链，28/28 验收 + geom 六页全绿）**。旧 MD 时代的 i18n 机制整套迁到 JSON 载体，机制不变、载体换：
  - **镜像树**：`site/content/<lang>/<type>/<pageId>.json`（zh 源在 `content/<type>/` 根）。两份 en MD 经 `md-to-json.mjs` 直通转换落 `content/en/posts/`（`page.slug` 自带 `en/` 前缀，路径天然分流，转换器零改动）。
  - **族谱（R37）**：`site/src/i18n.mjs` 扫 content 树**现算派生**（pageId=文件名=跨语言配对键；`content/<lang>/` 一层目录=镜像位），`registry.json` 只是物化快照（`i18n:registry --write/--check`，可全量重建、不是第二真相）。同文件还出 `pageUrl/siblingsOf/langSwitcher/isPublishable` + 站点层配置（SITE_ROOT/SITE_BASE/DEPLOY_LANGS/LANG_LABEL，终态迁 site.config）——**全站唯一一份 i18n 逻辑，四个消费方共用**：路由（门禁）、Chrome（切换器）、i18n 脚本、edit-server。
  - **语言切换器数据驱动（R38）**：`Chrome.astro` 改收整 `j`，按 slug 查族谱 → 当前语言禁用 pill + 兄弟真链接（trp-* DOM 逐字平移）；生产构建只链「published 且过门禁」的镜像，预览（INCLUDE_DRAFTS）不设限。与旧 dist 逐字节一致（新旧 pill 对比验过）。静态 `lang-switch.html` 占位块删除。
  - **发布门禁（R43）**：en 路由（`pages/en/posts|products/[slug].astro`，与 zh 源**共用同一份布局组件**——骨架跨语言一致、只文字不同）双闸门：状态门 + `isPublishable`（有「从未翻译」字段=源有戳译戳缺 → 不出 dist；已译但过期照发）；编辑预览全放行（占位也要能预览）。
  - **翻译回路（R40/R41）**：`i18n-status/touch/apply` 三脚本 JSON 化。**树字段翻译走 run 制**（R41）：emit 把 body 树按路径抽成 `{content[2]: 行内 md}` 清单（段落/标题的行内容 + 图片 alt），AI 只译文字；apply **克隆源树**按 run 路径回植（`applyRuns` 覆盖不齐/路径错位当场抛），**骨架恒 ≡ 源树、译文永远爆不了骨架**，行内 marks（bold/italic/link）由译文自由重排（`inlineToMd ↔ inlineMdToNodes` 互逆，span 标记 md 表达不了→抛错不静默）。文本字段逐字写回。术语表平移 `site/src/i18n/terms.zh-CN.en.yaml`（纯提示词，旧 U-2 决策沿用）。
  - **戳与指纹**：`i18n_rev`（源戳）/`i18n.translated_rev`（译戳）/`i18n_fp`（指纹）都存 JSON 顶层；指纹对树取**键排序规范化串行**的 sha1（免疫键序漂移）。`touch` 兜底检测（编辑器绕过路），`stampAfterSave` 挂进 edit-server 保存链：**zh 保存 → 名册字段源戳+1 刷指纹（R43 改 zh 自动标 en 待译）；en 镜像保存 → translated_rev 抬到源戳（R44 镜像直改=人工翻译）**。补丁路径剥一层 `.body` 尾缀即名册字段，名册外（图/数组/trail）跳过。事件留痕 `site/.i18n-events.jsonl`。
  - **保存寻址升级**：`/​__save` 的 slug 从「末段文件名」改为**内容相对路径**（`en/posts/xxx`）——镜像与源同 pageId，旧寻址有歧义。edit-layer 同步改；accept-poc5 四处 slug 更新。
  - **共享重构**：mdast→树映射抽成 `src/mdast-tree.mjs`（md-to-json 与 i18n-apply 共用，重烧逐字节回归验过）；`tree-utils` 补 `getIn`（与 setIn 对称）。
  - **验收 `scripts/accept-f3.mjs`（28/28）**：族谱派生/切换器三态/touch 检测+幂等/status/emit/文本写回抬戳/树 run 全链/覆盖不齐拒收零污染/门禁除名+预览保留+还原回/sync-structure 灌占位/HTTP 保存双路抬戳/事件留痕。
  - **残留（进 F4）**：`i18n-validate` 名册≡推导集合校验未迁（.astro 组件的 data-edit 标记不全，推导口径待 F4 一并定）；hreflang 输出在 F4 SEO 头里接族谱（`siblingsOf` 已备好同口径）。

- **2026-08-10** **DeepSeek 烧制台落地（第三条入口路，只加不拆；spec+计划+9 任务 TDD 子代理执行，双审制）**。AI 烧节点从会话内搬到界面：8092 编辑服挂 `/__burn` 控制台——贴裸文/URL → DeepSeek 两阶段（段映射表→逐段烧）→ 代码组装 → 预览+校验报告 → 人工决定落 draft。**铁律不变**：AI 只产 markdown/简单 JSON，切块编号、树转换（mdToDoc）、schema、逐字溯源、组装全归代码（`site/src/burn-lib.mjs` 纯逻辑 + `site/scripts/deepseek-burn.mjs` 编排，`callAI` 依赖注入可 mock）。**防凑字段**：字段分级（正文/规格=规范化后逐字子串硬查；标题=相似/包含；SEO 描述=概括豁免+报告标出；chrome=站级默认）；凑字段触发段级重修（≤2 次），屡败段缺席标红不静默出货；段级硬失败（超时/截断）降级 failed 不拖垮整次；4xx/截断快败不重试。**产物强制 draft**（writeDraft 撞名加序号、永不覆盖存量），精修走现有编辑器，旧路（md-to-json、会话内烧）全保留。key 只活服务端环境变量；服务绑 127.0.0.1（url 参数=带读回 SSRF 的收敛）。**执行期两条实证教训**：①「失败段缺席」只对组件有守卫的字段成立——`related_products`/`specs`/`hero.highlights`/`installation.cases` 组件无守卫读取，缺席即炸 rebuild，必须站级默认；②Astro rebuild 需 **node ≥22**（本机默认 node20 起 8092 时 /__save、/__burn-save 重建会失败，用 nvm 22 起服务）。验收 `npm run accept:burn`（65 条，无 key 全链 mock）；真 key 验收步骤见计划 Task 9。设计：docs/superpowers/specs/2026-08-10-deepseek-burn-design.md；计划（含执行期偏差记录 7 条）：docs/superpowers/plans/2026-08-10-deepseek-burn.md。

- **2026-08-11** **烧制台两连改：选族 + 对照表退役（用户连续追问 + 4 评审并行收敛）**。①**选族**：控制台下拉「自动判断（默认）/产品页族/文章页族（待建灰）」；`burn()` 加 `family`，auto 时 AI 先判族（`classifyMessages`），判成未建族干净拒绝（不硬烧），显式选族跳过判族。②**对照表/块号规划层退役**：实战两次失败（无空行文章块号越界、发明近义字段名）全炸在规划层，且用户看不懂段号报告=人工闸门失效——改**一把梭**：AI 按内容理解一次出整页 JSON（`oneShotMessages`，max_tokens 8192），机器验收四道：防编（逐句规范化子串查全文）、**防错位**（`auditPositions` 命中位置机器算：同段复用告警（顺序颠倒审计上线后经真 key 复验实证全是误报——页面栏序由组件固定、文章栏序不同≠装错格——已退役））、防漏（`report.unused` 整段反查）、白名单；失败格单独重烧并**喂回拒收原因**（温度 0 下不喂就是确定性重放，重烧必败）；截断干净报错（自动逐格降级在 roadmap）。`checkPlan`/`planMessages`/merge 删除；**报告层纪律：内部机制词（段号/阶段/重试）永不上桌**，只给预览+对不上的原句+未用段落+fieldMap。验收 accept:burn 72 条全绿；geom 六页 1:1。详见对话记录 §六。

- **2026-08-12** **协作规则（用户拍定，长期有效，1-5 用户原话固化，6-9 我方补充经用户要求）**。起因：翻译块重设计讨论中用户批评"我一说你就说我的想法好"——回声式附和毁掉参谋价值。
  1. **我先给结论和依据**，不绕弯。
  2. **对用户的想法：有问题直接说不行 + 依据；行就只写进方案，不夸**——禁"你想得对/这个想法好"类评价语。
  3. **建议必须有实质**：机制、代价、适用条件；禁空泛正确的废话。
  4. **批评对事不对人**：只说方案哪里不行，不比较"谁的想法好/谁的想法坏"。
  5. **业界做法必查真实在用系统**（搜索/官方文档）再下结论，不靠训练记忆回答"别人怎么做"。
  6. **行为级结论用实验兜底**：能跑就跑（build/脚本/几何比对），能查就查；不报未经实证的"应该"。
  7. **每个推荐附适用边界**——"什么条件下该选另一个方案"；没有永远对的方案。
  8. **报账诚实**：做完/没做完/挂了如实报，宁可报忧不报假喜（本项目有假 repaired 前科，c4f1d63）。
  9. **不确定就说不确定**，并给出验证路径。

- **2026-08-13** **第 6/9 条的执行细则（用户拍定，起因：信任事故）**。本次模版/Astro 问答中，连续两次凭训练印象对「本系统实际行为」下结论（①"缺数据构建就报错"——与按需渲染矛盾；②"必填是默认"——把可选/骨架比例说反），均被用户指出后才去查证；第三次 grep 核实后的结论才成立。用户质问"还能不能信任你"，拍定以下收紧细则：
  1. **凡「这个系统实际怎么跑」类结论：先贴证据（文件+行号，或命令输出），再下结论；没有证据不下结论。**
  2. **只查到一半的，明说"这部分没查"**并给验证路径；禁止用猜测把缺口补齐、说得像全查过。
  3. 用户对任何无证据结论可直接打回，不用客气。
  > 教训定性：根因不是知识不够，是没执行已有第 6/9 条——凭"Astro 一般长什么样"的印象张口就来，而不是先看本项目自己的文件。细则不新增原则，只把"查"从可选项变成前置条件。

- **2026-08-14（晚）** **模版 doctrine 拍定（spec B2）：一 astro 一模版 + 换站零改动**。起因：我把「旧 4 篇值不值得当模版」替用户判了（"槽位不通→不 kit 化"），用户驳回并拍定四条：①**一 astro 一模版**（配齐 index/meta/example 三件即入烧制可选列表）；②**自己套自己**；③**通用件不吞并**（PostPage/ProductPage 是"合几个为一体"的可选项，各原件保留）；④**对不上就空着**（fit 是用户判断权，系统只做逐字闸防编造，缺席槽 T9 守卫裁掉）。与 WordPress 模版模型同构。**换站验收标准**：换站=只带模版套件+内容 JSON+站点 chrome（site/src/chrome/），引擎/脚本零 diff——为此已做：组装 chrome 值全从套件 example.json 克隆（引擎 grep 无站名）、提示词示例自 example 现取、chrome 文件站内化（拷贝不搬移）、`kit-init` 一条命令升格任意 .astro 成套件（标记顺序自动配对）。**AI 的行为修正**：不对用户的方案做"可复用性"预判，只报机械可行性与代价；见 2026-08-12 协作规则第 2/7 条。

- **2026-08-17** **烧制台校验层收敛：硬闸=确定判定，概率判定只提示（用户质疑"校验太多"→授权 AI 按「真防得住/有用/不啰嗦」裁定）**。裁三处、降一处，**verbatim 逐字/白名单/重叠>50%/schema 四道硬闸一道不动**：①**裁** auditPositions 同段复用告警——结构性误报源修不好（分不清「AI 把一段塞两格」与「原文本身重复」，散文+规格表同句是常态）；重度重复由 findDuplicates 硬闸管，轻度的人眼在 fieldMap 行自见。②**裁** assemble 期两次 validateDoc（plantField/assemblePost）——与验收期 verifyTree 验的是同一确定性 mdToDoc 输出，同进程不可能失败；writeDraft 在浏览器往返后那次是信任边界，保留。③**挪**「hero 图不烧」「trail 人工确认」两条 100% 开火的恒提示出 per-run 报告 → burn-console 静态常驻区（每次都喊=没喊，告警疲劳毒化整个提示层）。④**降** 相似级（section 标题/sections heading/text+similar 含 hero.headline）拒收→提示进 issues——核心理由=爆炸半径错配：标题级概率判定失败会把逐字满分的正文整格拖死。level 语义从此干净：`verbatim`=硬闸/`similar`=提示/`summary`=豁免（meta.md 已同步）。**机器只枪毙它能 100% 判对的东西；「像不像」一律变成给人看的提示。已知风险（用户知情拍板）**：hero.headline 同降后 AI 组装营销语进 hero 无机器拦、靠人审预览；反悔=单字段恢复硬闸。测试：accept-burn 128/128（新增 5b 降级行为 3 断言；钉 18 失败刺激源从假标题换成正文编造）。

- **2026-08-18** **i18n 人审闸拆除：免审直发（用户拍定，全链落地同日完成）**。背景：用户判「人工审查翻译对不对」对团队无效——审查者是中文母语，看英文判断不了对错，审=花钱买心安。拍定：**翻译不再等任何人审，机翻直接上线；翻错了谁看见谁在镜像页就地改（可见即可编辑），改完存 TM 永不再犯；数字/型号守恒机器硬查——明确不留**。用户真正要管住的只有「翻译前置」：哪些翻（collectUnits 全树扫、默认全翻）/哪些不翻（SKIP_KEYS 键排除 + breadcrumb.trail 路径排除 + VALUE_SKIP 值形态 + terms lock 行内）/如何翻（TM 命中复用 + terms 表注入提示词）——这三问机制本就在跑，本次只拆状态闸。落地：① `config.json` `review.en` 拨 `auto`（该档代码本已预留，pipeline 镜像直发早认它）；② pipeline 机翻在 auto 语言直写 `approved`（`origin:'engine'` 与人审区分——**人改永远压过机翻**：adoptMirror/`/__i18n/tm` 写 `origin:'human'`，同句全站复用，窗口竞态机器稿让位逻辑不动）；③ 存量 745 句 draft 批量转正（origin 不动不冒充人审；failed 1 句不动——那是引擎错误非审核，红深标+retryFailed 救济通道保留）；④ 存量镜像 5 个源已发布的直发 published、5 个源 draft 的维持 draft（M-6 不放宽）；⑤ registry 快照重建。**质量杠杆从此只剩一个：术语表 `terms.zh-CN.en.json`（lock/map）——发现译错先补术语表修一片，不是只改那一句**。控制台审阅页/通过按钮保留（failed 救济用），待审数自此恒 ~0。顺带补欠账：上轮三态注解 WIP（pending 黄/untranslated 红浅/failed 红深）只改了模块没改断言，两条陈旧测试按新语义更新。验证：accept-i18n2 82/82（含新增「auto 直写 approved」红→绿用例）、registry ✓、node22 build 15 页、8 个 en 页入 dist、正文零中文泄漏（导航菜单中文=旧站链接，§8 已知遗留非本次引入）。TM 迁移前备份 `src/i18n/tm.zh-CN.en.json.bak-20260818`，确认线上无恙后可删。
