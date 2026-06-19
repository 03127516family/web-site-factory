# DGCRANE 产品页面模板原型实施计划

> **执行要求：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按照本计划逐项实施。所有步骤使用复选框（`- [ ]`）跟踪状态。

**目标：** 忠实还原 DGCRANE 中文产品系列页面，建立可复用的 Header 和 Footer、一个完整产品页面模板、响应式样式，并预留 AI、编辑器和动态模块标记。

**架构：** Nunjucks 仅用于组合全站外壳：基础布局引入可复用的 Header 和 Footer，产品页面主体仍然保留为完整 HTML，而不是字段驱动的数据表单。小型 Node 构建脚本将模板渲染到 `dist/`；模板标记用于识别页面区域和可编辑内容，询价表单与相关产品区域预留为 API 动态模块。

**技术栈：** Node.js 20+、Nunjucks、原生 `node:test`、HTML5、CSS、少量浏览器 JavaScript

---

## 范围

本计划仅实现第一份模板原型：

- 可复用的中文站点 Header
- 可复用的中文站点 Footer
- 内页共用的品牌信任横幅
- 面包屑系统占位
- 基于当前单梁门式起重机页面的 `product-family-detail@1` 页面模板
- 桌面端和移动端响应式 CSS
- 询价表单与相关产品动态占位
- 构建测试和结构测试
- 在浏览器中与 `https://www.dgcrane.com/zh/products/single-girder-gantry-cranes/` 进行视觉验证

本阶段不实现 CMS、AI 生成 API、PostgreSQL、S3 发布、真实表单、产品 API 或模板管理界面。

## 文件结构

```text
package.json                              Node 脚本和依赖声明
scripts/render.mjs                        Nunjucks 环境和可复用渲染函数
scripts/build.mjs                         生产构建入口
src/templates/layouts/base.njk            共用 HTML 文档外壳
src/templates/partials/header.njk         可复用站点页头
src/templates/partials/footer.njk         可复用站点页脚
src/templates/partials/trust-banner.njk   可复用内页信任横幅
src/templates/pages/product-family-detail.njk
                                          完整产品系列页面主体
src/styles/site.css                       共用样式和产品页响应式样式
src/scripts/site.js                       移动导航和动态模块降级逻辑
public/assets/logo.svg                    公司 Logo 本地副本
public/assets/product-hero.jpg            代表性产品图片
tests/render.test.mjs                     构建和外壳组合测试
tests/template-contract.test.mjs          必需标记和安全测试
README.md                                 本地构建和预览说明
dist/                                     生成产物，不纳入 Git
```

### 任务 1：搭建静态模板构建器

**文件：**
- 新建：`package.json`
- 新建：`.gitignore`
- 新建：`scripts/render.mjs`
- 新建：`scripts/build.mjs`
- 新建：`tests/render.test.mjs`

- [ ] **步骤 1：编写失败的渲染测试**

新建 `tests/render.test.mjs`：

```js
import assert from "node:assert/strict";
import test from "node:test";
import { renderSource } from "../scripts/render.mjs";

test("renders a complete HTML document", () => {
  const html = renderSource(
    "<!doctype html><html lang=\"zh-CN\"><body>{{ content }}</body></html>",
    { content: "产品模板" }
  );

  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /产品模板/);
});
```

- [ ] **步骤 2：运行测试并确认失败**

运行：

```bash
node --test tests/render.test.mjs
```

预期：测试失败，因为 `scripts/render.mjs` 尚不存在。

- [ ] **步骤 3：添加包配置和忽略规则**

新建 `package.json`：

```json
{
  "name": "dgcrane-template-prototype",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node scripts/build.mjs",
    "test": "node --test",
    "preview": "python3 -m http.server 4173 --directory dist"
  },
  "dependencies": {
    "nunjucks": "^3.2.4"
  }
}
```

新建 `.gitignore`：

```gitignore
node_modules/
dist/
.DS_Store
```

运行：

```bash
npm install
```

预期：生成 `node_modules` 和 `package-lock.json`。

- [ ] **步骤 4：实现可复用渲染器和构建命令**

新建 `scripts/render.mjs`：

