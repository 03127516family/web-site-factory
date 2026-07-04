// MD → 正文 HTML 渲染器：把结构化 MD（frontmatter + markdown 正文）填进带 data-* 标注的模版。
// 约定见 src/templates/product.contract.md §7/§8。
//
// 字段填充规则：
//   - data-field="a.b"      按点路径取值。值是字符串：含 '<' → 当富文本 set_content（保留行内标签/图标），
//                           否则当纯文本；值是数组 → 渲染成 <li> 列表（如 hero.highlights）。
//   - <img data-field>       取值作文件名 → src（IMG_BASE 前缀）；重复块单元里同时按 item.alt 写 alt。
//   - <a data-field="*.url"> 值写 href。
//   - 容器（点路径无数据、但内部还有 data-field）→ 跳过自身，子节点各自被填（如 summary.specs）。
//   - data-repeat="grp"      按数据数组克隆「首个子单元」；单元内字段用 grp 前缀作用域寻址。
//   - data-optional="key"    MD 无该 key → 整块删除。
//
// data-* 标注全程保留在输出里（编辑器靠它做「可见即可编辑」的 DOM↔MD 绑定）。

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { parse as parseHtml } from "node-html-parser";

const IMG_BASE = "/assets/img/product/";

// data-repeat 名 → { 取数据数组, 单元字段前缀 }
export const REPEATS = {
  "breadcrumb-trail": { array: (d) => d.breadcrumb?.trail, prefix: "crumb" },
  gallery: { array: (d) => d.gallery, prefix: "gallery" },
  "gallery-thumbs": { array: (d) => d.gallery, prefix: "gallery" },
  specs: { array: (d) => d.specs, prefix: "spec" },
  components: { array: (d) => d.components?.items, prefix: "component" },
  "production-flow": { array: (d) => d.production_flow?.steps, prefix: "flow" },
  "crane-types": { array: (d) => d.crane_types?.items, prefix: "crane_type" },
  cases: { array: (d) => d.installation?.cases, prefix: "case" },
  "related-products": { array: (d) => d.related_products?.items, prefix: "related" },
};

// 不在其上显示增删 UI 的组。gallery 大图区被模版写了 pointer-events:none + swiper fade（同时只显一张）
// + overflow:hidden，不适合放控件；改由缩略图组 gallery-thumbs 承载画廊增删（它映射同一个 gallery 数组）。
// 面包屑 trail：数据驱动渲染 + SEO，但不挂增删 UI（站点分类树，非逐点内容；决策 1.2①「只读驱动」）。
export const NO_STRUCT_EDIT = new Set(["gallery", "breadcrumb-trail"]);

// 哪些正文块是「按 ### 拆成重复项」的（其余 ## 块是单体富文本）
const REPEAT_BODY_BLOCKS = new Set(["components", "crane-types"]);

// data-repeat 名 → frontmatter 里对应的数组路径（编辑模式写回坐标 fm:<array>.<i>.<key>、
// 以及增删 arrayOp 定位数组 都用它）。
export const REPEAT_FM_ARRAY = {
  "breadcrumb-trail": "breadcrumb.trail",
  gallery: "gallery",
  "gallery-thumbs": "gallery",
  specs: "specs",
  components: "components_images",
  "production-flow": "production_flow.steps",
  "crane-types": "crane_types_images",
  cases: "installation.cases",
  "related-products": "related_products.seed",
};

// 正文块写回坐标不再写死白名单：由 buildData 在「确定数据来源」时就地产出（path → {md,edit}），
// classifyField 直接查这张动态表（见下）。新增/改名一个 ## 块即自动可编辑，无需在此登记。

// 一段正文 HTML 是否「富文本」（编辑器存 innerHTML、写回走 htmlToMd 反解）：
// 含块级结构（列表/表格/小标题/图）或多段 <p> → rich；否则（单段纯文本）→ text。
function bodyEditKind(html) {
  const h = String(html || "");
  if (/<(ul|ol|table|h4|img)\b/i.test(h)) return "rich";
  if ((h.match(/<p\b/gi) || []).length > 1) return "rich";
  return "text";
}

// 文件入口：读盘 → 委托字符串入口。保留原签名，行为逐字节不变。
export async function renderBodyFromMarkdown(templateHtml, mdPath, opts = {}) {
  const raw = await readFile(mdPath, "utf8");
  return renderBodyFromString(templateHtml, raw, opts, mdPath);
}

