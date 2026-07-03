# 08 · SEO 与性能

> 范围（2026-07-01 拍板）：SEO 分两层——**①技术 hygiene 是代码工作，归 AI，全部在此章清单化**；②内容策略/关键词/外链/监测运营**不做**（不是代码能解决的，做完①也不等于排名提升——那是运营侧的事）。base URL 已拍板（2026-07-02）：`https://www.dgcrane.com/zh/...`，本章全部绝对 URL 以此拼接。

---

## 1. 现状缺口（盘点于 2026-07-01，全部待实现）

- `{{SEO}}` 占位符（`src/layouts/document.html` 第 8 行）恒被 `build.mjs` 替换成**空字符串**——canonical、OG、JSON-LD 一个都没有。
- 面包屑用的是 Data-Vocabulary RDFa（Google 2020 起不认），且超集里 trail 硬编码单梁。
- 无 sitemap.xml / robots.txt。
- 图片未压缩入库（存在 3–4MB/张）。

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
