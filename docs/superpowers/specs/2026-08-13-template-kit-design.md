# 模板套件机制设计（Template Kit）

> 日期：2026-08-13
> 范围：**spec A = 产品页统一**（文章页补齐 = spec B，后续）
> 状态：设计已与用户逐节确认 + 6 项批判审视通过

---

## 1. 背景与问题

现状两处写死，产品页被钉死在 ProductPage 上：

- **烧制**：`site/scripts/deepseek-burn.mjs:13-15` 三个常量 `META`/`ASTRO`/`REF_JSON` 写死指向 ProductPage
- **路由**：`site/src/pages/products/[slug].astro:8,22` 写死 `import ProductPage` + `<ProductPage j={j}/>`
- 数据字段 `page.family: "product@1"`、`page.geomBaseline` 是旧 MD 时代残留

文章页（post）已是动态机制：`site/src/pages/posts/[slug].astro:10-21` 用 `import.meta.glob` 扫描、按篇名套同名模版。产品页没对齐。

**目标**：产品/文章平级，每个 `.astro` 是一个"模板套件"，生成/编辑/写回全动态、零写死，任何套件通用。

---

## 2. 设计

### 2.1 物理结构

每个模版 = 一个文件夹，放族目录下：

```
site/src/components/
├─ products/
│    └─ ProductPage/
│         ├─ index.astro      骨架（从 components/ProductPage.astro 搬入）
│         ├─ meta.json        字段表 [{key,shape,level}]（随搬）
│         ├─ example.json     填好的样例，喂 AI（新；复制 single-girder 当样板）
│         └─ meta.md          语义注释（可选，已有）
└─ posts/
     └─ <slug>/
          ├─ index.astro
          ├─ meta.json
          ├─ example.json
          └─ meta.md
```

约定：
- 文件夹名 = 模版名（族内唯一）
- 内部文件固定名（`index.astro` / `meta.json` / `example.json` / `meta.md`）
- 族 = 上一层目录名（products / posts）

**关键区分**：模版（骨架，少，放 `components/`）≠ 产品页（数据，多，放 `content/products/*.json`）。多个产品页共用一个模版。

### 2.2 发现机制（扫描）

扫描 `components/*/*/index.astro`：
- 有 `index.astro` → 认作一个模版
- 同名 `meta.json` + `example.json` 齐 = **可用**；缺 = 不可用 + 报缺啥
- 加模版 = 加文件夹，自动被发现
- `FAMILIES` 手填注册表（`burn-lib.mjs:78`）**退役**

扫描结果用于：烧制台的"选模版"列表。

### 2.3 出页机制（地基核心）

数据声明模版，代码读它：
- 产品 JSON 的 `page.template` 从旧路径值改成**模版名**（`ProductPage`）
- `products/[slug].astro` 改成读 `j.page.template` → 找 `components/products/<template>/index.astro` 套骨架（抄 post 的 glob 机制）
- en 镜像路由（`en/products/[slug].astro`）同步改
- `family`（判族参数）保留不动；`geomBaseline` 砍

效果：用哪个模版由数据决定，不由代码写死。换模版 = 重选 + 重建（系统自动更新数据那行）。

### 2.4 烧制机制

- 控制台列出所有可用模版（扫描结果）给用户选（或 `auto` 让 AI 判）
- `burn()` 收"选了哪个模版"，动态加载该套件 astro+meta+example
- AI 提示词用该套件 meta（字段表）+ example（样例）
- 校验 + 预览用该套件骨架
- 落 draft：数据自带 `page.template = <模版名>`
- `deepseek-burn.mjs` 的 `META`/`ASTRO`/`REF_JSON` 三个写死常量退役

### 2.5 收尾

必做（产品统一）：
- 砍 `geomBaseline`（代码 0 消费，改 `i18n-collect.mjs:5` SKIP_KEYS + 测试）
- 现有产品 JSON 批量改 `page.template` = `ProductPage`（配合路由改动，**原子提交**）
- `family` 全保留（判族参数 + 数据字段都不动）
- 删 `META`/`ASTRO`/`REF_JSON` 写死常量、`FAMILIES` 退役

后续（spec B）：文章 4 篇补 meta+example，文章族上线。

---

## 3. 风险与待决（批判审视）

