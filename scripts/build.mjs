// 构建脚本：把页头 / 正文模版 / 页脚组合进站点外壳，输出自包含的静态站到 dist/。
//
// 当前阶段：正文模版 (src/templates/product.html) 已用「单梁桥式起重机」真实内容
// 作为参考实例填充，构建只做「组合 + 注入」。
//
// 后续「MD 直接生成」的接入点见 fillTemplateFromMarkdown()：读取 src/content/*.md，
// 按 src/templates/FIELD-MAP.md 的映射把 data-field / data-repeat 填充后再走同一套组合。

import { readFile, writeFile, mkdir, cp, rm, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { renderBodyFromMarkdown } from "./render.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const p = (...s) => join(ROOT, ...s);

// 页面登记 = 扫描 src/content/*.md 的 frontmatter `page:` 块派生（2026-07-03 走查 F1 落地，
// 兑现本行原注释"按 content 目录展开"）。登记即内容：本文件不再手写任何页面元数据，
// 加页 = 加一份 MD。缺登记块/缺必填字段一律抛错中止（原理：改坏不静默）。
async function loadPages() {
  const dir = p("src/content");
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
  const list = [];
  for (const name of files) {
    const raw = await readFile(join(dir, name), "utf8");
    const matched = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    if (!matched) throw new Error(`src/content/${name}: 缺 frontmatter`);
    const reg = (parseYaml(matched[1]) || {}).page;
    if (!reg) throw new Error(`src/content/${name}: frontmatter 缺 page: 登记块（走查 F1：登记即内容）`);
    for (const key of ["slug", "type", "lang", "title", "description", "template"]) {
      if (!reg[key]) throw new Error(`src/content/${name}: page.${key} 缺失`);
    }
    list.push({ ...reg, mode: reg.mode || "render", content: `src/content/${name}` });
  }
  if (list.length === 0) throw new Error("src/content/ 下没有任何已登记页面");
  return list.sort((a, b) => (a.slug < b.slug ? -1 : 1));
}
export const pages = await loadPages();

// 组装整页。opts.editMode=true 时：正文走渲染器编辑模式（打 data-md 坐标），并在 </body> 前
// 注入编辑器资源（window.__EDIT__ + editor.css + editor.js）。生产 build 不传 opts，产出干净。
// 只处理 mode==="render" 的页面（template+MD 现算）；是否调用本函数由调用方（build()/edit-server.mjs）按 page.mode 决定。
export async function composePage(page, opts = {}) {
  const layout = await readFile(p("src/layouts/document.html"), "utf8");
  const header = await readFile(p("src/fragments/header.html"), "utf8");
  const footer = await readFile(p("src/fragments/footer.html"), "utf8");
  const inquiryForm = await readFile(p("src/fragments/inquiry-form.html"), "utf8");
  let body = await readFile(p(page.template), "utf8");

  if (page.content) {
    body = await renderBodyFromMarkdown(body, p(page.content), { editMode: opts.editMode === true });
  }
  body = body.replace("{{INQUIRY_FORM}}", () => inquiryForm);

  let html = layout
    .replaceAll("{{LANG}}", page.lang)
    .replaceAll("{{TITLE}}", page.title)
    .replaceAll("{{DESCRIPTION}}", page.description)
    .replaceAll("{{SEO}}", "")
    .replace("{{HEADER}}", () => header)
    .replace("{{BODY}}", () => body)
    .replace("{{FOOTER}}", () => footer);

  if (opts.editMode === true) {
    const inject =
      `<script>window.__EDIT__=${JSON.stringify({ slug: page.slug })};</script>\n` +
      `<link rel="stylesheet" href="/assets/css/editor.css">\n` +
      `<script src="/assets/js/editor.js"></script>\n`;
    html = html.includes("</body>") ? html.replace("</body>", inject + "</body>") : html + inject;
  }
  return html;
}

async function build() {
  await rm(p("dist"), { recursive: true, force: true });
  await mkdir(p("dist"), { recursive: true });
  // 把本地化资源整体拷进 dist，使 /assets/... 绝对路径在 dist 作为根目录时可解析。
  await cp(p("public"), p("dist"), { recursive: true });

  for (const page of pages) {
    if ((page.mode || "render") !== "render") {
      console.log("skipped", page.slug, `(${page.mode})`);
      continue;
    }
    const html = await composePage(page);
    const out = p("dist", page.slug, "index.html");
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, html, "utf8");
    console.log("built", page.slug + "/index.html", `(${html.length} bytes)`);
  }
}

// 仅在直接运行（node scripts/build.mjs）时执行 build；被 edit-server 等 import 时不触发。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