```js
import nunjucks from "nunjucks";

const environment = nunjucks.configure("src/templates", {
  autoescape: true,
  noCache: true,
  throwOnUndefined: true
});

export function renderTemplate(templateName) {
  return environment.render(templateName, {
    pageTitle: "单梁龙门吊价格 | DGCRANE",
    pageDescription: "DGCRANE 单梁门式起重机产品系列详情页模板。"
  });
}

export function renderSource(source, context = {}) {
  return environment.renderString(source, context);
}
```

新建 `scripts/build.mjs`：

```js
import { cp, mkdir, writeFile } from "node:fs/promises";
import { renderTemplate } from "./render.mjs";

await mkdir("dist/zh/products/single-girder-gantry-cranes", { recursive: true });
await mkdir("dist/assets", { recursive: true });

const html = renderTemplate("pages/product-family-detail.njk");
await writeFile(
  "dist/zh/products/single-girder-gantry-cranes/index.html",
  html,
  "utf8"
);
await cp("src/styles/site.css", "dist/assets/site.css");
await cp("src/scripts/site.js", "dist/assets/site.js");
await cp("public/assets", "dist/assets", { recursive: true });
```

- [ ] **步骤 5：提交构建脚手架**

```bash
git add package.json package-lock.json .gitignore scripts tests/render.test.mjs
git commit -m "build: scaffold static template renderer"
```

### 任务 2：建立可复用站点外壳

**文件：**
- 新建：`src/templates/layouts/base.njk`
- 新建：`src/templates/partials/header.njk`
- 新建：`src/templates/partials/footer.njk`
- 新建：`src/templates/partials/trust-banner.njk`
- 新建：`src/templates/pages/product-family-detail.njk`
- 修改：`tests/render.test.mjs`

- [ ] **步骤 1：扩展失败测试，检查外壳唯一性**

把 `tests/render.test.mjs` 中的渲染器导入改为：

```js
import { renderSource, renderTemplate } from "../scripts/render.mjs";
```

然后追加：

```js
test("includes each reusable shell partial exactly once", () => {
  const html = renderTemplate("pages/product-family-detail.njk");

  assert.match(html, /data-page-template="product-family-detail@1"/);
  assert.equal((html.match(/data-site-header/g) ?? []).length, 1);
  assert.equal((html.match(/data-trust-banner/g) ?? []).length, 1);
  assert.equal((html.match(/data-site-footer/g) ?? []).length, 1);
});
```

- [ ] **步骤 2：运行定向测试并确认失败**

运行：

```bash
node --test tests/render.test.mjs
```

预期：测试失败，因为产品页模板尚不存在。

- [ ] **步骤 3：创建基础布局**

新建 `src/templates/layouts/base.njk`：

```njk
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ pageTitle }}</title>
    <meta name="description" content="{{ pageDescription }}">
    <link rel="stylesheet" href="/assets/site.css">
    <script src="/assets/site.js" defer></script>
  </head>
  <body>
    {% include "partials/header.njk" %}
    {% include "partials/trust-banner.njk" %}
    {% block content %}{% endblock %}
    {% include "partials/footer.njk" %}
  </body>
</html>
```

- [ ] **步骤 4：创建可复用 Header**

新建 `src/templates/partials/header.njk`，包含以下稳定区域：

```njk
<header class="site-header" data-site-header>
  <div class="topbar">
    <div class="container topbar__inner">
      <button class="language-switcher" type="button">简体中文</button>
      <nav aria-label="辅助导航">
        <a href="/zh/online-tools/">在线工具</a>
        <a href="/zh/overhead-crane-prices/">价格</a>
        <a href="/zh/cases/">案例</a>
        <a href="/zh/blogs/">博客</a>
        <a href="/zh/pdf/">下载</a>
        <a href="/zh/videos/">视频</a>
      </nav>
    </div>
  </div>
  <div class="container masthead">
    <a class="brand" href="/zh/" aria-label="DGCRANE 首页">
      <img src="/assets/logo.svg" alt="DGCRANE">
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav">菜单</button>
    <nav id="primary-nav" class="primary-nav" aria-label="主导航">
      <a href="/zh/">工业</a>
      <a href="/zh/">设备</a>
      <a href="/zh/crane-parts/">起重机零件</a>
      <a href="/zh/about-dgcrane/">关于我们</a>
      <a href="/zh/contact-us/">联系我们</a>
    </nav>
  </div>
</header>
```

