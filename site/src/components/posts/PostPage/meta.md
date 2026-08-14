# PostPage 套件 meta.json — 字段语义注释

> JSON 不能带注释，本文件是套件 `meta.json`（components/posts/PostPage/）的知识存档。
> 字段清单（key/shape/level）的唯一真相是旁边的 `meta.json`；本文件只记**为什么**这么标注。
>
> shape 取值沿用产品套件词汇 + 本套件新增：`sections` = **重复章节序列**（任意 N 段，
> 每段 `{heading, body_md}`，AI 按原文顺序输出；区别于产品侧固定槽的 `section`）。
> level 取值：`verbatim`=逐字（规范化后子串硬查）｜ `similar`=相似/包含 ｜ `summary`=概括豁免。

## 字段表（3 项）

| key | shape | level | 说明 |
|---|---|---|---|
| `title` | `text` | `similar` | 文章标题（h1），允许等于原料首行标题或文章题，逐字过狠会误伤 |
| `body.sections` | `sections` | `verbatim` | **核心**：N 段顺序章节。每项 body_md 树逐字级、heading 与原文行相似级 |
| `page.description` | `seo` | `summary` | 概括豁免：SEO 描述不强求逐字；报告中标出该字段为豁免 |

## sections 形态的验收规则（verifyByShape）

1. 每项正文树逐字溯源（`verifyTree`，与产品 section 同口径）；
2. 每项 heading 与原文行相似（`similarToAny` 0.85，标题允许轻微规范）；
3. **段间重叠闸**：同一 sections 里两两比较，共享块 / 最大块数 > 0.5 拒收
   （产品侧该闸在跨字段层 `findDuplicates`；文章只有一个内容字段，闸收进字段内）。

## 配图（v1 顺序分配）

图池（`（配图：xxx.jpg）` 标记 / URL 抓取的图名）按顺序配到第 i 段，余图挂末段；
报告注明。缺 `width/height` 按 known-leftover 惯例给默认 880×495 占位，不破几何。

## 设计依据（为什么不是「旧 4 篇补 meta」）

旧 4 篇是 T2 拍定的「一篇一模版」：槽位（`body.h_price`、`card1_img`…）是**那篇文章
专属**的语义名，对别的文章无意义，拿去烧新文章必然乱装格。烧新文章需要的是
「N 段顺序章节」这一公共形态——即本套件。旧 4 篇继续走扁平组件（路由按 slug 回退派发）。

*本文件建于 spec B（文章族烧制上线）Task 1。*
