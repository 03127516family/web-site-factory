// 实时编辑服务：把产品页以「编辑模式」现渲染（带 data-md 写回坐标 + 注入 editor.js），
// 在页面上原位改文字/图片/链接 → POST /api/save → patch 对应 src/content/*.md。
//
// 运行：npm run edit  → http://localhost:8081/
// 生产 build（npm run build）不受影响，编辑器只挂在本服务里。
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { pages, composePage, p } from "./build.mjs";
import { patchMarkdown } from "./md-write.mjs";

const PORT = process.env.EDIT_PORT ? Number(process.env.EDIT_PORT) : 8081;
const PUBLIC = p("public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
};

const send = (res, code, body, type = "text/plain; charset=utf-8") => {
  res.writeHead(code, { "content-type": type });
  res.end(body);
};

const pageBySlug = (slug) => pages.find((pg) => pg.slug === slug);

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 5e6) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

async function serveStatic(res, urlPath) {
  // 仅允许 /assets/** 下的静态资源（防目录穿越）
  const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const file = join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return send(res, 403, "forbidden");
  try {
    const s = await stat(file);
    if (!s.isFile()) return send(res, 404, "not found");
    const buf = await readFile(file);
    send(res, 200, buf, MIME[extname(file).toLowerCase()] || "application/octet-stream");
  } catch {
    send(res, 404, "not found");
  }
}

function indexPage() {
  const editable = pages.filter((pg) => pg.content);
  const items = pages
    .map((pg) => {
      const can = !!pg.content;
      const tag = can ? "" : " （无 MD，暂不可编辑）";
      return can
        ? `<li><a href="/${pg.slug}">${pg.title}</a>${tag}</li>`
        : `<li>${pg.title}${tag}</li>`;
    })
    .join("\n");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>编辑模式 · 页面列表</title>
<style>body{font:16px/1.7 system-ui,sans-serif;max-width:720px;margin:60px auto;padding:0 20px}
h1{font-size:20px}a{color:#036AAE}li{margin:6px 0}</style></head>
<body><h1>✎ 可编辑页面（${editable.length}）</h1><ul>${items}</ul>
<p style="color:#888">打开任意页面即进入编辑模式：点文字直接改、点图片/链接改 URL，自动写回 MD。</p>
</body></html>`;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = decodeURIComponent(url.pathname);

    if (req.method === "POST" && path === "/api/save") {
      const { slug, coord, kind, value } = await readJsonBody(req);
      const page = pageBySlug(slug);
      if (!page || !page.content) return send(res, 400, JSON.stringify({ ok: false, error: "未知或不可编辑的页面" }), MIME[".json"]);
      if (typeof coord !== "string" || typeof value !== "string")
        return send(res, 400, JSON.stringify({ ok: false, error: "参数缺失" }), MIME[".json"]);
      await patchMarkdown(p(page.content), coord, kind, value);
      console.log(`saved ${slug}  ${coord} (${kind})`);
      return send(res, 200, JSON.stringify({ ok: true }), MIME[".json"]);
    }

    if (req.method !== "GET") return send(res, 405, "method not allowed");

    if (path === "/" || path === "/index.html") return send(res, 200, indexPage(), MIME[".html"]);

    if (path.startsWith("/assets/")) return serveStatic(res, path);

    // 产品页：path 去掉前导 / 后即 slug
    const slug = path.replace(/^\/+/, "").replace(/\/index\.html$/, "");
    const page = pageBySlug(slug);
    if (page) {
      if (!page.content) return send(res, 200, `<p>该页无 MD 数据源，暂不可编辑。<a href="/">返回</a></p>`, MIME[".html"]);
      const html = await composePage(page, { editMode: true });
      return send(res, 200, html, MIME[".html"]);
    }

    send(res, 404, `未找到：${path}  <a href="/">返回列表</a>`, MIME[".html"]);
  } catch (err) {
    console.error(err);
    send(res, 500, JSON.stringify({ ok: false, error: String(err.message || err) }), MIME[".json"]);
  }
});

server.listen(PORT, () => {
  console.log(`编辑服务已启动 → http://localhost:${PORT}/`);
  console.log(`可编辑页面：${pages.filter((pg) => pg.content).map((pg) => "/" + pg.slug).join("  ")}`);
});
