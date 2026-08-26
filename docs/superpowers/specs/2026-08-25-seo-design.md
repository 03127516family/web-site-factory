# SEO 模块设计（site/ 新架构）

> 状态：**设计定稿待终审**（D1~D8 全拍板；2026-08-26 真数据演示验证跑通）。
> 日期：2026-08-25 起，08-26 补正文。参与拍板：用户 + Claude。
> 问答全记录见本会话；可视化验证件：`design/seo-see-it.html`（真数据画的谷歌结果/微信卡/超长截断演示）。

---

## 一、已拍板决策

### D1 URL 结构：中文住根
默认语言（中文）在域名根 `/`，其他语言 `/<lang>/` 前缀（如 `/en/`）。
生产域名是站点配置常量（换站零改动），不写死。现状 `SITE_BASE` 带 `/zh/` 前缀为共存期旧值，切换时改常量即可。

### D2 语言规模：多语言矩阵
10+ 种语言机翻铺开（en 管线已通；加语言 = 建目录 + 跑机翻 + 配置登记，SEO 代码零改动）。
翻译成本不是约束（用户明示"无所谓，多花点翻译代价而已"）。

### D3 管理界面：单页面板 + 全站总览台，上线就要
- 单页 SEO 面板（编辑器侧栏：标题/描述/社交图 + Google 结果预览）——**交互先研究成型系统（Yoast metabox / Framer page settings）再设计，不自己发明**。
- 全站体检总览台：一行=一篇逻辑页，语言为行属性；异常旗常驻露脸直达编辑页，健康语言收进展开层；默认只显异常（常态全绿）；状态机器算（族谱+戳），零人工登记。
- 界面线框：`design/seo-overview-wireframe.html`（用户已看过；界面细节后置，字段先留位）。

### D4 生成方式：A — 构建流水线内照族谱现算
**拍板：A**（2026-08-25）。SEO 生成长在 astro build 流水线里：点名（族谱现算）→ 逐页造页时顺手贴 SEO 信息卡 → 收尾写 sitemap.xml / robots.txt。保存/发布/烧制/机翻四路共用串行构建队列，内容一变 SEO 自动新。

**B — Astro 官方生态件（@astrojs/sitemap i18n 选项等）：记档否决**
- 否决理由：插件按"路径去掉语言前缀"归组，**不读发布门禁与孤立镜像态**（真例：`free-standing-jib-cranes` 为 en-only 孤立镜像；源撤版镜像保留的态也存在）；hreflang 互指错 → 谷歌整组作废。JSON-LD 无生态件可代、仍需自写，省代码不彻底。head（自写组件）与 sitemap（插件）裂成两截真相，漂移无构造性防线。
- **B 的适用边界（何时 B 反而对）**：无翻译门禁、每页全语言齐全的（单语言或完全规整多语言）小站——省事够用。将来做这种站时回看此条。

### D5 SEO 字段翻译策略：机翻保底 + 人修锁定（pin）
- 默认层：机翻直出跟源页走（免审直发，2026-08-18 机制沿用），空/过期比机翻更伤。
- 锁定层：人精修过的镜像 SEO 字段 pin 住，源页再改不自动冲掉，只在总览台标"待确认"，人决定重不重跟。
- 质量层：SEO 字段的翻译指令单独写（按目标语言搜索习惯措辞，非逐字翻）；关键词进术语表（terms map）修一片。
- 依据：业界共识（Globalization Partners / Silvia Delgado / Translated.com 等）——标题描述应本地化而非直译；Yoast+WPML 每语言 SEO 字段独立可改。
- ⚠ 待验证：现状代码里"人精修后源页又改，人稿是否被机翻替换"未查证，设计 pin 机制前先验。

### D6 信息卡字段分工：照抄业界标准（用户授权"抄袭牛逼的"）
- **常规区（人编辑）**：标题、简介——机器兜底先填好（烧制台已产），面板可改。存 `page.title`/`page.description`（现有）。
- **社交区（人可改，默认自动复用）**：社交标题/简介/图，空=自动复用标题/简介/页面头图（Yoast 特色图兜底同款）。存可选 `page.seo.og.*` 覆盖块。
- **高级区（折叠藏起，95% 不碰）**：canonical 覆盖（空=自动自指）、收录开关（一开关同时：撤出 sitemap + noindex，Webflow 同款）。
- **纯机器不给人碰**：hreflang 语言互认、sitemap、JSON-LD、og:url——四家（Yoast/Webflow/Framer/Shopify）无一家给人工字段，证据见会话内调研（yoast.com/social-media-optimization、khod.io Webflow sitemap 指南、framer.com/help）。

