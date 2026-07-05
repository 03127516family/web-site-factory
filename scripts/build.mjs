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
import { execSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import { renderBodyFromMarkdown } from "./render.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const p = (...s) => join(ROOT, ...s);

// ===== SEO（蓝图 08 章）：全部从登记（=MD frontmatter）同源派生，构建期生成、零运行时 =====
// 生产 base（决策 2026-07-02：中文站走 /zh/ 子路径）。资产绝对 URL 前缀与部署拓扑绑定
// （蓝图 07 章"构建侧配套"）——上线联调若拓扑有变，只改这两个常量。
export const SITE_ROOT = "https://www.dgcrane.com/";
export const SITE_BASE = SITE_ROOT + "zh/";
const ASSET_BASE = "https://www.dgcrane.com/zh";

// ===== 多语言试点（决策㉘ 显式提前；机制=蓝图 12 章） =====
// deployLangs 闸（㉖）：对外语言清单——sitemap/hreflang 只认列内语言。试点期全开以便
// 本地看整链；上线前收回为 ["zh-CN"]（en 对外=整站切换日）；终态此值归 site.config。
const DEPLOY_LANGS = ["zh-CN", "en"];
const OG_LOCALE = { "zh-CN": "zh_CN", en: "en_US", "en-US": "en_US" };
const ogLocale = (lang) => OG_LOCALE[lang] || lang.replace("-", "_");

// 页面绝对 URL：源语言（内容根目录）走 /zh/ base（现行部署拓扑 dist→/zh/）；
// 目标语言 slug 自带 "<lang>/" 前缀（URL 即路径）。M1 拓扑翻转（dist→域名根）时统一。
export const pageUrl = (page) => (page.langDir ? SITE_ROOT + page.slug + "/" : SITE_BASE + page.slug + "/");

const escAttr = (s = "") =>
  String(s).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

// 读整份 frontmatter（seoHead 需要 hero/gallery/body/breadcrumb 等内容字段；
// YAML 坏了就抛——与 validateBlocks 同哲学：不静默降级）。
async function readFrontmatter(mdPath) {
  const raw = await readFile(mdPath, "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  return m ? parseYaml(m[1]) || {} : {};
}

// og:image 的站内路径：product 取 hero 图（回退 gallery 首图），post 取 body.img_hero
// （回退第一个 img_* 槽）。内容没有就没有（返回 null），不硬造。
function ogImagePath(page, fm) {
  if (page.type === "post") {
    const body = fm?.body || {};
    const v =
      body.img_hero || Object.keys(body).filter((k) => k.startsWith("img_")).map((k) => body[k])[0] || null;
    return v ? (String(v).startsWith("/") ? String(v) : "/assets/img/post/" + v) : null;
  }
  const v = fm?.hero?.image || fm?.gallery?.[0]?.image || null;
  return v ? (String(v).startsWith("/") ? String(v) : "/assets/img/product/" + v) : null;
}

// JSON-LD：product→Product、post→Article，均带 BreadcrumbList。
// 面包屑暂两级（首页>当前）——中间分类页尚未迁入，三级会指向死链；B3 后升三级（决策⑭.3）。
function jsonLdFor(page, fm, url, img) {
  const name = fm?.title || page.title;
  const entity =
    page.type === "post"
      ? {
          "@type": "Article",
          headline: name,
          description: page.description,
          inLanguage: page.lang,
          mainEntityOfPage: url,
          ...(img ? { image: img } : {}),
        }
      : {
          "@type": "Product",
          name,
          description: page.description,
          brand: { "@type": "Brand", name: "DGCRANE" },
          ...(img ? { image: img } : {}),
        };
  // 面包屑 JSON-LD 先两级（首页 > 当前页）：中间分类页尚未迁入，trail 中段 URL 会指向死链，
  // 结构化数据不该断言 404（决策⑭.3）。可见面包屑仍出完整 trail（其中段死链是既有问题，随 B3 解）；
  // B3 分类页迁入后，这里改读完整 trail 升三级。首页项取 trail[0]（即 首页/zh/），与可见面包屑同源。
  const trail = Array.isArray(fm?.breadcrumb?.trail) ? fm.breadcrumb.trail : [];
  const home = trail[0] || { label: "首页", url: SITE_BASE };
  const breadcrumb = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: home.label, item: home.url },
      { "@type": "ListItem", position: 2, name: fm?.breadcrumb?.current || name, item: url },
    ],
  };
  return { "@context": "https://schema.org", "@graph": [entity, breadcrumb] };
}

