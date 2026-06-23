// 自测：node scripts/md-write.test.mjs
// 把样板 MD 复制到临时文件，依次 patch + 断言；并验证 htmlToMd 往返。

import { readFile, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

import { patchMarkdown, htmlToMd } from "./md-write.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src", "content", "single-girder-eot-cranes.md");

// render.mjs 的 mdToHtml 未导出 —— 这里放一份等价简版，仅用于「往返到等价 HTML」的结构性断言。
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
        const base = "/assets/img/product/";
        const dim = w && hgt ? ` width="${w}" height="${hgt}"` : "";
        html.push(
          `<img decoding="async" class="alignnone size-full" src="${base}${src}" alt="${alt}"${dim} />`,
        );
      } else {
        html.push(`<p>${lines.join("").trim()}</p>`);
      }
    }
  }
  return html.join("\n");
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
function splitFile(raw) {
  const m = raw.match(FM_RE);
  return { frontmatter: m[1], body: m[2] };
}
function fmDoc(raw) {
  return parseDocument(splitFile(raw).frontmatter);
}

function assert(cond, msg) {
  if (!cond) throw new Error("断言失败：" + msg);
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "mdwrite-"));
  const tmp = join(dir, "single-girder-eot-cranes.md");
  await copyFile(SRC, tmp);

  try {
    // 1. fm:spec.capacity
    await patchMarkdown(tmp, "fm:spec.capacity", "text", "容量：1-50吨");
    {
      const raw = await readFile(tmp, "utf8");
      const doc = fmDoc(raw);
      assert(doc.getIn(["spec", "capacity"]) === "容量：1-50吨", "spec.capacity 未更新");
      assert(doc.getIn(["spec", "span"]) === "跨度长度：4-31.5米", "spec.span 不应改动");
      assert(raw.includes("# 快速参数（spec.*）"), "frontmatter 注释应保留");
      assert(raw.includes("## 概述 <!--block:overview-->"), "正文应原样保留");
    }

    // 2. fm:gallery.0.alt
    await patchMarkdown(tmp, "fm:gallery.0.alt", "text", "新alt");
    {
      const doc = fmDoc(await readFile(tmp, "utf8"));
      assert(doc.getIn(["gallery", 0, "alt"]) === "新alt", "gallery.0.alt 未更新");
      assert(
        doc.getIn(["gallery", 0, "image"]) ===
          "5Ton-LDC-type-single-girder-overhead-crane-in-India-1.jpg",
        "gallery.0.image 不应改动",
      );
      assert(doc.getIn(["gallery", 1, "alt"]) === "印度5吨LDC型单梁桥式起重机 2", "gallery.1 不应改动");
    }

    // 3. mdhead:overview
    await patchMarkdown(tmp, "mdhead:overview", "text", "概述（改）");
    {
      const raw = await readFile(tmp, "utf8");
      assert(
        /^## 概述（改） <!--block:overview-->\s*$/m.test(raw),
        "overview 标题未更新或锚丢失",
      );
    }

    // 4. mdbody:overview (rich)
    await patchMarkdown(
      tmp,
      "mdbody:overview",
      "rich",
      "<p>新概述</p><h4>优势</h4><ul><li>x</li></ul>",
    );
    {
      const raw = await readFile(tmp, "utf8");
      const body = splitFile(raw).body;
      const blockText = body.split("<!--block:overview-->")[1].split("\n## ")[0];
      assert(blockText.includes("新概述"), "overview 正文未写入段落");
      assert(blockText.includes("### 优势"), "overview 正文未写入 ### 优势");
      assert(blockText.includes("- x"), "overview 正文未写入列表项");
      assert(!blockText.includes("电动单梁桥式起重机是根据"), "overview 旧正文应被替换");
      // 后续块未受影响
      assert(raw.includes("<!--block:introduction-->"), "introduction 块应仍在");
      assert(
        raw.includes("单梁 eot 起重机由单根桥梁"),
        "introduction 正文应未受影响",
      );
      assert(raw.includes("<!--block:components-->"), "components 块应仍在");
    }

    // 5. mdbody:components#0 (text)
    await patchMarkdown(tmp, "mdbody:components#0", "text", "新主梁说明");
    {
      const raw = await readFile(tmp, "utf8");
      const comp = splitFile(raw).body.split("<!--block:components-->")[1].split("\n## ")[0];
      const seg0 = comp.split("### ")[1]; // 主梁\n\n新主梁说明
      assert(seg0.startsWith("主梁"), "components#0 标题应为 主梁");
      assert(seg0.includes("新主梁说明"), "components#0 内容未更新");
      assert(!seg0.includes("主梁是起重机的主要承载部分"), "components#0 旧内容应被替换");
      // 其它项不变
      assert(
        comp.includes("端梁位于主梁的两端"),
        "components#1（端梁）应未受影响",
      );
      assert(comp.includes("### 控制模式"), "components 末项应仍在");
    }

    // 6. htmlToMd 往返
    {
      const md = "段落\n\n### 标题\n\n- a\n- b";
      const html = mdToHtml(md);
      const back = htmlToMd(html);
      assert(back === md, `往返不一致：\n期望:\n${md}\n实得:\n${back}`);
      // 再喂回 mdToHtml 得到等价 HTML
      assert(mdToHtml(back) === html, "二次 mdToHtml 不等价");
    }

    // 7. htmlToMd 净化点
    {
      const dirty =
        '<div><p style="x" class="y">A&amp;B&nbsp;C</p><br><img src="/assets/img/product/foo.jpg" alt="标题" width="830" height="300"></div>';
      const md = htmlToMd(dirty);
      assert(md.includes("A&B C"), "实体解码/属性剥离失败：" + md);
      assert(md.includes("![标题](foo.jpg){830x300}"), "img 反解失败：" + md);
      // 无宽高
      const noDim = htmlToMd('<img src="/assets/img/product/bar.png" alt="b">');
      assert(noDim === "![b](bar.png)", "无宽高 img 应不带 {}：" + noDim);
    }

    console.log("✅ md-write 自测通过");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
