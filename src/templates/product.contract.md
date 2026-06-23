# 产品页模版契约（product template contract）

> 配套文件：`product.html`（带标记的参考实例，渲染即单梁桥式起重机原页 1:1）、
> `../content/single-girder-eot-cranes.md`（参考实例的内容源）。
> 本文取代旧的 `FIELD-MAP.md`，是「一份 MD → 一个产品页」的权威契约。

## 0. 一句话

`product.html` 是一份**带标记的 HTML 模版**：结构/样式固定（沿用原站真实 class，视觉 1:1），
内容点用 `data-field` 标出、可重复块用 `data-repeat` 标出。给一份符合本契约的 MD，
逐字段填充 + 逐单元克隆，即可生成同结构的新产品页。

模版同时是**「所有可能模块的超集」**：可选块标 `data-optional`、自由内容槽标 `data-slot="custom-*"`，
渲染时按「数据在不在」裁剪——**同一份模版裁出不同产品页**，「某产品多/少一个模块」只改 MD 不改模版。详见 §7。

## 1. 内容三分类（MD 只驱动 content）

| 分类 | 判定标记 | 含义 | 新产品是否需 MD 提供 |
|---|---|---|---|
| **dynamic** | `data-dynamic="..."` | 运行时由 API 接管（现为静态占位） | 否，运行时拉取 |
| **shared** | `data-kind="shared"` | 全站固定骨架 | 否，沿用模版内置 |
| **content** | 以上之外（默认） | 该产品独有内容 | 是 |

- **dynamic**：`inquiry-form`（询盘表单）、`related-products`（相关产品）。
- **shared**：`hero`（企业品牌语 + 10年/120国/50人/3000案例 等公司级数据）、
  `production-flow`（来料检验→…→包装交付 标准 9 步工序 + 交期提示）。
  > 注：`hero` 的 `hero.image`（产品横幅图）实为 content，可按产品覆盖；其余 hero 内容为 shared。
- **content**：其余全部。

## 2. 结构契约（不可破坏）

```
<section ... id="product" class="wrap">      ← #product 必须从这里…
   .pcon（title/specs/cta）
   .ltgallery（画廊，div，非独立 section）
   .content.wrap
      overview / introduction / components / production-flow / crane-types / installation
   inquiry-form
</section>                                     ← …一直包到 inquiry-form 之后才闭合
<section class="related">…</section>          ← related 在 #product 外（全宽）
```

**为什么**：`main.css` 有 **89 条 `#product xxx` 作用域规则**（`.ltgallery`/`.pcon`/`.process`/
`.craneinfo .pro-info`/`.types` 等全靠 `#product` 当祖先）。一旦把内部段落拆成独立顶层 section、
或在画廊后提前闭合 `#product`，这些规则集体失效——历史上已导致**生产流程九宫格竖排**、
**画廊撑满全宽**两次回归。改模版时务必保持此包裹关系。

`related-products` 在 `#product` 外，因为原站它就是全宽（`x=0,w=1440`）。

## 3. 顶层 section 一览

| 顺序 | role (data-template) | kind | 可重复块 | 关键 data-field |
|---|---|---|---|---|
| 1 | hero | shared | — | hero.image*, hero.headline, hero.highlights |
| 2 | product-summary（面包屑） | content | — | breadcrumb.current |
| 3 | product-summary-main `#product` | content | gallery | title, summary.intro, spec.\* (7), summary.cta |
| 3a | gallery（#product 内的 div） | content | gallery / gallery-thumbs | gallery.image |
| 4 | overview | content | — | overview.title, overview.body(HTML) |
| 5 | introduction | content | — | introduction.title, introduction.body(HTML), introduction.image |
| 6 | components | content | components | component.name, component.image, component.body |
| 7 | production-flow | shared | production-flow | flow.image, flow.label, production_flow.\* |
| 8 | crane-types | content | crane-types | crane_type.image, crane_type.name, crane_type.body(HTML) |
| 9 | installation | content | cases | installation.title, installation.body, case.\* |
| 10 | inquiry-form | dynamic | — | inquiry_form.title（表单体运行时接管） |
| 11 | related-products | dynamic | related-products | related.\*（运行时按 data-category 拉取） |

