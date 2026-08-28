# 系统架构导览（site/）

> 目的：让任何人（包括三个月后的自己）在 10 分钟内重建「这个系统怎么跑」的心智模型。
> 事实基准：2026-08-28 实际文件清点，非设计意图。路径全部相对仓库根的 `site/`。
> 配套阅读：`../../CLAUDE.md` 决策日志（为什么长成这样）、`docs/editor-assets.md`。

---

## 0. 一句话

**内容是 JSON（`content/**.json`），页面是 Astro 模版（kit），构建时确定性渲染；
两个浏览器界面（8092 编辑页 / 8090 工作台）是人唯一的操作入口，其余全部自动。**

## 1. 你碰什么（人视角）

```
   浏览器 8092 编辑页               浏览器 8090 工作台
   （所见即所得改页面/SEO面板）     （翻译·SEO体检·烧新页·询盘收件箱）
       │ 点「发布」                    │ 点按钮（代理到 8092）
       ▼                              ▼
   edit-layer/edit-layer.js        workbench/server.mjs
       │                              │
       ▼                              ▼
   scripts/edit-server.mjs ◄────────（同一台 8092）
       │
       ├─ 写回 content/**.json（writeback/ 校验后落盘）
       ├─ 自动：i18n 抬戳 → 机翻流水线 → 英文镜像更新
       ├─ 自动：上传图片压缩闸门（sharp）
       └─ 自动：astro build → dist（生产）/ dist-edit（草稿预览）

   一键启动：npm run workbench（须 node ≥ 22）
```

日常判断：**页面不对 → 8092 改；翻译/SEO/体检不对 → 8090 看；都不对 → 跑检查矩阵（§4）。**

## 2. 一次「内容 → 上线」的四段旅程

### ① 出生：内容变成界面

| 步骤 | 文件 |
|---|---|
| 裸文原料 | `content/raw/` |
| AI 烧制（贴文 → 整页 JSON，防编造硬闸） | `src/deepseek.mjs`、`src/burn-lib.mjs`、`scripts/deepseek-burn.mjs` |
| 草稿层（烧制产物强制 draft，人工转正） | `src/draft/store.mjs`、`src/draft/workflow.mjs` |
| **内容真相** | `content/products\|posts/<id>.json`（中文源）；`content/en/...`（英文镜像） |
| schema 校验 | `src/content/schema.mjs` |
| 模版 kit（一 astro 一模版，四件套） | `src/components/products/ProductPage/`、`src/components/posts/<各篇>/`：`index.astro`+`meta.json`+`example.json`+`edit-contract.json`；共享件 `components/shared/InquiryForm.astro` |
| 树→HTML | `src/render/render.mjs`、`src/render/tree-utils.mjs` |
| 路由（含英文门禁） | `src/pages/products/[slug].astro`、`pages/posts/[slug].astro`、`pages/[lang]/products\|posts/[slug].astro` |
| 外壳 chrome | `src/layouts/Chrome.astro`（装配 `src/chrome/` 五件：document/header/footer/inquiry-form/photoswipe） |
| 构建双产物 | `astro.config.mjs` + `src/build-outputs.mjs` → `dist/`（生产）、`dist-edit/`（草稿预览） |
| 素材 | `public/assets/`（真身）；上传闸门 `scripts/link-assets.mjs` + `src/asset-config.mjs`；探测 `scripts/img-probe.mjs` |

### ② 修改：所见即所得写回

| 步骤 | 文件 |
|---|---|
| 前端编辑层（TipTap，4 条 dirty 通道含 SEO 面板 `dirty.meta`） | `edit-layer/edit-layer.js` |
| 编辑服务器（8092，`/__save` 等全部端点） | `scripts/edit-server.mjs` |
| 原值上呈（DOM 里没有的值，如 SEO 覆盖键） | `src/edit-context.mjs` |
| 字段契约（哪些路径可写、什么类型） | `src/edit-contract.mjs` + 各 kit 的 `edit-contract.json` |
| **写回核心**（normalizeTree→validateDoc→ensurePath→落盘） | `src/writeback/core.mjs`、`src/writeback/request.mjs` |
| diff 弹层 | `src/content/diff.mjs` |
| 保存后自动副作用 | zh 源改→源戳+1→自动机翻；en 镜像直改→收养进 TM（`adoptMirror`） |