- [ ] **步骤 5：创建信任横幅和 Footer**

新建 `src/templates/partials/trust-banner.njk`：

```njk
<aside class="trust-banner" data-trust-banner>
  <div class="container trust-banner__inner">
    <h2>起重机制造商和出口商</h2>
    <ul>
      <li>10年以上起重机出口经验</li>
      <li>产品已销往120多个国家</li>
      <li>50多人技术团队</li>
      <li>3000多个行业案例</li>
    </ul>
  </div>
</aside>
```

新建 `src/templates/partials/footer.njk`：

```njk
<footer class="site-footer" data-site-footer>
  <section class="newsletter">
    <div class="container newsletter__inner">
      <div><h2>订阅我们的新闻</h2><p>获取最新价格、新闻、文章和资源。</p></div>
      <form><label><span class="sr-only">电子邮件</span><input type="email" placeholder="您的电子邮件地址"></label><button type="submit">订阅</button></form>
    </div>
  </section>
  <div class="container footer-grid">
    <section><h3>桥式起重机</h3><a href="/zh/overhead-cranes/">桥式起重机</a><a href="/zh/single-girder-overhead-crane-types/">单梁桥式起重机</a><a href="/zh/double-girder-overhead-crane/">双梁桥式起重机</a></section>
    <section><h3>龙门起重机</h3><a href="/zh/gantry-cranes/">龙门起重机</a><a href="/zh/products/single-girder-gantry-cranes/">单梁门式起重机</a><a href="/zh/products/double-girder-gantry-cranes/">双梁龙门起重机</a></section>
    <section><h3>起重机零件</h3><a href="/zh/crane-parts/">起重机零件</a><a href="/zh/crane-wheel-range/">起重机车轮</a><a href="/zh/products/crane-hooks/">起重机吊钩</a></section>
    <section><h3>联系</h3><a href="mailto:sales@dgcrane.com">sales@dgcrane.com</a><p>+86 373 387 6188</p><p>河南省新乡市金穗大道</p></section>
  </div>
  <div class="container footer-legal"><span>© 2026 DGCRANE</span><a href="/zh/privacy-policy/">隐私政策</a><a href="/sitemap_index.xml">XML Sitemap</a></div>
</footer>
```

- [ ] **步骤 6：创建最小产品页外壳**

新建 `src/templates/pages/product-family-detail.njk`：

```njk
{% extends "layouts/base.njk" %}
{% block content %}
<main data-page-template="product-family-detail@1"></main>
{% endblock %}
```

- [ ] **步骤 7：运行测试并提交**

运行：

```bash
npm test
```

预期：渲染器和外壳组合测试全部通过。

提交：

```bash
git add src/templates tests/render.test.mjs
git commit -m "feat: add reusable site shell templates"
```

### 任务 3：建立产品系列页面模板

**文件：**
- 修改：`src/templates/pages/product-family-detail.njk`
- 新建：`tests/template-contract.test.mjs`

- [ ] **步骤 1：编写失败的模板契约测试**

新建 `tests/template-contract.test.mjs`：

```js
import assert from "node:assert/strict";
import test from "node:test";
import { renderTemplate } from "../scripts/render.mjs";

const html = renderTemplate("pages/product-family-detail.njk");

test("marks the page and editable product sections", () => {
  assert.match(html, /data-page-template="product-family-detail@1"/);
  assert.match(html, /data-system="breadcrumb"/);
  assert.match(html, /data-section="product-hero"/);
  assert.match(html, /data-section="overview"/);
  assert.match(html, /data-section="advantages"/);
  assert.match(html, /data-section="components"/);
  assert.match(html, /data-section="production-process"/);
  assert.match(html, /data-section="cases"/);
});

test("reserves API-driven areas", () => {
  assert.match(html, /data-dynamic="inquiry-form"/);
  assert.match(html, /data-dynamic="related-products"/);
});

test("contains no executable inline content", () => {
  assert.doesNotMatch(html, /<script(?![^>]*src=)/i);
  assert.doesNotMatch(html, /\son[a-z]+=/i);
  assert.doesNotMatch(html, /javascript:/i);
});
```