// 每页 SEO head 块（替换 layout 的 {{SEO}}）。meta description 已由 {{DESCRIPTION}} 输出，
// 此处不重复；canonical 每页恰一个。
export function seoHead(page, fm) {
  const url = pageUrl(page);
  const imgPath = ogImagePath(page, fm);
  const img = imgPath ? ASSET_BASE + imgPath : null;
  const ld = JSON.stringify(jsonLdFor(page, fm, url, img)).replaceAll("<", "\\u003c");
  // hreflang 成对生成（12 章 §3.7）：同翻译组、且在 deployLangs 闸内的语言互指；
  // x-default 指源语言页（默认语言 zh）。组内只有自己 → 不输出（单语言页自指是噪音）。
  const siblings = (i18nGroups.get(page.i18nKey) || []).filter((m) => DEPLOY_LANGS.includes(m.lang));
  const hreflang =
    siblings.length > 1
      ? [
          ...siblings.map((m) => `<link rel="alternate" hreflang="${m.lang}" href="${pageUrl(m)}">`),
          `<link rel="alternate" hreflang="x-default" href="${pageUrl(siblings.find((m) => !m.langDir) || siblings[0])}">`,
        ]
      : [];
  const localeAlternates =
    siblings.length > 1
      ? siblings
          .filter((m) => m.lang !== page.lang)
          .map((m) => `<meta property="og:locale:alternate" content="${ogLocale(m.lang)}">`)
      : [];
  return [
    `<link rel="canonical" href="${url}">`,
    ...hreflang,
    `<meta property="og:type" content="${page.type === "post" ? "article" : "product"}">`,
    `<meta property="og:title" content="${escAttr(page.title)}">`,
    `<meta property="og:description" content="${escAttr(page.description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:locale" content="${ogLocale(page.lang)}">`,
    ...localeAlternates,
    ...(img ? [`<meta property="og:image" content="${escAttr(img)}">`] : []),
    `<script type="application/ld+json">${ld}</script>`,
  ].join("\n  ");
}

