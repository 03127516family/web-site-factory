# 05 · 工作流程 SOP

> 8 个标准操作流程。每个 SOP 给：触发、输入、步骤、产出、验证、常见错误。
> 角色约定：**用户** = 给料/拍板/验收的人；**agent** = AI（Claude Code 会话）；**运营** = 未来只做 L1 值编辑的人（现在也是用户本人）。

---

## 角色卡

| 角色 | 只需要会 | 不需要懂 |
|---|---|---|
| 用户 | 说三件事（文章、名字、slug）、看预览说行不行、答决策包问题 | MD 格式、字段名、模版、命令行细节 |
| agent | 本蓝图 + CLAUDE.md 全部 | —— |
| 运营 | SOP-4（编辑器点改）+ SOP-7（发布） | 其余全部 |

---

## SOP-0 环境准备（一次性）

1. Node.js ≥ 20（`verify:geom` 用 `--experimental-websocket`）；`npm i`。
2. 本机有 Chrome/Chromium 供 CDP（端口 **9456**；系统 Chrome/Edge 占着 9222，**勿动勿杀**）。
3. 确认 git 远端存在且能推（P0；若无先建）。
4. VSCode 用户确认 `.vscode` 里 markdown formatOnSave 关闭（防 `<!--block:KEY-->` 被格式化改写；真正的防线是 validateBlocks，这只是减噪）。

## SOP-1 新增产品页（标准超集页族）

**触发**：要加一个产品。 **输入**：用户三件事——①文章（路径或直接贴）②产品名 ③slug。

> 用户话术示例：「把 `src/content/raw/<slug>.txt` 做成产品页。产品名：XXX，slug：xxx。」

**步骤（agent 全权）**：
1. 落原料：裸文章存 `src/content/raw/<slug>.txt`（用户贴文即代劳）。
2. 烧 MD：判断每段归属（概述/简介/规格/组件/FAQ…），映射为超集字段；写 `src/content/<slug>.md`。取舍原则：内容没有的段不硬造（`data-optional` 会裁掉）；表格转管道表；图先记文件名（缺图走 known-leftover）。
3. 素材过闸门入库（SOP-6）。
4. 登记 `build.mjs::pages[]`：`{slug: "products/<slug>", template: 超集, type: "product", mode: "render"}`。
5. `npm run build` → 6. `npm run verify:geom`（基准=族内参照页，baseline 跨模版）→ 修到几何一致。
7. `npm run serve`（:8080）给用户预览链接。
8. **核对入口**：新页是否需要挂进导航菜单（现阶段=改 header fragment，见 04 章台账#7）、是否该出现在相关页的 `related_products` 里——没有入口的页面是"孤岛"。
**产出**：MD + dist 页面。 **验证**：validateBlocks 过、geom 1:1、用户点头。
**常见错误**：段落归错块（对照活样例 `single-girder-eot-cranes.md`）；富文本塞进 `<p>` 槽（禁）；忘登记 pages[]（build 不含该页）。

## SOP-2 新增文章/案例页（post 骨架页族）

**触发**：要发一篇文章/案例。 **输入**：同 SOP-1 三件事（原料放 `src/content/raw/posts/`）。

**步骤（agent）**：
1. 烧 MD：长文段→`## 块`；标题/图→frontmatter `body.*`。
2. **烧骨架**：`src/templates/posts/<slug>.html`——逐段决定版式（`fig-full`/`fig-2col`/`fig-grid`），挂 marker 槽；chrome 从现成 post 产物页逐字复制。
3. 登记 pages[]（`type:"post"`，template 指向自己的骨架）→ build → geom（基准=族内参照 post）→ 预览。
**选路规则**：一律 A 路（骨架进 templates、引擎渲染）。**禁走 B 路**（AI 直写 dist）——B 路已封存，若确实骨架表达不了（极罕见的一次性特殊视觉），先来找用户特批。
**常见错误**：骨架里文字写死没挂槽（改字就得重烧——凡是"值"必须进 MD）；图槽没带宽高（缺图破几何）。

## SOP-3 新页族（第一次遇到新类型页面，如 category、首页、联系页）

