# DeepSeek 烧制台 设计文档（2026-08-10）

> 状态：设计已获用户批准（2026-08-10 会话），待 spec 审阅后进 writing-plans。
> 一句话：在编辑服务（8092）上加一个「AI 烧制台」——贴裸文章或给旧站 URL，点按钮调 DeepSeek API 烧出产品页 JSON，人预览过目后落 draft；**这是第三条入口路，旧路（md-to-json 迁移、会话内 AI 烧）一线不碰。**

## 1. 目标与边界

- **用途**：把「AI 烧一次」这个全系统唯一的 AI 节点，从会话内搬到界面上，模型换成 DeepSeek API。
- **范围（v1）**：仅**产品页族**（超集结构固定，AI 只填值不造结构）。post 文章族（要连 .astro 骨架一起发明）明确不做，等 v1 跑顺再议。
- **新路只加不拆**：`md-to-json.mjs`、会话内烧、编辑/i18n/geom 全链不动。产物与手工烧的 JSON **同构**——`content/products/<slug>.json`、`status: draft`，落盘后走同一条 astro build → dist-edit 预览链。
- **不碰存量**：slug 撞已有页面自动加序号，永不覆盖。
- **纯 Node**：零新依赖（Node 18+ 全局 fetch），不引入其他运行时。

## 2. 架构

```
site/scripts/deepseek-burn.mjs   【新】烧制逻辑模块：抓料/两阶段烧/组装/校验/重修，可 CLI 独立跑独立测
site/scripts/edit-server.mjs     【加】GET /__burn 烧制台页面；POST /__burn 跑流水线；POST /__burn-save 落 draft
其余全部不动
```

风格对齐 i18n 三脚本：逻辑是独立可测的模块，HTTP 层是薄壳；产品期可原样搬 Lambda。

## 3. 模块拆分（deepseek-burn.mjs）

| 函数 | 职责 | 含 AI |
|---|---|---|
| `fetchSource({text, url})` | 收裸文本；或抓 URL → 启发式剥壳（去 script/style/nav/footer/header 取正文文字+图清单）。剥壳对 dgcrane 旧站结构调优，是公认的粗糙点——剥不好时用户改贴文本兜底 | 否 |
| `planSections(numbered)` | 阶段 1：出段映射表 `[{field, title, blocks:[块号…]}]` | 是 |
| `checkPlan(map, totalBlocks)` | 纯集合运算硬查：字段在白名单内、块号全覆盖、无重叠、单调递增；specs 类字段的块里没数字 → 打回 | 否 |
| `burnSection(field, slice)` | 阶段 2：按块号切片，一段一烧出该字段 JSON 碎片 | 是 |
| `verifySection(frag, srcSlice)` | validateDoc + 按字段分级的溯源校验（见 §5） | 否 |
| `assemble(parts, meta)` | 按产品超集结构拼整页；补 `version`/`page.slug`/`status: draft`；chrome 字段填站级默认；图片字段走 probe/留空 | 否 |
| `burn(input)` | 编排整条流水线 + 段级重修循环，返回 `{json, report}` | 编排 |

## 4. 提示词包

- **预编号**：组包时代码先按空行把原文切块并编号（`[1] [2] …`），DeepSeek 只许引用块号——span 校验因此是纯集合运算，阶段 2 按块号直接切片。AI 自报起止的口径问题从根上消掉。
- **system 契约**：① 产品族字段白名单**从 `ProductPage.astro` 的 `data-field` 推导**（不手写第二份真相）；② 节点/标记注册表精简版（由 `content-schema.mjs` 翻译）；③ 三条铁律——只输出 JSON、缺段=字段缺席禁止常识补、文字逐字搬运；④ 图片 src 只许从给定图清单选（裸文本路图清单为空 → 图字段必须留空）。
- **few-shot**：一段真实原料 + 现有已验收产品 JSON 的对应片段。
- **参数**：`model` 默认 `deepseek-chat`（环境变量可换）、`temperature: 0`、`response_format: {type:'json_object'}`（提示词含 "json" 字样满足其要求）、逐段调用 `max_tokens` 4096 足够。

## 5. 字段分级与防凑字段

白名单推导时每个字段归一级（决定 verifySection 怎么查）：

