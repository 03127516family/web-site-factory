// 几何回归验证：渲染器产出(A) vs 静态模版(B) 在真实 Chrome 里逐元素比包围盒，确认视觉 1:1。
// 一键编排：build → 生成 A/B 全页 → 起本地服务 + 无头 Chrome(CDP) → 测量 → 逐元素 diff → 清理。
//
// 运行：npm run verify:geom   （内部用 node --experimental-websocket 经 CDP 驱动系统 Chrome）
// Chrome 路径默认 macOS；其它平台用环境变量 CHROME 覆盖。
import { readFile, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderBodyFromMarkdown } from "./render.mjs";
import { pages } from "./build.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const p = (...s) => join(ROOT, ...s);
const PORT = 8099;
const CDP = 9456; // 避开常见调试端口（Chrome/Edge 默认 9222）冲突
const TOL = 2; // 像素容差
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const MEASURE = `(()=>{const out=[];for(const el of document.querySelectorAll('[data-block-id]')){const r=el.getBoundingClientRect();out.push({id:el.getAttribute('data-block-id'),x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)});}return JSON.stringify(out);})()`;

// 测量哪些页面：单源自 build.mjs 的登记（2026-07-03 走查 F2 落地——本文件自带的第二份
// 手写注册表已删除）。凡登记里带 page.geomBaseline 的页面进入几何回归；其余页面待
// 基准冻结（"祝圣"流程，06 章）后通过在其 MD 里加 geomBaseline 字段纳入。
// A = 渲染器把 content(MD) 填进 template；B = geomBaseline 原样静态页（ground truth）。
// 注：本文件的 compose() 与 build.mjs::composePage 故意不同——A 面须保留 marker
// 供 [data-block-id] 测量，生产 compose 会剥掉它们；两处的 fragment 注入仍须人工同步（坑账#4）。
const PAGES = pages
  .filter((pg) => pg.geomBaseline)
  .map((pg) => ({
    name: pg.slug.split("/").pop(),
    template: pg.template,
    content: pg.content,
    baseline: pg.geomBaseline,
  }));

function run(cmd, args) {
  return new Promise((res, rej) => {
    const c = spawn(cmd, args, { cwd: ROOT, stdio: "inherit" });
    c.on("exit", (code) => (code === 0 ? res() : rej(new Error(`${cmd} 退出码 ${code}`))));
  });
}

async function compose(bodyHtml) {
  const layout = await readFile(p("src/layouts/document.html"), "utf8");
  const header = await readFile(p("src/fragments/header.html"), "utf8");
  const footer = await readFile(p("src/fragments/footer.html"), "utf8");
  return layout
    .replaceAll("{{LANG}}", "zh-CN")
    .replaceAll("{{TITLE}}", "geom")
    .replaceAll("{{DESCRIPTION}}", "geom")
    .replaceAll("{{SEO}}", "")
    .replace("{{HEADER}}", () => header)
    .replace("{{BODY}}", () => bodyHtml)
    .replace("{{FOOTER}}", () => footer);
}

async function waitFor(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error("等待超时: " + url);
}

// ---- 一个极简 CDP 客户端 ----
async function cdpConnect() {
  const list = await (await fetch(`http://localhost:${CDP}/json`)).json();
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
    if (m.method)
      for (const w of waiters.slice())
        if (w.method === m.method) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(m);
        }
  });
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const once = (method) => new Promise((resolve) => waiters.push({ method, resolve }));
  await send("Page.enable");
  await send("Runtime.enable");
  return {
    async measure(url) {
      const dcl = once("Page.domContentEventFired");
      await send("Page.navigate", { url });
      await dcl;
      await new Promise((r) => setTimeout(r, 400));
      const res = await send("Runtime.evaluate", { expression: MEASURE, returnByValue: true });
      return JSON.parse(res.result.result.value);
    },
    close: () => ws.close(),
  };
}