// sitemap.xml：从同一份登记派生（同源则不漏页）。robots.txt 共存期不生成——
// 域名根归老站管（蓝图 08 §2.3），整站切换后再接管。
export function sitemapXml(entries) {
  const items = entries
    .map((e) => `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}

// lastmod = 该页内容 MD 的最后提交日期；未入库的新内容回退到今天。
function contentLastmod(page) {
  try {
    const out = execSync(`git log -1 --format=%cI -- "${page.content}"`, { cwd: ROOT, encoding: "utf8" }).trim();
    if (out) return out.slice(0, 10);
  } catch {
    /* git 不可用时走回退 */
  }
  return new Date().toISOString().slice(0, 10);
}

// 页面登记 = 扫描 src/content/*.md 的 frontmatter `page:` 块派生（2026-07-03 走查 F1 落地，
// 兑现本行原注释"按 content 目录展开"）。登记即内容：本文件不再手写任何页面元数据，
// 加页 = 加一份 MD。缺登记块/缺必填字段一律抛错中止（原理：改坏不静默）。
async function loadPages() {
  const dir = p("src/content");
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) files.push({ name: entry.name, langDir: null });
    // 语言镜像子目录（12 章 §3.1 镜像树）：src/content/<lang>/<同名文件>.md = 同一逻辑页的
    // 目标语言版，配对键 = 镜像文件名（i18nKey）。raw/ 是裸文章原料目录，不是语言。
    else if (entry.isDirectory() && entry.name !== "raw") {
      for (const sub of await readdir(join(dir, entry.name), { withFileTypes: true })) {
        if (sub.isFile() && sub.name.endsWith(".md"))
          files.push({ name: `${entry.name}/${sub.name}`, langDir: entry.name });
      }
    }
  }
  files.sort((a, b) => (a.name < b.name ? -1 : 1));
  const list = [];
  for (const { name, langDir } of files) {
    const raw = await readFile(join(dir, name), "utf8");
    const matched = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    if (!matched) throw new Error(`src/content/${name}: 缺 frontmatter`);
    const reg = (parseYaml(matched[1]) || {}).page;
    if (!reg) throw new Error(`src/content/${name}: frontmatter 缺 page: 登记块（走查 F1：登记即内容）`);
    for (const key of ["slug", "type", "lang", "title", "description", "template"]) {
      if (!reg[key]) throw new Error(`src/content/${name}: page.${key} 缺失`);
    }
    if (langDir && !reg.slug.startsWith(langDir + "/"))
      throw new Error(`src/content/${name}: 目标语言页 slug 须以 "${langDir}/" 开头（URL 即路径），现为 "${reg.slug}"`);
    list.push({
      ...reg,
      mode: reg.mode || "render",
      content: `src/content/${name}`,
      langDir, // null=源语言（根目录=权威位）；"en" 等=目标语言镜像
      i18nKey: name.split("/").pop().replace(/\.md$/, ""), // 镜像文件名 = 跨语言配对键
    });
  }
  if (list.length === 0) throw new Error("src/content/ 下没有任何已登记页面");
  return list.sort((a, b) => (a.slug < b.slug ? -1 : 1));
}
export const pages = await loadPages();

// 翻译组索引：i18nKey → 该逻辑页的全部语言版本（12 章 §3.1.1 manifest 的最小内核）。
export const i18nGroups = new Map();
for (const pg of pages) {
  const group = i18nGroups.get(pg.i18nKey) || [];
  group.push(pg);
  i18nGroups.set(pg.i18nKey, group);
}

// 组装整页。opts.editMode=true 时：正文走渲染器编辑模式（打 data-md 坐标），并在 </body> 前
// 注入编辑器资源（window.__EDIT__ + editor.css + editor.js）。生产 build 不传 opts，产出干净。
// 只处理 mode==="render" 的页面（template+MD 现算）；是否调用本函数由调用方（build()/edit-server.mjs）按 page.mode 决定。
export async function composePage(page, opts = {}) {
  const layout = await readFile(p("src/layouts/document.html"), "utf8");
  const header = await readFile(p("src/fragments/header.html"), "utf8");
  const footer = await readFile(p("src/fragments/footer.html"), "utf8");
  const inquiryForm = await readFile(p("src/fragments/inquiry-form.html"), "utf8");
  const breadcrumb = await readFile(p("src/fragments/breadcrumb.html"), "utf8");
  const photoswipe = await readFile(p("src/fragments/photoswipe.html"), "utf8");
  let body = await readFile(p(page.template), "utf8");

  // {{BREADCRUMB}} 必须在渲染器之前注入——它自带 data-repeat/data-field，要由引擎按 MD 填值；
  // {{INQUIRY_FORM}}/{{PHOTOSWIPE}} 是静态 chrome 片段（无 marker），渲染器不碰，之后注入即可。
  body = body.replace("{{BREADCRUMB}}", () => breadcrumb);
  if (page.content) {
    body = await renderBodyFromMarkdown(body, p(page.content), { editMode: opts.editMode === true });
  }
  body = body.replace("{{INQUIRY_FORM}}", () => inquiryForm).replace("{{PHOTOSWIPE}}", () => photoswipe);

  const fm = page.content ? await readFrontmatter(p(page.content)) : {};
  let html = layout
    .replaceAll("{{LANG}}", page.lang)
    .replaceAll("{{TITLE}}", page.title)
    .replaceAll("{{DESCRIPTION}}", page.description)
    .replaceAll("{{SEO}}", () => seoHead(page, fm))
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

  const sitemapEntries = [];
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
    // sitemap 只收 deployLangs 闸内语言（㉖：未对外语言可建、可预览、不进 sitemap）
    if (DEPLOY_LANGS.includes(page.lang))
      sitemapEntries.push({ loc: pageUrl(page), lastmod: contentLastmod(page) });
  }

  await writeFile(p("dist", "sitemap.xml"), sitemapXml(sitemapEntries), "utf8");
  console.log("built sitemap.xml", `(${sitemapEntries.length} urls)`);
}

// 仅在直接运行（node scripts/build.mjs）时执行 build；被 edit-server 等 import 时不触发。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
