// 写回器：把编辑器产生的 value 按坐标 coord patch 回结构化 MD 文件（frontmatter + markdown 正文）。
// 是 render.mjs 的逆向搭档：htmlToMd 反解 mdToHtml 产出的 HTML 子集，并净化 contenteditable 脏输出。
//
// coord 四种前缀：
//   fm:<点路径>            —— 改 frontmatter（YAML），保留注释/缩进，正文原样
//   mdhead:<block>         —— 改 `## 标题 <!--block:KEY-->` 的标题文字（保留锚）
//   mdbody:<block>         —— 替换该 ## 块标题行之后的整段正文区
//   mdbody:<block>#<i>     —— 替换该块下第 i 个 `### 项` 标题行之后的内容
//
// kind: 'text' → value 当纯文本直接写；'rich' → value 是 HTML，先 htmlToMd 反解再写。

import { readFile, writeFile } from "node:fs/promises";
import { parseDocument } from "yaml";
import { parse as parseHtml } from "node-html-parser";

const IMG_BASE = "/assets/img/product/";

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

// 拆出 frontmatter 文本 / 正文 / 以及 frontmatter 区的原始包裹（含 --- 分隔），便于原地回写。
function splitFile(raw) {
  const m = raw.match(FM_RE);
  if (!m) return { frontmatter: "", body: raw, hasFm: false };
  return { frontmatter: m[1], body: m[2], hasFm: true };
}

// ---------- 入口：按坐标分派 ----------

export async function patchMarkdown(mdPath, coord, kind, value) {
  const raw = await readFile(mdPath, "utf8");
  const next = applyPatch(raw, coord, kind, value);
  await writeFile(mdPath, next, "utf8");
  return next;
}

// 纯函数核心（便于测试）：接收原文与坐标，返回 patch 后的整篇文本。
export function applyPatch(raw, coord, kind, value) {
  const ci = coord.indexOf(":");
  if (ci < 0) throw new Error(`无法识别的 coord：${coord}`);
  const prefix = coord.slice(0, ci);
  const arg = coord.slice(ci + 1);

  if (prefix === "fm") return patchFrontmatter(raw, arg, value);

  // 其余都是正文操作
  const { frontmatter, body, hasFm } = splitFile(raw);
  let newBody;
  if (prefix === "mdhead") {
    newBody = patchHead(body, arg, value);
  } else if (prefix === "mdbody") {
    const hashIdx = arg.indexOf("#");
    const text = kind === "rich" ? htmlToMd(value) : String(value);
    if (hashIdx >= 0) {
      const block = arg.slice(0, hashIdx);
      const i = Number(arg.slice(hashIdx + 1));
      newBody = patchBodyItem(body, block, i, text);
    } else {
      newBody = patchBody(body, arg, text);
    }
  } else {
    throw new Error(`未知 coord 前缀：${prefix}`);
  }

  if (!hasFm) return newBody;
  return `---\n${frontmatter}\n---\n${newBody}`;
}

// ---------- fm: frontmatter ----------

function patchFrontmatter(raw, dotPath, value) {
  const { frontmatter, body, hasFm } = splitFile(raw);
  if (!hasFm) throw new Error("文件没有 frontmatter，无法 fm: 写入");
  const doc = parseDocument(frontmatter);
  const pathArr = toPathArray(dotPath);
  doc.setIn(pathArr, value);
  // lineWidth:0 关闭折行：未触碰的 flow 映射（`{ ... }` 单行）保持原样，不被默认 80 列
  // 折成多行 + 反斜杠续行，git diff 才干净。末尾自带换行去掉以保持 `---\n...\n---` 整洁。
  const fmText = doc.toString({ lineWidth: 0 }).replace(/\n$/, "");
  return `---\n${fmText}\n---\n${body}`;
}

// "gallery.0.image" → ["gallery", 0, "image"]（纯数字段当数组下标）
function toPathArray(dotPath) {
  return dotPath.split(".").map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg));
}

// ---------- mdhead: 改块标题 ----------

function patchHead(body, block, title) {
  const re = new RegExp(
    `^(##\\s+).*?(\\s*<!--\\s*block:${escapeRe(block)}\\s*-->\\s*)$`,
    "m",
  );
  if (!re.test(body)) throw new Error(`找不到块标题：${block}`);
  return body.replace(re, (_m, pre, anchor) => `${pre}${title} ${anchor.trimStart()}`);
}

// ---------- 块/项定位（行扫描）----------

// 返回该 block 在 lines 里的范围：标题行索引 + 正文起止（不含标题行，不含尾随到下一个 ## 的空行）。
function locateBlock(lines, block) {
  const anchorRe = new RegExp(`^##\\s+.*<!--\\s*block:${escapeRe(block)}\\s*-->\\s*$`);
  let headIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (anchorRe.test(lines[i])) {
      headIdx = i;
      break;
    }
  }
  if (headIdx < 0) throw new Error(`找不到块：${block}`);
  let end = lines.length;
  for (let i = headIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { headIdx, bodyStart: headIdx + 1, bodyEnd: end };
}

