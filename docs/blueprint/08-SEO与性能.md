# 08 · SEO 与性能

> 范围（2026-07-01 拍板，07-03 ⑭ 修订为四层责任制）：SEO 从每页 MD **同源派生、构建期生成**；**代码只负责技术层（L1）**，语义/关键词是 AI 烧页时做（L2/L3），外链/监测是运营侧（L4，§5）。base URL 已拍板（2026-07-02）：`https://www.dgcrane.com/zh/...`。

---

## 0. SEO 架构总览（系统视图，2026-07-04；下次接手先读这一节）

**一句话**：SEO 不是独立子系统，是从每页 MD **同源派生的构建期产物**——零运行时、零手写、零独立数据库。下面六问答完整个架构。

**① 每页的 SEO 记录在哪（数据模型）** —— 没有独立 SEO 库；一篇页面的 SEO 就是它 MD 里的几个字段（单一真相，F1）：

| SEO 记录项 | 存在 MD 哪里 |
|---|---|
| SEO 标题 | `page.title`（**可与页面 H1 的顶层 `title` 不同**——SEO 标题带"\| DGCRANE"后缀，H1 不带） |
| SEO 描述 | `page.description` |
| og 预览图 | 首图（product: `hero.image`/gallery 首图；post: `body.img_hero`/首个 `img_*`） |
| 面包屑名 | `breadcrumb.current` |

看"这篇 SEO 是什么" = 看它 MD 这几行；改 SEO = 改这几行。

**② 字段 → 标签怎么变（派生管线）** —— build 时 `seoHead()` 按固定映射生成 `<head>`，零手写：

| 输出标签 | 取自 |
|---|---|
| `canonical` / `og:url` | 站点 base + `page.slug` |
| `<title>` / `og:title` | `page.title` |
| `description` / `og:description` | `page.description` |
| `og:image` | 首图 |
| `og:locale` | `page.lang` |
| JSON-LD（`Product`/`Article` + `BreadcrumbList`） | `page.type` + 上述 + `breadcrumb.current` |
| `sitemap.xml` 的 loc/lastmod | 遍历登记；lastmod=该 MD 的 git 提交日期 |

**同源则不漏页**——加一页自动进 sitemap，不需另登记。

**③ 多语言 SEO 怎么接（详 [12 章 §3.7](12-修改传播与多语言同步.md)）**
- **hreflang 自动派生、不手设**：从多语言关联清单（这页有哪些语言）算出互指 + `x-default`，**永远对称**（手写易漏一边，Google 直接忽略不对称的）。
- 每语言独立 canonical（**各指自己，不指默认语言**——这是最易踩的坑）、独立 sitemap、`og:locale`。
- 语言切换器与 hreflang **同源**（同一份配对数据），可见 UI 与 SEO 声明永不矛盾。
- 站点 base 与目标语言由 `site.config` 管（**待建**；现在是 `build.mjs` 硬编码常量）。

**④ 怎么编辑 / 后台管理**
- **今天**：SEO 字段在 `<head>`、页面上看不见 → 改 MD 文本（三级模型的 L2 结构层）。**编辑器点不到**（它只改页面上可见的东西）。
- **未来后台**：一个 **SEO 面板**（类比 WordPress Yoast），填 SEO 标题/描述/og 图/面包屑 → 写回**同样这几个 MD 字段** → 走同一套 `edit-save` 机制。**待建，属管理软件层。**
- **hreflang 后台不手打**：只调它的输入（`site.config` 目标语言 / 每页本地化 slug / "此页不出某语言"排除开关），后台**展示算出来的 hreflang 供核对**，标签本身由系统生成。
- **配置分两类，别混（2026-07-04 拍板逻辑）**：**站点级共享 SEO**（域名/品牌/标题后缀/目标语言/hreflang 码/默认 og 图）→ 抽到 `site.config` 一处管、方便；**每页专有 SEO**（这页标题/描述/首图）→ **留在这页 MD**（搬出去就变"内容一处、SEO 另一处"两处同步、会漂移，违反单一真相 F1）。想"在一处方便改每页 SEO" = 用**聚合视图**（SEO 面板/总览表），在一屏编辑、写回各自 MD——**方便靠视图，不靠搬家**（同多语言关联清单 [12 章 §3.1.1](12-修改传播与多语言同步.md) 一个道理）。

