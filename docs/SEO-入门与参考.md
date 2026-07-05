# SEO 入门与参考手册

> 一份自学用的 SEO 概念地图。每个概念按「**是什么 / 为什么重要 / 长什么样 / 本项目现状**」四段讲。
> 代码示例尽量用本站 `scripts/build.mjs` 里已实现的真实产出，学完能对着源码认。
> 术语第一次出现给中英对照，文末有速查表。

---

## 0. 先建立地图：搜索引擎怎么工作 + SEO 四层

### 0.1 搜索引擎三步（理解一切 SEO 的地基）

```
①抓取 Crawl        ②索引 Index          ③排名 Rank
爬虫(Googlebot)      把读懂的页面存进        用户搜某词时，从库里
顺着链接爬到你的页    Google 的大数据库      挑出最相关+最可信的页排序
   │                    │                      │
 你要让它"爬得到"      你要让它"读得懂"        你要让它"觉得你最好"
 = robots/sitemap     = 语义HTML/结构化数据    = 内容质量+关键词+外链
```

**一句话**：SEO 就是围绕这三步，分别做「让爬虫**进得来**、**看得懂**、**愿意把你排前面**」三件事。下面的四层就是按这三步展开的。

### 0.2 SEO 四层责任模型（本项目的核心划分）

| 层 | 名字 | 谁负责 | 本质 | 能否代码化 |
|---|---|---|---|---|
| **L1** | 技术层 technical | 代码（build 时自动生成） | 让爬虫读得懂、抓得全 | ✅ 完全可代码化、可验证 |
| **L2** | 语义层 semantic | AI 烧 MD 时 | 内容结构清晰、扣主题 | 🟡 半自动（靠内容判断） |
| **L3** | 关键词层 keywords | 人 / 运营 | 命中用户搜的词 | ❌ 靠调研判断 |
| **L4** | 外链层 backlinks | 人 / 运营 / 市场 | 别的站为你背书 | ❌ 靠业务关系挣来 |

**关键认知**：L1+L2 是「把自己收拾干净、说清自己是谁」——做完是**必要条件**，不是充分条件。真正决定排名的大头在 L3+L4，那是运营/内容的活，`build.mjs` 再完美也提不动。**别指望做完 L1 就能排上去。**

---

## 1. L1 技术层：逐个概念（这一层是代码工作，重点学）

### 1.1 `<title>` 标题标签

- **是什么**：浏览器标签页显示的标题，也是搜索结果里那条**蓝色大标题**。
- **为什么**：排名最重要的**页面内**信号之一；用户在结果页第一眼看的就是它，直接决定点不点。
- **长什么样**：
  ```html
  <title>5吨桥式起重机终极指南：类型、价格与应用</title>
  ```
- **要点**：每页唯一；核心关键词靠前；控制在 ~30 个汉字/60 字符内（超了搜索结果里会被截断成「…」）。
- **本项目**：`document.html` 的 `{{TITLE}}`，值来自 MD frontmatter 的 `page.title`。

### 1.2 `<meta name="description">` 描述

- **是什么**：搜索结果标题下面那段**灰色摘要**文字。
- **为什么**：**不直接影响排名**，但影响**点击率（CTR）**——写得好，同样排名下更多人点。Google 有时会无视它、自己从正文截一段。
- **长什么样**：
  ```html
  <meta name="description" content="全面解析5吨桥式起重机的类型、价格区间与常见应用行业……">
  ```
- **要点**：~70-80 汉字；一句能勾人的概括；带上关键词（搜索词命中会加粗）。
- **本项目**：`{{DESCRIPTION}}` ← `page.description`。

### 1.3 `canonical` 规范链接 ⭐（你问的这个）

- **是什么**：告诉搜索引擎「这个页面的**官方唯一网址**是哪个」。
- **为什么**：同一篇内容常能通过多个 URL 访问（带不带 `www`、带不带 `?utm=` 追踪参数、`/` 结尾与否、http 与 https……）。搜索引擎会把它们当成**多个重复页面**，导致：
  - **权重被稀释**（本该集中到 1 个 URL 的「票数」散到 5 个变体上）；
  - **重复内容惩罚**风险。
  `canonical` 就是把所有变体的权重**归拢到一个主 URL**。