### ③ 多语言：翻译流水线

| 环节 | 文件 |
|---|---|
| 族谱（路由门禁/切换器/hreflang，全站唯一份） | `src/i18n/kernel.mjs`（scanPages/siblingsOf/pageUrl/langSwitcher/isPublishable）；快照 `scripts/i18n-registry.mjs` |
| 抽可翻字段 | `src/i18n/collect.mjs` |
| TM 句账 | `src/i18n/tm.mjs` + `src/i18n/data/tm.zh-CN.en.json` |
| 术语表（质量唯一杠杆） | `src/i18n/terms.mjs` + `src/i18n/data/terms.zh-CN.en.json` |
| 机翻引擎（DeepSeek） | `src/i18n/engine.mjs`（调 `src/deepseek.mjs`） |
| 流水线（机翻直发/人改收养/pin 锁定） | `src/i18n/pipeline.mjs` |
| 镜像投影（骨架恒≡源） | `src/i18n/project.mjs` + `src/i18n/sent.mjs`（指纹） |
| 排除/守恒硬查 | `src/i18n/checks.mjs` |
| 免审配置 | `src/i18n/data/config.json`（`review.en: "auto"`） |
| 事件留痕 | `src/i18n/events.mjs` → `site/.i18n-events.jsonl` |

### ④ SEO：构建时现算

| 环节 | 文件 |
|---|---|
| head 现算（canonical/hreflang/og/JSON-LD/noindex） | `src/seo/kernel.mjs` + `src/seo/config.mjs` |
| 注入点 | `src/layouts/Chrome.astro` 的 `{{SEO}}` 槽 |
| sitemap/robots（noindex 页自动除名） | `scripts/seo-emit.mjs` |
| 编辑入口 | 8092 SEO 面板（edit-layer `dirty.meta`）；8090 体检屏 |
| 体检数据 | `src/seo/kernel.mjs` 的 `healthData` |

## 3. 怎么知道「是对的」（检查矩阵）

**分工原则（2026-08-17 拍定）：机器只枪毙它能 100% 判对的东西；内容质量/版式必须人看结果——这是分工，不是失控。**

| 闸门 | 命令 | 管什么 |
|---|---|---|
| 写回契约 | （保存链内自动） | 没声明的路径拒写、类型硬查 |
| 防编造 | （烧制链内自动） | 逐字子串查全文、白名单、schema |
| 几何回归 | `npm run geom` | 新页 vs 旧产物基准逐元素 ±2px |
| i18n 全套 | `npm run check` | registry 快照一致 + accept-i18n2（84 断言） |
| 其余验收 | `npm run accept:poc5`（8092 端到端 56）、`accept:burn`（155）、`accept:writeback`（34）、`accept:seo`（17）、`accept:workbench`（7）、`accept:drafts`（11）、`accept:content-diff`（15）等 12 套件 | 各机制回归 |
| 构建冒烟 | `npm run build`（node ≥22） | 15 页全出、sitemap/robots 落盘 |

已知缺口：**无一键全矩阵命令**（`check` 只覆盖 2 项，其余散跑）——待建 `npm run doctor`。

## 4. 当前状态与已知缺口（2026-08-28）

已达成：内容迁移完（8 源 + 8 镜像）、i18n 免审直发、SEO 全字段、工作台唯一管理界面、素材自包含。

未达成（对照根目录旧 dist 还缺）：
- **404.html**（site 无）
- **首页 index**（site 无；旧 dist 有 index.html）
- **站内搜索**（旧 dist 有 search/ + search-index.json；site 无，header 搜索框仍指旧 WP）
- **部署**：本仓库无 deploy workflow，线上仍是旧 WordPress；本系统处于「待部署」态
- 旧系统（仓库根 `scripts/`、`src/`、`dist/`、根 `package.json`、CI `.github/workflows/check.yml`）仍在服役：CI 每次跑旧三件套；`geom-check.mjs` 拿根 dist 当基准。**退役路线图见决策日志 2026-08-28 条。**

## 5. 不属于本系统的

- `app/`：表单 mock 收件箱（工作台询盘屏在用，**不是**旧系统，别删）
- `demo/`、`design/`、`docs/superpowers/`、`对话记录-*.md`：历史存档
- 线上 WordPress：与本仓库无关（robots.txt 决策：域名根归老站管）