| # | 项 | 处理 |
|---|---|---|
| 1 | 双源核验命门（meta ⊆ astro data-field）在新结构怎么保 | **待决**：文件夹化后每个套件 meta 仍须跟自己 astro 双源核验；具体实现进 plan 时定，命门不能丢 |
| 2 | 字段语义 | `family` 保留；`geomBaseline` 砍；`template` 写模版名（不写路径，低耦合 + 业界主流） |
| 3 | 产品路由动态化高风险 | geom 1:1 兜底（改前改后逐页比）；代码+数据**原子提交**不留坏中间态；en 同步 |
| 4 | example 冷启动（新模版没 example） | 新模版上线前手写种子 example；ProductPage 复用 single-girder，不算冷启动 |
| 5 | edit-layer 是否写死 | **已核**：`edit-layer.js` 只读 `data-edit`/`data-field` marker（行 25/29），不认套件；不用动（grep 过，非推论） |
| 6 | 范围 | 拆 A/B：A=产品统一，B=文章补齐 |

---

## 4. 实施范围（spec A = 产品统一）

1. **目录搬家**：`ProductPage.astro` → `components/products/ProductPage/index.astro`（meta.json 随搬，补 example.json）
2. **产品路由动态化**：`products/[slug]` + `en/products/[slug]` 改读 `template`（抄 post glob）
3. **烧制动态化**：burn 选模版、动态取配套、退役写死常量
4. **砍 geomBaseline** + 产品 JSON 批量改 `template`
5. **验收**：`accept-burn` 全绿 + geom 六页 1:1

spec B（后续）：文章 4 篇补 meta+example、文章族上线。

---

## 5. 待用户确认的开放项

- **批判点 1（双源核验）**：暂跳过细节，列为"可能问题"。plan 阶段必须落实——每个套件 meta 跟自己 astro 双源核验，不能丢上一轮重构的防漂移命门。

---

## 6. spec B 附录（2026-08-14 实施）：文章族上线

> 实施时对 §2.5 的字面计划「文章 4 篇补 meta+example」做了一处**修正**，先行记录依据。

**修正：不 kit 化旧 4 篇，新增通用套件 `posts/PostPage`。**

- 旧 4 篇是 T2 拍定的「一篇一模版」：槽位（`body.h_price`、`card1_img`…）是**那篇文章
  专属**的语义名。给它们补 meta+example 只能让它们「被再次烧」同一篇，**不能用来烧新文章**
  （任意新文章的内容塞进另一篇文章的专属槽位 = 乱装格）。
- 烧「新」文章需要的是「N 段顺序章节」这一公共形态 → 新套件 `posts/PostPage`
  （`body.sections` 重复区：每段 heading + 正文树 + 可选配图；chrome 照抄 post@1）。
- 旧 4 篇继续走扁平组件，路由**双派发**：数据声明 `page.template` 命中套件 glob → 套件；
  否则按 slug 回退扁平组件（旧 JSON 残留的 `src/templates/...` 路径式 template 天然落空回退）。
  生产构建旧 4 篇产物逐字节不变（前后 diff 验过）。

**引擎侧（形态驱动，无页族特判字段名）：**

- 新 shape `sections`（重复章节序列）：`loadCatalog`/`auditPositions`/`previewHtml` 按
  shape 分支；`verifyByShape` 逐项逐字溯源 + 标题相似 + **段间重叠闸**（文章只有一个内容
  字段，产品侧的跨字段 `findDuplicates` 闸收进字段内）。
- `assemble` 拆族骨架：`assembleProduct`（行为不变）/ `assemblePost`（新）。族分支是骨架
  装配层的边界（骨架形态=族级差异，同「新族=新套件+新装配」），值的栽种仍按 shape 驱动。
- 判族契约直接用族目录名（`products`/`posts`），短名别名兜一层；已建族清单从 `scanKits`
  现算进提示词。`writeDraft` 按 `page.type` 落 `content/posts/`（edit-server 调用零改动），
  验证形态驱动（固定段验根树 / 重复章节验每项树）。
- 图池 v1 **顺序配段**：第 i 图给第 i 段、余图挂末段，报告注明；缺图 known-leftover 不带假尺寸。

**验收**：`accept-burn` 108/108（新增 T-post 块 10 钉）；旧 4 篇 build 产物 diff=0；
INCLUDE_DRAFTS 草稿构建套件页出页正常（sec-N 锚点进 TOC）。

**遗留（下轮）**：重复区内富文本的编辑器写回坐标真机验证；en 镜像路由的 template 派发
（等 en 路由文件的未提交改动落地后同步）；烧制台下拉本身仍是写死 HTML（单族单套件时与
扫描结果恒重合；某族出现第二套件时需接扫描渲染）。
