# CLAUDE.md — 项目工作规范（每次会话自动加载）

> 本文件固化已达成的规范，避免每次重复交代。**遇到新讨论拍定的约定，追加到文末「决策日志」。**
> 项目：`websitere-placement-system` —— 替代 WordPress 的内容驱动静态建站系统（dgcrane 起重机站）。

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
- **关键认知**：能脱离对话上下文还原页面的，是 **MD**，不是裸文章（裸文章→MD 要 AI 判断，会因上下文而异）。MD→页面才是确定性的。**上下文是耗材，MD 是资产。**

## 2. 用户工作流协议（用户只需说三件事）

用户要加/改一个产品页时，只需给：① **文章**（路径或直接贴）② **产品名** ③ **slug**（网址用英文标识）。
默认用标准超集模版，无需指定。例：

> "把 `src/content/raw/<slug>.txt` 这篇做成产品页。产品名:XXX，slug:xxx。"

**我(AI)负责剩下全部**：烧 MD → 接模版 → `npm run build` → `npm run verify:geom` 验 1:1 → 给页面，不对再改。
**用户不用碰**：MD 格式、字段名、模版裁剪。
- 裸文章原料统一放 `src/content/raw/<slug>.txt`；成品 MD 放 `src/content/<slug>.md`。

## 3. 模版方针：一份超集，按 MD 裁剪（2026-06-25 拍定）

- **同一网站同一风格 → 只用一份超集模版**，所有产品共用；渲染器按各产品 MD「数据在不在」用 `data-optional` 裁掉用不到的段，裁出不同产品页。**加同风格产品 = 只写一份 MD，零新模版。**
- 真出现**别的风格**，才另起一份超集。
- 超集模版：`src/templates/product-superset.html`（单梁 12 段 + overhead 独有 5 段 = 17 段，每可省段带 `data-optional`）。
- 收敛中：单梁/overhead 历史上各有独立模版（`product.html` / `overhead-cranes-for-sale.html`），目标是都改指向超集后退役它们。

## 4. MD 规范要点（权威细节见 `src/templates/product.contract.md`）

- MD = **YAML frontmatter + markdown 正文**，`---` 分隔；自带 `slug` 与 `template`。
- 每个模版 `data-field="a.b"` → frontmatter 对应点路径 `a.b`；正文块 `## 标题 <!--block:KEY-->`，KEY 对模版 `.body` 字段。
- 重复块 `data-repeat="X"` → frontmatter 一个数组，且 X 须在 `scripts/render.mjs` 的 `REPEAT_FM_ARRAY` 登记（新组才需加一行）。
- `components`/`crane-types` 是**双处结构**：name 同时在 frontmatter `*_images` 与正文 `###`，按同 index 对齐。
- ⚠ **契约文档会漂移**（§4 已与代码不一致）：**最终权威是 `render.mjs` 实际行为 + 现行 `single-girder-eot-cranes.md`**，契约当设计意图参考。

## 5. 命令

| 命令 | 作用 |
|---|---|
| `npm run build` | 生产构建（产物零 `data-*`，干净 HTML） |
| `npm run edit` | 可见即可编辑服务 → localhost:8081（在渲染页上原位改文字/图/链接、增删重复项，写回 MD） |
| `npm run verify:geom` | 几何回归：CDP 逐元素比对「渲染产物 vs 原静态模版」，1:1 即视觉无损 |
| `npm run serve` | build + 本地预览 localhost:8080 |

> CDP 用端口 9456（避开系统 Chrome/Edge 的 9222，**勿杀** Edge 进程）。

## 6. 不可破坏的铁律

- **结构只许存在于 MD**：模版固定、不可编辑；「某产品多/少一段、多/少一行」只改 MD，不改模版。
- **`#product` 包裹关系**：`#product` 须从标题一直包到询盘表单才闭合（`main.css` 89 条 `#product xxx` 作用域规则依赖它，提前闭合会整片塌——历史塌过两次）。`related-products` 在 `#product` 外（全宽）。
- **改完必验**：动了渲染器/模版/MD，跑 `verify:geom` 确认仍 1:1。
- **沟通记录**：重要会话存 `对话记录-YYYY-MM-DD-主题.md`（仓库根）。

## 7. 当前进度

