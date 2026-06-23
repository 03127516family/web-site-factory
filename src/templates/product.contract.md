# 产品页模版契约（product template contract）

> 配套文件：`product.html`（带标记的参考实例，渲染即单梁桥式起重机原页 1:1）、
> `../content/single-girder-eot-cranes.md`（参考实例的内容源）。
> 本文取代旧的 `FIELD-MAP.md`，是「一份 MD → 一个产品页」的权威契约。

## 0. 一句话

`product.html` 是一份**带标记的 HTML 模版**：结构/样式固定（沿用原站真实 class，视觉 1:1），
内容点用 `data-field` 标出、可重复块用 `data-repeat` 标出。给一份符合本契约的 MD，
逐字段填充 + 逐单元克隆，即可生成同结构的新产品页。

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

## 7. 渲染器（待实现，hook 在 scripts/build.mjs::fillTemplateFromMarkdown）

按本契约，渲染器只需三步，全部确定性、无 AI：
1. 标量 `data-field` → 转义填文本 / image 拼路径；标 (HTML) 的字段先渲 markdown。
2. 每个 `[data-repeat]` → 用 §5 单元模版按 MD 数组克隆填充。
3. dynamic / shared 段不动（沿用模版内置；dynamic 由运行时接管）。

实现后用「全页几何 diff」（本地 vs 原站）回归，确保仍 1:1。