function diff(A, B) {
  const mapA = new Map(A.map((e) => [e.id, e]));
  const mapB = new Map(B.map((e) => [e.id, e]));
  const onlyA = [...mapA.keys()].filter((k) => !mapB.has(k));
  const onlyB = [...mapB.keys()].filter((k) => !mapA.has(k));
  const diffs = [];
  for (const [id, a] of mapA) {
    const b = mapB.get(id);
    if (!b) continue;
    const d = { x: a.x - b.x, y: a.y - b.y, w: a.w - b.w, h: a.h - b.h };
    if (Object.values(d).some((v) => Math.abs(v) > TOL)) diffs.push({ id, a, b, d });
  }
  return { onlyA, onlyB, diffs, count: A.length };
}

async function main() {
  await run("node", ["scripts/build.mjs"]); // 确保 dist + /assets 就绪

  // 生成每页的 A(渲染器)/B(静态模版) 到 dist 根，让 /assets 绝对路径可解析
  for (const pg of PAGES) {
    let tpl = await readFile(p(pg.template), "utf8");
    let tplB = await readFile(p(pg.baseline || pg.template), "utf8");
    const breadcrumb = await readFile(p("src/fragments/breadcrumb.html"), "utf8");
    // {{BREADCRUMB}} 须在渲染前注入 A 面模版（自带 marker 由引擎填值）。B 面同步注入（镜像
    // INQUIRY_FORM）：原站静态基准（overhead）无此 marker → 无害空操作、保留内联真实面包屑；
    // 若基准恰是带 marker 的模版本身（single-girder 的 product.html）→ 注入片段，避免 B 面残留字面量。
    tpl = tpl.replace("{{BREADCRUMB}}", () => breadcrumb);
    tplB = tplB.replace("{{BREADCRUMB}}", () => breadcrumb);
    let bodyA = await renderBodyFromMarkdown(tpl, p(pg.content));
    const inquiryForm = await readFile(p("src/fragments/inquiry-form.html"), "utf8");
    // 与 build.mjs::composePage 同步：无 baseline 时 tplB === tpl 本身也带 marker；有 baseline（原站静态页）则本来就没有 marker，replace 是无害空操作。
    bodyA = bodyA.replace("{{INQUIRY_FORM}}", () => inquiryForm);
    tplB = tplB.replace("{{INQUIRY_FORM}}", () => inquiryForm);
    await writeFile(p(`dist/_geomA_${pg.name}.html`), await compose(bodyA), "utf8");
    await writeFile(p(`dist/_geomB_${pg.name}.html`), await compose(tplB), "utf8");
  }

  const server = spawn("python3", ["-m", "http.server", "--directory", p("dist"), String(PORT)], {
    stdio: "ignore",
  });
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      `--remote-debugging-port=${CDP}`,
      "--user-data-dir=/tmp/verify-geom-profile",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let failed = 0;
  try {
    await waitFor(`http://localhost:${PORT}/`);
    await waitFor(`http://localhost:${CDP}/json/version`);
    const cdp = await cdpConnect();
    for (const pg of PAGES) {
      const A = await cdp.measure(`http://localhost:${PORT}/_geomA_${pg.name}.html`);
      const B = await cdp.measure(`http://localhost:${PORT}/_geomB_${pg.name}.html`);
      const r = diff(A, B);
      console.log(`\n[${pg.name}] 元素 A=${A.length} B=${B.length}  容差 ±${TOL}px`);
      console.log(`  仅A: ${r.onlyA.join(", ") || "无"} | 仅B: ${r.onlyB.join(", ") || "无"}`);
      if (r.diffs.length === 0 && !r.onlyA.length && !r.onlyB.length) {
        console.log("  ✅ 几何全对齐：渲染器产出与静态模版逐元素一致（视觉 1:1）");
      } else {
        failed++;
        console.log(`  ❌ 超容差差异 ${r.diffs.length} 处：`);
        for (const f of r.diffs)
          console.log(`     ${f.id}  Δx=${f.d.x} Δy=${f.d.y} Δw=${f.d.w} Δh=${f.d.h}`);
      }
    }
    cdp.close();
  } finally {
    server.kill();
    chrome.kill();
    for (const pg of PAGES) {
      await rm(p(`dist/_geomA_${pg.name}.html`), { force: true });
      await rm(p(`dist/_geomB_${pg.name}.html`), { force: true });
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