- [ ] **步骤 2：运行测试并确认失败**

运行：

```bash
node --test tests/template-contract.test.mjs
```

预期：测试失败，因为产品页模板尚未包含必需区域。

- [ ] **步骤 3：创建完整产品页面主体**

修改 `src/templates/pages/product-family-detail.njk`。它必须继承 `layouts/base.njk`，并按以下顺序包含内容：

```njk
{% extends "layouts/base.njk" %}
{% block content %}
<main class="product-page" data-page-template="product-family-detail@1">
  <div class="container">
    <nav class="breadcrumb" data-system="breadcrumb" aria-label="面包屑">
      <a href="/zh/">首页</a><span aria-hidden="true">›</span><a href="/zh/gantry-cranes/">龙门起重机</a><span aria-hidden="true">›</span><span>单梁门式起重机</span>
    </nav>
    <section class="product-hero" data-section="product-hero">
      <div class="product-hero__content">
        <h1 data-field="title">单梁门式起重机</h1>
        <div data-field="summary"><p>龙门吊不受车间钢结构限制，结构简单、安装方便，适用于多种工作条件。</p><p>强度高、刚性好、稳定性高，是具有成本效益的起重机解决方案。</p></div>
        <ul class="product-specs" data-field="specifications"><li>容量：1吨–32吨</li><li>跨度：4–35米</li><li>提升高度：6米、9米、12米</li><li>工作级别：A3、A4、A5</li></ul>
        <p class="product-price" data-field="price">参考价格：$6,000–30,000/套</p>
        <a class="button" data-field="primary-cta" href="#inquiry">获取报价</a>
      </div>
      <figure class="product-hero__gallery" data-field="gallery"><img src="/assets/product-hero.jpg" alt="单梁门式起重机"><figcaption>单梁门式起重机</figcaption></figure>
    </section>
    <article class="product-content">
      <section class="content-section prose" data-section="overview" data-optional><h2 data-field="heading">概述</h2><div data-field="content"><p>单梁门式起重机使用电动葫芦作为起升机构，可用于码头、货场、仓库和建筑工地。</p></div></section>
      <section class="content-section" data-section="advantages" data-optional><h2 data-field="heading">优势</h2><ul class="feature-grid" data-field="items"><li>结构简单紧凑</li><li>安全可靠</li><li>性能稳定</li><li>易于运输安装</li><li>维护方便</li><li>成本合理</li></ul></section>
      <section class="content-section" data-section="components" data-optional><h2 data-field="heading">组成部分</h2><div class="component-list" data-field="items"><article class="component-item"><img src="/assets/product-hero.jpg" alt="起重机主梁"><div><h3>主梁</h3><p>主梁是起重机的主要承重部件，也是电动葫芦的运行轨道。</p></div></article><article class="component-item"><div><h3>支腿与地梁</h3><p>支腿和地梁形成稳定门架，并承载起重机运行机构。</p></div></article></div></section>
      <section class="content-section" data-section="production-process" data-optional><h2 data-field="heading">生产流程</h2><ol class="process-grid" data-field="steps"><li><span>01</span>来料抽检</li><li><span>02</span>钢板切割</li><li><span>03</span>主梁制造</li><li><span>04</span>支腿制造</li><li><span>05</span>起重机预装</li><li><span>06</span>电气装配</li><li><span>07</span>油漆</li><li><span>08</span>包装储存</li></ol></section>
      <section class="content-section" data-section="cases" data-optional><h2 data-field="heading">项目案例</h2><div class="case-grid" data-field="items"><article><h3>秘鲁单梁龙门起重机项目</h3><p>5吨和10吨单梁龙门起重机交付案例。</p></article><article><h3>卡塔尔交付项目</h3><p>16吨单梁龙门起重机交付案例。</p></article></div></section>
    </article>
  </div>
  <section id="inquiry" class="dynamic-section" data-dynamic="inquiry-form"><div class="container"><h2>填写您的详细资料，我们将在24小时内回复</h2><p data-dynamic-fallback>询价表单将在 API 接入后加载。</p></div></section>
  <section class="dynamic-section" data-dynamic="related-products" data-category="gantry-cranes" data-limit="4"><div class="container"><h2>相关产品</h2><p data-dynamic-fallback>相关产品将在 API 接入后加载。</p></div></section>
</main>
{% endblock %}
```