**触发**：页面结构不属于任何现有页族。
**步骤（agent）**：严格走 [04 章 §4 七步法](04-内容模型与模版契约.md)（权威=CLAUDE.md §9）：切块→判形→命名→抽模子→复 chrome→守硬约束→验。**先按规则、再动手**，交付时附七步自检对照表。
**铁律**：新页族 = 新模版一份，**引擎零改动**。若发现"不改引擎做不了"，先停下——要么是模版没造对，要么是发现了 marker 词汇表的真缺口（后者进决策日志再动引擎，动完全族回归）。

## SOP-4 日常改值（运营手册——"可见即可编辑"的全部）

**触发**：改错字、换图、改链接、增删一条重复项（如加一个 FAQ）。
**步骤**：
1. `npm run edit` → 打开 `localhost:8081/<slug 路径>`。
2. 鼠标悬停出现可编辑高亮；点击即改：
   - 文字/富文本：就地编辑，支持段落、加粗、列表、表格；
   - 图片：改文件名/替换（新图先按 SOP-6 入库）；
   - 链接：改地址与文字；
   - 重复区：单元上的增删控件复制/删除一项（带 `data-no-add` 的区域不可增删）。
3. 保存 → 系统定点写回 `src/content/<slug>.md`（frontmatter 或对应正文块）。
4. 出货：`npm run build`（发布线建成后再 `npm run deploy`）。
**边界（重要）**：改不了的东西是故意的——版式、段落顺序、新增段落类型属于 L2/L3，走 SOP-5/SOP-9-结构，别硬来。
**验证**：改完刷新预览即所见；怀疑写坏 MD 时跑 `npm run check`。

## SOP-5 改结构（L2：段落有无/顺序、字段增减）

**触发**：某页要多一段/少一段/换顺序；某重复区加减字段。
**步骤**（懂 MD 的人或 agent）：
1. 直接编辑 `src/content/<slug>.md`：加/删对应 key 或 `## 块`、调整数组项顺序。
2. 模版已有对应 `data-optional`/`data-field` 的，**零模版改动**即生效；模版没有对应槽的 → 这实际是 L3（新段落类型），转 SOP-9-版式。
3. `npm run build`（validateBlocks 兜底）→ 预览。
**常见错误**：`## 标题`忘带 `<!--block:KEY-->`（validateBlocks 会拦）；KEY 在模版无着落（同上会拦——这正是校验存在的意义）。

## SOP-6 素材入库（图片闸门）

**触发**：任何图片要进 `public/assets/img/`。
**规范**（详见 [08 章](08-SEO与性能.md)）：
1. 压缩后再落盘：常规图 ≤200KB，hero/大图 ≤350KB（原始大图别进仓库——已踩过 3–4MB/张拖 LCP 的坑）。
2. 文件名沿用原站命名或语义英文小写连字符。
3. 页面引用处 `<img>` 必带 `width/height`（防 CLS；缺图时按框占位不塌版）。
4. 缺图 = known-leftover：记录进 04 章债务台账#6，后补同名文件即显示，HTML 不改。

## SOP-7 发布与回滚（发布线建成后生效；现为占位）

**现状**：发布线未建（07 章决策包等用户 4 问）。当前"发布"= 本地 `npm run serve` 验收。
**目标态**：
1. 发布：`npm run check` 全绿 → `npm run deploy`（构建→原子上传→CDN 刷新→打 release tag）。
2. 回滚：`npm run rollback <tag>`（把旧 release 完整重发，不是改指针）。
3. 发布前检查单见 07 章 §6。

## SOP-8 改版式 / 改模版（L3，agent 专属）

**触发**：某页族要改布局/样式；post 某篇要改排版。
**步骤（agent）**：
1. 改 `src/templates/`（页族模版或 post 骨架）。改前明确影响面：超集模版改动 = 全族页面都变。
2. `npm run build` 全族重渲 → `npm run verify:geom`：预期不变的页必须仍 1:1；预期变化的逐条解释。
3. 用户过目后合入。
**铁律**：动了渲染器/模版/MD 三者任一，**改完必验**；模版改动禁止只看单页——族内其他页就是回归面。

---

## 附：命令速查

| 命令 | 作用 |
|---|---|
| `npm run build` | 真相层 → dist（产物零 data-*） |
| `npm run edit` | :8081 可见即可编辑（写回 MD） |
| `npm run serve` | build + :8080 本地预览 |
| `npm run verify:geom` | 逐元素几何回归（CDP :9456） |
| `npm run check` | （P0 待加）测试 + build + geom 一条龙 |
| `npm run deploy` / `rollback` | （发布线建成后）发布 / 回滚 |