// 字符串入口（不碰文件系统）：模版 + MD 原文字符串 → 正文 HTML。
// 云端 edit-save/render-page Lambda 拿到的 MD 是 S3/git 来的字符串而非路径，直接调本函数；
// 编辑链路回归门也用它做纯内存渲染（不写真实文件）。srcLabel 仅用于 validateBlocks 报错定位。
export function renderBodyFromString(templateHtml, raw, opts = {}, srcLabel = "<string>") {
  const editMode = opts.editMode === true;
  const { frontmatter, body } = splitFrontmatter(raw);
  const fm = parseYaml(frontmatter) || {};
  const blocks = parseBody(body);
  validateBlocks(body, blocks, templateHtml, srcLabel); // 改坏即报错，不静默退默认
  const { data, coords } = buildData(fm, blocks);

  const root = parseHtml(templateHtml, { comment: true });
  validateRequired(root, data, srcLabel); // 必填字段缺数据即报错，不许退模版占位（与 validateBlocks 同哲学）
  pruneOptional(root, data);
  expandRepeats(root, data, editMode);
  fillFields(root, data, editMode, coords);
  return root.toString();
}

// 非重复字段的写回坐标分类：纯函数，path → { md:<data-md 值>, edit:<data-edit 类型> }。
// edit 为 image/link 时若元素并非 <img>/<a> 应由调用方按实际标签回退到 text；这里只给出「按 path 的预期类型」。
function classifyField(path, tag, value, coords = {}) {
  // 来自正文 ## 块的字段（标题/正文）→ 用 buildData 就地产出的动态坐标（mdhead:/mdbody:）。
  if (coords[path]) return coords[path];
  // hero.highlights：frontmatter 数组渲染成 <ul>，按富文本编辑。
  if (path === "hero.highlights") return { md: "fm:hero.highlights", edit: "rich" };
  // 其余 → fm:<path>，类型按元素标签 / path 后缀 / 值是否含行内标签 判定。
  return { md: `fm:${path}`, edit: editTypeOf(tag, path, null, value) };
}

// 元素标签 + 路径/键 + 值 → 编辑类型：<img>→image；<a> 且以 url 结尾→link；
// 值含行内标签（如价格的 <span>）→ rich（编辑器存 innerHTML，否则会丢标签）；否则 text。
function editTypeOf(tag, path, key, value) {
  if (tag === "img") return "image";
  if (tag === "a" && ((path && path.endsWith(".url")) || (key && key.endsWith("url")))) return "link";
  if (typeof value === "string" && value.includes("<")) return "rich";
  return "text";
}

// 编辑模式下给可编辑元素打写回坐标。
function tagEditable(el, md, edit) {
  el.setAttribute("data-md", md);
  el.setAttribute("data-edit", edit);
}

// 重复块单元内字段的写回坐标：组名 name + 0 基索引 i + 单元内键 key（与 path）+ 值 value。
function tagUnitField(el, name, i, key, path, value) {
  const tag = (el.tagName || "").toLowerCase();
  // 按 ### 拆项的块（components/crane-types…）：body 与 name 都取自正文（渲染的真源），坐标都指正文——
  //   body → 第 i 个 ### 项的正文（mdbody:<block>#<i>，rich/text 按内容判定）；
  //   name → 第 i 个 ### 项的标题行（mdhead:<block>#<i>）。
  // fm 的 <数组>_images 只承载 image（index 对齐）；其 name 字段渲染侧不读、编辑侧不写（收单处，
  // 2026-07-04 修 1.8#1「name 写回黑洞」：旧坐标指 fm:components_images.N.name 但渲染取正文 ###，改名不生效）。
  if (REPEAT_BODY_BLOCKS.has(name)) {
    if (key === "body") {
      const edit = typeof value === "string" && value.includes("<") ? "rich" : "text";
      return tagEditable(el, `mdbody:${name}#${i}`, edit);
    }
    if (key === "name") return tagEditable(el, `mdhead:${name}#${i}`, "text");
  }
  // 其余 → fm:<数组路径>.<i>.<key>，类型按元素标签 / key 后缀 / 值含标签 判定。
  const array = REPEAT_FM_ARRAY[name];
  tagEditable(el, `fm:${array}.${i}.${key}`, editTypeOf(tag, path, key, value));
}