### D7 x-default 兜底语言：英文版（用户拍板 A）
34 语言都不匹配的用户（如仅会法语者）兜底送英文版。依据：外贸 B2B 受众，会英语概率远高于会中文。

### D8 技术细则（打包拍板，照业界标准）
1. **JSON-LD**：产品页 Product、文章页 Article、全站 BreadcrumbList（Yoast/WooCommerce 同款组合；B2B 无在线售价，走轻量 product snippet）。Organization 站级标识经正文收敛为后补项（见 §8）。
2. **sitemap**：单文件合并式，每条 url 带全部语言 `xhtml:link` 互认（WPML+Yoast 同款；34 语言×几十页 ≈700-2000 条，远低于 5 万上限，不拆片）。
3. **og:image 兜底链**：`page.seo.og.image` 覆盖 → 页面头图（hero.image）→ 站级默认图。
4. **草稿/预览防收录**：`page.status ≠ published` → 不进 sitemap + noindex；dist-edit 预览产物统一 noindex（status 门已有，纯接线）。
5. **站级默认层**：品牌后缀模板、默认描述、默认分享图、SITE_ROOT/DEPLOY_LANGS 等 → 站点配置一处（换站零改动），不散落代码。

---

## 二、待定问题（问答队列）

（已清零——D1~D8 全部拍板，2026-08-25）

---

## 三、关键事实（已验证，带证据）

- **族谱不落盘**：真相 = content 文件夹结构（pageId=文件名=跨语言配对键，`content/<lang>/`=镜像位）；每次构建/起服务现算（`src/i18n/kernel.mjs` scanPages/buildGroups/siblingsOf）；`content/registry.json` 为可全量重建的物化快照，非第二真相。
- **构建触发链**：保存/发布/烧制/机翻 → 串行队列 → `astro build`（全局重建，15 页实测 ≈1.5s；`edit-server.mjs:142` spawn 同一条 astro build，BUILD_OUT 参数化 dist/dist-edit 双产物）。
- **接线点**：`src/layouts/Chrome.astro:46` `.replaceAll('{{SEO}}', '')` 空占位；语言切换器 `Chrome.astro:40` 已消费 siblingsOf——SEO 为同一数据的第二消费者。
- **Google hreflang 硬规则**（官方文档已读）：每版本列自己+全部兄弟、集合内互指一致、URL 绝对路径、zh-CN/en 合法、x-default 为未匹配语言兜底；sitemap 方式每 url 带 xhtml:link 列全部版本。
- **现状 SEO 代码为零**：全库 grep canonical/hreflang/og:/sitemap/robots 零命中（除空占位注释）。
- **文件结构**（2026-08-25 整理后）：`src/i18n/`（kernel+pipeline+…+data/）、`src/writeback/`、`src/content/`、`src/draft/`、`src/render/`；SEO 新模块落 `src/seo/`。
- **真数据演示已跑通**（2026-08-26，/tmp 雏形约 100 行，不落库）：15 页真实内容 → 中英信息卡、sitemap 78 行、互指一致性程序验证 ✓；体检当场抓到真问题：**英文页标题 6 处、简介 8 处超长**（谷歌会截断）——治理进实施步 3（翻译指令加长度约束）。

---

## 四、设计正文

### §0 一句话

SEO 是渲染链的一部分：**三样现成原料 → `src/seo/` 一个纯逻辑模块 → 三样成品**，搭每趟构建的顺风车，无独立生命周期。全链没有任何一刻需要"人写 SEO"——人只有"改"（标题/简介/开关），没有"写"。

### §1 模块与接口

**新模块 `src/seo/kernel.mjs`（纯 Node，零 Astro 依赖，与 i18n/kernel 同款纪律）：**

| 函数 | 签名 | 输出 |
|---|---|---|
| `seoHead(pg, siblings, cfg)` | 页面对象+语言兄弟+配置 | 该页 head 片段（string） |
| `sitemapXml(groups, pages, pubSet, cfg)` | 族谱全量 | sitemap.xml 全文（string） |
| `robotsTxt(cfg)` | 配置 | robots.txt（string，3 行） |
| `healthData(pages, cfg)` | 全部页面 | 体检数据数组（总览台直接吃） |

**配置收拢（换站零改动的落点）**：`SITE_ROOT`（已有）、`DEPLOY_LANGS/LANG_LABEL`（已有）+ 新增 `BRAND`、`TITLE_TEMPLATE`（"{标题} \| {品牌}"）、`DEFAULT_OG_IMAGE`、`X_DEFAULT_LANG`（=en，D7）、`OG_LOCALE` 映射表。与 i18n 配置同层存放（其终态同迁 site.config）。**D1「中文住根」**：`pageUrl` 的 zh 前缀改为根（改常量），演示已验证一行翻转全站变。

