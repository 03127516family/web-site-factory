// 构建脚本：把页头 / 正文模版 / 页脚组合进站点外壳，输出自包含的静态站到 dist/。
//
// 当前阶段：正文模版 (src/templates/product.html) 已用「单梁桥式起重机」真实内容
// 作为参考实例填充，构建只做「组合 + 注入」。
//
// 后续「MD 直接生成」的接入点见 fillTemplateFromMarkdown()：读取 src/content/*.md，
// 按 src/templates/FIELD-MAP.md 的映射把 data-field / data-repeat 填充后再走同一套组合。

import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderBodyFromMarkdown } from "./render.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const p = (...s) => join(ROOT, ...s);

// 页面清单：将来一个 MD 一个产品页时，这里按 content 目录展开即可。
export const pages = [
  {
    slug: "products/single-girder-eot-cranes",
    type: "product",
    mode: "render",
    lang: "zh-CN",
    title: "单梁桥式起重机 - DGCRANE",
    description: "单梁桥式起重机制造商与出口商，适用于高速产线，10 年以上出口经验，销往 120 多个国家。",
    template: "src/templates/product.html",
    content: "src/content/single-girder-eot-cranes.md", // 由 MD 驱动填充
  },
  {
    slug: "products/overhead-cranes-for-sale",
    type: "product",
    mode: "render",
    lang: "zh-CN",
    title: "FEM标准桥式起重机（欧式桥式起重机） - DGCRANE",
    description:
      "欧式（FEM标准）桥式起重机制造商与出口商，广泛用于机械制造、石化、港口、电力等行业，技术先进、自重轻、能效高。",
    template: "src/templates/product-superset.html",
    content: "src/content/overhead-cranes-for-sale.md", // 由 MD 驱动填充（超集模版按数据裁剪）
  },
  {
    slug: "products/free-standing-jib-cranes",
    type: "product",
    mode: "render",
    lang: "zh-CN",
    title: "独立式旋臂起重机 - DGCRANE",
    description:
      "独立式（自由站立式）旋臂起重机制造商与出口商，容量高达16吨、臂长高达16米、旋转120-360°，结构轻巧、占地小、易安装，适用于短距离密集作业单元。",
    template: "src/templates/product-superset.html",
    content: "src/content/free-standing-jib-cranes.md", // 超集模版按数据裁剪（仅 6 段正文，其余 data-optional 删除）
  },
  {
    slug: "products/multi-point-suspension-cranes",
    type: "product",
    mode: "render",
    lang: "zh-CN",
    title: "多点悬挂式起重机：适用于大跨度工业车间 - DGCRANE",
    description:
      "多点悬挂式起重机专为大跨度工业车间和仓库（如飞机制造与维修厂）设计，通过多个悬挂点分散载荷，起重 3-40 吨，最大跨度可达 80 米。",
    template: "src/templates/product-superset.html",
    content: "src/content/multi-point-suspension-cranes.md",
  },
  {
    // 第一个 post 页族页（案例文章）。CLAUDE.md §9 / 决策日志 2026-06-29：A 路——每篇一份骨架模版，引擎按 MD 填值。
    slug: "posts/32t-rail-mounted-container-gantry-crane-exported-to-russia",
    type: "post",
    mode: "render",
    lang: "zh-CN",
    title: "32吨轨道式集装箱龙门起重机出口俄罗斯：适用于低温环境 | DGCRANE",
    description:
      "32吨轨道式集装箱龙门起重机出口俄罗斯案例：Q355E耐低温钢、-40℃稳定运行、俄语本地化、全面安全防护与运输保护，提供完整可靠的集装箱搬运解决方案。",
    template: "src/templates/posts/32t-rail-mounted-container-gantry-crane-exported-to-russia.html",
    content: "src/content/32t-rail-mounted-container-gantry-crane-exported-to-russia.md",
  },
  {
    // 第二篇 post——从【裸 MD】烧制（无原页可逆向，版式由 AI 判断；竞品稿已改 DGCRANE + 译中文）。
    slug: "posts/gantry-cranes-for-sale",
    type: "post",
    mode: "render",
    lang: "zh-CN",
    title: "龙门起重机选购指南：价格行情、智能选购与专家建议 | DGCRANE",
    description:
      "龙门起重机选购指南：单梁/双梁/半龙门/便携式价格区间、影响成本的关键因素（设备/特殊设计/运输/安装）及智能选购建议，助你做出明智的采购决策。",
    template: "src/templates/posts/gantry-cranes-for-sale.html",
    content: "src/content/gantry-cranes-for-sale.md",
  },
  {
    // 第三篇 post——从【裸 MD】烧制（起重作业安全培训，标准/列表/图集型长文）。
    slug: "posts/crane-lifting-safety-training",
    type: "post",
    mode: "render",
    lang: "zh-CN",
    title: "起重机操作安全管理：核心标准、危险及风险预防 | DGCRANE",
    description:
      "起重作业安全核心规范：典型事故案例警示、吊钩与钢丝绳使用报废标准、操作员标准化安全操作规程、“十不吊”安全禁令及标准指挥手势，全面防范起重作业安全风险。",
    template: "src/templates/posts/crane-lifting-safety-training.html",
    content: "src/content/crane-lifting-safety-training.md",
  },
];

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