- [ ] **步骤 4：运行全部结构测试并提交**

运行：

```bash
npm test
```

预期：全部测试通过。

提交：

```bash
git add src/templates/pages tests
git commit -m "feat: add product family page template"
```

### 任务 4：添加本地资源和响应式样式

**文件：**
- 新建：`public/assets/logo.svg`
- 新建：`public/assets/product-hero.jpg`
- 新建：`src/styles/site.css`
- 新建：`src/scripts/site.js`

- [ ] **步骤 1：下载已确认的公司官网资源**

运行：

```bash
mkdir -p public/assets
curl -L 'https://www.dgcrane.com/wp-content/themes/website/svg/logo.svg' -o public/assets/logo.svg
curl -L 'https://www.dgcrane.com/wp-content/uploads/Single-girder-gantry-crane-4.jpg?w=1740&h=1160' -o public/assets/product-hero.jpg
file public/assets/logo.svg public/assets/product-hero.jpg
```

预期：`logo.svg` 为 SVG 文件，`product-hero.jpg` 为 JPEG 图片。

- [ ] **步骤 2：创建响应式样式表**

新建 `src/styles/site.css`，包含设计变量、共用外壳样式、产品首屏网格、长内容间距、卡片网格、动态区域样式和响应式断点。必须满足以下布局契约：

```css
:root { --container: 1200px; --brand: #d71920; --ink: #1f252b; --muted: #66717c; --line: #e2e6e9; --surface: #f4f6f7; --section: 80px; }
* { box-sizing: border-box; }
body { margin: 0; color: var(--ink); font: 16px/1.7 Arial, "Microsoft YaHei", sans-serif; }
img { display: block; max-width: 100%; }
a { color: inherit; text-decoration: none; }
.container { width: min(calc(100% - 40px), var(--container)); margin-inline: auto; }
.topbar { background: #20252a; color: #fff; font-size: 13px; }
.topbar__inner, .masthead, .newsletter__inner, .footer-legal { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.topbar nav, .primary-nav { display: flex; gap: 24px; }
.masthead { min-height: 92px; }
.brand img { width: 180px; }
.nav-toggle { display: none; }
.trust-banner { color: #fff; background: #2b3137; }
.trust-banner__inner { display: grid; grid-template-columns: 1fr 2fr; gap: 48px; padding-block: 32px; }
.trust-banner ul { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 24px; margin: 0; }
.breadcrumb { display: flex; flex-wrap: wrap; gap: 10px; padding-block: 28px; color: var(--muted); }
.product-hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(420px, .9fr); gap: 56px; align-items: center; padding-block: 20px 80px; }
.product-hero h1 { margin: 0 0 24px; font-size: clamp(38px, 5vw, 64px); line-height: 1.1; }
.product-specs { display: grid; gap: 8px; padding: 0; list-style: none; }
.product-price { color: var(--brand); font-size: 20px; font-weight: 700; }
.button { display: inline-flex; padding: 14px 24px; color: #fff; background: var(--brand); }
.product-hero__gallery { margin: 0; }
.product-content { display: grid; gap: var(--section); padding-bottom: var(--section); }
.content-section h2, .dynamic-section h2 { font-size: clamp(28px, 3vw, 42px); line-height: 1.2; }
.feature-grid, .process-grid, .case-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; padding: 0; list-style: none; }
.feature-grid li, .process-grid li, .case-grid article { padding: 24px; background: var(--surface); }
.component-list { display: grid; gap: 48px; }
.component-item { display: grid; grid-template-columns: minmax(280px, .8fr) 1fr; gap: 40px; align-items: center; }
.dynamic-section { padding-block: var(--section); background: var(--surface); }
.newsletter { padding-block: 40px; color: #fff; background: var(--brand); }
.site-footer { color: #fff; background: #20252a; }
.footer-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 40px; padding-block: 64px; }
.footer-grid section { display: grid; align-content: start; gap: 10px; }
.footer-legal { padding-block: 20px; border-top: 1px solid #394149; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
@media (max-width: 900px) { .nav-toggle { display: block; } .primary-nav { display: none; } .primary-nav[data-open] { display: grid; position: absolute; inset: 92px 20px auto; padding: 24px; background: #fff; box-shadow: 0 18px 60px #0003; } .trust-banner__inner, .product-hero, .component-item { grid-template-columns: 1fr; } .feature-grid, .process-grid, .case-grid, .footer-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px) { .container { width: min(calc(100% - 28px), var(--container)); } .topbar nav { display: none; } .trust-banner ul, .feature-grid, .process-grid, .case-grid, .footer-grid { grid-template-columns: 1fr; } .product-hero { gap: 32px; padding-bottom: 56px; } }
```

