// 自测：node scripts/md-write.test.mjs
// 把样板 MD 复制到临时文件，依次 patch + 断言；并验证 htmlToMd 往返。

import { readFile, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

import { patchMarkdown, htmlToMd, arrayOp } from "./md-write.mjs";
import { writeFile } from "node:fs/promises";

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
    // 1. fm:specs.0.text（规格已改造成 data-repeat 数组）
    await patchMarkdown(tmp, "fm:specs.0.text", "text", "容量：1-50吨");
    {
      const raw = await readFile(tmp, "utf8");
      const doc = fmDoc(raw);
      assert(doc.getIn(["specs", 0, "text"]) === "容量：1-50吨", "specs.0.text 未更新");
      assert(doc.getIn(["specs", 1, "text"]) === "跨度长度：4-31.5米", "specs.1 不应改动");
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
      assert(doc.getIn(["gallery", 1, "alt"]) === "孟加拉国5吨单梁桥式起重机", "gallery.1 不应改动");
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
      assert((comp.match(/^### /gm) || []).length >= 5, "components 各项应仍在（patch #0 不应削减项数）");
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

    await arrayOpTests(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------- arrayOp 自测 ----------

// 数一段正文里某块下 ### 项的数量
function bodyItemCount(raw, block) {
  const blk = splitFile(raw).body.split(`<!--block:${block}-->`)[1].split("\n## ")[0];
  return (blk.match(/^###\s+/gm) || []).length;
}

async function arrayOpTests(dir) {
  // 每个用例都从干净样本副本起步，避免相互污染。
  const fresh = async (name) => {
    const p = join(dir, name);
    await copyFile(SRC, p);
    return p;
  };

  // 1. gallery add / remove
  {
    const tmp = await fresh("op-gallery.md");
    const before = fmDoc(await readFile(tmp, "utf8")).getIn(["gallery"]).items.length;
    await arrayOp(tmp, "gallery", "add");
    let doc = fmDoc(await readFile(tmp, "utf8"));
    const arr = doc.getIn(["gallery"]);
    assert(arr.items.length === before + 1, "gallery add 后长度应 +1");
    const last = doc.getIn(["gallery", before]);
    assert(last.get("image") === "" && last.get("alt") === "新图片", "gallery 末项应是默认占位");

    const first0Image = doc.getIn(["gallery", 0, "image"]);
    await arrayOp(tmp, "gallery", "remove", 0);
    doc = fmDoc(await readFile(tmp, "utf8"));
    assert(doc.getIn(["gallery"]).items.length === before, "gallery remove 后长度应回到原值");
    assert(
      doc.getIn(["gallery", 0, "image"]) !== first0Image,
      "gallery remove(0) 应删掉原第0项",
    );
  }

  // 2. specs add（样本无 specs 数组 → 自行构造含 specs 的临时 MD）
  {
    const tmp = join(dir, "op-specs.md");
    const md = [
      "---",
      "title: 测试",
      "specs:",
      "  - { text: 已有参数 }",
      "---",
      "",
      "## 概述 <!--block:overview-->",
      "",
      "正文",
      "",
    ].join("\n");
    await writeFile(tmp, md, "utf8");
    await arrayOp(tmp, "specs", "add");
    const doc = fmDoc(await readFile(tmp, "utf8"));
    const arr = doc.getIn(["specs"]);
    assert(arr.items.length === 2, "specs add 后长度应为 2");
    assert(doc.getIn(["specs", 1, "text"]) === "新参数", "specs 末项应是默认 新参数");
  }

  // 3. components 双处同步 add / remove(2)
  {
    const tmp = await fresh("op-components.md");
    const r0 = await readFile(tmp, "utf8");
    const fmBefore = fmDoc(r0).getIn(["components_images"]).items.length;
    const bodyBefore = bodyItemCount(r0, "components");
    assert(fmBefore === bodyBefore, "前提：components_images 与 ### 项数应相等");

    // add：两处都 +1，名字一致
    await arrayOp(tmp, "components", "add");
    const rAdd = await readFile(tmp, "utf8");
    const docAdd = fmDoc(rAdd);
    assert(
      docAdd.getIn(["components_images"]).items.length === fmBefore + 1,
      "components_images add 后应 +1",
    );
    assert(bodyItemCount(rAdd, "components") === bodyBefore + 1, "components 正文 ### 项应 +1");
    assert(
      docAdd.getIn(["components_images", fmBefore, "name"]) === "新组件",
      "components_images 末项 name 应为 新组件",
    );
    const addedBlk = splitFile(rAdd).body.split("<!--block:components-->")[1].split("\n## ")[0];
    assert(addedBlk.includes("### 新组件"), "正文应追加 ### 新组件");
    assert(/###\s+新组件\s*\n\s*\n\s*新说明/.test(addedBlk), "新项应带 新说明 正文");

    // remove(2)：两处都删第2项，其它项不变
    const fmName2 = docAdd.getIn(["components_images", 2, "name"]); // 电动升降机
    await arrayOp(tmp, "components", "remove", 2);
    const rRm = await readFile(tmp, "utf8");
    const docRm = fmDoc(rRm);
    assert(
      docRm.getIn(["components_images"]).items.length === fmBefore,
      "components_images remove 后应回到原数",
    );
    assert(bodyItemCount(rRm, "components") === bodyBefore, "components 正文 ### 项应回到原数");
    // frontmatter 第2项被删，原第3项前移
    assert(
      docRm.getIn(["components_images", 2, "name"]) !== fmName2,
      "components_images 第2项应已被删除",
    );
    const rmBlk = splitFile(rRm).body.split("<!--block:components-->")[1].split("\n## ")[0];
    assert(!rmBlk.includes(`### ${fmName2}`), `正文应删除 ### ${fmName2}`);
    assert(rmBlk.includes("### 主梁") && rmBlk.includes("### 端梁"), "其它 ### 项应保留");
    assert(
      rmBlk.includes("主梁是起重机的主要承载部分"),
      "未删项的正文内容应原样保留",
    );
  }

  // 4. 任一操作后，frontmatter 其它字段、其它正文块零改动
  {
    const tmp = await fresh("op-untouched.md");
    const r0 = await readFile(tmp, "utf8");
    await arrayOp(tmp, "cases", "add");
    const r1 = await readFile(tmp, "utf8");
    const d0 = fmDoc(r0);
    const d1 = fmDoc(r1);
    // 无关 frontmatter 字段不变
    assert(d1.getIn(["title"]) === d0.getIn(["title"]), "title 不应改动");
    assert(
      d1.getIn(["spec", "capacity"]) === d0.getIn(["spec", "capacity"]),
      "spec.capacity 不应改动",
    );
    assert(
      d1.getIn(["gallery"]).items.length === d0.getIn(["gallery"]).items.length,
      "gallery 不应改动",
    );
    // installation.cases +1
    assert(
      d1.getIn(["installation", "cases"]).items.length ===
        d0.getIn(["installation", "cases"]).items.length + 1,
      "installation.cases 应 +1",
    );
    // 其它正文块零改动
    const blocksOf = (raw) => splitFile(raw).body;
    const b0 = blocksOf(r0);
    const b1 = blocksOf(r1);
    for (const blk of ["overview", "introduction", "components", "crane-types"]) {
      const seg0 = b0.split(`<!--block:${blk}-->`)[1].split("\n## ")[0];
      const seg1 = b1.split(`<!--block:${blk}-->`)[1].split("\n## ")[0];
      assert(seg0 === seg1, `${blk} 正文块不应改动`);
    }
  }

  console.log("✅ arrayOp 自测通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
