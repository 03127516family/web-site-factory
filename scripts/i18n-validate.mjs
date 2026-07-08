// U-1(a) 可翻译名册校验器：源页手埋的 i18n_rev 是否 ≡ 从模版推导的可翻译集合（防漂移门禁）。
// 推导 = {模版 editMode DOM 里 data-edit∈{text,rich} 的坐标 → coordToField} ∪ SEO白名单 − 结构性排除。
//   · image/link 天然不可译——kind 由 render.mjs 按【标签+内容形态】判（<img>→image、<a…url>→link），
//     非字段名白名单，符合 §2.1（引擎不认字段名）。
//   · SEO白名单：page.title/description 可译但不是 DOM 节点（进 <head>），补进集合。
//   · 结构性排除：breadcrumb.trail 逐镜像手写、分语言结构（label 虽是 text 也不走戳），排除。
// 决策 2026-07-07「先校验、后推导」：现阶段名册仍手埋，本校验器抓漂移（误加 image 字段 / 漏加
// 新 text 段）；证稳后可切全自动推导。不一致即退出码 1，挂进 npm run check。
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parse as parseHtml } from "node-html-parser";
import { pages, p } from "./build.mjs";
import { renderBodyFromString } from "./render.mjs";
import { parseDoc, coordToField } from "./i18n-touch.mjs";

// ── 站点层字段策略（U-1，未来落 site.config）────────────────────────────
const SEO_ALLOWLIST = ["page.title", "page.description"];
const STRUCTURAL_EXCLUDE = ["breadcrumb.trail"];
const isExcluded = (field) => STRUCTURAL_EXCLUDE.some((pre) => field === pre || field.startsWith(pre + "."));

// 从模版 editMode DOM 推导某源页的可翻译字段集合（面包屑须注入才被采，同 edit-probe）。
async function derive(page, breadcrumb) {
  let tmpl = await readFile(p(page.template), "utf8");
  if (tmpl.includes("{{BREADCRUMB}}")) tmpl = tmpl.replace("{{BREADCRUMB}}", () => breadcrumb);
  const raw = await readFile(p(page.content), "utf8");
  const root = parseHtml(renderBodyFromString(tmpl, raw, { editMode: true }, page.content));
  const set = new Set();
  for (const el of root.querySelectorAll("[data-md]")) {
    const kind = el.getAttribute("data-edit");
    if (kind !== "text" && kind !== "rich" && kind != null) continue; // image/link 排除
    const field = coordToField(el.getAttribute("data-md"));
    if (isExcluded(field)) continue;
    set.add(field);
  }
  SEO_ALLOWLIST.forEach((f) => set.add(f));
  const roster = new Set(Object.keys(parseDoc(raw).fm.i18n_rev || {}));
  return { set, roster };
}

// 校验所有【已启用 i18n（有 i18n_rev）的源页】。返回 [{slug, missing, extra}]（有出入的页）。
export async function validateRosters() {
  const breadcrumb = await readFile(p("src/fragments/breadcrumb.html"), "utf8");
  const out = [];
  for (const page of pages) {
    if (page.langDir || (page.mode || "render") !== "render" || !page.content) continue;
    const { set, roster } = await derive(page, breadcrumb);
    if (!roster.size) continue; // 未启用 i18n，跳过
    const missing = [...set].filter((f) => !roster.has(f)); // 推导有、名册漏（新 text 段忘登记）
    const extra = [...roster].filter((f) => !set.has(f)); // 名册有、推导无（误登记不可译字段/改名）
    if (missing.length || extra.length) out.push({ slug: page.slug, missing, extra });
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bad = await validateRosters();
  if (!bad.length) {
    console.log("✓ i18n_rev 名册校验通过：所有已启用页的名册 ≡ 推导可翻译集合");
  } else {
    console.error(`✗ i18n_rev 名册漂移：${bad.length} 个页面`);
    for (const b of bad) {
      if (b.missing.length) console.error(`  ${b.slug} 名册漏登记（推导有）：${b.missing.join(", ")}`);
      if (b.extra.length) console.error(`  ${b.slug} 名册多登记（推导无/不可译）：${b.extra.join(", ")}`);
    }
    process.exit(1);
  }
}