- **长什么样**：
  ```html
  <link rel="canonical" href="https://www.dgcrane.com/zh/posts/5-ton-overhead-crane/">
  ```
  即使用户从 `...?utm_source=ad` 进来，页面里这行仍指向干净主 URL → Google 只索引主 URL。
- **要点**：绝对 URL（带域名）；每页恰一个；通常指向自己（self-canonical）。
- **本项目**：`build.mjs::seoHead` 第一行就生成它，base 是 `https://www.dgcrane.com/zh/`（决策 2026-07-02 中文站走 `/zh/` 子路径）。

### 1.4 `robots.txt` 爬虫总闸

- **是什么**：放在**域名根目录** `/robots.txt` 的纯文本，告诉爬虫「哪些目录能爬、哪些别爬」，并指向 sitemap。
- **为什么**：控制爬虫预算（别让它去爬后台/搜索结果页这类无意义 URL）。**注意**：它管的是「爬不爬」，**不等于**「不被索引」——被别处链到的 URL 即使 disallow 了也可能被索引（要禁索引得用 `noindex`，见 1.6）。
- **长什么样**：
  ```
  User-agent: *
  Disallow: /admin/
  Allow: /

  Sitemap: https://www.dgcrane.com/sitemap.xml
  ```
- **本项目**：**故意暂不生成**——共存期域名根还归老 WordPress 站管（蓝图 08 §2.3），整站切换后再接管，免得两套打架。

### 1.5 `sitemap.xml` 站点地图