- ✅ 确定性渲染器、可见即可编辑、增删重复项、几何 1:1（单梁 single-girder 已完整跑通）。
- ✅ overhead（FEM标准桥式起重机）接 MD + 超集模版，几何 1:1（A=超集+MD vs B=原站静态页，81 元素全对齐）。验证引擎已通用（`verify-geom` 支持 `baseline` 跨模版比对）。
- ⬜ 待定：编辑器给谁用（决定是否做后台管理 / 补富文本工具栏等缺口）。
- ✅ 编辑写回**全动态**：`classifyField` 不再用白名单，写回坐标由 `buildData` 随数据来源就地产出（取自 `## 块`→`mdhead:/mdbody:`，取自 frontmatter→`fm:`）；`htmlToMd` 支持 `<table>` 反解；组件 body 按内容自适应。27 块往返一致（编辑→保存→重渲染零变化），含两张对比表/优势/保护装置等 overhead 段。新增/改名段「能渲染、也能编辑」零改 render.mjs。
- ⚠ overhead 遗留（不阻塞，下次处理）：① 超集面包屑 trail 仍是单梁硬编码（显示「Eot Cranes」非「桥式起重机」）——trail 非 data 驱动，待把 `breadcrumb.trail` 接进渲染器；② 组件5图 `Crane-electric-control-bo.jpg` 素材缺失（原站亦缺），需补图。

---

## 决策日志（新拍定的约定往这里追加，带日期）

- **2026-06-25**：模版走「单超集 + 按 MD 裁剪」，不走「每产品一模版」。
- **2026-06-25**：用户工作流定为「给文章+产品名+slug，AI 负责到 1:1」；裸文章放 `src/content/raw/`。
- **2026-06-25**：再平衡原则——刹「往深做工具」，提「把产品搬进来」；规范轻量维护，校验器(`npm run check`)等多产品后再上。
- **2026-06-25**：渲染器扩展（接 overhead 时加，均通用、不针对单产品）——`mdToHtml` 支持管道表格(`| a | b |`→`<table>`，body 含表自动套 `.custom_tables`)与原始 HTML 块透传(`<p><img>`/`<ul>` 等原样输出)；非重复 `data-field` 图也去 `srcset/sizes`（src 用本产品图）；`buildData` **通用块映射**——非「结构块(overview/introduction/components/crane-types/production-flow/installation)」的任意 `## 标题 <!--block:KEY-->` 自动映射成 `d[KEY]={title,body}`，新增/改名段只要模版有对应 `data-optional/data-field` 即插即用，**不必再改 render.mjs**（避免写死段名）。
- **2026-06-25**：**多段可编辑正文用 `<div>`+正文块,不用 `<p>`**——`<p data-field>` 装不下多个 `<p>`，若把多段塞进一个值（`</p><p>`）浏览器会拆成兄弟节点，只有第一段带编辑手柄、其余段不可编辑。规范：多段落富文本（如 product-summary 的导语 `summary_intro`）一律用 `<div data-field="X.body">` 承载 + 一个 `## 块` 供源，渲染走 mdToHtml、编辑走 rich 往返。审计结论：overhead body 文字/图片已全可编辑，仅剩面包屑 trail（导航 chrome，待 data 化）、`提示。`（共享固定标签）、询盘表单占位标签（dynamic 模块）非产品内容。
- **2026-06-25**：**编辑写回去白名单、改全动态**——原 `classifyField` 用 `HEAD_BLOCK_OF/RICH_BODY_BLOCK_OF` 两张写死表判断字段写回 `fm:`/`mdhead:`/`mdbody:`，新段会误判成 `fm:` 导致改了不生效。改为：`buildData` 在「字段确实取自 `## 块`」处就地登记坐标（path→{md,edit}），`classifyField` 查这张随数据同源产出的动态表，查不到才回落 `fm:`；rich/text 按内容判定（含列表/表格/多段→rich）。配套 `htmlToMd` 加 `<table>`→管道表格反解（与 `mdToHtml` 互逆），组件 body 按内容自适应（列表型 mdToHtml、纯文本原样）。原则：**渲染侧与编辑侧对称，两边都从实际 `blocks` 推导，不写死配置**。验证：27 块「编辑→保存→重渲染」往返一致 + 两页 `verify:geom` 仍 1:1。