**⑦ 程序化执行（能不能"点一下自动跑"）** —— 能，而且**没有单独的 SEO 按钮**：canonical/OG/JSON-LD/sitemap/hreflang 都是"渲染这页时顺带生成"。点【发布】→ 程序渲染该页（`seoHead` 一起跑）→ 标签自动进 `<head>`，**每次必带、漏不掉**（SEO 不是要记得点的动作，是构建的自动副产品）。`seoHead` 是确定性函数，**今天在 `npm run build` 跑，产品里原样在 publish/render 云函数跑，一行不改**（同 render.mjs，见 [16 章](16-装配契约.md)字符串入口）。人只在 SEO 面板供"文字判断"（标题/描述），"生成标签"永远自动。

**⑤ 四层责任**（详 §5）：L1 技术（代码，build 时）/ L2 语义（烧 MD 时，AI）/ L3 关键词（调研，阶段 2.2）/ L4 外链（运营，不做）；**监测分析 = 上线后 + 你给 Search Console 数据才能做**。做满 L1–L3 也不承诺排名（诚实边界）。

**⑥ 现状三态**（2026-07-04 实测，`✅已建 / 🔶设计定待建 / 📐设计未建 / ⏸有意暂缓`）：

| 部件 | 状态 |
|---|---|
| canonical / OG 全套 / JSON-LD（Product/Article/BreadcrumbList）/ sitemap.xml | ✅ 已建（阶段 1.1，7 个测试守着） |
| 每页 SEO 记录 = MD `page` 块 | ✅ 已是现状 |
| 面包屑：删旧 RDFa + trail 数据化 + JSON-LD 三级 | 🔶 设计定，待建（任务 1.2；6 个模版还带旧 RDFa） |
| 图片压缩 / LCP 闸门 | 🔶 设计定，待建（任务 1.3；存量有 4.1MB/张） |
| `robots.txt` | ⏸ 共存期故意不生成（域名根归老站，整站切换后接管） |
| hreflang / 每语言 canonical / `site.config` | 📐 设计定，**未建**（属多语言 M3；单语言站本就无需 hreflang） |
| 后台 SEO 面板 | 📐 设计，待产品化（管理软件层，还没有任何后台） |
| 监测分析（排名/流量/Search Console） | ⏸ **上线后才能做**，且需你授权 Search Console 数据 |

> 一句话状态：**技术层核心 ✅ 已建；面包屑/图片是待建收尾；hreflang/site.config/后台面板是设计好未建；监测是上线后的事。** 详细逐项见下。

---

## 1. 现状（2026-07-04 更新；原 07-01 缺口盘点已大部清偿）

- ✅ **`{{SEO}}` 已生效**：canonical / OG 全套 / JSON-LD / sitemap.xml 均已由 `build.mjs::seoHead()` + sitemap 生成（阶段 1.1，7 测试）。**（此前本节写"一个都没有"，是 1.1 前的旧状态，已过时——2026-07-04 更正，免得误导接手者。）**
- 🔶 **仍缺**：面包屑用的还是 Data-Vocabulary RDFa（6 个模版），trail 超集里硬编码单梁（任务 1.2）。
- 🔶 **仍缺**：图片未压缩入库（存在 4.1MB/张，任务 1.3）。
- ⏸ **暂不做**：robots.txt（共存期归老站）；hreflang（多语言 M3）。

## 2. 实现方案（逐项，全部从 `build.mjs::pages[]` 同源派生——**同源则不漏页**，这是设计原则）

### 2.1 `{{SEO}}` 注入（每页 head）

build 时按 `page` + MD frontmatter 生成，替换 `document.html` 的 `{{SEO}}`：

```html
<link rel="canonical" href="https://www.dgcrane.com/zh/<slug>/">
<meta name="description" content="…（frontmatter seo.description，无则从概述块截取）">
<meta property="og:type"  content="product|article">
<meta property="og:title" content="…">
<meta property="og:description" content="…">
<meta property="og:url"   content="canonical 同值">
<meta property="og:image" content="https://www.dgcrane.com/zh/assets/img/…（hero 图）">
<script type="application/ld+json">…（见 2.2）</script>
```