**接线两处：**
1. `Chrome.astro:46`：`.replaceAll('{{SEO}}', '')` → `.replaceAll('{{SEO}}', seoHead(me, siblingsOf(me, groups, publishable), cfg))`——与语言切换器（:40）同源同位置。
2. 构建后处理：与 `link-assets.mjs` 同层新增 `scripts/seo-emit.mjs`，写 `sitemap.xml`+`robots.txt` 进产物目录；**dist 与 dist-edit 两条产物链都跑**。预览链（dist-edit）加环境变量 `SEO_PREVIEW=1` → seoHead 首行插入 `<meta name="robots" content="noindex">`（BUILD_OUT 参数化同款做法）。

### §2 数据模型（放每页 content JSON 内，D6 已拍；不建独立 SEO 目录）

```json
"page": {
  "title": "…", "description": "…", "status": "published",   // 现有，不动
  "seo": {                                                    // 新增，整体可省略；null/缺省=自动
    "og":   { "title": null, "description": null, "image": null },
    "canonical": null,
    "noindex": false
  }
}
```

- **schema**：`content/schema.mjs` 的 page 定义加可选 `seo` 键（类型错当场红，validateDoc 纪律沿用）。
- **兜底链**：`title → TITLE_TEMPLATE(title+品牌)`；`description → 正文首段截 160 字符`；`og.title/og.description → 复用 title/description`（Yoast 同款）；`og.image → hero.image → DEFAULT_OG_IMAGE`；`canonical → url(自己)`。
- **翻译名册**：`page.title/description/seo.og.title/seo.og.description` 跟源机翻；`seo.og.image/canonical/noindex` 不翻（值形态排除，机制已有）。
- **pin 地基（⚠ 实施第一步先验证）**：字段级 origin（human/engine）若现状无则补——TM 有按句 origin，字段级未验。pin 语义：origin=human 的字段在源变更时进"待确认"队列，**不自动重翻**；体检台提供**批量**操作（全部重跟 / 全部保持 / 挑选，WPML Translation Dashboard 同款交互）。

### §3 生成规则（每行标签的来源，演示代码即雏形）

| 标签 | 来源 |
|---|---|
| `<title>` / `<meta description>` | page 字段（含兜底链） |
| `<link canonical>` | `page.seo.canonical \|\| url(自己)` |
| `<link hreflang ×N>` | `siblingsOf` 每成员一行（含自己）；`x-default → en 成员`，**仅当集合>1 且该成员在集合内**；集合=1 且恰为兜底语言时省略（防重复行） |
| `og:title/description/image/url/type` | 兜底链 / canonical / post→article、product→product / og:locale（lang 映射；`og:locale:alternate` 后补，见 §8） |
| JSON-LD `@graph` | `[Product \| Article, BreadcrumbList(trail+current)]`——B2B 无在线售价走轻量 product snippet；Article 无日期字段（内容 JSON 未存日期），合法但弱，**列为已知限制**；Organization 站级标识列为后补加分项 |
| `<meta robots>` | `status≠published \|\| page.seo.noindex \|\| 预览构建` → noindex，且该页不进 sitemap |
| sitemap | pubSet 逐成员 `<url>`+`<loc>`+全员 `xhtml:link`；**无 lastmod**（无可靠时间源，瞎填有害；有可靠 updatedAt 后再加） |
| robots.txt | 允许全站 + `Sitemap: <绝对URL>`。**部署注意**：若新站与老站共存同域子路径，robots.txt 归域名根所有者（老站），此文件不上传——部署层判断，代码照产 |

### §4 管理层（界面后置，接口本期留好）

- **单页面板**：读 = page 字段 + seoHead 的 Google 结果预览（`seo-see-it.html` 已验证可画）；写 = 现有写回协议（changes/revision/edit-contract 声明 seo 块字段），零新保存链。交互开工前先拆 Yoast metabox / Framer page settings 同款（D3 纪律）。
- **体检台**：吃 `healthData`（标题/简介缺失与超长、noindex）+ 翻译戳（过期/未建/failed）+ pin 待确认队列；行=逻辑页、异常旗常驻、默认只显异常、**批量操作**（见 §2 pin）。线框：`design/seo-overview-wireframe.html`。

### §5 边界与错误处理

