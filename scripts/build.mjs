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
// 语言切换器的显示名（站点层语言登记表，同 DEPLOY_LANGS/OG_LOCALE 属 i18n 配置，非内容特判；
// 终态随 site.config 迁出）。未登记语言回退到语言码本身。
const LANG_LABEL = { "zh-CN": "简体中文", en: "English", "en-US": "English" };
const langLabel = (lang) => LANG_LABEL[lang] || lang;

// 发布门禁（U-3，决策 2026-07-07）：build 期间置为「可发布页 slug 集」，供 seoHead 的 hreflang
// 过滤与 sitemap/写盘用；null = 不设限（edit-server 预览 / 测试保持原行为）。渲染层不读它——
// 只 build 决定出不出（过期字段照渲上次英文，此门禁只挡「有从未翻译字段」的目标页）。
let publishableSlugs = null;

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

// 同翻译组、且【在 deployLangs 闸内 且 可发布】的语言版本（含本页自身）。hreflang 与语言切换器
// 同源——都只互指真实存在、已过发布门禁的语言（避免悬空 alternate / 死切换链接）。
// publishableSlugs 未设（预览/测试）时不设限。i18nGroups 定义在后，靠调用时已初始化（非 TDZ）。
export function siblingsOf(page) {
  return (i18nGroups.get(page.i18nKey) || []).filter(
    (m) => DEPLOY_LANGS.includes(m.lang) && (!publishableSlugs || publishableSlugs.has(m.slug)),
  );
}

// 语言切换器 HTML（替换 header/footer fragment 的 {{LANG_SWITCH}} marker）。原 WordPress 残留是
// 写死 34 种语言、全指向旧站 single-girder 页的死链；改为按当前页从 siblingsOf 动态生成：当前语言=
// 禁用 pill，其余真实语言=指向各自 pageUrl 的链接。只 1 种语言 → 只出当前 pill（无别的可切）。
// 结构/类名逐字沿用原 trp-* DOM，故 main.css 的样式与测宽脚本原样生效。
export function langSwitcher(page) {
  const others = siblingsOf(page).filter((m) => m.lang !== page.lang);
  const disabled = (lang) =>
    `<a href="javascript:void(0)" class="trp-ls-shortcode-disabled-language trp-ls-disabled-language" title="${escAttr(langLabel(lang))}">${langLabel(lang)}</a>`;
  const linkTo = (m) =>
    `<a href="${pageUrl(m)}" title="${escAttr(langLabel(m.lang))}">${langLabel(m.lang)}</a>`;
  const list = [disabled(page.lang), ...others.map(linkTo)].join("\n            ");
  return `<div class="trp-language-switcher trp-language-switcher-container" data-no-translation>
    <div class="trp-ls-shortcode-current-language">
        ${disabled(page.lang)}
    </div>
    <div class="trp-ls-shortcode-language">
            ${list}
    </div>
    <script type="application/javascript">
        var trp_ls_shortcodes = document.querySelectorAll('.trp-language-switcher');
        if ( trp_ls_shortcodes.length > 0) {
            var trp_el = trp_ls_shortcodes[trp_ls_shortcodes.length - 1];
            var trp_shortcode_language_item = trp_el.querySelector('.trp-ls-shortcode-language')
            var trp_ls_shortcode_width = trp_shortcode_language_item.offsetWidth + 5;
            trp_shortcode_language_item.style.width = trp_ls_shortcode_width + 'px';
            trp_el.querySelector('.trp-ls-shortcode-current-language').style.width = trp_ls_shortcode_width + 'px';
            trp_shortcode_language_item.style.display = 'none';
        }
    </script>
</div>`;
}