MD 侧新增可选 frontmatter：`seo.title` / `seo.description`（无则回退 hero.title / 概述截取——**内容没有就回退，不硬造**，与 data-optional 同哲学）。

### 2.2 JSON-LD（按 `page.type` 选型）

| type | 结构化数据 | 数据来源 |
|---|---|---|
| product | `Product`（name/image/description/brand）+ `BreadcrumbList` | frontmatter |
| post | `Article`（headline/image/datePublished/author）+ `BreadcrumbList` | frontmatter |

**面包屑连带清偿**（债务台账#2）：trail 进 MD（`breadcrumb.trail` 数组），模版 `data-repeat` 渲染可见面包屑，同一数组再生成 `BreadcrumbList` JSON-LD，旧 RDFa 属性（`xmlns:v` 等）从模版移除——**一份数据、两个出口，改一处两处对**。

### 2.3 sitemap.xml / robots.txt

- `build.mjs::pages` 循环末尾生成 `dist/sitemap.xml`（loc=canonical，lastmod=该页 MD 的 git 最后提交时间）。
- `robots.txt`：允许全部 + `Sitemap:` 行。注意 sitemap/robots 的**站点级归属**：`/zh/` 是子路径，robots.txt 属于域名根——若根还是老站（拓扑 A/B 并存期），robots 由老站管、我们只保证 sitemap 可访问（`/zh/sitemap.xml`）并提交 Search Console；整站切换（拓扑 C）后才接管根 robots。此点随 07 章拓扑一起定。

### 2.4 验证方式

- Google Rich Results Test 抽测 product/post 各 1 页；
- `npm run build` 后脚本自检：每页有且只有一个 canonical、og:image 可达、JSON-LD 可解析（可并入 `npm run check`）。

## 3. 图片闸门（性能的大头，**必须先于批量搬迁生效**）

**规范**（SOP-6 引用的正是本节）：

| 项 | 规范 |
|---|---|
| 尺寸 | 常规内容图 ≤200KB；hero/首屏大图 ≤350KB；缩略图 ≤60KB |
| 格式 | 保守起步：jpg/png 高质量压缩（quality~80）；webp 双轨等整站切换后再议（老站并存期不折腾） |
| 落盘前 | 一律先压缩再进 `public/assets/img/`——原始大图不进仓库 |
| HTML | `<img>` 必带 `width/height`（防 CLS + 缺图占位不塌） |
| 工具 | 一个小脚本（sharp 或 squoosh-cli）`npm run img -- <文件>`；属 launch 必需 hygiene，不算"往深做工具" |

**存量清理**：对已入库的超标图（crane-lifting-safety-training 那批 3–4MB）做一次性压缩替换，geom 验证（带宽高属性时几何不变）。

**素材原件库**（2026-07-03 审计补）：仓库里只放压缩后的出货图；**原件**（原始大图/设计源文件）不进仓库——统一存网盘或对象存储冷区、按 slug 归档。将来要重切尺寸、换格式（如启用 webp）、做高清版时有源可回，不用再找厂里要一遍。

**附件规范**（外贸站审计补）：PDF 产品目录/规格书等下载文件落 `public/assets/files/`，语义命名、单文件 ≤10MB、落盘前压缩；页面上的下载按钮是链接字段（`data-edit="link"`），可见即可编辑。

**响应式图片（P2 增强，非上线必需）**：高频大图可加 `srcset` 双档进一步压 LCP；等首站上线后按真实 Lighthouse 数据决定是否做，不预做。

## 4. 性能预算（上线判据的一部分）

| 指标 | 预算 | 测法 |
|---|---|---|
| LCP（4G 模拟） | < 2.5s | 本地 Lighthouse |
| 单页图片总重 | < 1.5MB | build 后脚本统计 |
| HTML 单页 | < 100KB | 同上 |
| CLS | ≈ 0（宽高齐备则天然达标） | Lighthouse |

超预算处理：先压图、再裁减首屏图数量；**不引入 JS 懒加载库**（`loading="lazy"` 原生属性够用）。

**可访问性基线**（2026-07-03 审计补）：`<html lang>` 正确（多语言时随 locale）、图片 alt 全覆盖（已是字段，随内容走）、标题层级合法（validateBlocks/结构天然保证）、对比度不劣于原站。静态语义 HTML 天然达标大半，不另立专项，只在本清单验收。