| 场景 | 行为 |
|---|---|
| 孤立镜像（真例：free-standing-jib-cranes，en-only） | hreflang 集合=1 只指自己，无 x-default 重复行；sitemap 单行 |
| 源撤版、镜像保留（页面永不下线语义） | siblingsOf 照含该镜像，互指/sitemap 跟随 |
| 缺头图/简介/标题 | 兜底链（§2），构建不失败 |
| seo 块类型写坏 | validateDoc 当场红（schema 纪律） |
| 标题/简介超长 | **提示级**（体检数据标 ⚠），不拦截构建（2026-08-17 概率判定只提示 doctrine）；治本在步 3 翻译指令加长度约束 |
| 特殊字符 | escAttr 同款转义（&/"/<） |

### §6 验收（`scripts/accept-seo.mjs`，新增）

1. 每页卡五行齐全（title/desc/canonical/hreflang≥1/og 四件）
2. **互指一致性**：每组内各版本 hreflang 集合两两相等（程序断言）
3. sitemap 条数 = dist 实际页数，一条不多不少；draft/noindex 页绝不在内
4. 空手工位 = 纯默认输出（与无 seo 块逐字节同）
5. 孤立镜像只指自己
6. 端到端：改中文标题→保存→重建→en 页卡跟随变（走真实编辑链）
7. 换站冒烟：改配置常量→全部 URL 变、代码零 diff

### §7 实施切分（四步，每步全绿才进下一步）

| 步 | 内容 | 关键点 |
|---|---|---|
| 1 验地基 | 验证/补字段级 origin；配置收拢（含 D1 前缀翻转） | pin 的前提，先验后做 |
| 2 输出层 | `src/seo/kernel.mjs` + Chrome.astro 接线 + seo-emit（dist/dist-edit 双链、预览 noindex）+ accept-seo | 做完全站 15 页立刻带完整 SEO |
| 3 翻译联动 | seo 字段进名册；pin+待确认队列+批量端点；翻译指令加长度约束（治 14 处超长）；体检数据接线 | 依赖步 1 |
| 4 管理界面 | 研究 Yoast/Framer 交互→单页面板；体检台 | 吃步 2/3 现成数据 |

### §8 已知限制与后补清单

- sitemap 无 lastmod（无可靠时间源）
- Article 无 datePublished（内容 JSON 未存日期；哪天加日期字段则补）
- Organization 站级 JSON-LD、og:locale:alternate——首版可后补
- 英文 SEO 字段超长（现存 14 处）治理在步 3，属翻译提示词工程
- 管理界面（面板/体检台）整体在步 4，本期只保数据接口

---

## 附录：实施修正与实证（2026-08-26 落地时核出，已随实施一并处理）

1. seoHead 不发 `<title>`/`<meta description>`——document.html `{{TITLE}}`/`{{DESCRIPTION}}` 已发（重复发=双标签）。
2. 预览 noindex 用现成 `INCLUDE_DRAFTS` 信号（dist-edit 恒 1，build-outputs.mjs:66），不新加 `SEO_PREVIEW` 环境变量。
3. `DEFAULT_OG_IMAGE` 默认空=无兜底图不发 `og:image`（死图比缺标签伤）；站里放好默认图后改常量。
4. `TITLE_TEMPLATE` 默认空=不套（page.title 烧制已含品牌「- DGCRANE」，再套=双品牌）；只作用于 og:title/JSON-LD headline。
5. §7 步 1「验证字段级 origin」核出两个真缺口并一并修：**adoptMirror 无生产调用方**（镜像人改不进 TM，下次重投影整文件覆盖冲掉人改）；**SITE_BASE '/zh/' 与 dist 拓扑不一致**（dist zh 产物在 /posts/ 无前缀，切换器 zh 链接 404）——D1 翻转即修正。
6. 「seo 字段进名册」零代码——collectUnits 按 key/值形态自动收 `seo.og.title/description`、自动排除 `image/canonical/noindex`。
7. **pin 键必须 `pageId::field`**（e2e 实证教训）：TM 全语言对共享，只按字段名做键会一页收养六页污染（每页都有 title）；句账 fp 全局去重本身正确，pin 是页级人决策。另：首次镜像发布会把存量手工调过、从未进 TM 的字段收养成人稿+pin（一次性欠账收割，预期行为）。
8. 体检基线实跑（2026-08-26，healthData 全站）：15 页、异常 8 页全在 en——标题超长 6 处（32t=111 / 5-ton=82 / safety=89 / gantry=82 / multi-point=75 / overhead=69）、简介超长 8 处（171~319 字符）。治理=步 3 长度预算已上线，存量句重译走 refollow/下轮发布自然补。
9. 实施验证矩阵：accept-seo 16/16、check 84/84、burn 155/155、writeback 34/34、poc5 56/56、node22 build 15 页、e2e 四步真实链全过。