\* hero.image 为 content（见 §1 注）。

## 4. 字段 schema（content 部分）

MD frontmatter（标量/数组）：

```yaml
title: 单梁桥式起重机
breadcrumb_current: 单梁桥式起重机
summary_intro: "…"                 # 富文本段
specs:                              # 7 项，顺序固定
  capacity: "容量：1-20吨"
  span: "跨度长度：4-31.5米"
  duty_class: "工作职责。A3, A4"
  voltage: "工作电压：220V~690V，50-60Hz，3ph AC"
  temperature: "工作环境温度：-25℃～+40℃，相对湿度≤85%"
  control: "起重机控制模式。地面控制/远程控制/机舱室"
  price_range: "参考价格范围。$750-4500/套"
cta: 报价要求
hero_image: Single-Girder-Overhead-Crane-scaled.jpg

gallery:                            # 驱动 gallery + gallery-thumbs 两处（同图两种尺寸）
  - { image: 5Ton-...-India-1.jpg, alt: "印度5吨…1" }
  # … N 项

components:                        # 可重复
  - { name: 主梁, image: Main-Girder-1-scaled.jpg, body: "…" }
  # … N 项

crane_types:                       # 可重复（body 为含 <ul> 的富文本）
  - { name: "LDA（普通…）", image: LDA-scaled.jpg, body_html: "<ul>…</ul>" }

cases:                             # 可重复
  - { title: "…", url: "https://…", image: ….jpg }

related_category: eot-cranes       # dynamic：仅提供分类与数量，内容运行时拉
related_limit: 4
```

MD 正文（markdown，渲染为 HTML 填入对应 `data-field` 的 *.body）：
`overview.body`、`introduction.body`、各 `component.body` / `crane_type.body`。

> 类型约定：纯文本字段 = 转义后填入；标 `(HTML)` 的字段 = 渲染 markdown 后填入；
> image 字段 = 文件名，渲染时拼 `/assets/img/product/<文件名>`。

## 5. 抽出的可重复单元模版（unit templates）

渲染规则：对 `[data-repeat="<grp>"]` 容器，清空其子项，按 MD 数组逐元素克隆下面的单元、
填入字段。下列为各组的**单元**（占位用 `{{ }}`，实际取自 §4 数组元素）。

**gallery**（主图，容器 `.gallery-top .swiper-wrapper`）：
```html
<div class="swiper-slide" data-block-id="gallery-{{i}}"><img data-field="gallery.image"
  src="/assets/img/product/{{image}}" alt="{{alt}}" width="870" height="580"></div>
```
**gallery-thumbs**（缩略图，容器 `.gallery-thumbs .swiper-wrapper`，与 gallery 同源数组、尺寸 95×63）：
```html
<div class="swiper-slide" data-block-id="gallery-thumb-{{i}}"><img
  src="/assets/img/product/{{image}}" alt="{{alt}}" width="95" height="63"></div>
```
**components**（容器 `#parts`）：
```html
<div class="faq_block" data-block-id="components-{{i}}">
  <div class="faq_q"><dd data-field="component.name">{{name}}</dd></div>
  <div class="faq_a"><p class="photo"><img data-field="component.image"
     src="/assets/img/product/{{image}}" alt="{{name}}"></p>
  <p data-field="component.body">{{body}}</p></div>
</div>
```
> 注：组件可无图（如「起重机驱动装置」），此时省略 `<p class="photo">`，`.faq_a` 仅含 body。

