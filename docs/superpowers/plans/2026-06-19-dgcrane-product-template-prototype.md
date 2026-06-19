# DGCRANE Product Template Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a faithful static prototype of the DGCRANE Chinese product-family page with reusable Header and Footer partials, one complete product page template, responsive styling, and reserved AI/editor/dynamic-module markers.

**Architecture:** Use Nunjucks only for site-shell composition: a base layout includes reusable Header and Footer partials, while the product page body remains complete HTML rather than a field-driven data form. A small Node build script renders the template into `dist/`; template markers identify page sections and editable fields, while form and related-products areas are reserved as API-driven modules.

**Tech Stack:** Node.js 20+, Nunjucks, native `node:test`, HTML5, CSS, minimal browser JavaScript

---

## Scope

This plan implements only the first template prototype:

- Reusable Chinese site Header
- Reusable Chinese site Footer
- Shared inner-page trust banner
- Breadcrumb system placeholder
- `product-family-detail@1` page template based on the current single-girder gantry crane page
- Responsive desktop/mobile CSS
- Inquiry-form and related-products dynamic placeholders
- Build and structural tests
- Browser visual verification against `https://www.dgcrane.com/zh/products/single-girder-gantry-cranes/`

It does not implement the CMS, AI generation API, PostgreSQL, S3 publishing, real forms, product APIs, or template management UI.

## File Structure

```text
package.json                              Node scripts and dependency declaration
scripts/render.mjs                        Nunjucks environment and reusable render function
scripts/build.mjs                         Production build entry point
src/templates/layouts/base.njk            Shared HTML document shell
src/templates/partials/header.njk         Reusable site header
src/templates/partials/footer.njk         Reusable site footer
src/templates/partials/trust-banner.njk   Reusable inner-page trust banner
src/templates/pages/product-family-detail.njk
                                          Complete product-family page body
src/styles/site.css                       Shared and product-page responsive styles
src/scripts/site.js                       Mobile navigation and dynamic-module fallback
public/assets/logo.svg                    Local copy of company logo
public/assets/product-hero.jpg            Representative product image
tests/render.test.mjs                     Build and shell composition tests
tests/template-contract.test.mjs          Required marker and security tests
README.md                                 Local build and preview instructions
dist/                                     Generated output, ignored by git
```

### Task 1: Scaffold the Static Template Builder

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `scripts/render.mjs`
- Create: `scripts/build.mjs`
- Create: `tests/render.test.mjs`

- [ ] **Step 1: Write the failing render test**