| 级 | 字段 | 校验 |
|---|---|---|
| 逐字 | 正文树（overview/specs/components/faq 等 body）、规格表 | 规范化（去空白、全角→半角）后必须是原文切片子串；规格数字逐一核对 |
| 相似 | 各级标题 | 与原文相似度 ≥0.9（允许大小写/标点轻修） |
| 概括（豁免+标出） | `page.description` 等 SEO 字段 | 不硬查，报告里标「AI 概括」供人工过目 |
| 站级默认 | breadcrumb.trail、inquiry_form、author | AI 不碰，assemble 填站级默认值 |
| 用户给 | slug、产品名 | 烧制台表单输入，slug 校验 `/^[\w/-]+$/` |

流程：规划表三查（覆盖/重叠/单调）→ 逐段烧 → 每段 validateDoc + 分级溯源 → **段级重修**（哪段不过修哪段，≤2 次；还不过该段标红缺席——超集裁剪天然支持缺段，预览照渲）→ 报告如实呈现，不静默出货。

## 6. 烧制台界面与流程

`localhost:8092/__burn`，自包含单页（视觉照抄现有编辑层 UI 风格）：

1. 输入区：裸文本框 / URL 框（二选一）、slug、产品名、`开始烧制`。
2. 烧制中：进度态（v1 = 长连接 + loading；Node 无默认超时，本地单用户够用；任务队列不做）。
3. 结果区三样：**渲染预览**（iframe 渲真页面）+ **JSON 原文**（可展开）+ **校验报告**（段映射表、溯源通过率、重修轮次、标红缺席段、AI 概括字段清单）。
4. 三选一：`存草稿`（POST /__burn-save 落盘 → build → 给 8092 编辑器链接，精修改用现有编辑器原位改）/ `重新烧` / `丢弃`。

「改」不新建任何编辑功能——落 draft 后就是普通页面，现有可见即可编辑器全接管（写回过 `/__save` + schema）。

## 7. 错误处理与配置

- DeepSeek 超时/限流/非法 JSON：每步各自重试 2 次仍败 → 界面明确报（哪步、什么原因），不落任何盘。
- URL 抓取：仅 http/https，超时与响应大小上限（SSRF 收敛）；失败直接报，不猜。
- key：只活服务端，edit-server 启动读环境变量 `DEEPSEEK_API_KEY`；浏览器永不可见；不进 git。未配置时 `/__burn` 显示「未配置」、端点 503，不崩。
- 新页**不预写 i18n 名册**（`i18n_rev`）：将来 `i18n:touch` 首跑自动落基准，符合现有「首跑只落基准不抬戳」设计。

## 8. 验收标准

1. **模块单测**：mock DeepSeek 响应 → 组装/分级校验/重修循环行为正确（无 key 可跑）。
2. **真枪实弹**（拿到 key 后）：烧 `src/content/raw/overhead-cranes-for-sale.txt`（该页已有手工迁好的 JSON 当对照答案）→ 段齐、逐字级字段无凑字段 → 落 draft → dist-edit 预览可见 → 现有编辑器能开能改能存。
3. **URL 路**：贴一个旧站产品页地址，抓→剥→烧全通。
4. **回归**：`npm run check` + geom 六页照旧全绿（证明旧路零影响）。

## 9. 明确不做（YAGNI）

post 文章族；段映射表中途暂停确认（v1 一口气到预览，报告里展示映射表供事后判断；误判率高再加暂停点）；批量队列；多用户/权限；云部署。

## 10. 设计自审记录（2026-08-10，已修订）

设计呈现后按用户要求复审，修了 5 处真问题：

1. **span 口径**：AI 自报"第几段"与代码切块口径必崩 → 改代码预编号、AI 引用块号（§4）。
2. **逐字误杀概括**：SEO 描述等字段原文无逐字句 → 字段分级（§5）。
3. **裸文本无图**：图字段留空走 known-leftover，编辑器后补（§4 铁律④/§6）。
4. **重修粒度**：整页重烧浪费 → 段级重修 + 标红缺席（§5）。
5. **长耗时无反馈**：v1 长连接 + 进度态，不建队列（§6）。

另：slug 校验沿用现有规则；不预写 i18n 名册；URL 抓取做 SSRF 收敛（§7）。