**production-flow**（shared，容器 `.grid.demo-gallery`，单元为 `<a class="grid3">`）：
```html
<a href="/assets/img/product/{{image}}" data-block-id="flow-{{i}}" data-size="1000x667" class="grid3">
  <img data-field="flow.image" src="/assets/img/product/{{image}}" alt="{{i}} {{label}}" width="285" height="190">
  <h4><i></i><span data-field="flow.label">{{label}}</span></h4>
</a>
```
**crane-types**（容器 `.types_info`）：
```html
<div class="grid_3" data-block-id="crane-type-{{i}}">
  <img data-field="crane_type.image" src="/assets/img/product/{{image}}" width="285" height="190">
  <h4 data-field="crane_type.name">{{name}}</h4>
  <div data-field="crane_type.body">{{body_html}}</div>
</div>
```
**cases**（容器 `.cases .grid`）：
```html
<div class="grid_2" data-block-id="cases-{{i}}">
  <a href="{{url}}" target="_blank" class="news_block clearfix" data-field="case.url">
    <img class="lt" data-field="case.image" src="/assets/img/product/{{image}}" alt="{{title}}" width="156" height="104">
    <h4 data-field="case.title">{{title}}</h4>
  </a>
</div>
```
**related-products**（dynamic：单元仅作运行时占位骨架，容器 `.product .grid[data-slot="items"]`）：
```html
<div class="grid_4" data-block-id="related-{{i}}">
  <a href="{{url}}" target="_blank" data-field="related.url">
    <img data-field="related.image" src="/assets/img/product/{{image}}" width="276" height="184">
    <h4 data-field="related.title">{{title}}</h4>
    <p data-field="related.summary">{{summary}}</p>
    <h5>了解更多</h5>
  </a>
</div>
```

## 6. WP 残留（目标态可清理，现阶段保留以保 1:1）

以下属性是 WordPress 主题/插件的遗留，对模版语义无意义，但**当前不删**——其中部分类名可能
被 CSS/JS 命中，删除有视觉漂移风险，留待「目标态」连同 CSS 一起处理：

- 图片上的 `wp-image-####`、`size-full`、`alignnone`、`fetchpriority`、`decoding`、`srcset`/`sizes`。
- 询盘表单整段 `wpforms-*` 类、`data-formid`、`data-field-id`、`#wpforms-713`、`#from-2`
  （inquiry 是 dynamic 占位，目标态由组件替换，届时一并清理）。
- 已清理：`.ltgallery` 上无意义的 `id="1"`（已确认无 CSS/JS 引用）。

保留为 hook、**不要删**：`#product`、`#from-single`（CTA 锚点）、`#gallery`（PhotoSwipe 容器）、
`.gallery-top`/`.gallery-thumbs`（swiper 初始化目标）、`.demo-gallery`/`.grid3`（PhotoSwipe + 布局）。

## 7. 页面间差异机制（超集裁剪）

本模版是**「所有可能模块的超集」**。给一份产品 MD，渲染器按**「数据在不在」**对带条件标记的块裁剪——
**同一份 `product.html` 裁出不同产品页**。于是「某产品多/少一个模块」不必改模版，只改 MD。
（背景讨论见对话记录「产品页差异化机制」。）

### 7.1 裁剪规则（统一、确定性、无 AI）

遍历模版里带条件标记的块：

- `data-optional="<key>"`：MD 顶层有 `<key>` 数据 → 渲染并保留；无 → **删除整块**。
- `data-slot="custom-*"`：MD 有同名 key（一段 markdown）→ 渲染为 HTML **注入**该块；无 → **删除整块**。

不带条件标记的块始终渲染：`hero` / `product-summary` / 规格 / `production-flow`（shared）、
`inquiry-form` / `related-products`（dynamic）等。

### 7.2 两种可变块

**① 结构化条件块（`data-optional`）**——固定骨架 + `data-field`/`data-repeat`，只是「整段可有可无」。
当前已标注为可选的块及其 key：

| 块 | data-optional key | 说明 |
|---|---|---|
| gallery（`.ltgallery`） | `gallery` | 无图库则不渲染 |
| overview | `overview` | |
| introduction | `introduction` | |
| components | `components` | |
| crane-types | `crane_types` | |
| installation | `installation` | 含案例卡 |

> hero / 标题 / 规格 / production-flow / inquiry / related 视为必现或 shared/dynamic，不设 optional。

**② 自由槽（`data-slot="custom-*"`）**——给「结构各异、塞不进固定字段」的独有内容（对比表、单参数表、独有小节…）。

槽位的值是**一个有序列表**（一个槽可放多块，按序渲染），每项 = `{ heading, body }`：
- `heading`：该块标题 → 渲成 `<h3>`。
- `body`：一段 **markdown**（原生支持任意表格/列表/段落），渲成 HTML。