Create `tests/render.test.mjs`:

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

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test tests/render.test.mjs
```

Expected: FAIL because `scripts/render.mjs` does not exist.

- [ ] **Step 3: Add package and ignore configuration**

Create `package.json`:

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

Create `.gitignore`:

```gitignore
node_modules/
dist/
.DS_Store
```

Run:

```bash
npm install
```

Expected: `node_modules` and `package-lock.json` are created.

- [ ] **Step 4: Implement the reusable renderer and build command**

Create `scripts/render.mjs`:

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

Create `scripts/build.mjs`:

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

- [ ] **Step 5: Commit the scaffold**

```bash
git add package.json package-lock.json .gitignore scripts tests/render.test.mjs
git commit -m "build: scaffold static template renderer"
```

### Task 2: Build the Reusable Site Shell

**Files:**
- Create: `src/templates/layouts/base.njk`
- Create: `src/templates/partials/header.njk`
- Create: `src/templates/partials/footer.njk`
- Create: `src/templates/partials/trust-banner.njk`
- Create: `src/templates/pages/product-family-detail.njk`
- Modify: `tests/render.test.mjs`

- [ ] **Step 1: Extend the failing test for shell uniqueness**

Change the renderer import in `tests/render.test.mjs` to:

```js
import { renderSource, renderTemplate } from "../scripts/render.mjs";
```

Then append:

```js
test("includes each reusable shell partial exactly once", () => {
  const html = renderTemplate("pages/product-family-detail.njk");

  assert.match(html, /data-page-template="product-family-detail@1"/);
  assert.equal((html.match(/data-site-header/g) ?? []).length, 1);
  assert.equal((html.match(/data-trust-banner/g) ?? []).length, 1);
  assert.equal((html.match(/data-site-footer/g) ?? []).length, 1);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --test tests/render.test.mjs
```

Expected: FAIL because the product page template does not exist.

- [ ] **Step 3: Create the base layout**

Create `src/templates/layouts/base.njk`:

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

- [ ] **Step 4: Create the reusable Header**

Create `src/templates/partials/header.njk` with these stable regions:

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

- [ ] **Step 5: Create the trust banner and Footer**

Create `src/templates/partials/trust-banner.njk`:

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

Create `src/templates/partials/footer.njk`:

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

- [ ] **Step 6: Create the minimum product-page shell**

Create `src/templates/pages/product-family-detail.njk`:

```njk
{% extends "layouts/base.njk" %}
{% block content %}
<main data-page-template="product-family-detail@1"></main>
{% endblock %}
```

- [ ] **Step 7: Run tests and commit**

Run:

```bash
npm test
```

Expected: PASS for the renderer and shell-composition tests.

Commit:

```bash
git add src/templates tests/render.test.mjs
git commit -m "feat: add reusable site shell templates"
```

### Task 3: Build the Product-Family Page Template

**Files:**
- Modify: `src/templates/pages/product-family-detail.njk`
- Create: `tests/template-contract.test.mjs`

- [ ] **Step 1: Write the failing template-contract tests**

Create `tests/template-contract.test.mjs`:

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

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/template-contract.test.mjs
```

Expected: FAIL because the product page template does not exist.

- [ ] **Step 3: Create the complete product page body**

Create `src/templates/pages/product-family-detail.njk`. It must extend `layouts/base.njk` and contain, in this order:

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

- [ ] **Step 4: Run all structural tests and commit**

Run:

```bash
npm test
```

Expected: PASS for all tests.

Commit:

```bash
git add src/templates/pages tests
git commit -m "feat: add product family page template"
```

### Task 4: Add Local Assets and Responsive Styles

**Files:**
- Create: `public/assets/logo.svg`
- Create: `public/assets/product-hero.jpg`
- Create: `src/styles/site.css`
- Create: `src/scripts/site.js`

- [ ] **Step 1: Download approved company-site assets**

Run:

```bash
mkdir -p public/assets
curl -L 'https://www.dgcrane.com/wp-content/themes/website/svg/logo.svg' -o public/assets/logo.svg
curl -L 'https://www.dgcrane.com/wp-content/uploads/Single-girder-gantry-crane-4.jpg?w=1740&h=1160' -o public/assets/product-hero.jpg
file public/assets/logo.svg public/assets/product-hero.jpg
```

Expected: `logo.svg` is SVG and `product-hero.jpg` is JPEG image data.

- [ ] **Step 2: Create the responsive stylesheet**

Create `src/styles/site.css` with design tokens, shared shell styles, product hero grid, long-form content spacing, card grids, dynamic-section styling, and responsive breakpoints. The required layout contract is:

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

- [ ] **Step 3: Add minimal mobile navigation behavior**

Create `src/scripts/site.js`:

```js
const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector("#primary-nav");

toggle?.addEventListener("click", () => {
  const open = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", String(!open));
  nav?.toggleAttribute("data-open", !open);
});
```

- [ ] **Step 4: Build and verify output files**

Run:

```bash
npm run build
test -f dist/zh/products/single-girder-gantry-cranes/index.html
test -f dist/assets/site.css
test -f dist/assets/site.js
test -f dist/assets/logo.svg
test -f dist/assets/product-hero.jpg
```

Expected: all commands exit with code 0.

- [ ] **Step 5: Commit styles and assets**

```bash
git add public src/styles src/scripts
git commit -m "feat: style responsive product template"
```

### Task 5: Verify the Prototype in the In-App Browser

**Files:**
- Create: `README.md`

- [ ] **Step 1: Start the local preview server**

Run:

```bash
npm run build
npm run preview
```

Expected: the server listens at `http://localhost:4173`.

- [ ] **Step 2: Open the generated product page**

Open:

```text
http://localhost:4173/zh/products/single-girder-gantry-cranes/
```

Verify at desktop width:

- Header and Footer appear once.
- Trust banner appears between Header and breadcrumb.
- Hero has content on the left and product image on the right.
- Overview, advantages, components, process and cases follow in order.
- Inquiry and related-products API placeholders are visible.
- No horizontal overflow occurs.

- [ ] **Step 3: Verify responsive behavior**

Check at 390×844 and verify:

- Mobile navigation is collapsed and opens once.
- Hero becomes one column.
- Product cards and Footer columns become one column.
- Text and images remain within the viewport.

- [ ] **Step 4: Compare against the source page**

Compare the local page with:

```text
https://www.dgcrane.com/zh/products/single-girder-gantry-cranes/
```

The prototype must preserve the source page's information hierarchy and brand identity. Exact pixel parity is not required in this first pass; the template must be structurally faithful, responsive, and free of WordPress runtime dependencies.

- [ ] **Step 5: Document commands and boundaries**

Create `README.md`:

```markdown
# DGCRANE Template Prototype

## Commands

- `npm install` installs dependencies.
- `npm test` validates template composition and markers.
- `npm run build` renders the static site into `dist/`.
- `npm run preview` serves `dist/` on port 4173.

## Template Boundaries

- `header.njk` and `footer.njk` are reusable across every page type.
- `trust-banner.njk` is reusable across inner pages.
- `product-family-detail.njk` is the first complete middle-page template.
- `data-field` marks editable content without requiring Markdown to use a fixed schema.
- `data-dynamic` reserves modules that will later call APIs.
- The current prototype does not include CMS, AI, database, S3, or real dynamic APIs.
```

- [ ] **Step 6: Run final verification and commit**

Run:

```bash
npm test
npm run build
git status --short
```

Expected: tests and build pass; only intended README or generated lockfile changes remain before commit.

Commit:

```bash
git add README.md package-lock.json
git commit -m "docs: document product template prototype"
```
