# ProductPage 套件 meta.json — 字段语义注释

> JSON 不能带注释，本文件是套件 `meta.json`（components/products/ProductPage/）的知识存档。
> 字段清单（key/shape/level）的唯一真相是旁边的 `.meta.json`；本文件只记**为什么**这么标注的语义依据，供后续维护参考。
>
> shape 取值：`section`=`{title,body_md}`（标题+正文树）｜ `list`=文本数组 ｜ `text`=单文本 ｜ `seo`=概括豁免
> level 取值：`verbatim`=逐字（规范化后子串硬查）｜ `similar`=相似/包含 ｜ `summary`=概括豁免（报告中标出）

## 正文段（11 项，全部 `section`/`verbatim`，缺段=缺席）

`overview`、`introduction`、`advantages`、`protection`、`main_features`、`basic_params`、`spec_compare`、`spec_detail`、`which_better`、`summary_intro`、`installation`

标题走 similar 级、body_md 树逐字级。

### ⚠ `summary_intro` 特判（最关键）

`summary_intro` 组件**只渲 body，没有 title 槽**。`loadCatalog` 对该 key 做了特判（`c.key === 'summary_intro'` 时跳过 title 的核验）。新增/改名时务必同步 `burn-lib.mjs::loadCatalog` 里的特判分支。

## 特殊字段（5 项）

| key | shape | level | 说明 |
|---|---|---|---|
| `specs` | `list` | `verbatim` | `[{text}]` 结构，规格数字逐字（`spec.text` 特判读取） |
| `summary.intro` | `text` | `verbatim` | 单文本逐字 |
| `hero.headline` | `text` | `similar` | **允许等于产品名**（similar 级，非 verbatim） |
| `hero.highlights` | `list` | `similar` | 列表，similar 级 |
| `page.description` | `seo` | `summary` | **概括豁免**：SEO 描述不强求逐字；报告中标出该字段为豁免 |

## v1 不烧（排除清单）

下列字段在 v1 **不烧**：缺席或走站级默认，报告里注明即可。

- gallery 以外的图组
- `related_products`
- `case`
- `production_flow`
- `components_images`
- `crane_types_images`
- `breadcrumb.trail`
- `inquiry_form`

---

*本文件于 Task 5（删除中心 `SECTION_CATALOG`、字段清单单一真相收归模板旁 meta 文件）时建立，承载原 `burn-lib.mjs` 中代码注释里的字段语义知识。*
