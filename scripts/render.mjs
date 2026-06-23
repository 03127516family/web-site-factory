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
const REPEATS = {
  gallery: { array: (d) => d.gallery, prefix: "gallery" },
  "gallery-thumbs": { array: (d) => d.gallery, prefix: "gallery" },
  components: { array: (d) => d.components?.items, prefix: "component" },
  "production-flow": { array: (d) => d.production_flow?.steps, prefix: "flow" },
  "crane-types": { array: (d) => d.crane_types?.items, prefix: "crane_type" },
  cases: { array: (d) => d.installation?.cases, prefix: "case" },
  "related-products": { array: (d) => d.related_products?.items, prefix: "related" },
};

// 哪些正文块是「按 ### 拆成重复项」的（其余 ## 块是单体富文本）
const REPEAT_BODY_BLOCKS = new Set(["components", "crane-types"]);

// data-repeat 名 → frontmatter 里对应的数组路径（编辑模式写回坐标 fm:<array>.<i>.<key> 用）。
const REPEAT_FM_ARRAY = {
  gallery: "gallery",
  "gallery-thumbs": "gallery",
  components: "components_images",
  "production-flow": "production_flow.steps",
  "crane-types": "crane_types_images",
  cases: "installation.cases",
  "related-products": "related_products.seed",
};

// 非重复字段点路径 → ## 标题块名（mdhead:<block>）。注意 crane_types 映射到连字符 crane-types。
const HEAD_BLOCK_OF = {
  "overview.title": "overview",
  "introduction.title": "introduction",
  "components.title": "components",
  "crane_types.title": "crane-types",
};

// 正文富文本块（mdbody:<block>，rich）的点路径 → 块名。
const RICH_BODY_BLOCK_OF = {
  "overview.body": "overview",
  "introduction.body": "introduction",
};

export async function renderBodyFromMarkdown(templateHtml, mdPath, opts = {}) {
  const editMode = opts.editMode === true;
  const raw = await readFile(mdPath, "utf8");
  const { frontmatter, body } = splitFrontmatter(raw);
  const fm = parseYaml(frontmatter) || {};
  const blocks = parseBody(body);
  const data = buildData(fm, blocks);

  const root = parseHtml(templateHtml, { comment: true });
  pruneOptional(root, data);
  expandRepeats(root, data, editMode);
  fillFields(root, data, editMode);
  return root.toString();
}

// 非重复字段的写回坐标分类：纯函数，path → { md:<data-md 值>, edit:<data-edit 类型> }。
// edit 为 image/link 时若元素并非 <img>/<a> 应由调用方按实际标签回退到 text；这里只给出「按 path 的预期类型」。
function classifyField(path, tag) {
  // ## 标题块（overview/introduction/components/crane_types 的 .title）→ mdhead:<block>，text。
  if (path in HEAD_BLOCK_OF) return { md: `mdhead:${HEAD_BLOCK_OF[path]}`, edit: "text" };
  // 正文富文本块（overview/introduction 的 .body）→ mdbody:<block>，rich。
  if (path in RICH_BODY_BLOCK_OF) return { md: `mdbody:${RICH_BODY_BLOCK_OF[path]}`, edit: "rich" };
  // installation 正文：纯文本块 → mdbody:installation，text。
  if (path === "installation.body") return { md: "mdbody:installation", edit: "text" };
  // hero.highlights：frontmatter 数组渲染成 <ul>，按富文本编辑。
  if (path === "hero.highlights") return { md: "fm:hero.highlights", edit: "rich" };
  // 其余 → fm:<path>，类型按元素标签 / path 后缀判定。
  return { md: `fm:${path}`, edit: editTypeOf(tag, path, null) };
}

// 元素标签 + 路径/键 → 编辑类型：<img>→image；<a> 且以 url 结尾→link；否则 text。
function editTypeOf(tag, path, key) {
  if (tag === "img") return "image";
  if (tag === "a" && ((path && path.endsWith(".url")) || (key && key.endsWith("url")))) return "link";
  return "text";
}

// 编辑模式下给可编辑元素打写回坐标。
function tagEditable(el, md, edit) {
  el.setAttribute("data-md", md);
  el.setAttribute("data-edit", edit);
}

