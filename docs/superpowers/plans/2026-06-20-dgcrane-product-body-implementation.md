# DGCRANE 产品页主体 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 忠实还原单梁门式起重机页面从面包屑到询价表单结束的完整静态 HTML，并建立可结构化填充的产品模板。

**Architecture:** 产品主体、询价表单与现有站点外壳分别保存为 HTML；`scripts/build.mjs` 在构建时合成完整页面。第一阶段先还原官网结构和视觉，第二阶段只增加结构化属性，不改变视觉与交互。

**Tech Stack:** HTML5、CSS、原生 JavaScript、Node.js 构建脚本、Node Test Runner

---

### Task 1: 建立产品页面组合契约

**Files:**
- Modify: `tests/build.test.mjs`
- Modify: `scripts/build.mjs`
- Create: `src/pages/single-girder-gantry-cranes.html`
- Create: `src/fragments/inquiry-form.html`

- [ ] **Step 1: 编写失败测试**

验证构建产物存在、页面片段按顺序出现、询价表单只出现一次且相关产品不存在。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test`
Expected: FAIL，因为产品页构建产物尚不存在。

- [ ] **Step 3: 添加最小组合实现**

让 `scripts/build.mjs` 读取产品主体与询价表单，并生成 `dist/zh/products/single-girder-gantry-cranes/index.html`。

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test`
Expected: PASS。

### Task 2: 忠实还原产品主体

**Files:**
- Modify: `src/pages/single-girder-gantry-cranes.html`
- Modify: `src/styles/site.css`
- Create: `public/assets/site/products/single-girder-gantry-cranes/*`
- Create: `tests/product-page.test.mjs`

- [ ] **Step 1: 编写页面区域与图库契约测试**

验证面包屑、首屏、`ltgallery`、概述、优势、组成部分、生产流程、安装服务和项目案例均存在；大图与缩略图数量一致。

- [ ] **Step 2: 运行定向测试并确认失败**

Run: `node --test tests/product-page.test.mjs`
Expected: FAIL，因为完整主体尚未实现。

- [ ] **Step 3: 获取并保存官网图片资源**

使用浏览器已加载资源或官网公开资源保存至本地产品资源目录，并验证文件类型。

- [ ] **Step 4: 实现原始 HTML 与响应式样式**

按官网顺序和视觉层级实现主体；保留 `ltgallery`、Swiper 大图和缩略图结构，不依赖 WordPress 脚本。

- [ ] **Step 5: 运行测试并确认通过**

Run: `npm test && npm run build`
Expected: 全部通过。

### Task 3: 实现共享询价表单

**Files:**
- Modify: `src/fragments/inquiry-form.html`
- Modify: `src/styles/site.css`
- Modify: `tests/product-page.test.mjs`

- [ ] **Step 1: 编写表单字段契约测试**

验证姓名、邮箱、电话、留言、文件上传和发送按钮存在，且表单没有真实提交地址。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/product-page.test.mjs`
Expected: FAIL，因为表单字段尚不完整。

- [ ] **Step 3: 还原表单外观与字段**

实现独立 HTML 片段；提交按钮仅作静态演示，不发送数据。

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test`
Expected: PASS。

### Task 4: 添加结构化模板标记

**Files:**
- Modify: `src/pages/single-girder-gantry-cranes.html`
- Modify: `src/fragments/inquiry-form.html`
- Create: `tests/template-contract.test.mjs`

- [ ] **Step 1: 编写结构化标记契约测试**

验证 `data-section`、`data-field`、`data-item` 和 `data-optional` 的必要位置；验证图库结构未被标记改造破坏。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/template-contract.test.mjs`
Expected: FAIL，因为模板尚无完整结构化标记。

- [ ] **Step 3: 添加结构化属性**

只添加属性，不改变已经确认的 HTML 层级、类名、样式和内容。

- [ ] **Step 4: 运行全部测试**

Run: `npm test && npm run build`
Expected: 全部通过。

### Task 5: 浏览器视觉验证

**Files:**
- Modify: `src/styles/site.css`（仅在发现视觉差异时）

- [ ] **Step 1: 启动本地预览**

Run: `npm run preview`
Expected: `http://127.0.0.1:4173/zh/products/single-girder-gantry-cranes/` 可访问。

- [ ] **Step 2: 对照官网验证桌面端**

检查区域顺序、首屏双栏、图库、长内容、案例和询价表单；确认无相关产品。

- [ ] **Step 3: 验证 390px 移动端**

检查单列布局、图片、表单和无横向溢出。

- [ ] **Step 4: 最终验证**

Run: `npm test && npm run build && git status --short`
Expected: 测试和构建通过，只包含预期修改。

