// 站点工作台 · 数据层（转正版 design/admin-ui → site/workbench）。
// 读=正源直算（import site/src 模块，口径与 8092 恒一致——Task 2 重写）；
// 写=全部代理 8092（单一写路径+其内部串行构建链）。8092 健康探测并入 overview。
import http from "node:http";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { bindHost, accessUrls } from "../scripts/lan.mjs";
import { scanPages, buildGroups, isPublishable } from "../src/i18n/kernel.mjs";
import { loadTm, loadConfig } from "../src/i18n/tm.mjs";
import { loadTerms } from "../src/i18n/terms.mjs";
import { consoleData, pinQueue } from "../src/i18n/pipeline.mjs";
import { healthData } from "../src/seo/kernel.mjs";
import { readWorkspace } from "../src/draft/store.mjs";

const HERE = dirnameOfThis();
function dirnameOfThis() {
  const u = new URL(".", import.meta.url);
  return fileURLToPath(u);
}
const SITE = resolve(HERE, "..");                  // site 根（正源模块以 process.cwd() 为基，启动器保证 cwd=site）
const CONTENT = join(SITE, "content");
const DIST = join(SITE, "dist");
const IMG = join(SITE, "public", "assets", "img");
const EVENTS = join(SITE, ".i18n-events.jsonl");
const INBOX = join(SITE, "..", "app", "mock-cloud", "inbox.jsonl");
const PORT = Number(process.env.WORKBENCH_PORT || 8090);
const HOST = bindHost("0.0.0.0");

const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));
const readJsonSafe = (f) => (existsSync(f) ? readJson(f) : null);

// ---------- 页面清单（正源）：scanPages 全语言 + 门禁口径（与 8092 出页同一条规则） ----------
function pagesData() {
  const pages = scanPages({ withJson: true });
  const groups = buildGroups(pages);
  const pubSet = new Set(pages.filter(p => p.status === "published" && isPublishable(p, groups, pages)).map(p => p.slug));
  return pages.map(p => {
    const fam = (groups.get(p.pageId) || []).filter(m => pubSet.has(m.slug));
    return {
      pageId: p.pageId,
      type: p.type === "product" ? "products" : "posts",
      file: p.file, slug: p.slug,
      title: typeof p.j.title === "string" ? p.j.title : (p.j.page.title || p.pageId),
      family: p.j.page.family || "",
      status: p.status, lang: p.lang, langDir: p.langDir,
      langs: fam.map(m => m.lang),
      publishable: pubSet.has(p.slug),
      mtime: statSync(join(SITE, "content", p.file)).mtimeMs,
    };
  });
}

function distFacts() {
  const count = (d) => {
    if (!existsSync(d)) return 0;
    let n = 0;
    const walk = (p) => {
      for (const e of readdirSync(p, { withFileTypes: true })) {
        const fp = join(p, e.name);
        if (e.isDirectory()) walk(fp);
        else if (e.name === "index.html") n++;
      }
    };
    walk(d);
    return n;
  };
  let zh = 0, en = 0;
  if (existsSync(join(DIST, "products"))) zh += count(join(DIST, "products"));
  if (existsSync(join(DIST, "posts"))) zh += count(join(DIST, "posts"));
  if (existsSync(join(DIST, "en"))) en = count(join(DIST, "en"));
  let builtAt = 0;
  if (existsSync(DIST)) builtAt = statSync(DIST).mtimeMs;
  return { zh, en, total: zh + en, builtAt };
}

function mediaList() {
  if (!existsSync(IMG)) return [];
  const out = [];
  const walk = (p) => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const fp = join(p, e.name);
      if (e.isDirectory()) walk(fp);
      else if (/\.(jpe?g|png|webp|gif|svg)$/i.test(e.name)) {
        const st = statSync(fp);
        out.push({ name: e.name, path: fp.slice(IMG.length + 1), size: st.size, mtime: st.mtimeMs });
      }
    }
  };
  walk(IMG);
  return out;
}