渲染器把每项包进**与标准段同款的外壳**，从而「外观像模版、内容是自定义」：
```html
<div class="pro-info clearfix"><h3>{{heading}}</h3><div class="custom_tables">{{body 渲成的 HTML}}</div></div>
```
> `.custom_tables` 是本地 CSS 已有的表格容器（滚动/边距），表格类 body 套它即与全站一致；
> 纯散文 body 可省去 `.custom_tables`、直接 `<div>{{html}}</div>`。
> 整个槽**无数据则删除**（空占位 `<div data-slot>` 零视觉影响）。

推荐插入点（**当前模版未预置**——保持「单梁 1:1」；真正需要时在对应段缝加 `<div data-slot="custom-<位置>">…</div>`）：

| data-slot | 位置 |
|---|---|
| `custom-after-overview` | 概述之后、简介之前 |
| `custom-after-introduction` | 简介之后、组件之前 |
| `custom-after-crane-types` | 型号之后、安装之前 |

> 本节是**机制约定**，现阶段未在模版里实写任何自定义块/锚点，待真有产品需要时再落地。
> 表格类 body 套 `.custom_tables`（本地 CSS 已有容器样式；精细边框等用时另补 `.custom_tables table`）。

> 需要新插入点时：在对应段缝加 `<div data-slot="custom-<位置>"></div>`（class-less 空 div，零视觉影响），并在此表登记。

**实例**（`overhead-cranes-for-sale` 页在「简介之后、组件之前」多出三块：两张对比表 + 一段散文）：
```yaml
custom-after-introduction:
  - heading: 简要技术参数比较      # → table.tg1 那张对比表
    body: |
      | 技术数据 | 传统型 | 欧洲型 |
      |---|---|---|
      | 负载 | 至16公吨 | 至12.5公吨 |
  - heading: 细节规格按要求提供    # → table.tg2 那张对比表
    body: |
      | 物品 | 传统风格 | 欧洲型 |
      |---|---|---|
      | 价格 | 成本效益高 | 昂贵 |
  - heading: 哪个更好             # → 一段散文，无表格
    body: |
      一般来说，欧洲型桥式起重机更先进、更好……
```
单梁那页不声明这些 `custom-*` → 不生成任何自定义块，页面如常。**同一份模版裁出两种页。**

### 7.3 逃生舱：真正一次性的独有布局

极少数页面有「模版彻底表达不了」的独有布局（独有交互、独有对比图…）。不必硬塞进超集：
该页从模版生成 90%，独有部分**直接手改进生成的 HTML**，并在页面清单标 `truth: html`，
build 不再覆盖它（该页 HTML 即其唯一真相）。默认优先用 7.1 裁剪，逃生舱是兜底。

### 7.4 四档差异速查

| 差异 | 手段 |
|---|---|
| 值不同（文字/图） | `data-field` 填充 |
| 数量不同（重复块多少） | `data-repeat` 按数组克隆 |
| 整段可有可无 | `data-optional` 裁剪 |
| 独有不规整内容（表格…） | `data-slot` 自由槽 |
| 完全定制布局 | 逃生舱（`truth: html` 手改） |

## 8. 渲染器（待实现，hook 在 scripts/build.mjs::fillTemplateFromMarkdown）

按本契约，渲染器步骤，全部确定性、无 AI：
1. 标量 `data-field` → 转义填文本 / image 拼路径；标 (HTML) 的字段先渲 markdown。
2. 每个 `[data-repeat]` → 用 §5 单元模版按 MD 数组克隆填充。
3. **裁剪（见 §7.1）**：`data-optional` 无对应 key → 删整块；
   `data-slot="custom-*"` 有同名 key → 按其**列表**逐项渲染（每项 `{heading, body}` 包进 §7.2② 的 `pro-info` 外壳），无 → 删整块。
4. dynamic / shared 段不动（沿用模版内置；dynamic 由运行时接管）。

实现后用「全页几何 diff」（本地 vs 原站）回归，确保仍 1:1。
