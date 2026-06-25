# 沟通记录 · overhead 第二产品接入 + 规范权威性 + 深度 vs 广度复盘

> 日期：2026-06-25
> 承接《对话记录-2026-06-24-确定性渲染器-可见即可编辑-增删-缺口评估.md》。
> 本轮无代码改动（处于 plan 模式），是一次**方向/概念澄清 + 差异核对 + 自我复盘**，并产出 overhead 接入计划。
> 项目：`websitere-placement-system`（替代 WordPress 的内容驱动建站系统）

---

## 0. 接续点

上一份截止于「编辑器缺口评估完成、待定使用场景」。本轮从「下一步做什么」展开，落到
**把 overhead 做成第二个可编辑产品**，中途穿插大量概念澄清，最后做了一次「是否走偏」的诚实复盘。

---

## 1. 下一步定调：overhead 作为「第二个产品」

- 现状：真正做通的产品只有 single-girder（单梁）**一个**。引擎（render/md-write/editor）号称通用，但只被一个样本验证过。
- 选 overhead（`overhead-cranes-for-sale`，FEM/欧式桥式起重机）：它模版已合规（135 个 `data-field`、7 个 `data-repeat`），
  只差一份 MD 数据源——`build.mjs` 里它的 page 条目缺 `content:` 一行，所以 `composePage` 不走渲染器、编辑服务显示「不可编辑」。
- 价值：对「引擎通用、第二个产品≈免费复用」最便宜的真实检验，且**不依赖**「编辑器给谁用」那个待定决定（引擎能否复用是地基）。

---

## 2. 概念澄清（本轮主体，用户连环追问）

### 2.1 「这个 MD 需要什么要求？」→ 5 条硬要求
MD 是**产物规格**，不是输入。合格 MD：① 两段式（YAML frontmatter + markdown 正文，`---` 分隔）；
② 自报家门 `slug` + `template: product@1`；③ 每个 `data-field` 都有对应点路径数据；
④ 每个 `data-repeat="X"` 有数组、且 X 已在 `REPEAT_FM_ARRAY` 登记；⑤ 正文块 `## 标题 <!--block:KEY-->` 的 KEY 与模版对应点对上。

### 2.2 「内容不可能自带这格式吧？」→ 对，这是 AI 创作那一步
真实内容就是普通 text，**把它装配成合规 MD 是 AI 创作（烧一次）**，代码只吃规整 MD。
**好消息**：overhead 的原料 text 已躺在 497 行的 `overhead-cranes-for-sale.html` 里（`data-field` 标签内 + `<div data-field><p>` 正文里都确认有真内容）→ 补 overhead MD ≈ **纯搬运，不是创作**。

### 2.3 「什么叫老命名？」→ 写死格子 vs 清单
overhead 参数仍是老式命名：`spec.capacity / span / duty_class / voltage ...`（每行一个**专属命名格子**，数量写死，**不能增删**）。
单梁已改造成 `data-repeat="specs"` + `spec.text`（所有行同名、靠编号排队 = **可伸缩清单**，**天生能增删**）。
比喻：老式=印死 7 个空的表格；新式=空白记事本想写几条写几条。

### 2.4 「为什么要和单梁对齐？每个模版应该唯一」→ 对齐的是「引擎」，不是单梁
**用户这条追问很关键，纠正了我的松散措辞。**
- 每个模版唯一、每份 MD 填自己的模版、内容各自独有——**MD 不抄单梁内容**。
- 真正要对齐的是**引擎的认知边界**（`REPEAT_FM_ARRAY`/字段分类/`NEW_ITEM` 等表）：overhead 用到的东西引擎认不认？认→只填数据零改码；不认→加一行表。
- 单梁只是「引擎目前认识的东西」的现成快照，故拿它当代理，**不是要 overhead 模仿单梁**。

### 2.5 「一个 JS 怎么编辑命名不同的模版？」→ editor.js 对名字是盲的
**核验：editor.js 里零具体字段名**（grep 证实，唯一的 "gallery" 是 CSS 类 `.ltgallery`）。它只认 4 个通用属性 `data-md/edit/group/idx`。
机制 = **三层间接**：① 模版把字段名写进 `data-md`（名字差异关在最上层）；② editor.js 当黑盒搬运、从不解析名字，`data-edit` 只有 text/rich/image/link 4 种固定 kind；
③ 服务器 `md-write.mjs` 按 `data-md` 里的点路径**通用走对象**（任何名字都走得通）。
→ 普通字段任意命名都自动支持；**唯一耦合点是重复组名**（要登记进 `REPEAT_FM_ARRAY`，可用「组名=数组路径」约定彻底消掉，未做）。

### 2.6 「能否后续做后台管理？」→ 现在的 edit-server 已经是个后台雏形
`edit-server.mjs` 本就是 web 服务 + 首页页面列表（`indexPage()` = 雏形 dashboard）+ `/api/save`、`/api/array-op`。
「后台管理」=在它之上加东西，引擎整套照搬。三档：① 本地增强 dashboard（列产品/新建删除，本地，低成本）；
② 部署上线+登录（非技术同事浏览器改+发布，补权限/并发/部署，中成本）；③ 完整 CMS（媒体库/角色/草稿发布/版本，高成本）。
本质 = §10.1「编辑器给谁用」那个待定问题。**用户决定：暂不做后台，先出 overhead。**

