// 极简静态文件服务——替代 `python3 -m http.server`，去掉系统 Python 依赖（phase 1 缺口）。
// 仅本地 build 预览（npm run serve）与几何回归（verify:geom）用；非生产组件、无需鲁棒性优化。
// dist 以自身为根目录，页面里 /assets/... 是绝对路径，故本服务从 root 直接按 URL 路径取文件。
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve, normalize, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { bindHost, accessUrls } from "./lan.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

// 起服务，resolve 到「已在监听」的 server（await 后即可请求，无需再轮询）。调用方负责 server.close()。
// host 默认 0.0.0.0（本机 + 局域网均可访问）；HOST=127.0.0.1 可缩回仅本机。
export function startServer(dir, port, host = bindHost("0.0.0.0")) {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    try {
      let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      // 生产拓扑 dist→/zh/（决策 2026-07-02）：本地把 /zh/ 前缀剥掉映射到 dist 根，
      // 使站内 /zh/... 链接（logo、返回首页等）本地行为与生产一致。
      if (urlPath === "/zh" || urlPath.startsWith("/zh/")) urlPath = urlPath.slice(3) || "/";
      let filePath = normalize(join(root, urlPath));
      // 防目录穿越：拼接归一化后须仍在 root 内（等于 root 或以 root+分隔符 开头）。
      if (filePath !== root && !filePath.startsWith(root + sep)) {
        res.writeHead(403).end("403");
        return;
      }
      let st = await stat(filePath).catch(() => null);
      if (st && st.isDirectory()) {
        filePath = join(filePath, "index.html");
        st = await stat(filePath).catch(() => null);
      }
      if (!st || !st.isFile()) {
        // 静态托管通用约定：未命中 → 返回 root/404.html（状态码仍是 404）。没有就纯文本兜底。
        const nf = join(root, "404.html");
        const nfSt = await stat(nf).catch(() => null);
        if (nfSt && nfSt.isFile()) {
          res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Content-Length": nfSt.size });
          createReadStream(nf).pipe(res);
        } else {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 Not Found");
        }
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[extname(filePath).toLowerCase()] || "application/octet-stream",
        "Content-Length": st.size,
      });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(500).end("500");
    }
  });
  return new Promise((res) => server.listen(port, host, () => res(server)));
}

// CLI：node scripts/static-server.mjs [dir=dist] [port=8080] [host=HOST|0.0.0.0]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir = "dist", port = "8080", hostArg] = process.argv.slice(2);
  const host = hostArg || bindHost("0.0.0.0");
  await startServer(dir, Number(port), host);
  console.log(`静态服务 → ${accessUrls(Number(port), "/", host).join("  ")}  （根目录：${resolve(dir)}，监听：${host}）`);
}