// 使用中判定：内容 JSON 里出现过该图片路径（zh + en 全扫）
function usedMedia(items) {
  const used = new Set();
  const dirs = [[CONTENT, "products"], [CONTENT, "posts"], [CONTENT, "en", "posts"], [CONTENT, "en", "products"]]
    .map(([a, b]) => join(a, b)).filter(existsSync);
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json") || name.endsWith(".bak")) continue;
      let blob = "";
      try { blob = readFileSync(join(dir, name), "utf8"); } catch { continue; }
      for (const f of items) if (blob.includes(f.path)) used.add(f.path);
    }
  }
  return [...used];
}

function recentEvents(n = 6) {
  if (!existsSync(EVENTS)) return [];
  const lines = readFileSync(EVENTS, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-n).reverse().map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

// 内容字符串坐标收集（搜索/引用判定共用：路径 + 值）
function collectStrings(j) {
  const out = [];
  const walk = (node, path) => {
    if (node && typeof node === "object" && !Array.isArray(node)) {
      if (node.type === "text" && typeof node.text === "string") { out.push([path, node.text]); return; }
      for (const k of Object.keys(node)) {
        if (path === "" && /^i18n(_rev|_fp|$)/.test(k)) continue; // 戳/指纹不进搜索
        walk(node[k], path ? path + "." + k : k);
      }
    } else if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, path + "[" + i + "]"));
    } else if (typeof node === "string" && node.length >= 2) {
      out.push([path, node]);
    }
  };
  walk(j, "");
  return out;
}

function searchContent(q) {
  const ql = q.toLowerCase();
  const pages = [];
  for (const [dir, lang] of [[join(CONTENT, "products"), "zh-CN"], [join(CONTENT, "posts"), "zh-CN"], [join(CONTENT, "en", "posts"), "en"], [join(CONTENT, "en", "products"), "en"]]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json") || name.endsWith(".bak")) continue;
      let j; try { j = readJson(join(dir, name)); } catch { continue; }
      const page = j.page || {};
      const title = typeof j.title === "string" ? j.title : (page.title || "");
      const slug = page.slug || name.replace(/\.json$/, "");
      const hits = [];
      if (title.toLowerCase().includes(ql)) hits.push({ field: "title", snippet: title });
      if (slug.toLowerCase().includes(ql)) hits.push({ field: "slug", snippet: slug });
      for (const [path, value] of collectStrings(j)) {
        const i = value.toLowerCase().indexOf(ql);
        if (i >= 0 && hits.length < 3) {
          const s = Math.max(0, i - 24), e = Math.min(value.length, i + ql.length + 40);
          hits.push({ field: path.replace(/^\./, ""), snippet: (s > 0 ? "…" : "") + value.slice(s, e) + (e < value.length ? "…" : "") });
        }
      }
      if (hits.length) pages.push({ pageId: name.replace(/\.json$/, ""), title, slug, lang, hits: hits.slice(0, 3) });
      if (pages.length >= 8) return pages;
    }
  }
  return pages;
}

// ---- 8092 代理层：写回动作全部走编辑服务（单一写路径 + 其内部重建串行链）----
const E8092 = "http://localhost:8092";
async function proxy8092(method, path, bodyObj, timeoutMs = 600000) {
  try {
    const r = await fetch(E8092 + path, {
      method,
      headers: bodyObj !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { error: text.slice(0, 300) }; }
    return { status: r.status, json };
  } catch (e) {
    return { status: 502, json: { error: "8092 编辑服务未启动或超时：" + (e.message || e) } };
  }
}
const POST_PROXY = {
  "/api/mirror": "/__mirror",
  "/api/burn": "/__burn",
  "/api/burn-save": "/__burn-save",
  "/api/approve": "/__i18n/approve",
  "/api/translate": "/__i18n/translate",
  "/api/translate-all": "/__i18n/translate-all",
  "/api/config-save": "/__i18n/config",
  "/api/terms-save": "/__i18n/terms",
  "/api/build": "/__build",
  "/api/tm-save": "/__i18n/tm",
  "/api/pin-decide": "/__i18n/pin-decide",
};

// 模版套件扫描（一 astro 一模版：index.astro + meta.json + example.json 三件套齐全 = 可烧制）
function scanKits() {
  const out = [];
  for (const fam of ["products", "posts"]) {
    const dir = join(SITE, "src", "components", fam);
    if (!existsSync(dir)) continue;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const kd = join(dir, e.name);
      const complete = existsSync(join(kd, "index.astro")) && existsSync(join(kd, "meta.json")) && existsSync(join(kd, "example.json"));
      out.push({ family: fam, name: e.name, title: e.name, complete });
    }
  }
  return out;
}