// 每页 SEO head 块（替换 layout 的 {{SEO}}）。meta description 已由 {{DESCRIPTION}} 输出，
// 此处不重复；canonical 每页恰一个。
export function seoHead(page, fm) {
  const url = pageUrl(page);
  const imgPath = ogImagePath(page, fm);
  const img = imgPath ? ASSET_BASE + imgPath : null;
  const ld = JSON.stringify(jsonLdFor(page, fm, url, img)).replaceAll("<", "\\u003c");
  // hreflang 成对生成（12 章 §3.7）：同翻译组、且在 deployLangs 闸内且可发布的语言互指；
  // x-default 指源语言页（默认语言 zh）。组内只有自己 → 不输出（单语言页自指是噪音）。
  // 与语言切换器同源（siblingsOf），保证 hreflang 与可切换语言一致、不出悬空 alternate。
  const siblings = siblingsOf(page);
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

// 从未翻译字段：源有戳、目标 translated_rev 缺或为 0（会显示源占位/结构缺）——区别于「已译但
// 过期」（0<译戳<源戳，仍显示上次英文，可发）。判据同决策⑳、只读两个当前 MD 的戳。
function neverTranslated(sourceRev, translatedRev) {
  return Object.keys(sourceRev).filter((f) => !(translatedRev[f] > 0));
}

// 发布门禁（U-3）：源语言页恒可发；目标语言页仅当【无任何「从未翻译」字段】才可发（过期 stale
// 仍可发=显示上次英文）。孤儿镜像（无源）不发。渲染不参与——只 build 用它决定出不出。
export async function isPublishable(page) {
  if (!page.langDir) return true;
  const source = (i18nGroups.get(page.i18nKey) || []).find((m) => !m.langDir);
  if (!source) return false;
  const sourceRev = (await readFrontmatter(p(source.content))).i18n_rev || {};
  const translatedRev = (await readFrontmatter(p(page.content))).i18n?.translated_rev || {};
  return neverTranslated(sourceRev, translatedRev).length === 0;
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
    .replace("{{FOOTER}}", () => footer)
    // 语言切换器：header/footer 各有一个 {{LANG_SWITCH}} marker，按当前页动态生成（决策 2026-07-08）。
    .replaceAll("{{LANG_SWITCH}}", () => langSwitcher(page));

  if (opts.editMode === true) {
    const inject =
      `<script>window.__EDIT__=${JSON.stringify({ slug: page.slug })};</script>\n` +
      `<link rel="stylesheet" href="/assets/css/editor.css">\n` +
      `<script src="/assets/js/editor.js"></script>\n`;
    html = html.includes("</body>") ? html.replace("</body>", inject + "</body>") : html + inject;
  }
  return html;
}

// —— 派生页（404 / 列表 / 首页）：不走 MD+模版渲染，由「pages 登记」构建期派生（同 sitemap/
// 语言切换器先例：登记即内容，加页自动出现、零维护）。chrome 构建期拼入，产物仍是自包含 HTML。 ——

// 拼 chrome 外壳：layout/header/footer + 语言切换器，正文由调用方给。派生页共用。
async function composeChrome(bodyHtml, { title, description, seo, lang = "zh-CN" }) {
  const layout = await readFile(p("src/layouts/document.html"), "utf8");
  const header = await readFile(p("src/fragments/header.html"), "utf8");
  const footer = await readFile(p("src/fragments/footer.html"), "utf8");
  const page = { slug: "__derived__", lang, i18nKey: "__derived__", langDir: null };
  return layout
    .replaceAll("{{LANG}}", lang)
    .replaceAll("{{TITLE}}", title)
    .replaceAll("{{DESCRIPTION}}", description)
    .replaceAll("{{SEO}}", () => seo || "")
    .replace("{{HEADER}}", () => header)
    .replace("{{BODY}}", () => bodyHtml)
    .replace("{{FOOTER}}", () => footer)
    .replaceAll("{{LANG_SWITCH}}", () => langSwitcher(page));
}

// 404 页：正文极简。写 dist/404.html——静态托管通用约定（S3/CloudFront、GH Pages 都认）。
async function build404() {
  const body = `<div class="wrap" style="max-width:720px;margin:80px auto 120px;padding:0 20px;text-align:center">
  <p style="font-size:110px;font-weight:700;color:#001A4F;margin:0;line-height:1">404</p>
  <h1 style="font-size:24px;color:#001A4F;margin:14px 0 18px">页面未找到</h1>
  <p style="color:#666">您访问的页面不存在或已被移动。</p>
  <p style="margin-top:28px"><a href="/zh/" style="color:#036AAE">返回首页 →</a></p>
</div>`;
  return composeChrome(body, {
    title: "页面未找到 | DGCRANE",
    description: "您访问的页面不存在。",
    seo: `<meta name="robots" content="noindex">`,
  });
}

// 列表卡片：题图取该页 og 图同源（ogImagePath），标题去掉「| DGCRANE」尾巴，描述 CSS 截断。
function cardHtml(page, fm) {
  const img = ogImagePath(page, fm);
  const title = escAttr(page.title.split("|")[0].trim());
  const href = "/" + page.slug + "/";
  return `<a href="${href}" style="display:block;width:270px;text-decoration:none;color:inherit;border:1px solid #e3e7ec;border-radius:4px;overflow:hidden;background:#fff">
  ${img ? `<img src="${img}" alt="${title}" width="270" height="180" style="display:block;width:100%;height:180px;object-fit:cover">` : `<div style="height:180px;background:#f2f5f8"></div>`}
  <div style="padding:12px 14px 16px">
    <p style="margin:0 0 6px;font-size:16px;font-weight:600;color:#001A4F;line-height:1.4">${title}</p>
    <p style="margin:0;font-size:13px;color:#666;line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${escAttr(page.description)}</p>
  </div>
</a>`;
}

function listingSection(heading, cards) {
  return `<section style="margin:0 0 50px">
  <h2 style="font-size:22px;color:#001A4F;border-left:4px solid #036AAE;padding-left:12px;margin:0 0 20px">${heading}</h2>
  <div style="display:flex;flex-wrap:wrap;gap:20px">${cards.join("\n")}</div>
</section>`;
}

// 站内搜索索引：每个可列页一条 {slug,title,description,text}。text = MD 正文去壳成纯文本
// （frontmatter/block 注释/HTML 标签/markdown 记号全剥），截 3000 字。构建期一次生成，
// 搜索页 JS 客户端匹配——访客链路仍只依赖静态文件。
async function buildSearchIndex(listed) {
  const entries = [];
  for (const { pg } of listed) {
    const raw = await readFile(p(pg.content), "utf8");
    const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, "");
    const text = body
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[#>*_`|[\]()-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);
    entries.push({ slug: pg.slug, title: pg.title.split("|")[0].trim(), description: pg.description, text });
  }
  return entries;
}

// 列表页/首页正文（派生自登记：只收源语言、可发布、render 页；en 内容成规模后再出 en 版列表）。
async function buildDerivedPages(publishable) {
  const listed = pages.filter(
    (pg) => !pg.langDir && (pg.mode || "render") === "render" && publishable.has(pg.slug),
  );
  const withFm = [];
  for (const pg of listed) withFm.push({ pg, fm: await readFrontmatter(p(pg.content)) });
  const products = withFm.filter(({ pg }) => pg.type === "product");
  const posts = withFm.filter(({ pg }) => pg.type === "post");
  const wrap = (inner, h1, intro) =>
    `<div class="wrap" style="max-width:1200px;margin:40px auto 80px;padding:0 20px">
  <h1 style="font-size:26px;color:#001A4F;margin:0 0 8px">${h1}</h1>
  <p style="color:#666;margin:0 0 34px">${intro}</p>
  ${inner}
</div>`;
  const seoFor = (path, title, description) =>
    [
      `<link rel="canonical" href="${SITE_BASE}${path}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${escAttr(title)}">`,
      `<meta property="og:description" content="${escAttr(description)}">`,
      `<meta property="og:url" content="${SITE_BASE}${path}">`,
      `<meta property="og:locale" content="${ogLocale("zh-CN")}">`,
    ].join("\n  ");

  const out = [];
  out.push({ path: "search-index.json", loc: null, html: JSON.stringify(await buildSearchIndex(withFm)) });
  if (products.length) {
    const t = "起重机产品目录 | DGCRANE";
    const d = `DGCRANE 起重机产品目录：${products.map(({ pg }) => pg.title.split("|")[0].trim()).join("、")}。`;
    out.push({
      path: "products/index.html", loc: SITE_BASE + "products/",
      html: await composeChrome(
        wrap(listingSection("全部产品", products.map(({ pg, fm }) => cardHtml(pg, fm))), "产品目录", `共 ${products.length} 个产品`),
        { title: t, description: d, seo: seoFor("products/", t, d) },
      ),
    });
  }
  if (posts.length) {
    const t = "案例与文章 | DGCRANE";
    const d = "DGCRANE 起重机案例与技术文章列表。";
    out.push({
      path: "posts/index.html", loc: SITE_BASE + "posts/",
      html: await composeChrome(
        wrap(listingSection("案例与文章", posts.map(({ pg, fm }) => cardHtml(pg, fm))), "案例与文章", `共 ${posts.length} 篇`),
        { title: t, description: d, seo: seoFor("posts/", t, d) },
      ),
    });
  }
  {
    // 站内搜索结果页（noindex，不进 sitemap）：自包含 HTML + 页内 JS 读静态索引，零运行时组装。
    const t = "站内搜索 | DGCRANE";
    const body = `<div class="wrap" style="max-width:900px;margin:40px auto 80px;padding:0 20px">
  <h1 style="font-size:26px;color:#001A4F;margin:0 0 24px">站内搜索</h1>
  <div id="search-results"><p style="color:#666">加载中…</p></div>
</div>
<script>
(function () {
  var q = (new URLSearchParams(location.search).get("s") || "").trim();
  var box = document.getElementById("search-results");
  var input = document.getElementById("s");
  if (input) input.value = q;
  if (!q) { box.innerHTML = '<p style="color:#666">请输入关键词后搜索。</p>'; return; }
  fetch("/search-index.json").then(function (r) { return r.json(); }).then(function (idx) {
    var terms = q.toLowerCase().split(/\\s+/).filter(Boolean);
    var hits = idx.filter(function (e) {
      var hay = (e.title + " " + e.description + " " + e.text).toLowerCase();
      return terms.every(function (t) { return hay.indexOf(t) !== -1; });
    });
    box.textContent = "";
    var head = document.createElement("p");
    head.style.cssText = "color:#666;margin:0 0 20px";
    head.textContent = "“" + q + "” 共 " + hits.length + " 条结果";
    box.appendChild(head);
    hits.forEach(function (e) {
      var item = document.createElement("div");
      item.style.cssText = "margin:0 0 22px";
      var a = document.createElement("a");
      a.href = "/" + e.slug + "/";
      a.style.cssText = "font-size:17px;color:#036AAE;font-weight:600";
      a.textContent = e.title;
      var snip = document.createElement("p");
      snip.style.cssText = "margin:6px 0 0;color:#555;font-size:13px;line-height:1.7";
      var hay = e.text || e.description, pos = hay.toLowerCase().indexOf(terms[0]);
      snip.textContent = pos >= 0 ? (pos > 40 ? "…" : "") + hay.slice(Math.max(0, pos - 40), pos + 90) + "…" : e.description.slice(0, 130);
      item.appendChild(a); item.appendChild(snip); box.appendChild(item);
    });
  }).catch(function () { box.innerHTML = '<p style="color:#c62828">索引加载失败，请刷新重试。</p>'; });
})();
</script>`;
    out.push({
      path: "search/index.html", loc: null,
      html: await composeChrome(body, { title: t, description: "DGCRANE 站内搜索", seo: `<meta name="robots" content="noindex">` }),
    });
  }
  {
    const t = "DGCRANE 起重机——桥式/门式/悬臂起重机制造商";
    const d = "DGCRANE 起重机制造商与出口商：桥式起重机、门式起重机、悬臂起重机与电动葫芦，产品销往120多个国家。";
    const body = wrap(
      [
        products.length ? listingSection(`产品（${products.length}）`, products.map(({ pg, fm }) => cardHtml(pg, fm))) : "",
        posts.length ? listingSection(`案例与文章（${posts.length}）`, posts.map(({ pg, fm }) => cardHtml(pg, fm))) : "",
      ].join("\n"),
      "起重机制造商和出口商",
      "10年以上起重机出口经验 · 产品销往120多个国家",
    );
    out.push({ path: "index.html", loc: SITE_BASE, html: await composeChrome(body, { title: t, description: d, seo: seoFor("", t, d) }) });
  }
  return out;
}

async function build() {
  await rm(p("dist"), { recursive: true, force: true });
  await mkdir(p("dist"), { recursive: true });
  // 把本地化资源整体拷进 dist，使 /assets/... 绝对路径在 dist 作为根目录时可解析。
  // dereference：public/ 内 assets、favicon 已软链到 site/public/（素材真身 2026-08-24 归 site），
  // 拷真身进 dist 保持产物自包含可移植；不跟随会把软链原样带进 dist（绝对路径、换机即断）。
  await cp(p("public"), p("dist"), { recursive: true, dereference: true });

  // 先算发布门禁集（U-3）：render 页且 isPublishable。seoHead 的 hreflang 过滤依赖它，故须在
  // 任何 composePage 之前置好。目标页有「从未翻译」字段 → 不入集 → 不写盘、不进 sitemap/hreflang。
  publishableSlugs = new Set();
  for (const page of pages) {
    if ((page.mode || "render") === "render" && (await isPublishable(page))) publishableSlugs.add(page.slug);
  }

  const sitemapEntries = [];
  for (const page of pages) {
    if ((page.mode || "render") !== "render") {
      console.log("skipped", page.slug, `(${page.mode})`);
      continue;
    }
    if (!publishableSlugs.has(page.slug)) {
      console.log("held", page.slug, "(未完成翻译，发布门禁暂扣)");
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

  // 派生页：首页 + 产品目录 + 案例文章列表 + 搜索页/索引（从登记派生；loc 为 null 的不进 sitemap）
  for (const d of await buildDerivedPages(publishableSlugs)) {
    const out = p("dist", d.path);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, d.html, "utf8");
    console.log("built", d.path, `(${d.html.length} bytes)`);
    if (d.loc) sitemapEntries.push({ loc: d.loc, lastmod: new Date().toISOString().slice(0, 10) });
  }

  await writeFile(p("dist", "sitemap.xml"), sitemapXml(sitemapEntries), "utf8");
  console.log("built sitemap.xml", `(${sitemapEntries.length} urls)`);

  const notFound = await build404();
  await writeFile(p("dist", "404.html"), notFound, "utf8");
  console.log("built 404.html", `(${notFound.length} bytes)`);
}

// 仅在直接运行（node scripts/build.mjs）时执行 build；被 edit-server 等 import 时不触发。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
