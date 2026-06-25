# CLAUDE.md — 项目工作规范（每次会话自动加载）

> 本文件固化已达成的规范，避免每次重复交代。**遇到新讨论拍定的约定，追加到文末「决策日志」。**
> 项目：`websitere-placement-system` —— 替代 WordPress 的内容驱动静态建站系统（dgcrane 起重机站）。
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

- 面包屑 `breadcrumb.trail` 未 data 化（超集里仍是单梁硬编码，显示「Eot Cranes」非「桥式起重机」）——待接进渲染器，使 trail 由 MD 驱动。
- 个别素材缺失需补图（如 overhead 组件 `Crane-electric-control-bo.jpg`，原站亦缺）。

---

## 决策日志（新拍定的约定往这里追加，带日期）

- **2026-06-25** 模版走「单超集 + 按 MD 裁剪」，不走「每产品一模版」。
- **2026-06-25** 用户工作流：「给文章+产品名+slug，AI 负责到 1:1」；裸文章放 `src/content/raw/`。
- **2026-06-25** 引擎铁律：禁名字驱动逻辑/白名单；渲染侧与编辑侧对称、皆从实际 `blocks` 推导；加新页族 = 加自声明模版，引擎不动（详见 §2）。
- **2026-06-25** 再平衡：刹「往深做工具」，提「把产品搬进来」；引擎纯化重构（注册表搬模版属性）等第二个页族再做。