### 2.7 「product.contract.md 规范是什么？」→ 权威文档，但已漂移
契约 8 节：三分类（dynamic/shared/content）、结构铁律（`#product` 必须包到 inquiry-form，否则 89 条 `#product` 作用域 CSS 失效，历史塌过两次）、
11 个 section 一览、字段 schema、每组单元 HTML、WP 残留清理边界、**差异五档**（field/repeat/optional/slot/逃生舱）、渲染器步骤。
**⚠ 发现一：契约 §4 已与现行代码对不上**——契约写 `specs:{capacity,...}` 命名 map、`breadcrumb_current`/`summary_intro` 扁平键；
实际单梁 MD 已是 `specs:[{text}]` 数组、`breadcrumb:{current,trail}`/`summary:{intro,cta}` 嵌套。**手写文档漂了，代码没回写。**
→ 最终权威其实是「能跑的代码 + 现行单梁 MD」，契约是「设计意图参考（细节已漂）」。
**⚠ 发现二：契约 §7.2 设想 overhead 的对比表用 `data-slot` 自由槽（markdown 表格）做；但实际 overhead 模版做成了固定 `data-field`（spec_compare.body / which_better.body…）。** 两种实现，模版已选「固定字段」——抽 MD 时这几块按固定 title+body 写（表格排版需斟酌）。

---

## 3. 规范权威性原则（用户提出）

用户：「必须有一份规范文档，后续新模版都要走它，是不是？」→ **对，是架构命门。**
教训：**光有手写文档会烂**（刚亲眼见契约漂移）。让「新模版都走规范」真成立，要三层（弱→强）：
1. **刷新的权威文档**（底线）——把契约对齐现行代码 + 加「新产品接入清单」。
2. **接入清单**（便宜）——加一个产品的 N 步：写 MD→标 markers→新重复组登记→登记 build.mjs→跑几何验证。
3. **校验器 `npm run check`（最狠、防漂移根治）**——扫模版 markers 核对 MD 是否都喂了/组名是否登记/结构铁律是否破，不符合就构建红。
文档会漂、清单会忘，**只有校验器漂不了**。但**校验器先别做**（现在只 1 个产品就上=继续修车间），等三四个产品真痛了再上。

---

## 4. 诚实复盘：「走偏了吗？」

**方向没偏，重心/节奏偏了。**
- **没偏**：MD 中间层、确定性渲染、可见即可编辑、规范——都在「替代 WordPress 整站」这条线上，引擎也扎实（几何 1:1、增删真能跑）。
- **偏了**：① **深度压过广度**——要替代整站（14+ 产品 + 其它页），真正做通的只有 1 个；引擎反复精修（徽标污染、swiper 增删、链接内编辑、几何验证），而「搬内容」这主体几乎没开始。
  ② **今天全是「谈」没有「产」**——一整段在「规划怎么规划」，零文件推进。
  ③ **规范/校验器有变成下一个 side-quest 的风险**（只 1 产品就上校验器=重蹈深度压广度）。
- **纠正**：**刹「往深做工具」，提「把第 2、3 个产品搬进来」**。规范只轻量刷新文档+清单、校验器缓做。
  **少谈、把 overhead 端到端真做出来**——一举三得：推进真目标 + 验证引擎通用 + 检验规范。

---

## 5. 差异核对结论（已完成，只读）：overhead 接入「引擎零改动」

把 overhead 模版要的 vs 引擎已知能力逐项对过：
- **重复组：零新增。** overhead 的 7 个组（cases/components/crane-types/gallery/gallery-thumbs/production-flow/related-products）**全已在 `REPEAT_FM_ARRAY` 登记**。
- **overhead 独有块（protection/spec_compare/spec_detail/which_better + overview/introduction/advantages）：零改代码。** 全是 `.title`+`.body` 简单字段，走通用点路径；正文 block 解析是通用正则 `block:([\w-]+)`，吃任意 KEY。
- **内容：纯搬运。** 全部真文字已 baked 在模版里。
- **唯一结构改造：`spec` 老命名 → `specs` 数组**（让参数行可增删）；`specs` 组本就已登记，**仍零改 `render.mjs`**。

**净结论：补 overhead = 写一份 MD（搬内容）+ 改一处模版（spec→specs）+ build.mjs 加一行。引擎代码零改动。** 这本身就是「第二个产品近乎免费」的实证。

---

## 6. 计划产出（plan 文件 `sunny-enchanting-nova.md`）

1. 新建 `src/content/overhead-cranes-for-sale.md`（照引擎契约+现行单梁手感写，字段集照 overhead 自己模版；从 497 行模版搬内容）。
2. 改 `src/templates/overhead-cranes-for-sale.html`：参数 `<ul>` → `data-repeat="specs"` + `spec.text` 单元。
3. `scripts/build.mjs`：overhead 条目补 `content:` 一行。
4. 引擎五件套（render/md-write/edit-server/editor.js/css）**不改**——零改动正是实证目标。
验证：`npm run build`（干净）→ `npm run verify:geom`（纳入 overhead，逐元素 1:1）→ `npm run edit`（overhead 可编辑、specs 增删生效）。

---

## 7. 决策与待办

- ✅ **定**：暂不做后台管理，先出 overhead。
- ✅ **定（倾向）**：再平衡——刹深度、提广度、先把产品搬进来。
- ⬜ **待**：① 规范刷新范围（轻量对齐 §4 + 加接入清单）；② overhead 对比表按「固定字段」还是契约的「自由槽+表格」；③（老问题仍挂）编辑器给谁用，决定后台档次与缺口 A/B。
- ▶ **下一步**：执行 overhead 接入计划（退出 plan 模式后开干）。

---

## 8. 本会话 commit

本轮无代码 commit（plan 模式，仅产出计划 + 本记录）。上一轮截止于 `1efe7a6`（2026-06-24 沟通记录）。

---

*本记录截止于「overhead 接入计划已成形、待退出 plan 模式执行；规范刷新与再平衡方向已与用户达成共识」。*