- **是什么**：一份 XML，把你**所有希望被收录的 URL** 列出来，附最后修改时间。
- **为什么**：主动把「我有哪些页」喂给爬虫，尤其新站/内链稀疏时能加速收录；`lastmod` 让爬虫知道哪些页变了、该重爬。
- **长什么样**：
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
      <loc>https://www.dgcrane.com/zh/posts/5-ton-overhead-crane/</loc>
      <lastmod>2026-07-03</lastmod>
    </url>
  </urlset>
  ```
- **本项目**：`build.mjs::sitemapXml` 从页面登记（=各 MD 的 frontmatter）**同源派生**——同一份登记既出页面又出 sitemap，所以**不会漏页**；`lastmod` 取该 MD 的 git 最后提交日。

### 1.6 robots meta / `X-Robots-Tag` 页面级指令

- **是什么**：写在**单个页面** `<head>` 里的爬虫指令，比 robots.txt 更精细（针对这一页）。
- **常见值**：
  | 指令 | 含义 |
  |---|---|
  | `index` / `noindex` | 允许 / 禁止把本页放进搜索库 |
  | `follow` / `nofollow` | 允许 / 禁止顺着本页的链接往下爬 |
  | `max-image-preview:large` | 允许搜索结果里给本页大图预览（利于富摘要） |
  | `noarchive` | 别存网页快照 |
- **长什么样**：
  ```html
  <meta name="robots" content="index, follow, max-image-preview:large">
  ```
- **要点**：默认（不写）就是 `index, follow`，所以正常页**不用写**；要**禁**索引某页（如测试页、致谢页）才显式 `noindex`。
- **本项目**：暂未显式输出；`max-image-preview:large` 是个廉价可加项（利于图片富摘要）。

### 1.7 Open Graph（`og:`）社交分享卡片

- **是什么**：一组 `<meta property="og:...">`，规定「本页被分享到微信/Facebook/LinkedIn 时，卡片显示的标题、图、描述」。源自 Facebook 的 Open Graph 协议。
- **为什么**：**不直接影响排名**，但决定分享出去好不好看 → 影响社交流量和点击。没有它，分享出来可能是一坨光秃秃的链接。
- **长什么样**：
  ```html
  <meta property="og:type" content="article">
  <meta property="og:title" content="5吨桥式起重机终极指南">
  <meta property="og:description" content="全面解析类型、价格与应用……">
  <meta property="og:url" content="https://www.dgcrane.com/zh/posts/5-ton-overhead-crane/">
  <meta property="og:image" content="https://www.dgcrane.com/zh/assets/img/post/hero.jpg">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:site_name" content="DGCRANE">   <!-- 本项目暂缺，可补 -->
  ```
- **本项目**：`seoHead` 已输出 type/title/description/url/locale/image；`og:site_name` 是廉价可加项。

### 1.8 Twitter Card

- **是什么**：Twitter/X 版的 og，一组 `<meta name="twitter:...">`。缺了它，X 会回退去读 og（所以不是必须，但加了更可控）。
- **长什么样**：
  ```html
  <meta name="twitter:card" content="summary_large_image">
  ```
- **本项目**：暂缺，廉价可加项。

### 1.9 结构化数据 / JSON-LD / Schema.org ⭐（富摘要的关键）

- **是什么**：用机器能懂的格式，把页面里的**实体信息**（这是一篇文章/一个产品/一条面包屑…）显式标注出来。词汇表来自 [schema.org](https://schema.org)；推荐写法是 **JSON-LD**（一段独立 `<script>`，不侵入 HTML 结构）。
- **为什么**：让 Google 不用「猜」，直接知道页面讲的是什么实体 → 有机会出**富摘要（Rich Results）**：搜索结果里带星级、价格、面包屑路径、FAQ 折叠等花样，**更显眼、更高点击率**。
- **长什么样**（本站 Article + 面包屑的产出）：
  ```html
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "headline": "5吨桥式起重机终极指南",
        "description": "……",
        "inLanguage": "zh-CN",
        "mainEntityOfPage": "https://www.dgcrane.com/zh/posts/5-ton-overhead-crane/"
        // ⚠ 缺 datePublished / dateModified / author / publisher —— 补齐才易出文章富摘要
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {"@type":"ListItem","position":1,"name":"首页","item":"https://www.dgcrane.com/zh/"},
          {"@type":"ListItem","position":2,"name":"5吨桥式起重机","item":"https://…/5-ton-overhead-crane/"}
        ]
      }
    ]
  }
  </script>
  ```
- **常见类型**：
  | 类型 | 用于 | 富摘要效果 |
  |---|---|---|
  | `Product` | 产品页 | 价格、库存、评分（需配 `offers`/`aggregateRating`） |
  | `Article` | 文章/新闻 | 大图、发布日期、作者 |
  | `BreadcrumbList` | 面包屑 | 结果里显示 `首页 › 分类 › 本页` 路径 |
  | `FAQPage` | FAQ 段 | 结果里可折叠展开问答 |
  | `Organization` | 首页/全站 | 品牌名、logo、社媒（知识面板） |
  | `LocalBusiness` | 有实体门店 | 地图、营业时间 |
- **要点**：结构化数据**必须与页面可见内容一致**（不能标注页面上没有的价格/评分，属操纵，会被惩罚）；用 Google **Rich Results Test** 验证。
- **本项目**：`build.mjs::jsonLdFor`，product→Product、post→Article，都带 BreadcrumbList。面包屑**故意只两级**（首页>当前）——中间分类页还没建，写三级会指向死链，结构化数据不该断言 404（决策⑭.3）；分类页迁入后升三级。

### 1.10 `hreflang` 多语言/多地区

- **是什么**：告诉 Google「本页还有其它语言/地区版本，各自的 URL 是哪个」，让它给对的用户展对的语言版本。
- **长什么样**：
  ```html
  <link rel="alternate" hreflang="zh-CN" href="https://www.dgcrane.com/zh/posts/5-ton-overhead-crane/">
  <link rel="alternate" hreflang="en"    href="https://www.dgcrane.com/en/posts/5-ton-overhead-crane/">
  <link rel="alternate" hreflang="x-default" href="https://www.dgcrane.com/en/…/">
  ```
- **本项目**：**暂不需要**——现在只有中文站。将来英文站落地（多语言 U-1~U-5）时才接；`/zh/` 子路径正是为此预留（决策 2026-07-02）。

### 1.11 语义化 HTML 与标题层级（h1–h6）

- **是什么**：用**有含义的标签**表达结构：一个 `<h1>` 是页面主标题，`<h2>` 是大节，`<h3>` 是子节；正文用 `<p>`、列表用 `<ul>`、导航用 `<nav>`。
- **为什么**：爬虫靠标签层级理解「什么是重点、内容怎么组织」。标题层级混乱（跳级、多个 h1、拿 h 标签当样式用）会让机器读不清主次。
- **要点**：每页**恰一个 `<h1>`**；层级不跳（h2 下才是 h3）；标题里带关键词。
- **本项目**：post 模版 `<h1 data-required>` 唯一；正文一串 `<h2 id="…">`（还喂给左栏 TOC 自动生成，见 `post-toc.js`）。

### 1.12 `alt` 图片替代文本

- **是什么**：`<img alt="…">`，图片的文字描述。
- **为什么**：①无障碍（读屏软件念给盲人听）；②图片 SEO（Google 图片搜索靠它理解图片内容）；③图挂了时显示占位文字。
- **长什么样**：
  ```html
  <img src="5-ton-crane.jpg" alt="5吨双梁桥式起重机在车间作业" width="880" height="495">
  ```
- **要点**：描述图片**真实内容**，自然带上相关词，别堆砌关键词。
- **本项目**：post 图片槽都带 `alt` + `width/height`。

### 1.13 URL 结构 / slug

- **是什么**：网址里那段人类可读的路径标识，如 `.../posts/5-ton-overhead-crane/`。
- **为什么**：简短、含关键词、有层级的 URL 对用户和爬虫都更友好；乱码/超长参数 URL 差。
- **要点**：小写、连字符 `-` 分词（别用下划线/空格）、含核心词、稳定（**上线后别乱改 URL**，改了旧链接全断，非改不可要做 301 跳转）。
- **本项目**：slug 由 MD frontmatter `page.slug` 定，英文小写连字符（§3 用户工作流：给 slug 就是给这个）。

### 1.14 HTTPS

- **是什么**：加密的 HTTP。
- **为什么**：Google 明确把 HTTPS 当**排名信号**；现代浏览器对 http 页面标「不安全」。
- **本项目**：生产走 CloudFront/S3，天然 HTTPS。

### 1.15 性能与 Core Web Vitals（核心网页指标）⭐

- **是什么**：Google 用三个真实体验指标衡量「页面快不快、稳不稳、跟手不跟手」，是排名信号：
  | 指标 | 全称 | 衡量 | 达标 |
  |---|---|---|---|
  | **LCP** | Largest Contentful Paint | 最大内容（通常首图/大标题）多久画出来 | < 2.5s |
  | **CLS** | Cumulative Layout Shift | 加载中版面**乱跳**的程度 | < 0.1 |
  | **INP** | Interaction to Next Paint | 点击后多久有反应（取代了旧的 FID） | < 200ms |
- **怎么优化**：
  - **LCP**：压缩图片、用现代格式（WebP/AVIF）、首图预加载、少阻塞渲染的 JS/CSS。
  - **CLS**：给 `<img>`/广告位**写死 `width/height`**（浏览器提前留位，图加载完不挤动版面）——本站图片都带宽高正是为此。
  - **INP**：别让主线程被大 JS 卡住。
- **本项目**：静态站天然快（无服务器渲染、CDN 边缘缓存）；**唯一短板是图片未压缩**（决策㉕ 把压缩挪到外链/云端环节，那笔 LCP 账记在那）。工具：Google **PageSpeed Insights**。

### 1.16 移动友好 / Mobile-First Indexing

- **是什么**：Google 现在**以手机版页面为准**建索引和排名（mobile-first）。
- **要点**：响应式布局、字体不过小、点击目标不过密、`<meta name="viewport">` 要有。
- **本项目**：`document.html` 已有 `<meta name="viewport" content="width=device-width, initial-scale=1">`。

### 1.17 图片优化（综合）

- 压缩体积（3-4MB/张是灾难，目标单张 < 200KB）；WebP/AVIF 格式；`width/height` 防 CLS；首屏外的图 `loading="lazy"` 延迟加载；`alt` 文本；文件名有意义（`5-ton-crane.jpg` 优于 `IMG_2931.jpg`）。

---

## 2. L2 语义层：内容结构（AI 烧 MD 时保证）

不是标签，是**内容本身对不对题**：

- **关键词自然融入**标题（h1/h2）、首段、正文——不是硬塞，是真的在讲这个主题。
- **搜索意图（search intent）匹配**：用户搜「5吨桥式起重机价格」，页面就得真给价格信息，而非只有参数表。
- **内容深度与结构**：分节清晰、覆盖用户会关心的子问题（类型/价格/应用/对比/案例）——本站 post 的 h2 划分就是在做这个。
- **E-E-A-T**（Experience 经验 / Expertise 专业 / Authoritativeness 权威 / Trustworthiness 可信）：Google 评估内容质量的框架，尤其看重「是不是真专家写的、可不可信」。B2B 制造业尤其吃这套（真实案例、参数、资质）。

---

## 3. L3 关键词层：让页面命中别人搜的词（人做）

- **关键词调研（keyword research）**：用工具查「哪些词有人搜、搜索量多大、竞争多激烈」。工具：Google Keyword Planner、Ahrefs、Semrush、Google Trends。
- **搜索意图分类**：信息型（「桥式起重机是什么」）、导航型（「dgcrane 官网」）、交易型（「5吨桥式起重机 报价」）——不同意图要不同页面类型接。
- **长尾关键词（long-tail）**：「5吨」这种大词竞争惨烈，「5吨防爆桥式起重机 出口印尼 价格」这种长尾词竞争小、更精准、转化高。B2B 外贸尤其靠长尾。
- **本项目边界**：这层**不写代码**，是内容/运营的判断。AI 不该拍脑袋硬编关键词。

---

## 4. L4 外链层：别的站为你背书（人/市场做）

- **外链（backlink / inbound link）**：别的网站链到你的页 = 给你投一票。**Google 起家的 PageRank 核心**，至今是最重排名信号之一。
- **对比内链（internal link）**：你**站内**页面互链（面包屑、related-products、正文互跳）——你能完全控制，属 L1/L2；外链在**别人服务器上**，只能「挣」。
- **关键属性**：
  - **锚文本（anchor text）**：链接上那段可点文字。「点击这里」没价值，「5吨桥式起重机厂家」这种含关键词的锚文本传递主题相关性。
  - **dofollow / nofollow**：`rel="nofollow"` 的链接告诉 Google「别把权重传过去」（如广告、用户生成内容）。dofollow 才传权重。
  - **域名权威度（Domain Authority / Rating）**：Ahrefs/Moz 的第三方估分，衡量一个域名整体多权威。高权威站给你的外链更值钱。
- **怎么挣（正道）**：内容好到别人自愿引用；行业目录/B2B 平台（阿里国际站、Made-in-China）；展会/协会/合作伙伴页；客户案例被转载；Guest post。
- **雷区**：买链接、链接农场（link farm）、垃圾评论刷链 → Google 惩罚**降权**，是**负资产**。
- **本项目边界**：`build.mjs` 生成不出一条外链，纯运营/市场活，明确划在系统范围外。

---

## 5. 常用工具（学会看数据）

| 工具 | 免费? | 干什么 |
|---|---|---|
| **Google Search Console (GSC)** | 免费 | Google 官方后台：看你哪些词有展现/点击、收录状态、抓取错误、提交 sitemap。**必装第一站。** |
| **Bing Webmaster Tools** | 免费 | Bing 版 GSC。 |
| **PageSpeed Insights** | 免费 | 测 Core Web Vitals（LCP/CLS/INP）+ 给优化建议。 |
| **Rich Results Test** | 免费 | 验证你的 JSON-LD 结构化数据能不能出富摘要。 |
| **Mobile-Friendly Test** | 免费 | 测移动友好。 |
| **Ahrefs / Semrush** | 付费 | 关键词调研、竞品分析、外链分析（L3/L4 主力）。 |
| **Screaming Frog** | 有免费额度 | 爬自己整站，批量查坏链/缺 title/重复 canonical 等技术问题。 |

---

## 6. 术语速查表

| 术语 | 中文 | 一句话 |
|---|---|---|
| Crawl | 抓取 | 爬虫顺链接爬到你的页 |
| Index | 索引 | 把读懂的页存进搜索库 |
| Rank | 排名 | 搜索时从库里排序展示 |
| SERP | 搜索结果页 | Search Engine Results Page |
| Canonical | 规范链接 | 声明本页官方唯一 URL，归拢重复权重 |
| Meta description | 元描述 | 结果里标题下的灰色摘要 |
| robots.txt | 爬虫协议 | 域名根，管爬虫能爬哪 |
| Sitemap | 站点地图 | 列出所有该收录的 URL |
| noindex | 禁索引 | 页面级：别把本页放进库 |
| Structured Data | 结构化数据 | 机器可读的实体标注（schema.org） |
| JSON-LD | — | 结构化数据的推荐写法（独立 script） |
| Rich Results | 富摘要 | 带星级/价格/面包屑的花式搜索结果 |
| Open Graph | — | 社交分享卡片元数据（og:） |
| hreflang | — | 多语言/地区版本声明 |
| Alt text | 替代文本 | 图片的文字描述 |
| Core Web Vitals | 核心网页指标 | LCP/CLS/INP 三大体验指标 |
| LCP | 最大内容绘制 | 主内容多久画出来（<2.5s） |
| CLS | 累积布局偏移 | 版面乱跳程度（<0.1） |
| INP | 交互到下次绘制 | 点击响应快慢（<200ms） |
| Keyword | 关键词 | 用户搜的词 |
| Search Intent | 搜索意图 | 用户搜这词想要什么 |
| Long-tail | 长尾词 | 长而具体、竞争小的词 |
| Backlink | 外链 | 别的站链到你 |
| Internal link | 内链 | 你站内互链 |
| Anchor text | 锚文本 | 链接上的可点文字 |
| Nofollow | — | 该链接不传递权重 |
| Domain Authority | 域名权威度 | 一个域名整体多权威（第三方估分） |
| E-E-A-T | — | 经验/专业/权威/可信，Google 的内容质量框架 |
| CTR | 点击率 | 展现里被点的比例 |
| 301 redirect | 永久跳转 | URL 变了把旧址权重转到新址 |

---

## 7. 结合本项目：现状对照（学完回看源码）

| 概念 | 状态 | 在哪 |
|---|---|---|
| title / description | ✅ | `document.html` `{{TITLE}}`/`{{DESCRIPTION}}` ← MD `page.*` |
| canonical | ✅ | `build.mjs::seoHead` |
| Open Graph | ✅ type/title/desc/url/locale/image（缺 `og:site_name`） | `seoHead` |
| Twitter Card | ❌ 廉价可加 | — |
| JSON-LD Product/Article | ✅（Article 缺 date/author/publisher，真窟窿） | `build.mjs::jsonLdFor` |
| JSON-LD BreadcrumbList | ✅ 两级（有意，⑭.3） | `jsonLdFor` |
| sitemap.xml | ✅ 登记同源 | `build.mjs::sitemapXml` |
| robots.txt | ⏸ 共存期不做（08 §2.3） | — |
| robots meta `max-image-preview` | ❌ 廉价可加 | — |
| hreflang | ⏸ 只有中文，多语言时接 | — |
| h1 唯一 / 标题层级 | ✅ | post 模版 + `post-toc.js` |
| alt / width / height | ✅ | 各图片槽 |
| slug / URL 结构 | ✅ | MD `page.slug` |
| HTTPS | ✅ | CloudFront |
| 图片压缩 / LCP | ⏸ 挪到外链环节（㉕） | — |
| viewport / 移动友好 | ✅ | `document.html` |

**下一步若要收口 L1**：补 Article 的 `datePublished`/`dateModified`（git lastmod 现成）/`author`/`publisher` —— 这是唯一会真正掉富摘要的洞；`og:site_name` / `twitter:card` / `max-image-preview` 是顺手的小项。这些都在 `build.mjs::seoHead`/`jsonLdFor` 里加，加完 `npm run check` 验一遍即可。

---

*本文是学习参考，非项目决策记录。项目的 SEO 范围划分与决策见 `CLAUDE.md` §8 及决策日志（2026-07-01 / 2026-07-02）、蓝图 08 章。*
