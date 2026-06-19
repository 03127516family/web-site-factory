# DGCRANE Header/Footer 高保真实施计划

**目标：** 忠实还原中文官网公共 Header 与 Footer，形成可供 iframe 临时预览、并可由发布时 Lambda/Worker 扁平化组合的纯 HTML 片段。

**边界：** Header 从页面顶部开始，包含导航与蓝色品牌信任横幅，在面包屑之前结束；Footer 从订阅区开始，包含产品链接、联系信息、语言、版权与社交入口。

**技术栈：** Node.js 20+、原生 `node:test`、HTML5、CSS、原生 JavaScript。

## 任务

- [x] 采集官网桌面端和移动端 Header/Footer 的结构、尺寸、样式、交互和公开资源。
- [x] 先编写失败测试，约束片段唯一性、Header 边界、Footer 内容、资源本地化与完整 HTML 组合。
- [x] 实现 `src/fragments/header.html`、`src/fragments/footer.html`、公共 CSS 与导航交互。
- [x] 实现构建脚本，生成 iframe 预览和扁平化完整 HTML 预览。
- [x] 在相同视口下对比官网与本地预览，校准桌面端和移动端视觉。
- [x] 运行测试、构建和浏览器验证后提交。

## 产物

```text
package.json
scripts/build.mjs
src/fragments/header.html
src/fragments/footer.html
src/layouts/document.html
src/styles/site.css
src/scripts/site.js
public/assets/site/*
tests/build.test.mjs
dist/shell-iframe-preview.html
dist/shell-composed-preview.html
dist/fragments/header.html
dist/fragments/footer.html
```

`dist/` 不提交。iframe 预览只是开发替身；SEO、DOM 与最终响应式验收使用 `shell-composed-preview.html`。