## 5. SEO 责任模型（2026-07-03 ⑭ 修订：AI 四层责任制，取代 07-01"只做技术卫生"边界）

> 用户授权按 AI 自己的判断重划边界。旧边界把"页面语义"和"关键词策略"整体推给运营——推错了：前者是烧页时本来就在做的判断，后者 AI 有真实调研能力，做出来至少是合格初版。

| 层 | 内容 | 谁 | 何时 |
|---|---|---|---|
| **L1 技术层** | canonical/OG/JSON-LD/sitemap，本章 §2 方案 | AI 写一次生成器，之后构建期自动 | 阶段 1.1 |
| **L2 页面语义层** | 每页标题措辞、描述、标题层级、alt、内链 | AI 烧 MD 时带着 SEO 意识做（零额外成本） | 每页搬迁/创建时 |
| **L3 策略层** | 关键词→页面映射、内容缺口、内链架构（真实 web 调研起草；商业优先级先按 AI 判断假设，用户可改） | AI 起草，**排在批量搬迁之前**——每页带着意图搬，不是只求还原 | 阶段 2.2 |
| **L4 站外层** | 外链建设、公关、预算 | **不做**——需要商务动作，AI 做不了、不硬装 | — |
| 监测分析 | 上线后 Search Console 数据的周期分析与调优（改标题/描述/内链） | AI 分析并执行调整；用户只需给数据访问 | 上线后循环 |

仍然成立的边界：hreflang/多语言 SEO 随英文站启用（正式设计在 [12 章 §3.7](12-修改传播与多语言同步.md)，现在只保证 `/zh/` 结构不阻断）；L1–L3 做满分也不承诺排名——排名同时取决于内容供给节奏与 L4，此为诚实边界而非免责。

## 6. 本章验收清单（并入 01 章 v1.0 判据第 3 条）

- [ ] 每页 canonical / description / OG 齐全且值正确（抽 3 页人工核）
- [ ] product/post JSON-LD 通过 Rich Results Test
- [ ] 面包屑：可见 trail 由 MD 驱动 + BreadcrumbList 输出 + 旧 RDFa 移除
- [ ] `/zh/sitemap.xml` 生成且包含全部 pages[]；robots 策略随拓扑落定
- [ ] 图片闸门生效：新图全部达标 + 存量超标图清理完
- [ ] 性能预算四项全绿（Lighthouse 报告存档一份）

## 7. SEO 未决清单（2026-07-04 完备性审计，OPEN，待拍板；同 [12 章 §3.9](12-修改传播与多语言同步.md) 体例，登记不擅定）

> 骨架逻辑已足（§0）；下列为该定未定项。其中 SEO-1 含 2026-07-04 拿代码自我核对后的**更正**（此前有夸大/遗漏）。

| # | 未决项 | 精确说明（含自我核对更正） | 待定方向 |
|---|---|---|---|
| **SEO-1** | **JSON-LD 深度** | 实测：Article 缺 datePublished/dateModified/author、Product 缺 offers/price。**根子是内容模型缺字段**——post 的 MD 里现在**根本没有日期/作者数据**（实测为空），要补 JSON-LD 得先给 MD 加字段。且这些对富摘要是**"推荐"非"必需"、富摘要不保证给**（更正此前"必需"的夸大） | 定要不要给 MD 加日期/作者字段；Product 是否挂价格 |
| **SEO-2** | **每页 noindex 开关** | 实测：全仓库无任何 noindex/robots meta 机制。谢谢页/纯功能页不该进索引，属标准能力 | 加 `page.noindex` 标记，seoHead 据此出 `<meta name="robots" content="noindex">` |
| **SEO-3** | **首页级结构化数据** | Organization/WebSite（公司 logo/社媒/站内搜索框）未设计；因无首页故未做 | 做首页时补 |
| **SEO-4** | Twitter Card / 404 SEO | 次要：Twitter Card 有 OG 兜底；404 的状态码+noindex 大半属托管层（CloudFront） | 随首页/托管拓扑一起定 |

**meta keywords（TDK 的 K）**：现未输出；Google 不看、百度边缘。中文站可从 MD `keywords` 字段派生输出——属"执行时的小选择"，不阻塞主流程。

同步登记进 [DECISIONS 待拍板清单](DECISIONS.md)。