- [ ] **步骤 3：添加最小移动端导航行为**

新建 `src/scripts/site.js`：

```js
const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector("#primary-nav");

toggle?.addEventListener("click", () => {
  const open = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", String(!open));
  nav?.toggleAttribute("data-open", !open);
});
```

- [ ] **步骤 4：构建并验证输出文件**

运行：

```bash
npm run build
test -f dist/zh/products/single-girder-gantry-cranes/index.html
test -f dist/assets/site.css
test -f dist/assets/site.js
test -f dist/assets/logo.svg
test -f dist/assets/product-hero.jpg
```

预期：所有命令均以状态码 0 结束。

- [ ] **步骤 5：提交样式和资源**

```bash
git add public src/styles src/scripts
git commit -m "feat: style responsive product template"
```

### 任务 5：在应用内浏览器验证原型

**文件：**
- 新建：`README.md`

- [ ] **步骤 1：启动本地预览服务器**

运行：

```bash
npm run build
npm run preview
```

预期：服务器监听 `http://localhost:4173`。

- [ ] **步骤 2：打开生成的产品页面**

打开：

```text
http://localhost:4173/zh/products/single-girder-gantry-cranes/
```

在桌面端宽度下验证：

- Header 和 Footer 各出现一次。
- 信任横幅位于 Header 与面包屑之间。
- 产品首屏左侧为内容，右侧为产品图片。
- 概述、优势、组成部分、生产流程和案例按顺序出现。
- 询价表单和相关产品 API 占位可见。
- 页面没有横向溢出。

- [ ] **步骤 3：验证响应式行为**

在 390×844 尺寸下检查：

- 移动导航默认收起，并且能够正常打开。
- 产品首屏变为单列。
- 产品卡片和 Footer 栏目变为单列。
- 文字和图片均保持在视口内。

- [ ] **步骤 4：与来源页面对比**

把本地页面与以下页面比较：

```text
https://www.dgcrane.com/zh/products/single-girder-gantry-cranes/
```

原型必须保留来源页面的信息层级和品牌识别。第一轮不要求像素级完全一致，但模板必须忠实保留结构、支持响应式，并且不依赖 WordPress 运行时。

- [ ] **步骤 5：记录命令和模板边界**

新建 `README.md`：

```markdown
# DGCRANE 模板原型

## 命令

- `npm install` 安装依赖。
- `npm test` 验证模板组合和标记。
- `npm run build` 把静态网站渲染到 `dist/`。
- `npm run preview` 在 4173 端口提供 `dist/` 预览。

## 模板边界

- `header.njk` 和 `footer.njk` 可供所有页面类型复用。
- `trust-banner.njk` 可供所有内页复用。
- `product-family-detail.njk` 是第一份完整的中间页面模板。
- `data-field` 标记可编辑内容，但不要求 Markdown 使用固定字段结构。
- `data-dynamic` 预留以后调用 API 的模块。
- 当前原型不包含 CMS、AI、数据库、S3 或真实动态 API。
```

- [ ] **步骤 6：运行最终验证并提交**

运行：

```bash
npm test
npm run build
git status --short
```

预期：测试和构建通过；提交前只剩预期的 README 或 lockfile 变更。

提交：

```bash
git add README.md package-lock.json
git commit -m "docs: document product template prototype"
```