function inboxList() {
  if (!existsSync(INBOX)) return [];
  return readFileSync(INBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// ---------- API ----------
const api = {
  "/api/overview": () => {
    const pages = pagesData();
    const tm = loadTm("zh-CN", "en");
    const terms = loadTerms("zh-CN", "en");
    const sources = pages.filter(p => !p.langDir);
    const withMirror = sources.filter(p => pages.some(m => m.langDir && m.pageId === p.pageId));
    const enOf = pid => pages.find(m => m.langDir && m.pageId === pid);
    return {
      pages: sources.length,
      published: sources.filter(p => p.status === "published").length,
      draft: sources.filter(p => p.status === "draft").length,
      products: sources.filter(p => p.type === "products").length,
      posts: sources.filter(p => p.type === "posts").length,
      mirrors: withMirror.map(m => ({ pageId: m.pageId, title: m.title, status: m.status, enStatus: enOf(m.pageId)?.status ?? null })),
      mirrorless: sources.filter(p => !pages.some(m => m.langDir && m.pageId === p.pageId)).length,
      tmTotal: Object.keys(tm.sentences).length,
      tmApproved: Object.values(tm.sentences).filter(s => s.status === "approved").length,
      termsMap: Object.keys(terms.map || {}).length,
      termsLock: (terms.lock || []).length,
      dist: distFacts(),
      editAlive,
      events: recentEvents(5),
    };
  },
  "/api/pages": () => pagesData(),
  "/api/terms": () => {
    const t = loadTerms("zh-CN", "en");
    return { lock: t.lock || [], map: Object.entries(t.map || {}).map(([zh, en]) => ({ zh, en })) };
  },
  "/api/tm": () => {
    const tm = loadTm("zh-CN", "en");
    const items = Object.values(tm.sentences).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    return { pair: tm.pair, total: items.length, items: items.slice(0, 300) };
  },
  "/api/config": () => loadConfig(),
  "/api/templates": () => scanKits(),
  "/api/seo-health": () => {
    const rows = healthData(scanPages({ withJson: true }));
    const pins = Object.keys(loadConfig().review).flatMap(l => pinQueue(l));
    return { ok: true, rows, pins, summary: { pages: rows.length, flagged: rows.filter(r => r.issues.length).length, pinsPending: pins.length } };
  },
  "/api/media": () => {
    const items = mediaList().sort((a, b) => b.mtime - a.mtime);
    return { total: 0, items, used: usedMedia(items) };
  },
  "/api/search": (q) => searchContent(q || ""),
  "/api/inbox": () => inboxList(),
};

// ---------- 静态服务 ----------
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};

// 编辑服务(8092)健康探测：每 5 秒 ping 一次，结果并入 /api/overview.editAlive
let editAlive = false;
const pingEdit = async () => {
  try {
    const r = await fetch("http://localhost:8092/products/single-girder-eot-cranes/", { signal: AbortSignal.timeout(1200) });
    editAlive = r.ok;
  } catch { editAlive = false; }
};
pingEdit();
setInterval(pingEdit, 5000);

const server = http.createServer(async (req, res) => {
  const [urlPath, queryString] = decodeURIComponent(req.url || "/").split("?");
  if (req.method === "POST" && urlPath === "/api/seo-save") {
    // SEO 字段写回（体检屏展开行）：组装 changes 协议 + 现取 workspace revision，代理 8092 /__save。
    // targetId page.title/page.description 已注册进两族 edit-contract（写回校验/重建/翻译联动全复用 /__save 链）。
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let payload;
      try { payload = JSON.parse(body || "{}"); } catch { payload = {}; }
      const { slug, title, description } = payload;
      if (typeof slug !== "string" || !/^[\w/-]+$/.test(slug) || slug.includes("..")) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "slug 非法" }));
        return;
      }
      const changes = [];
      if (typeof title === "string") changes.push({ targetId: "page.title", value: title });
      if (typeof description === "string") changes.push({ targetId: "page.description", value: description });
      if (!changes.length) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "title/description 至少给一个" }));
        return;
      }
      let ws;
      try { ws = readWorkspace(SITE, slug); } catch (e) {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: `页面不存在或无工作区: ${e.message}` }));
        return;
      }
      const { status, json } = await proxy8092("POST", "/__save", {
        slug, intent: "publish",
        revision: ws.workingRevision, publishedRevision: ws.publishedRevision,
        changes,
      });
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(json));
    });
    return;
  }
  if (req.method === "POST" && urlPath in POST_PROXY) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let payload;
      try { payload = JSON.parse(body || "{}"); } catch { payload = {}; }
      const { status, json } = await proxy8092("POST", POST_PROXY[urlPath], payload);
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(json));
    });
    return;
  }
  if (req.method === "POST" && urlPath === "/api/upload") {
    // 图片上传：原始字节透传 8092 /__upload（压缩闸门在那边）
    const name = new URLSearchParams(queryString || "").get("name") || "upload.jpg";
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      try {
        const r = await fetch(E8092 + "/__upload?name=" + encodeURIComponent(name), {
          method: "POST", body: Buffer.concat(chunks),
          signal: AbortSignal.timeout(120000),
        });
        const text = await r.text();
        let json; try { json = JSON.parse(text); } catch { json = { error: text.slice(0, 200) }; }
        res.writeHead(r.status, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(json));
      } catch (e) {
        res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "8092 未启动: " + (e.message || e) }));
      }
    });
    return;
  }
  if (req.method === "GET" && urlPath === "/api/i18n-data") {
    const { status, json } = await proxy8092("GET", "/__i18n/data", undefined, 30000);
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(json));
    return;
  }
  if (urlPath in api) {
    try {
      const params = new URLSearchParams(queryString || "");
      const body = api[urlPath](urlPath === "/api/search" ? params.get("q") : undefined);
      if (urlPath === "/api/media") body.total = body.items.length;
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
    return;
  }
  // 图片直读（媒体库缩略图）：/img/<相对 public/assets/img 路径>
  if (urlPath.startsWith("/img/")) {
    const abs = normalize(join(IMG, urlPath.slice(5)));
    if (abs.startsWith(IMG) && existsSync(abs) && !statSync(abs).isDirectory()) {
      res.writeHead(200, { "Content-Type": MIME[extname(abs).toLowerCase()] || "application/octet-stream" });
      res.end(readFileSync(abs));
    } else {
      res.writeHead(404); res.end("not found");
    }
    return;
  }
  // 静态：design/admin-ui 目录
  let rel = urlPath === "/" ? "/index.html" : urlPath;
  const abs = normalize(join(HERE, rel));
  if (!abs.startsWith(HERE) || !existsSync(abs) || statSync(abs).isDirectory()) {
    res.writeHead(404); res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[extname(abs).toLowerCase()] || "application/octet-stream" });
  res.end(readFileSync(abs));
});

server.listen(PORT, HOST, () => {
  console.log(`站点工作台（真数据）→ ${accessUrls(PORT, "/", HOST).join("  ")}  （监听：${HOST}）`);
});