// ---------- MD 解析 ----------

function splitFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { frontmatter: "", body: raw };
  return { frontmatter: m[1], body: m[2] };
}

// 兜底校验：MD 结构被编辑器/格式化器改坏时「当场报错」，而不是静默退回模版默认。
// 只用通用规则（不写死段名）：① 每个 ## 二级标题必须带合法 <!--block:KEY-->；
// ② 每个 block KEY 规范化后须在模版出现（data-field="KEY..." 或 data-optional="KEY"）。
function validateBlocks(body, blocks, templateHtml, mdPath) {
  const errors = [];
  body.split(/\r?\n/).forEach((line, i) => {
    if (/^##(?!#)\s/.test(line) && !/<!--\s*block:[\w-]+\s*-->\s*$/.test(line)) {
      errors.push(
        `第 ${i + 1} 行：## 标题缺少/损坏 block 标记 → "${line.trim().slice(0, 60)}"（应以 <!--block:KEY--> 收尾）`,
      );
    }
  });
  const tmplKeys = new Set();
  for (const m of templateHtml.matchAll(/data-field="([\w-]+)/g)) tmplKeys.add(m[1]);
  for (const m of templateHtml.matchAll(/data-optional="([\w-]+)"/g)) tmplKeys.add(m[1]);
  for (const bk of Object.keys(blocks)) {
    const dk = bk.replace(/-/g, "_");
    if (!tmplKeys.has(dk) && !tmplKeys.has(bk)) {
      errors.push(`block KEY "${bk}" 在模版里找不到对应 data-field/data-optional（拼错？模版无此槽？）`);
    }
  }
  if (errors.length) {
    throw new Error(
      `[MD 校验失败] ${mdPath}\n  - ${errors.join("\n  - ")}\n` +
        `（多半是编辑器的 markdown 格式化把 <!--block:KEY--> 改写了；请勿让格式化器改写它。）`,
    );
  }
}

// 把 markdown 正文按 `## 标题 <!--block:KEY-->` 切块。
// 返回 { KEY: { title, html?, items?:[{name, body}] } }
function parseBody(body) {
  const lines = body.split(/\r?\n/);
  const out = {};
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const content = cur.lines.join("\n").trim();
    if (REPEAT_BODY_BLOCKS.has(cur.key)) {
      out[cur.key] = { title: cur.title, items: splitBySubheading(content) };
    } else {
      // html：富文本块（overview/introduction 的 <div data-field>）；raw：纯文本块
      // （installation 的 <p data-field>，模版已自带 <p> 外壳，不能再套）
      out[cur.key] = { title: cur.title, html: mdToHtml(content), raw: content };
    }
    cur = null;
  };
  for (const line of lines) {
    const h = line.match(/^##\s+(.*?)\s*<!--\s*block:([\w-]+)\s*-->\s*$/);
    if (h) {
      flush();
      cur = { key: h[2], title: h[1].trim(), lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  flush();
  return out;
}

// 把一段含多个 `### 子标题` 的内容拆成 [{ name, content }]
function splitBySubheading(content) {
  const lines = content.split(/\r?\n/);
  const items = [];
  let cur = null;
  for (const line of lines) {
    const h = line.match(/^###\s+(.*)$/);
    if (h) {
      if (cur) items.push(cur);
      cur = { name: h[1].trim(), lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) items.push(cur);
  return items.map((it) => ({ name: it.name, content: it.lines.join("\n").trim() }));
}

// 行内 markdown：**粗体** / *斜体* / [文字](链接)。htmlToMd（md-write.mjs）有对称的逆向。
// 顺序：先粗体（消耗成对 **），再链接，最后斜体（剩余单 *），避免 ** 被斜体误匹配。
function inline(s) {
  return String(s)
    .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+?)\]\(([^)\s]+?)\)/g, '<a href="$2">$1</a>')
    .replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
}

// 极简 markdown→HTML：空行分块；列表 / ### 小标题 / 管道表格 / 行内图 / 原始HTML透传 / 段落。
function mdToHtml(md) {
  if (!md) return "";
  const blocks = md.split(/\n{2,}/);
  const html = [];
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    const lines = block.split(/\r?\n/);
    if (lines.every((l) => l.startsWith("- "))) {
      html.push("<ul>" + lines.map((l) => `<li>${inline(l.slice(2).trim())}</li>`).join("") + "</ul>");
    } else if (/^###\s+/.test(block)) {
      html.push(`<h4>${inline(block.replace(/^###\s+/, "").trim())}</h4>`);
    } else if (lines.length >= 2 && lines[0].includes("|") && /-/.test(lines[1]) && /^[\s|:-]+$/.test(lines[1])) {
      // GitHub 风格管道表格：首行表头、次行 ---|--- 分隔、其余数据行。
      // 产出与原站对比表一致的 <table><tbody> 结构（表头 <th style="text-align: left;">）。
      const cells = (l) => l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
      const head = cells(lines[0]);
      const rows = lines.slice(2).map(cells);
      let t = "<table>\n<tbody>\n<tr>\n";
      t += head.map((h) => `<th style="text-align: left;">${inline(h)}</th>`).join("\n") + "\n</tr>\n";
      for (const r of rows) t += "<tr>\n" + r.map((c) => `<td>${inline(c)}</td>`).join("\n") + "\n</tr>\n";
      t += "</tbody>\n</table>";
      html.push(t);
    } else {
      const img = block.match(/^!\[([^\]]*)\]\(([^)]+?)\)(?:\{(\d+)x(\d+)\})?$/);
      if (img) {
        const [, alt, src, w, hgt] = img;
        const dim = w && hgt ? ` width="${w}" height="${hgt}"` : "";
        html.push(
          `<img decoding="async" class="alignnone size-full" src="${resolveImg(src)}" alt="${alt}"${dim} />`,
        );
      } else if (block.startsWith("<")) {
        html.push(block); // 原始 HTML 块（如 <p><img></p> 内嵌图、<ul> 等）原样透传，不再包 <p>
      } else {
        html.push(`<p>${inline(lines.join("").trim())}</p>`);
      }
    }
  }
  return html.join("\n");
}

// 用正文块补全 frontmatter，拼出渲染器用的统一数据对象。
// 返回 { data, coords }：coords 是「编辑写回坐标」的动态表（path → {md,edit}），
// 在每处「字段确实取自正文 ## 块」时就地登记——与数据来源同源，不再另立白名单。
// 取自 frontmatter 的字段不登记（classifyField 默认回落到 fm:）。
function buildData(fm, blocks) {
  const d = { ...fm };
  const coords = {};
  const headAt = (key) => ({ md: `mdhead:${key}`, edit: "text" }); // ## 标题取自块
  const bodyAt = (key, html) => ({ md: `mdbody:${key}`, edit: bodyEditKind(html) }); // 块正文

  if (blocks.overview) {
    d.overview = { title: blocks.overview.title, body: blocks.overview.html };
    coords["overview.title"] = headAt("overview");
    coords["overview.body"] = bodyAt("overview", blocks.overview.html);
  }
  if (blocks.introduction) {
    d.introduction = {
      ...(fm.introduction || {}),
      title: blocks.introduction.title,
      body: blocks.introduction.html,
    };
    coords["introduction.title"] = headAt("introduction");
    coords["introduction.body"] = bodyAt("introduction", blocks.introduction.html);
  }
  if (blocks.components) {
    const imgs = fm.components_images || [];
    d.components = {
      title: blocks.components.title,
      items: blocks.components.items.map((it, i) => ({
        name: it.name,
        image: imgs[i]?.image ?? null,
        // 单段纯文本 → 保持原样（模版自带 <p> 外壳，1:1）；含列表等 markdown 结构 → 渲成 HTML。
        // 按内容自适应，故 markdown 列表型组件(如保护装置)既能渲染、也能编辑往返。
        body: /^\s*-\s/m.test(it.content) ? mdToHtml(it.content) : it.content,
      })),
    };
    coords["components.title"] = headAt("components"); // 各项 body 的坐标由 tagUnitField 打（重复块）
  }
  if (blocks["crane-types"]) {
    const imgs = fm.crane_types_images || [];
    d.crane_types = {
      title: blocks["crane-types"].title,
      items: blocks["crane-types"].items.map((it, i) => ({
        name: it.name,
        image: imgs[i]?.image ?? null,
        body: mdToHtml(it.content), // 列表 → <ul>，按富文本注入
      })),
    };
    coords["crane_types.title"] = headAt("crane-types");
  }
  if (blocks.installation) {
    d.installation = { ...(fm.installation || {}), body: blocks.installation.raw };
    coords["installation.body"] = bodyAt("installation", blocks.installation.raw);
    // installation.title 取自 frontmatter（不登记，回落 fm:）
  }
  // 通用单体富文本块：以上「特殊结构块」之外的任意 `## 标题 <!--block:KEY-->`，
  // 自动映射成 d[KEY]={title, body}（块名连字符→data 键下划线），并就地登记 title/body 写回坐标。
  // 新增/改名一个段，只要模版里有对应 data-optional/data-field，即「能渲染、也能编辑」，无需改本文件。
  // 套壳按「内容」决定而非段名：body 含 <table> → 外包 .custom_tables（对齐原站对比表结构）。
  const STRUCTURED_BLOCKS = new Set([
    "overview",
    "introduction",
    "components",
    "crane-types",
    "production-flow", // 这些块各有专门处理（重复项/内嵌图/frontmatter 步骤等），不走通用映射
    "installation",
  ]);
  for (const [blockKey, blk] of Object.entries(blocks)) {
    if (STRUCTURED_BLOCKS.has(blockKey)) continue;
    const dataKey = blockKey.replace(/-/g, "_");
    const body = blk.html.includes("<table") ? `<div class="custom_tables">${blk.html}</div>` : blk.html;
    d[dataKey] = { title: blk.title, body };
    coords[`${dataKey}.title`] = headAt(blockKey);
    coords[`${dataKey}.body`] = bodyAt(blockKey, blk.html);
  }
  if (fm.related_products?.seed)
    d.related_products = { ...fm.related_products, items: fm.related_products.seed };
  return { data: d, coords };
}

// ---------- DOM 填充 ----------

function resolve(data, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), data);
}

