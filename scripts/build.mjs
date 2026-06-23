// 构建脚本：把页头 / 正文模版 / 页脚组合进站点外壳，输出自包含的静态站到 dist/。
//
// 当前阶段：正文模版 (src/templates/product.html) 已用「单梁桥式起重机」真实内容
// 作为参考实例填充，构建只做「组合 + 注入」。
//
// 后续「MD 直接生成」的接入点见 fillTemplateFromMarkdown()：读取 src/content/*.md，
// 按 src/templates/FIELD-MAP.md 的映射把 data-field / data-repeat 填充后再走同一套组合。

import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const p = (...s) => join(ROOT, ...s);

// 页面清单：将来一个 MD 一个产品页时，这里按 content 目录展开即可。
const pages = [
  {
    slug: "products/single-girder-eot-cranes",
    lang: "zh-CN",
    title: "单梁桥式起重机 - DGCRANE",
    description: "单梁桥式起重机制造商与出口商，适用于高速产线，10 年以上出口经验，销往 120 多个国家。",
    template: "src/templates/product-superset.html",
    // content: 'src/content/single-girder-eot-cranes.md', // 启用后由 MD 驱动填充
  },
  {
    slug: "products/overhead-cranes-for-sale",
    lang: "zh-CN",
    title: "FEM标准桥式起重机（欧式桥式起重机） - DGCRANE",
    description:
      "欧式（FEM标准）桥式起重机制造商与出口商，广泛用于机械制造、石化、港口、电力等行业，技术先进、自重轻、能效高。",
    template: "src/templates/overhead-cranes-for-sale.html",
  },
];

async function composePage(page) {
  const layout = await readFile(p("src/layouts/document.html"), "utf8");
  const header = await readFile(p("src/fragments/header.html"), "utf8");
  const footer = await readFile(p("src/fragments/footer.html"), "utf8");
  let body = await readFile(p(page.template), "utf8");

  if (page.content) {
    body = await fillTemplateFromMarkdown(body, p(page.content));
  }

  return layout
    .replaceAll("{{LANG}}", page.lang)
    .replaceAll("{{TITLE}}", page.title)
    .replaceAll("{{DESCRIPTION}}", page.description)
    .replaceAll("{{SEO}}", "")
    .replace("{{HEADER}}", () => header)
    .replace("{{BODY}}", () => body)
    .replace("{{FOOTER}}", () => footer);
}

// 占位：将来按 FIELD-MAP 把 MD 的 frontmatter / 正文填进 data-field / data-repeat。
async function fillTemplateFromMarkdown(template /*, mdPath */) {
  return template; // TODO: 实现 MD → data-field 注入
}

async function build() {
  await rm(p("dist"), { recursive: true, force: true });
  await mkdir(p("dist"), { recursive: true });
  // 把本地化资源整体拷进 dist，使 /assets/... 绝对路径在 dist 作为根目录时可解析。
  await cp(p("public"), p("dist"), { recursive: true });

  for (const page of pages) {
    const html = await composePage(page);
    const out = p("dist", page.slug, "index.html");
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, html, "utf8");
    console.log("built", page.slug + "/index.html", `(${html.length} bytes)`);
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