// 重复块单元内字段的写回坐标：组名 name + 0 基索引 i + 单元内键 key（与 path）。
function tagUnitField(el, name, i, key, path) {
  const tag = (el.tagName || "").toLowerCase();
  // 特例：components/crane-types 的 body 写回正文块的第 i 个 ### 项（mdbody:<block>#<i>）。
  if (name === "components" && key === "body") return tagEditable(el, `mdbody:components#${i}`, "text");
  if (name === "crane-types" && key === "body") return tagEditable(el, `mdbody:crane-types#${i}`, "rich");
  // 其余 → fm:<数组路径>.<i>.<key>，类型按元素标签 / key 后缀判定。
  const array = REPEAT_FM_ARRAY[name];
  tagEditable(el, `fm:${array}.${i}.${key}`, editTypeOf(tag, path, key));
}

// ---------- MD 解析 ----------

function splitFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { frontmatter: "", body: raw };
  return { frontmatter: m[1], body: m[2] };
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

// 极简 markdown→HTML：空行分块；列表 / ### 小标题 / 行内图 / 段落。
function mdToHtml(md) {
  if (!md) return "";
  const blocks = md.split(/\n{2,}/);
  const html = [];
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    const lines = block.split(/\r?\n/);
    if (lines.every((l) => l.startsWith("- "))) {
      html.push("<ul>" + lines.map((l) => `<li>${l.slice(2).trim()}</li>`).join("") + "</ul>");
    } else if (/^###\s+/.test(block)) {
      html.push(`<h4>${block.replace(/^###\s+/, "").trim()}</h4>`);
    } else {
      const img = block.match(/^!\[([^\]]*)\]\(([^)]+?)\)(?:\{(\d+)x(\d+)\})?$/);
      if (img) {
        const [, alt, src, w, hgt] = img;
        const dim = w && hgt ? ` width="${w}" height="${hgt}"` : "";
        html.push(
          `<img decoding="async" class="alignnone size-full" src="${resolveImg(src)}" alt="${alt}"${dim} />`,
        );
      } else {
        html.push(`<p>${lines.join("").trim()}</p>`);
      }
    }
  }
  return html.join("\n");
}

// 用正文块补全 frontmatter，拼出渲染器用的统一数据对象。
function buildData(fm, blocks) {
  const d = { ...fm };
  if (blocks.overview) d.overview = { title: blocks.overview.title, body: blocks.overview.html };
  if (blocks.introduction)
    d.introduction = {
      ...(fm.introduction || {}),
      title: blocks.introduction.title,
      body: blocks.introduction.html,
    };
  if (blocks.components) {
    const imgs = fm.components_images || [];
    d.components = {
      title: blocks.components.title,
      items: blocks.components.items.map((it, i) => ({
        name: it.name,
        image: imgs[i]?.image ?? null,
        body: it.content, // 单段纯文本，模版自带 <p> 外壳
      })),
    };
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
  }
  if (blocks.installation)
    d.installation = { ...(fm.installation || {}), body: blocks.installation.raw };
  if (fm.related_products?.seed)
    d.related_products = { ...fm.related_products, items: fm.related_products.seed };
  return d;
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
    const html = arr
      .map((item, i) => {
        const clone = unit.clone();
        if (clone.getAttribute && clone.getAttribute("data-block-id"))
          clone.setAttribute("data-block-id", `${stem}-${i + 1}`);
        // 编辑模式下把组名 name 和 0 基索引 i 传下去，给单元内字段打写回坐标。
        return fillUnit(clone, item, spec.prefix, editMode ? { name, i } : null);
      })
      .join("\n");
    container.set_content(html);
  }
}

function fillUnit(unit, item, prefix, edit = null) {
  const fields = unit.querySelectorAll("[data-field]");
  if (unit.getAttribute && unit.getAttribute("data-field")) fields.unshift(unit);
  const altText = item.alt ?? item.name ?? item.title ?? item.label;
  for (const el of fields) {
    const path = el.getAttribute("data-field");
    const key = path.startsWith(prefix + ".") ? path.slice(prefix.length + 1) : path;
    if (edit) tagUnitField(el, edit.name, edit.i, key, path);
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

function fillFields(root, data, editMode = false) {
  for (const el of root.querySelectorAll("[data-field]")) {
    const path = el.getAttribute("data-field");
    const value = resolve(data, path);
    if (value === undefined) continue; // 容器 / 重复块前缀字段 / 无数据 → 保持原样
    if (editMode) {
      const tag = (el.tagName || "").toLowerCase();
      const { md, edit } = classifyField(path, tag);
      tagEditable(el, md, edit);
    }
    applyValue(el, value, path, null);
  }
}

function applyValue(el, value, path, item) {
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "img") {
    if (value == null) {
      const photo = el.closest(".photo");
      (photo || el).remove();
      return;
    }
    el.setAttribute("src", resolveImg(value));
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