function resolveImg(value) {
  if (!value) return value;
  if (/^(https?:)?\//.test(value)) return value; // 已是绝对路径/URL
  return IMG_BASE + value;
}

// 必填校验：模版自声明 `data-required` 的点，MD 必须给数据，否则抛错中止（不许退模版占位符）。
// marker 驱动、不认字段名（§2）：与 data-optional 互为反义——可选(缺→删段) ↔ 必填(缺→报错)。
//   · data-required 挂在 data-repeat 容器 → 其 backing 数组须非空（如面包屑 trail）；
//   · data-required 挂在普通 data-field → resolve(data,path) 须有非空值（如 breadcrumb.current、h1 title）。
// 起因：面包屑 trail/current 缺失时会静默出占位「首页 > 当前页」上线（1.2 走查发现）。
function validateRequired(root, data, mdPath) {
  const errors = [];
  for (const el of root.querySelectorAll("[data-required]")) {
    const repeatName = el.getAttribute("data-repeat");
    if (repeatName) {
      const arr = REPEATS[repeatName]?.array(data);
      if (!Array.isArray(arr) || arr.length === 0)
        errors.push(`必填重复区 data-repeat="${repeatName}"：MD 缺对应数组或为空`);
      continue;
    }
    const path = el.getAttribute("data-field");
    if (!path) continue;
    const v = resolve(data, path);
    if (v === undefined || v === null || v === "")
      errors.push(`必填字段 data-field="${path}"：MD 无值（不许退模版占位）`);
  }
  if (errors.length) {
    throw new Error(
      `[必填校验失败] ${mdPath}\n  - ${errors.join("\n  - ")}\n` +
        `（模版用 data-required 声明了这些点必须由 MD 提供；补齐对应 frontmatter/正文即可。）`,
    );
  }
}

function pruneOptional(root, data) {
  for (const el of root.querySelectorAll("[data-optional]")) {
    const key = el.getAttribute("data-optional");
    const v = resolve(data, key);
    if (v == null || (Array.isArray(v) && v.length === 0)) el.remove();
  }
}

function expandRepeats(root, data, editMode = false) {
  for (const container of root.querySelectorAll("[data-repeat]")) {
    const name = container.getAttribute("data-repeat");
    const spec = REPEATS[name];
    if (!spec) continue;
    const arr = spec.array(data);
    if (!Array.isArray(arr)) continue;
    const unit = container.childNodes.find((n) => n.nodeType === 1); // 首个元素子节点
    if (!unit) continue;
    const baseId = (unit.getAttribute && unit.getAttribute("data-block-id")) || name;
    const stem = baseId.replace(/-\d+$/, ""); // gallery-1 → gallery
    const structEdit = editMode && !NO_STRUCT_EDIT.has(name);
    const html = arr
      .map((item, i) => {
        const clone = unit.clone();
        if (clone.getAttribute && clone.getAttribute("data-block-id"))
          clone.setAttribute("data-block-id", `${stem}-${i + 1}`);
        // 编辑模式下给单元打 0 基索引（前端删项用），并把组名+索引传下去打字段写回坐标。
        if (structEdit) clone.setAttribute("data-idx", String(i));
        return fillUnit(clone, item, spec.prefix, editMode ? { name, i } : null);
      })
      .join("\n");
    container.set_content(html);
    // 编辑模式下标记容器为「可增删组」，前端据此挂 ＋添加 / ×删除 控件（镜像组 gallery-thumbs 除外）。
    if (structEdit) container.setAttribute("data-group", name);
  }
}

function fillUnit(unit, item, prefix, edit = null) {
  const fields = unit.querySelectorAll("[data-field]");
  if (unit.getAttribute && unit.getAttribute("data-field")) fields.unshift(unit);
  const altText = item.alt ?? item.name ?? item.title ?? item.label;
  for (const el of fields) {
    const path = el.getAttribute("data-field");
    const key = path.startsWith(prefix + ".") ? path.slice(prefix.length + 1) : path;
    if (edit) tagUnitField(el, edit.name, edit.i, key, path, item[key]);
    applyValue(el, item[key], path, item);
    // 重复块单元是「克隆首个单元」来的：图片须去掉首单元残留的 srcset/sizes（否则会按 srcset
    // 加载到错误的图），并把 alt 改成本项文字。
    if ((el.tagName || "").toLowerCase() === "img" && item[key] != null) {
      el.removeAttribute("srcset");
      el.removeAttribute("sizes");
      if (altText != null) el.setAttribute("alt", altText);
    }
  }
  // production-flow：单元本身是 <a>，把灯箱大图 href 指到本项图片
  if ((unit.tagName || "").toLowerCase() === "a") {
    const href = unit.getAttribute("href") || "";
    if (/\.(jpe?g|png|webp|gif)$/i.test(href) && item.image)
      unit.setAttribute("href", resolveImg(item.image));
  }
  return unit.toString();
}

function fillFields(root, data, editMode = false, coords = {}) {
  for (const el of root.querySelectorAll("[data-field]")) {
    const path = el.getAttribute("data-field");
    const value = resolve(data, path);
    if (value === undefined) continue; // 容器 / 重复块前缀字段 / 无数据 → 保持原样
    if (editMode) {
      const tag = (el.tagName || "").toLowerCase();
      const { md, edit } = classifyField(path, tag, value, coords);
      tagEditable(el, md, edit);
    }
    applyValue(el, value, path, null);
  }
}

function applyValue(el, value, path, item) {
  let tag = (el.tagName || "").toLowerCase();
  // §2.4：<p> 槽装不下块级内容（<ul>/<table>/<h4>/嵌套<p>…）——解析器/浏览器会按 HTML 规则把它拆到
  // <p> 之外，使该 data-field 元素变空、不可编辑（1.8#2）。按「内容形态」就地把这种 <p> 改成 <div>
  // （内容驱动，非段名特判；与原站手写页一致：列表型组件用 <div>、纯文本组件仍用 <p>）。
  if (tag === "p" && typeof value === "string" && /<(ul|ol|table|h4|div|p|section|blockquote)\b/i.test(value)) {
    el.tagName = "div";
    tag = "div";
  }
  if (tag === "img") {
    if (value == null) {
      const photo = el.closest(".photo");
      (photo || el).remove();
      return;
    }
    el.setAttribute("src", resolveImg(value));
    // 非重复字段图（如 hero）也去掉模版残留的 srcset/sizes，否则浏览器会按 srcset
    // 加载到模版默认（别的产品）的图；src 是本产品的正确图。
    el.removeAttribute("srcset");
    el.removeAttribute("sizes");
    return;
  }
  if (value == null) return;
  if (tag === "a" && path.endsWith(".url")) {
    el.setAttribute("href", value);
    return;
  }
  if (Array.isArray(value)) {
    el.set_content(value.map((v) => `<li>${v}</li>`).join(""));
    return;
  }
  el.set_content(String(value)); // 含标签 → 富文本；否则纯文本
}
