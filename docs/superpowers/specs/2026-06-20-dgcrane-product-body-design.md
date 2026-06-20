# DGCRANE 产品页主体模板设计

## 目标

还原 DGCRANE 中文站“单梁门式起重机”页面从面包屑到询价表单结束的 HTML、视觉布局与关键交互，作为第一份产品页主体模板。

## 实施顺序

1. 先忠实还原官网原始页面，不在还原过程中抽象可复用产品组件。
2. 在浏览器中确认桌面端和移动端的布局、图库和表单外观。
3. 在不改变外观的前提下加入结构化标记。
4. 验证内容增减后模板结构仍然成立。

## 页面边界

页面按以下顺序组合：

1. 现有 Header 共享片段。
2. 产品主体：面包屑、产品首屏、概述、优势、组成部分、生产流程、安装服务、项目案例。
3. Inquiry Form 共享片段。
4. 现有 Footer 共享片段。

“相关产品”不在本次范围内。

## 文件边界

- `src/pages/single-girder-gantry-cranes.html`：完整产品主体，不包含 Header、询价表单和 Footer。
- `src/fragments/inquiry-form.html`：共享询价表单。
- `src/fragments/header.html`、`src/fragments/footer.html`：继续使用现有实现。
- `scripts/build.mjs`：本地构建时把四部分合成为完整静态 HTML。

未来可由 Lambda@Edge 注入 Header、Inquiry Form 和 Footer；本地构建仍提供完整静态 HTML 作为预览和发布兜底。

## 结构化规则

- `data-section` 标识稳定内容区域。
- `data-field` 标识 AI 可填充的内容位置。
- `data-item` 标识数量可变的重复项。
- `data-optional` 标识没有对应内容时可整体删除的区域。
- 模板负责固定类名、层级、布局和交互契约；AI 负责识别内容、增减重复项和填充字段。

图库使用官网的 `ltgallery` 外壳以及 Swiper 的大图、缩略图结构。图片可多可少；AI 只能增减对应的 `swiper-slide`，不能破坏 Swiper 层级。

## 验收条件

- 页面从面包屑到询价表单结束，且不出现相关产品。
- Header、Inquiry Form、Footer 在最终 HTML 中各出现一次。
- 产品图片图库保留大图与缩略图的一一对应结构。
- 桌面端和 390px 移动端无横向溢出。
- 表单只还原字段和外观，不连接真实提交 API。
- 所有图片等资源均使用本地文件，不依赖 WordPress 运行时。