// 替换整块正文区
function patchBody(body, block, text) {
  const lines = body.split(/\r?\n/);
  const { headIdx, bodyEnd } = locateBlock(lines, block);
  const before = lines.slice(0, headIdx + 1); // 含标题行
  const after = lines.slice(bodyEnd); // 从下一个 ## 开始（或文件尾）
  return assemble(before, text, after);
}

// 替换块内第 i 个 ### 项 的内容（标题行之后、到下一个 ### / 下一个 ## 之前）
function patchBodyItem(body, block, i, text) {
  const lines = body.split(/\r?\n/);
  const { bodyStart, bodyEnd } = locateBlock(lines, block);
  // 收集块内所有 ### 项的标题行索引
  const heads = [];
  for (let k = bodyStart; k < bodyEnd; k++) {
    if (/^###\s+/.test(lines[k])) heads.push(k);
  }
  if (i < 0 || i >= heads.length) throw new Error(`块 ${block} 没有第 ${i} 个 ### 项`);
  const itemHead = heads[i];
  const itemEnd = i + 1 < heads.length ? heads[i + 1] : bodyEnd;
  const before = lines.slice(0, itemHead + 1); // 含 ### 标题行
  const after = lines.slice(itemEnd); // 下一个 ### 或下一个 ## 起
  return assemble(before, text, after);
}

// 把 [前缀行] + 新内容 + [后缀行] 拼回字符串，并整理前后空行：标题行与内容之间、内容与下一节之间各留一个空行。
function assemble(before, text, after) {
  // 去掉 before 尾部已有的空行（稍后统一加一个）
  while (before.length && before[before.length - 1].trim() === "") before.pop();
  // 去掉 after 头部空行
  while (after.length && after[0].trim() === "") after.shift();
  const content = String(text).trim();

  const parts = [...before];
  if (content) {
    parts.push("", content);
  }
  if (after.length) {
    parts.push("", ...after);
  } else {
    parts.push(""); // 文件尾保留一个换行
  }
  return parts.join("\n");
}

// ---------- htmlToMd：mdToHtml 的逆 + 净化 ----------

const ENTITIES = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

function decodeEntities(s) {
  return String(s).replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => ENTITIES[m]);
}

function cleanText(s) {
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

export function htmlToMd(html) {
  if (html == null) return "";
  const root = parseHtml(String(html), { comment: false });
  // 顶层节点遍历；<div> / <br> 当块级 unwrap。
  const blocks = [];
  collectBlocks(root.childNodes, blocks);
  return blocks
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .join("\n\n");
}

// 把节点列表收集成「markdown 块」字符串数组（每个元素是一个段落 / 列表 / 标题 / 图）。
function collectBlocks(nodes, out) {
  let textRun = []; // 累积裸文本 / 行内节点 → 合成一个段落
  const flushText = () => {
    if (textRun.length) {
      const t = textRun.join("").replace(/\s+/g, " ").trim();
      if (t) out.push(t);
      textRun = [];
    }
  };

  for (const node of nodes) {
    if (node.nodeType === 3) {
      // 文本节点
      textRun.push(decodeEntities(node.rawText));
      continue;
    }
    if (node.nodeType !== 1) continue; // 注释等忽略
    const tag = (node.rawTagName || "").toLowerCase();

    if (tag === "br") {
      // <br> 视作段落分隔
      flushText();
      continue;
    }
    if (tag === "div") {
      // div 当块级 unwrap：先收尾当前文本，再递归处理其子节点
      flushText();
      collectBlocks(node.childNodes, out);
      continue;
    }
    if (tag === "h4") {
      flushText();
      out.push(`### ${cleanText(node.text)}`);
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      flushText();
      const items = node
        .querySelectorAll("li")
        .map((li) => `- ${cleanText(li.text)}`)
        .filter((l) => l !== "- ");
      if (items.length) out.push(items.join("\n"));
      continue;
    }
    if (tag === "img") {
      flushText();
      out.push(imgToMd(node));
      continue;
    }
    if (tag === "p") {
      flushText();
      // 段落里可能内嵌 <img> / <br>；递归收集，作为独立块
      collectBlocks(node.childNodes, out);
      continue;
    }
    // 其它行内标签（span/strong/em/a…）：剥标签，保留文本，并入当前段落
    textRun.push(decodeEntities(node.text));
  }
  flushText();
}

function imgToMd(node) {
  const alt = decodeEntities(node.getAttribute("alt") || "");
  let src = node.getAttribute("src") || "";
  if (src.startsWith(IMG_BASE)) src = src.slice(IMG_BASE.length);
  const w = node.getAttribute("width");
  const h = node.getAttribute("height");
  const dim = w && h ? `{${w}x${h}}` : "";
  return `![${alt}](${src})${dim}`;
}

// ---------- utils ----------

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
