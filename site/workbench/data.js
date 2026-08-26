// 站点工作台 · 数据接线层：拉 /api/* 真数据，渲染进各屏容器；筛选/搜索全部接活。
// 只读渲染；写回类动作（保存/翻译/发布）仍是演示 toast，端点后续挂 8092。
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtTime = (ms) => {
  if (!ms) return "—";
  const d = Date.now() - ms;
  if (d < 60e3) return "刚刚";
  if (d < 3600e3) return Math.floor(d / 60e3) + " 分钟前";
  if (d < 86400e3) return Math.floor(d / 3600e3) + " 小时前";
  return Math.floor(d / 86400e3) + " 天前";
};
const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.round(b / 1024) + " KB");
const slugOf = (p) => p.slug || (p.type + "/" + p.pageId);
// 编辑服务与工作台同机不同端口：跟随当前页面主机，局域网打开不会跳回访问者自己的 localhost。
const EDIT_BASE = `${location.protocol}//${location.hostname}:8092/`;
const STATUS_PILL = {
  published: '<span class="pill pill-ok"><span class="dot"></span>已发布</span>',
  draft: '<span class="pill pill-gray"><span class="dot"></span>草稿</span>',
};

// ---- 全局状态 ----
let PAGES = [];
let TERMS = { lock: [], map: [] };
let TM = { total: 0, items: [] };
let I18N_DATA = { pages: [] };
let OV = { pages: 0, published: 0, draft: 0, mirrors: [], mirrorless: 0, tmTotal: 0, tmApproved: 0, termsMap: 0, termsLock: 0, dist: { zh: 0, en: 0, builtAt: 0 }, events: [], draftPages: [] };
const ui = {
  pages: { type: "all", filter: "all", query: "" },
  mirror: { filter: "all", query: "" },
  terms: { query: "" },
  tm: { query: "", status: "all" },
};
const bound = { pages: false, mirror: false, terms: false, tm: false, seo: false };
let SEO = { rows: [], pins: [], summary: { pages: 0, flagged: 0, pinsPending: 0 } };
const seoState = { showAll: false };

const setActive = (c, chips) => { chips.forEach((x) => x.classList.remove("active")); c.classList.add("active"); };

/* ============ 概览 ============ */
function renderDash(ov) {
  if ($("dashSub")) $("dashSub").innerHTML =
    `${ov.pages} 个页面 · ${ov.published} 已发布 · 构建产物 zh ${ov.dist.zh} 页 + en ${ov.dist.en} 页`;
  if ($("dashStats")) $("dashStats").innerHTML = `
    <div class="stat"><span class="eyebrow">页面总数</span><div class="v">${ov.pages}</div><div class="d"><b>${ov.products} 产品 / ${ov.posts} 文章</b> · JSON 唯一真相</div></div>
    <div class="stat"><span class="eyebrow">已发布</span><div class="v">${ov.published}</div><div class="d">zh ${ov.dist.zh} · en ${ov.dist.en} · 门禁通过</div></div>
    <div class="stat"><span class="eyebrow">翻译记忆</span><div class="v num">${ov.tmTotal}</div><div class="d">句对 · 全部 approved · 命中即复用</div></div>
    <div class="stat"><span class="eyebrow">草稿</span><div class="v">${ov.draft}</div><div class="d">未发布 · 不会进入构建</div></div>`;
  if ($("dashTodo")) {
    const rows = [];
    const seoBad = (SEO.summary.flagged || 0) + (SEO.summary.pinsPending || 0);
    if (seoBad > 0)
      rows.push(`<div class="todo-row"><div class="todo-main"><div class="t">SEO 体检：${SEO.summary.flagged} 页异常 · ${SEO.summary.pinsPending} 条人稿待确认</div><div class="s">标题超长会被谷歌截断 · 待确认=源已改而人稿顶住中</div></div><span class="pill pill-warn"><span class="dot"></span>${seoBad}</span><button class="btn btn-sm btn-secondary" onclick="navTo('seo')">去体检</button></div>`);
    if (ov.mirrors.length)
      rows.push(`<div class="todo-row"><div class="todo-main"><div class="t">${ov.mirrors.length} 个 en 镜像</div><div class="s">${ov.mirrors.map((m) => esc(m.title.slice(0, 20))).join(" · ")}</div></div><span class="pill pill-ok"><span class="dot"></span>已发布 ${ov.mirrors.filter((m) => m.enStatus === "published").length} · 草稿 ${ov.mirrors.length - ov.mirrors.filter((m) => m.enStatus === "published").length}</span><button class="btn btn-sm btn-secondary" onclick="navTo('i18n')">查看镜像</button></div>`);
    if (ov.mirrorless)
      rows.push(`<div class="todo-row"><div class="todo-main"><div class="t">${ov.mirrorless} 个页面尚无英文镜像</div><div class="s">新语言 onboarding：克隆骨架 → 门禁挡 → 翻译回路 → 转 published</div></div><span class="pill pill-warn"><span class="dot"></span>无镜像 ${ov.mirrorless}</span><button class="btn btn-sm btn-secondary" onclick="createAllMirrors()">批量建镜像</button></div>`);
    ov.draftPages.forEach((p) => rows.push(`<div class="todo-row"><div class="todo-main"><div class="t">${esc(p.title)}</div><div class="s">草稿状态 · ${fmtTime(p.mtime)} 编辑</div></div><span class="pill pill-gray"><span class="dot"></span>草稿</span><a class="btn btn-sm btn-secondary" href="/editor.html?p=${esc(slugOf(p))}" target="_blank">继续编辑</a></div>`));
    const pendingTotal = I18N_DATA.pages.filter((x) => x.lang === "en").reduce((a, x) => a + (x.pending || 0), 0);
    if (pendingTotal > 0)
      rows.push(`<div class="todo-row"><div class="todo-main"><div class="t">${pendingTotal} 句译文待人工审</div><div class="s">引擎译文已生成 · 审阅页逐句通过后发布（或矩阵「通过并发布」一键批）</div></div><span class="pill pill-warn"><span class="dot"></span>待审 ${pendingTotal}</span><button class="btn btn-sm btn-secondary" onclick="navTo('i18n')">去审阅</button></div>`);
    if (!rows.length) rows.push(`<div class="todo-row"><div class="todo-main"><div class="t">没有待办</div><div class="s">所有页面已发布，镜像齐备</div></div><span class="pill pill-ok"><span class="dot"></span>全部完成</span></div>`);
    $("dashTodo").innerHTML = rows.join("");
  }
  if ($("dashActivity")) {
    const LABEL = { "source-edit": "源编辑", "translate": "翻译", "auto-translate": "自动翻译", harvest: "收割记忆", "approve-publish": "发布通过", "review-edit": "人审编辑", "pipeline-error": "流水线失败" };
    const ICO = { "source-edit": "#i-check", "translate": "#i-globe", "auto-translate": "#i-spark", harvest: "#i-image", "approve-publish": "#i-send", "review-edit": "#i-eye", "pipeline-error": "#i-warn" };
    $("dashActivity").innerHTML = ov.events.map((e) => `
      <div class="act-row">
        <div class="act-ico"><svg><use href="${ICO[e.action] || "#i-clock"}"/></svg></div>
        <div class="t"><b>${esc(String(e.slug || "").split("/").pop())}</b> ${LABEL[e.action] || e.action}${e.detail && (e.detail.translated !== undefined || e.detail.sentences !== undefined || e.detail.failed !== undefined) ? ` · ${e.detail.translated ?? e.detail.sentences ?? ""} 句` : ""}</div>
        <time>${fmtTime(new Date(e.ts).getTime())}</time>
      </div>`).join("") || `<div class="act-row"><div class="t" style="color:var(--ink-3)">暂无活动记录</div></div>`;
  }
  if ($("dashBuildLog")) $("dashBuildLog").innerHTML = `
    <span class="ok">✓</span> dist 产物 · zh ${ov.dist.zh} 页 + en ${ov.dist.en} 页<br>
    <span class="ok">✓</span> 构建于 ${fmtTime(ov.dist.builtAt)} · 镜像含 hreflang 逻辑<br>
    <span class="dim">·</span> robots.txt 共存期跳过 · 域名根归老站<br>
    <span class="dim">·</span> ${ov.draft} 个草稿未进入产物`;
  if ($("topBuild")) $("topBuild").innerHTML = `<span class="dot"></span>构建产物 ${ov.dist.zh + ov.dist.en} 页 · ${fmtTime(ov.dist.builtAt)}`;
  if ($("svcStatus")) {
    $("svcStatus").innerHTML = `<span class="dot" style="${ov.editAlive ? "" : "background:var(--ink-3);box-shadow:none"}"></span><span>编辑服务</span><span class="mono" style="margin-left:auto">${ov.editAlive ? "运行中" : "未启动"}</span>`;
  }
}

/* ============ 页面屏（筛选 + 搜索） ============ */
function pagesRow(p) {
  return `<tr>
    <td><input type="checkbox" class="ck"></td>
    <td><div class="t-title">${esc(p.title)}</div><div class="t-sub">${esc(slugOf(p))}</div></td>
    <td><span class="tag">${p.type === "products" ? "产品" : "文章"}</span></td>
    <td><span class="tag">中</span>${p.hasEn ? ' <span class="tag">EN</span>' : ""}</td>
    <td>${STATUS_PILL[p.status] || STATUS_PILL.draft}</td>
    <td class="mono" style="font-size:12px;color:var(--ink-2)">${fmtTime(p.mtime)}</td>
    <td><div class="cell-actions"><a class="btn btn-sm btn-ghost" href="/editor.html?p=${esc(slugOf(p))}" target="_blank">编辑</a><button class="icon-btn"><svg><use href="#i-dots"/></svg></button></div></td>
  </tr>`;
}
function pagesBase() {
  let list = PAGES;
  if (ui.pages.type === "products") list = list.filter((p) => p.type === "products");
  else if (ui.pages.type === "posts") list = list.filter((p) => p.type === "posts");
  return list;
}
function drawPages() {
  const base = pagesBase();
  let list = base;
  const f = ui.pages.filter;
  if (f === "published") list = list.filter((p) => p.status === "published");
  else if (f === "draft") list = list.filter((p) => p.status === "draft");
  else if (f === "hasEn") list = list.filter((p) => p.hasEn);
  if (ui.pages.query) {
    const q = ui.pages.query.toLowerCase();
    list = list.filter((p) => p.title.toLowerCase().includes(q) || slugOf(p).toLowerCase().includes(q));
  }
  const tbody = $("pagesTbody");
  if (tbody) tbody.innerHTML = list.map(pagesRow).join("") || `<tr><td colspan="7" style="color:var(--ink-3);padding:18px">没有匹配的页面</td></tr>`;
  if ($("pagesFootL")) $("pagesFootL").textContent = `共 ${base.length} 个页面${list.length !== base.length ? ` · 显示 ${list.length}` : ""} · 已选 0`;
  if ($("pagesFootR")) $("pagesFootR").textContent = `${list.length} / ${base.length}`;
}
function bindPages() {
  if (bound.pages) return; bound.pages = true;
  const chips = document.querySelectorAll("#s-pages .toolbar .chip");
  const map = ["all", "published", "draft", "hasEn"];
  chips.forEach((c, i) => c.addEventListener("click", () => { ui.pages.filter = map[i] ?? "all"; setActive(c, chips); drawPages(); }));
  const si = $("pagesSearch");
  if (si) si.addEventListener("input", () => { ui.pages.query = si.value.trim(); drawPages(); });
}
function drawPagesChips() {
  const base = pagesBase();
  const sets = [base.length, base.filter((p) => p.status === "published").length, base.filter((p) => p.status === "draft").length, base.filter((p) => p.hasEn).length];
  document.querySelectorAll("#s-pages .toolbar .chip .c").forEach((c, i) => { if (sets[i] !== undefined) c.textContent = sets[i]; });
}
// 侧边栏类型上下文（index.html navTo 调用）：切 产品/文章 tab = 切列表类型
window.setPagesTypeCtx = function (t) {
  ui.pages.type = t || "all";
  drawPagesChips();
  drawPages();
};
function renderPages(pages) {
  PAGES = pages || [];
  // 首屏深链（#products/#posts）时 inline 脚本先于本文件执行，类型上下文按 hash 自取一次
  const h = (location.hash || "").replace("#", "");
  if (h === "products" || h === "posts" || h === "pages") ui.pages.type = h === "pages" ? "all" : h;
  if ($("navCountProducts")) $("navCountProducts").textContent = PAGES.filter((p) => p.type === "products").length;
  if ($("navCountPosts")) $("navCountPosts").textContent = PAGES.filter((p) => p.type === "posts").length;
  drawPagesChips();
  bindPages();
  drawPages();
}

/* ============ 多语言 ============ */
function matrixRow(p) {
  return `<tr>
    <td><input type="checkbox" class="ck"></td>
    <td><div class="t-title">${esc(p.title)}</div><div class="t-sub cell-clip" style="max-width:420px">${esc(slugOf(p))}</div></td>
    <td><span class="pill pill-blue"><span class="dot"></span>源</span> <span style="font-size:12px;color:var(--ink-3)">${p.status === "published" ? "已发布" : "草稿"}</span></td>
    <td>${(() => {
      const en = I18N_DATA.pages.find((x) => x.pageId === p.pageId && x.lang === "en");
      if (!p.hasEn) return `<span style="font-size:12.5px;color:var(--ink-3)">无镜像</span> <button class="link-btn" onclick="createMirror('${esc(p.pageId)}')"><svg><use href="#i-plus"/></svg>创建</button>`;
      let cell = p.enStatus === "published"
        ? `<span class="pill pill-ok"><span class="dot"></span>已发布</span>`
        : `<span class="pill pill-gray"><span class="dot"></span>${p.enStatus || "草稿"}</span>`;
      if (en) {
        if (en.pending > 0) cell += ` <span class="pill pill-warn" title="引擎已译 · 待人审"><span class="dot"></span>待审 ${en.pending}</span>`;
        if (en.failed > 0) cell += ` <span class="pill pill-bad" title="翻译失败句"><span class="dot"></span>失败 ${en.failed}</span>`;
        if (en.untranslated > 0) cell += ` <span class="pill pill-bad" title="源已改动/新增 · 从未翻译 · 门禁拦截"><span class="dot"></span>未译 ${en.untranslated}</span>`;
      }
      cell += ` <a class="link-btn" href="/editor.html?p=en/${esc(p.type)}/${esc(p.pageId)}" target="_blank"><svg><use href="#i-ext"/></svg>打开镜像</a>`;
      cell += ` <a class="link-btn" href="${EDIT_BASE}__i18n/review/${esc(p.pageId)}?lang=en" target="_blank" title="逐句复查译文 · 失败句救济入口（免审直发后非常用）"><svg><use href="#i-eye"/></svg>复查</a>`;
      if (en && (en.untranslated > 0 || en.failed > 0)) cell += ` <button class="link-btn" onclick="translatePage('${esc(p.pageId)}')"><svg><use href="#i-spark"/></svg>送翻</button>`;
      if (en && en.pending > 0) cell += ` <button class="link-btn" onclick="approvePage('${esc(p.pageId)}')"><svg><use href="#i-check"/></svg>通过并发布</button>`;
      return cell;
    })()}</td>
    <td style="text-align:center"><span style="color:var(--ink-3)">—</span></td>
  </tr>`;
}
function drawMirror() {
  let list = PAGES;
  const f = ui.mirror.filter;
  if (f === "hasEn") list = list.filter((p) => p.hasEn);
  else if (f === "none") list = list.filter((p) => !p.hasEn);
  else if (f === "draft") list = list.filter((p) => p.status === "draft");
  if (ui.mirror.query) {
    const q = ui.mirror.query.toLowerCase();
    list = list.filter((p) => p.title.toLowerCase().includes(q) || slugOf(p).toLowerCase().includes(q));
  }
  const mtx = $("matrixTbody");
  if (mtx) mtx.innerHTML = list.map(matrixRow).join("") || `<tr><td colspan="5" style="color:var(--ink-3);padding:18px">没有匹配的页面</td></tr>`;
  if ($("enCount")) $("enCount").textContent = `${PAGES.filter((p) => p.hasEn).length}/${PAGES.length}`;
  const chips = document.querySelectorAll("#i18n-mirrors .toolbar .chip .c");
  const sets = [PAGES.length, PAGES.filter((p) => p.hasEn).length, PAGES.filter((p) => !p.hasEn).length, PAGES.filter((p) => p.status === "draft").length];
  chips.forEach((c, i) => { if (sets[i] !== undefined) c.textContent = sets[i]; });
}
function bindMirror() {
  if (bound.mirror) return; bound.mirror = true;
  const chips = document.querySelectorAll("#i18n-mirrors .toolbar .chip");
  const map = ["all", "hasEn", "none", "draft"];
  chips.forEach((c, i) => c.addEventListener("click", () => { ui.mirror.filter = map[i] ?? "all"; setActive(c, chips); drawMirror(); }));
  const si = document.querySelector("#i18n-mirrors .toolbar input");
  if (si) si.addEventListener("input", () => { ui.mirror.query = si.value.trim(); drawMirror(); });
}
function drawTerms() {
  const q = (ui.terms.query || "").toLowerCase();
  const lockHit = TERMS.lock.filter((w) => !q || w.toLowerCase().includes(q));
  const mapHit = TERMS.map.filter((t) => !q || t.zh.toLowerCase().includes(q) || t.en.toLowerCase().includes(q));
  if ($("lockRows")) $("lockRows").innerHTML = lockHit.map((w) => `<div class="lrow"><span>${esc(w)}</span><button class="x" title="移除" onclick="toast('移除待接评审端点 · 界面已就位')">×</button></div>`).join("") || `<div class="lrow" style="color:var(--ink-3);justify-content:center">无匹配</div>`;
  if ($("mapTbody")) $("mapTbody").innerHTML = mapHit.map((t) => `
    <tr>
      <td style="font-weight:550">${esc(t.zh)}</td>
      <td style="color:var(--ink-2)">${esc(t.en)}</td>
      <td><div class="cell-actions"><button class="btn btn-sm btn-ghost">编辑</button><button class="btn btn-sm btn-danger" onclick="toast('移除待接评审端点 · 界面已就位')">删除</button></div></td>
    </tr>`).join("") || `<tr><td colspan="3" style="color:var(--ink-3);padding:18px">无匹配</td></tr>`;
}
function bindTerms() {
  if (bound.terms) return; bound.terms = true;
  const si = $("termsSearch");
  if (si) si.addEventListener("input", () => { ui.terms.query = si.value.trim(); drawTerms(); });
}
const TM_STATUS = { approved: ["pill-ok", "已批准"], draft: ["pill-gray", "草稿"], failed: ["pill-bad", "失败"] };
const TM_ORIGIN = { harvest: "自动积累", engine: "引擎", human: "人工" };
function drawTm() {
  let list = TM.items;
  if (ui.tm.status !== "all") list = list.filter((s) => s.status === ui.tm.status);
  if (ui.tm.query) {
    const q = ui.tm.query.toLowerCase();
    list = list.filter((s) => (s.text || "").toLowerCase().includes(q) || (s.translation || "").toLowerCase().includes(q));
  }
  const el = $("tmList");
  if (el) el.innerHTML = list.slice(0, 200).map((s, i) => {
    const [cls, label] = TM_STATUS[s.status] || ["pill-gray", s.status || "未知"];
    const border = i === Math.min(list.length, 200) - 1 ? "" : ' style="border-bottom:1px solid var(--line)"';
    return `<div class="pair-row"${border}>
      <div class="pair-main">
        <div class="pair-zh">${esc(s.text || "")}</div>
        <div class="pair-en">${esc(s.translation || "")}</div>
      </div>
      <div class="pair-meta">
        <span class="pill pill-blue"><span class="dot"></span>${TM_ORIGIN[s.origin] || s.origin || "未知"}</span>
        <span class="pill ${cls}"><span class="dot"></span>${label}</span>
        <span class="mono" style="font-size:11px;color:var(--ink-3)">${(s.updatedAt || "").slice(0, 10)}</span>
      </div>
      <div class="pair-actions"><button class="btn btn-sm btn-ghost">编辑</button><button class="icon-btn"><svg><use href="#i-dots"/></svg></button></div>
    </div>`;
  }).join("") || `<div class="pair-row" style="color:var(--ink-3);justify-content:center">无匹配</div>`;
  const chips = document.querySelectorAll("#i18n-tm .toolbar .chip .c");
  const sets = [TM.items.length, TM.items.filter((s) => s.status === "approved").length, TM.items.filter((s) => s.status === "failed").length];
  chips.forEach((c, i) => { if (sets[i] !== undefined) c.textContent = sets[i]; });
  const foot = document.querySelector("#i18n-tm .muted-note.mono");
  if (foot) foot.textContent = `${Math.min(list.length, 200)} / ${TM.total}`;
  const footL = document.querySelectorAll("#i18n-tm .muted-note")[0];
  if (footL) footL.innerHTML = `文件 <span class="mono">site/src/i18n/tm.zh-CN.en.json</span> · 共 ${TM.total} 条 · approved ${OV.tmApproved}`;
}
function bindTm() {
  if (bound.tm) return; bound.tm = true;
  const chips = document.querySelectorAll("#i18n-tm .toolbar .chip");
  const map = ["all", "approved", "failed"];
  chips.forEach((c, i) => c.addEventListener("click", () => { ui.tm.status = map[i] ?? "all"; setActive(c, chips); drawTm(); }));
  const si = $("tmSearch");
  if (si) si.addEventListener("input", () => { ui.tm.query = si.value.trim(); drawTm(); });
}
function renderI18n(ov, pages, terms, tm) {
  if ($("statsStrip")) {
    const en = I18N_DATA.pages.filter((x) => x.lang === "en");
    const sum = (k) => en.reduce((a, x) => a + (x[k] || 0), 0);
    $("statsStrip").innerHTML = `
    <div class="sstat"><div class="v">${en.length}<span class="u">个</span></div><div class="l">en 镜像 · ${en.filter((x) => x.status === "published").length} 已发布</div></div>
    ${sum("pending") ? `<div class="sstat"><div class="v" style="color:var(--warn)">${sum("pending")}<span class="u">句</span></div><div class="l">待审 · review 档位为 manual 时积压</div></div>` : ""}
    <div class="sstat"><div class="v" style="color:${sum("untranslated") ? "var(--bad)" : ""}">${sum("untranslated")}<span class="u">句</span></div><div class="l">未译 · 源新增/改动 · 门禁拦</div></div>
    <div class="sstat"><div class="v" style="color:${sum("failed") ? "var(--bad)" : ""}">${sum("failed")}<span class="u">句</span></div><div class="l">失败 · 可重送（救济通道）</div></div>
    <div class="sstat"><div class="v">${terms.map.length + terms.lock.length} + ${tm.total}</div><div class="l">术语 ${terms.map.length + terms.lock.length} · 记忆 ${tm.total}</div></div>`;
  }
  document.querySelectorAll("#i18nTabs .c").forEach((c, i) => { c.textContent = [terms.map.length + terms.lock.length, tm.total][i] ?? c.textContent; });
  if ($("lockCount")) $("lockCount").textContent = `${terms.lock.length} 条`;
  if ($("mapCount")) $("mapCount").textContent = `${terms.map.length} 条 · 按页相关选料注入翻译提示`;
  bindMirror(); drawMirror();
  bindTerms(); drawTerms();
  bindTm(); drawTm();
}

/* ============ SEO 体检屏（抄 Yoast Overview：一行=一逻辑页，默认只显异常） ============ */
const SEO_FLAG = { "title-missing": "标题缺失", "title-overlength": "标题超长", "description-missing": "简介缺失", "description-overlength": "简介超长", "noindex": "未收录", "noindex-manual": "已关收录" };
function seoAgg() {
  const by = new Map();
  for (const r of SEO.rows) {
    const g = by.get(r.pageId) || { pageId: r.pageId, langs: [], flags: [], pinCount: 0 };
    g.langs.push(r.lang);
    for (const i of r.issues) if (!g.flags.includes(i)) g.flags.push(i);
    by.set(r.pageId, g);
  }
  for (const p of SEO.pins) { const g = by.get(p.pageId); if (g) g.pinCount++; }
  return [...by.values()];
}
function seoTitle(pageId) {
  const p = PAGES.find(x => x.pageId === pageId && !x.langDir) || PAGES.find(x => x.pageId === pageId);
  return p ? p.title : pageId;
}
function drawSeo() {
  if ($("seoStats")) $("seoStats").innerHTML = `
    <div class="sstat"><div class="v">${SEO.summary.pages}<span class="u">页</span></div><div class="l">全站逻辑页</div></div>
    <div class="sstat"><div class="v">${SEO.summary.flagged}<span class="u">页</span></div><div class="l">体检异常（长度/缺失/收录）</div></div>
    <div class="sstat"><div class="v">${SEO.summary.pinsPending}<span class="u">条</span></div><div class="l">人稿待确认（源已变·顶住中）</div></div>`;
  const badge = $("navCountSeo");
  if (badge) { const n = SEO.summary.flagged + SEO.summary.pinsPending; badge.textContent = n; badge.style.display = n ? "" : "none"; }
  const btn = $("seoShowAll");
  if (btn) btn.innerHTML = (seoState.showAll ? "只显异常" : "显示全部");
  const rows = seoAgg();
  const show = seoState.showAll ? rows : rows.filter(g => g.flags.length || g.pinCount);
  if ($("seoTbody")) $("seoTbody").innerHTML = show.map(g => {
    const detail = SEO.rows.filter(r => r.pageId === g.pageId);
    const pins = SEO.pins.filter(p => p.pageId === g.pageId);
    return `<tr>
      <td><div class="t-title">${esc(seoTitle(g.pageId))}</div><div class="t-sub">${esc(g.pageId)}</div></td>
      <td>${g.langs.map(l => `<span class="tag">${esc(l)}</span>`).join(" ")}</td>
      <td class="mono" style="font-size:12px">${detail.map(r => r.titleLength > 60 ? `<span style="color:var(--bad)">${r.titleLength}</span>` : r.titleLength).join(" / ")}</td>
      <td class="mono" style="font-size:12px">${detail.map(r => r.descriptionLength > 160 ? `<span style="color:var(--bad)">${r.descriptionLength}</span>` : r.descriptionLength).join(" / ")}</td>
      <td>${g.flags.map(f => `<span class="pill pill-warn">${SEO_FLAG[f] || esc(f)}</span>`).join(" ")}${g.pinCount ? ` <span class="pill pill-bad">待确认 ${g.pinCount}</span>` : ""}</td>
      <td><button class="btn btn-sm btn-ghost" onclick="seoToggle('${esc(g.pageId)}')">展开</button></td>
    </tr>
    <tr id="seoDetail-${esc(g.pageId)}" hidden><td colspan="6" style="background:var(--surface-2)">
      ${detail.map(r => `<div style="display:flex;gap:10px;align-items:center;padding:4px 8px"><span class="tag">${esc(r.lang)}</span><a class="btn btn-sm btn-ghost" href="${EDIT_BASE}${esc(r.slug)}/" target="_blank">编辑</a><span style="font-size:12px;color:var(--ink-2)">标题 ${r.titleLength} · 简介 ${r.descriptionLength}</span>${r.issues.map(i => `<span class="pill pill-warn">${SEO_FLAG[i] || esc(i)}</span>`).join(" ")}</div>`).join("")}
      ${pins.map(p => `<div style="display:flex;gap:10px;align-items:center;padding:4px 8px;border-top:1px dashed var(--line)"><span class="tag">${esc(p.lang)}</span><span class="mono" style="font-size:11px;color:var(--ink-3)">${esc(p.field)}</span><span style="font-size:12px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">源已改「${esc(p.sourceText.slice(0, 36))}」· 人稿顶住「${esc(p.pinnedText.slice(0, 36))}」</span><button class="btn btn-sm btn-ghost" onclick="pinDecideOne('${esc(p.pageId)}','${esc(p.field)}','${esc(p.lang)}','keep')">保持</button><button class="btn btn-sm btn-danger" onclick="pinDecideOne('${esc(p.pageId)}','${esc(p.field)}','${esc(p.lang)}','refollow')">重跟</button></div>`).join("")}
    </td></tr>`;
  }).join("") || `<tr><td colspan="6" style="color:var(--ok);padding:22px;text-align:center">✓ 没有异常——全站体检通过</td></tr>`;
}
function seoToggle(pageId) { const el = $("seoDetail-" + pageId); if (el) el.hidden = !el.hidden; }
async function postPinDecisions(action, list) {
  if (!list.length) { toast("没有待确认项"); return; }
  if (action === "refollow" && !confirm(`将 ${list.length} 条人稿改为跟源重翻（会产生翻译花费）——确认？`)) return;
  const byLang = new Map();
  for (const p of list) { if (!byLang.has(p.lang)) byLang.set(p.lang, []); byLang.get(p.lang).push({ pageId: p.pageId, field: p.field, action }); }
  let kept = 0, refollowed = 0, retranslated = 0, err = null;
  for (const [lang, decisions] of byLang) {
    const r = await fetch("/api/pin-decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang, decisions }) }).then(x => x.json()).catch(() => ({ error: "请求失败" }));
    if (r.ok) { kept += r.kept || 0; refollowed += r.refollowed || 0; retranslated += r.retranslated || 0; } else err = r.error || "未知";
  }
  toast(err ? "失败：" + err : `${action === "keep" ? "已保持人稿（旗已清）" : "已重跟源"}：保持 ${kept} · 重跟 ${refollowed} · 重译 ${retranslated} 句`);
  init();
}
async function pinDecideOne(pageId, field, lang, action) { await postPinDecisions(action, [{ pageId, field, lang }]); }
async function pinDecideAll(action) { await postPinDecisions(action, SEO.pins); }
function bindSeo() {
  if (bound.seo) return; bound.seo = true;
  const sw = $("seoShowAll");
  if (sw) sw.addEventListener("click", () => { seoState.showAll = !seoState.showAll; drawSeo(); });
}

/* ============ 媒体库（分页 + 筛选 + 搜索） ============ */
const mediaState = { all: [], used: new Set(), filter: "all", query: "", page: 0, pageSize: 48 };
function mediaCard(f) {
  const used = mediaState.used.has(f.path);
  return `
    <div class="m-card">
      <div class="m-thumb"><img src="/img/${esc(f.path)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()"><span class="badge pill ${used ? "pill-ok" : "pill-gray"}"><span class="dot"></span>${used ? "使用中" : "未使用"}</span></div>
      <div class="m-meta"><div class="m-name" title="${esc(f.path)}">${esc(f.name)}</div><div class="m-sub"><span title="${esc(f.path)}">${esc(f.path)}</span><span>${fmtSize(f.size)}</span></div></div>
    </div>`;
}
function drawMedia() {
  const { all, used, filter, query, page, pageSize } = mediaState;
  let list = all;
  if (filter === "used") list = list.filter((f) => used.has(f.path));
  if (filter === "unused") list = list.filter((f) => !used.has(f.path));
  if (query) {
    const q = query.toLowerCase();
    list = list.filter((f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
  }
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const p = Math.min(page, pages - 1);
  const slice = list.slice(p * pageSize, (p + 1) * pageSize);
  const grid = $("mediaGrid");
  if (grid) grid.innerHTML = slice.map(mediaCard).join("") + `
    <div class="m-card" style="border-style:dashed;display:grid;place-items:center;color:var(--ink-3);min-height:190px;cursor:pointer" onclick="document.getElementById('mediaFile').click()">
      <div style="display:grid;justify-items:center;gap:8px;font-size:12.5px"><svg style="width:20px;height:20px"><use href="#i-upload"/></svg>点击上传图片<br><span style="font-size:10.5px">jpg/png/webp · 自动压缩</span></div>
      <input type="file" id="mediaFile" accept=".jpg,.jpeg,.png,.webp" style="display:none" onchange="uploadMedia(this.files[0])">
    </div>`;
  const chips = document.querySelectorAll("#s-media .toolbar .chip .c");
  [all.length, used.size, all.length - used.size].forEach((n, i) => { if (chips[i]) chips[i].textContent = n; });
  if ($("mediaFoot")) $("mediaFoot").innerHTML = `
    <span class="muted-note">共 ${list.length} 张${filter !== "all" || query ? "（筛选后）" : ""} · 第 ${p + 1} / ${pages} 页 · 每页 ${pageSize}</span>
    <div style="display:flex;gap:8px">
      <button class="btn btn-sm btn-secondary" id="mediaPrev" ${p === 0 ? "disabled style=opacity:.45" : ""}>上一页</button>
      <button class="btn btn-sm btn-secondary" id="mediaNext" ${p >= pages - 1 ? "disabled style=opacity:.45" : ""}>下一页</button>
    </div>`;
  const prev = $("mediaPrev"), next = $("mediaNext");
  if (prev) prev.addEventListener("click", () => { mediaState.page = Math.max(0, p - 1); drawMedia(); });
  if (next) next.addEventListener("click", () => { mediaState.page = p + 1; drawMedia(); });
  if ($("mediaInfo")) $("mediaInfo").innerHTML =
    `<svg><use href="#i-check"/></svg>共 ${all.length} 张（public/assets/img）· 使用中 ${used.size} · 未使用 ${all.length - used.size} · 上传压缩闸门由 8092 /__upload 提供 · 最近更新 ${fmtTime(all[0]?.mtime)}`;
}
function renderMedia(media) {
  mediaState.all = media.items || [];
  mediaState.used = new Set(media.used || []);
  const chips = document.querySelectorAll("#s-media .toolbar .chip");
  const map = ["all", "used", "unused"];
  chips.forEach((c, i) => c.addEventListener("click", () => {
    mediaState.filter = map[i] ?? "all"; mediaState.page = 0;
    setActive(c, chips); drawMedia();
  }));
  const si = $("mediaSearch");
  if (si) si.addEventListener("input", () => { mediaState.query = si.value.trim(); mediaState.page = 0; drawMedia(); });
  drawMedia();
}

/* ============ 发布 ============ */
function renderPublish(ov, pages) {
  const tbody = $("gateTbody");
  const enOf = (pageId) => I18N_DATA.pages.find((x) => x.pageId === pageId && x.lang === "en");
  if (tbody) tbody.innerHTML = pages.map((p) => {
    const en = enOf(p.pageId);
    const blocks = [];
    if (p.status === "draft") blocks.push("源页状态为草稿");
    if (en) {
      if (en.status !== "published") blocks.push("镜像 status: " + en.status);
      if (en.untranslated > 0) blocks.push(`en 镜像 ${en.untranslated} 句从未翻译（核心字段未审不发）`);
      if (en.failed > 0) blocks.push(`en 镜像 ${en.failed} 句翻译失败`);
    }
    if (blocks.length) {
      return `<tr><td><div class="t-title">${esc(p.title)}</div></td><td><span class="mono" style="font-size:12px;color:var(--ink-2)">zh${p.hasEn ? " + en" : ""}</span></td><td><span class="pill pill-bad"><span class="dot"></span>被挡</span></td><td><span style="font-size:12.5px;color:var(--ink-2)">${blocks.join(" · ")}</span></td><td><div class="cell-actions" style="opacity:1"><button class="btn btn-sm btn-secondary" onclick="navTo('i18n')">去处理</button></div></td></tr>`;
    }
    return `<tr><td><div class="t-title">${esc(p.title)}</div></td><td><span class="mono" style="font-size:12px;color:var(--ink-2)">zh${p.hasEn ? " + en" : ""}</span></td><td><span class="pill pill-ok"><span class="dot"></span>可发布</span></td><td><span style="font-size:12.5px;color:var(--ink-3)">${p.hasEn ? "镜像已发布 · 核心字段已审" : "无镜像 · 仅出 zh"}</span></td><td></td></tr>`;
  }).join("");
  const blocked = pages.filter((p) => {
    const en = enOf(p.pageId);
    return p.status === "draft" || (en && (en.status !== "published" || en.untranslated > 0 || en.failed > 0));
  }).length;
  if ($("gateHint")) $("gateHint").textContent = `${blocked} 项被拦截`;
  if ($("gateFoot")) $("gateFoot").textContent = `${pages.length} 页 · ${pages.length - blocked} 可发`;
  if ($("pubBuildLog")) $("pubBuildLog").innerHTML = `
    <span class="ok">✓</span> dist 产物 · zh ${ov.dist.zh} 页 + en ${ov.dist.en} 页<br>
    <span class="ok">✓</span> 构建于 ${fmtTime(ov.dist.builtAt)} · 静态 HTML 零运行时<br>
    <span class="dim">·</span> canonical / OG / JSON-LD 注入（模板层）<br>
    <span class="dim">·</span> 部署目标 S3 待指示 · robots 共存期跳过`;
}

/* ============ 设置 ============ */
function renderSettings(cfg, ov) {
  const card = $("setI18n");
  if (!card) return;
  card.innerHTML = `
    <div class="card-h"><h3>翻译引擎 · 现状</h3><span class="hint">只读 · 写回端点待接（loadConfig/saveConfig 已备）</span></div>
    <div class="card-b">
      <div class="set-row"><div class="txt"><div class="t">自动翻译（auto）</div><div class="s">发布钩子触发 DeepSeek 批量送翻（引擎已建，触发器待接）。</div></div>
        <button class="toggle ${cfg.auto ? "on" : ""}" onclick="toggleAuto(this)"></button></div>
      <div class="set-row"><div class="txt"><div class="t">en 评审模式</div><div class="s">镜像发布前的人工评审要求。</div></div>
        <span class="pill ${cfg.review?.en === "auto" ? "pill-ok" : "pill-warn"}"><span class="dot"></span>${cfg.review?.en === "auto" ? "auto · 直发" : "required · 人审后发"}</span></div>
      <div class="set-row"><div class="txt"><div class="t">翻译记忆</div><div class="s">site/src/i18n/tm.zh-CN.en.json</div></div><span class="tag mono">${ov.tmTotal} 句对</span></div>
      <div class="set-row" style="border-bottom:none"><div class="txt"><div class="t">术语表</div><div class="s">site/src/i18n/terms.zh-CN.en.json</div></div><span class="tag mono">${ov.termsMap} + ${ov.termsLock}</span></div>
    </div>`;
}

/* ============ 询盘收件箱 ============ */
function renderInbox(list) {
  const el = $("inboxList");
  if (!el) return;
  const KIND = { inquiry: ["pill-blue", "询盘"], subscribe: ["pill-ok", "订阅"] };
  if ($("inboxCount")) $("inboxCount").textContent = `${list.length} 条记录`;
  el.innerHTML = list.map((r) => {
    const [cls, label] = KIND[r.kind] || ["pill-gray", r.kind || "未知"];
    const fields = Object.entries(r.fields || {}).map(([k, v]) => `<div class="f"><b>${esc(k)}</b> ${esc(String(v))}</div>`).join("");
    const files = (r.files || []).map((f) => `<span class="tag mono">📎 ${esc(f)}</span>`).join(" ");
    return `<div class="inbox-row">
      <div class="inbox-main">
        <div class="t"><span class="pill ${cls}"><span class="dot"></span>${label}</span>${files}</div>
        ${fields || `<div class="f" style="color:var(--ink-3)">无字段</div>`}
      </div>
      <div class="inbox-side">
        <span class="pill pill-gray"><span class="dot"></span>未处理</span>
        <span class="mono" style="font-size:11px;color:var(--ink-3)">${new Date(r.at).toLocaleString()}</span>
      </div>
    </div>`;
  }).join("") || `<div class="inbox-row" style="color:var(--ink-3);justify-content:center">收件箱为空</div>`;
}

/* ============ 初始化 ============ */
async function init() {
  let pages = [], terms = { lock: [], map: [] }, tm = { total: 0, items: [] }, cfg = {}, media = { total: 0, items: [] }, inbox = [];
  // 逐端点容错：单个端点失败不拖垮其余屏
  const j = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [a, b, c, d, e, f, g, h, s] = await Promise.all([
    j("/api/overview"), j("/api/pages"), j("/api/terms"), j("/api/tm"),
    j("/api/config"), j("/api/media"), j("/api/inbox"), j("/api/i18n-data"),
    j("/api/seo-health"),
  ]);
  OV = a || OV; pages = b || []; terms = c || terms; tm = d || tm; cfg = e || {}; media = f || media; inbox = g || [];
  I18N_DATA = h || I18N_DATA;
  SEO = s || SEO;
  // 侧边栏多语言徽章 = 全站失败句合计（免审直发后人要管的只有失败句），0 则不显示
  const i18nBadge = $("navCountI18n");
  if (i18nBadge) {
    const failedTotal = (I18N_DATA.pages || []).reduce((a2, x) => a2 + (x.failed || 0), 0);
    i18nBadge.textContent = failedTotal;
    i18nBadge.style.display = failedTotal ? "" : "none";
  }
  OV.draftPages = pages.filter((p) => p.status === "draft");
  TERMS = terms; TM = tm;
  loadTemplates();
  renderDash(OV);
  bindSeo(); drawSeo();
  renderPages(pages);
  renderI18n(OV, pages, TERMS, TM);
  renderMedia(media);
  renderPublish(OV, pages);
  renderSettings(cfg, OV);
  renderInbox(inbox);
}
// ---- 全局搜索（R34 字段定位）----
let searchTimer = null;
function bindGlobalSearch() {
  const input = $("globalSearch");
  const drop = $("searchDrop");
  if (!input || !drop) return;
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (!q) { drop.hidden = true; return; }
    searchTimer = setTimeout(async () => {
      const r = await fetch("/api/search?q=" + encodeURIComponent(q)).then((x) => x.json()).catch(() => []);
      if (!r || !r.length) {
        drop.innerHTML = `<div class="sd-head">「${esc(q)}」没有匹配</div>`;
        drop.hidden = false;
        return;
      }
      drop.innerHTML = `<div class="sd-head"><span>${r.length} 个页面命中 · 点击打开编辑器</span><kbd>Esc</kbd></div>` + r.map((p) => `
        <div class="sd-item" onclick="window.open('/editor.html?p=${esc(p.slug)}','_blank')">
          <div class="t">${esc(p.title)} <span class="mono" style="font-size:10px;color:var(--ink-3)">${esc(p.lang)}</span></div>
          <div class="slug">${esc(p.slug)}</div>
          ${p.hits.map((h) => `<div class="sd-hit"><span class="f">${esc(h.field)}</span><span class="s">${esc(h.snippet)}</span></div>`).join("")}
        </div>`).join("");
      drop.hidden = false;
    }, 200);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") drop.hidden = true; });
  document.addEventListener("click", (e) => { if (!e.target.closest(".top-search")) drop.hidden = true; });
}
bindGlobalSearch();

// ---- 构建触发 ----
async function rebuildSite() {
  toast("重建已入队（8092 串行链）…");
  const r = await fetch("/api/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((x) => x.json()).catch(() => ({ error: "请求失败" }));
  if (r.ok) { toast("构建完成 · dist + dist-edit 已更新"); init(); }
  else toast("构建失败：" + (r.error || "未知"));
}

// ---- 写动作：创建镜像（onboarding 第一步：克隆骨架 + 中文占位；auto 开且有 key 时自动接翻译流水线） ----
async function createMirror(pageId) {
  try {
    const r = await fetch("/api/mirror", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId, lang: "en" }) });
    const j = await r.json();
    if (j.ok) {
      if (j.autoTranslate === "queued") {
        toast("镜像已建 → 已自动送翻（后台）· 免审直发：译完自动上线，失败句到多语言屏重送");
      } else if (j.noKey) {
        toast("镜像已建（中文占位 · 未译）· 8092 未配置 DEEPSEEK_API_KEY，翻译没跑 · 配好 key 后点「送翻」");
      } else {
        toast("镜像已建（中文占位 · 未译）· 自动翻译已关（设置）· 可点「送翻」手动触发");
      }
      init(); // 重拉数据刷新矩阵/概览
    } else {
      toast("创建失败：" + (j.error || "未知"));
    }
  } catch (e) {
    toast("创建失败：" + (e.message || e));
  }
}
async function translatePage(pageId) {
  toast("送翻中（该页 · 后台执行，失败句会重送）…");
  let r;
  try {
    const resp = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId, lang: "en", retryFailed: true }) });
    const j = await resp.json().catch(() => null);
    r = j || { status: resp.status, statusText: resp.statusText };
  } catch (e) {
    r = { error: "网络请求失败：" + (e.message || e) };
  }
  if (r.ok) { toast(`已送翻：新翻 ${r.translated} · 失败 ${r.failed} · 免审直发已上线${r.failed ? "（失败句可到多语言屏重送）" : ""}`); init(); }
  else {
    const status = r.status || r.error || "未知";
    const hint = (r.status === 404 || r.status === 405 || r.status === 502) ? " · 8090/8092 需重启才能加载新端点（node design/admin-ui/start.mjs）" : "";
    toast("送翻失败：HTTP " + status + hint);
  }
}
async function createAllMirrors() {
  const list = PAGES.filter((p) => !p.hasEn);
  if (!list.length) { toast("所有页面都已有镜像"); return; }
  toast("开始批量建镜像（" + list.length + " 页）…");
  for (const p of list) await createMirror(p.pageId);
}
async function translateAll() {
  toast("全站送翻已入队（后台执行，完成自动重建）…");
  const r = await fetch("/api/translate-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((x) => x.json()).catch(() => ({ error: "请求失败" }));
  if (r.ok) { toast("全站翻译完成"); init(); }
  else toast("送翻失败：" + (r.error || "未知"));
}
async function approvePage(pageId) {
  toast("审批中（引擎 draft → approved → 重投影 → 重建）…");
  const r = await fetch("/api/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId, lang: "en" }) }).then((x) => x.json()).catch(() => ({ error: "请求失败" }));
  if (r.ok) { toast(`已通过 ${r.approved} 句并发布${r.remainingFailed ? ` · 仍有 ${r.remainingFailed} 句失败` : ""}${r.remainingUntranslated ? ` · ${r.remainingUntranslated} 句未翻` : ""}`); init(); }
  else toast("通过失败：" + (r.error || "未知"));
}
async function postTerms(lock, mapArr) {
  const mapObj = {}; mapArr.forEach((t) => { mapObj[t.zh] = t.en; });
  const r = await fetch("/api/terms-save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ src: "zh-CN", tgt: "en", lock, map: mapObj }) }).then((x) => x.json()).catch(() => ({ error: "请求失败" }));
  if (r.ok) { toast("术语表已保存（saveTerms 校验通过）"); init(); }
  else toast("保存失败：" + (r.error || "未知"));
}
function addLock() {
  const w = (window.prompt("新锁定词（品牌/型号，翻译时原样保留）：") || "").trim();
  if (!w) return;
  if (TERMS.lock.includes(w)) { toast("已存在：" + w); return; }
  postTerms([...TERMS.lock, w], TERMS.map);
}
async function addTerm() {
  const zh = ($("termZh")?.value || "").trim();
  const en = ($("termEn")?.value || "").trim();
  if (!zh || !en) { toast("中文与 English 都要填"); return; }
  if (TERMS.map.some((t) => t.zh === zh)) { toast("已存在：" + zh); return; }
  await postTerms(TERMS.lock, [...TERMS.map, { zh, en }]);
}
async function toggleAuto(btn) {
  const on = !btn.classList.contains("on");
  const r = await fetch("/api/config-save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auto: on }) }).then((x) => x.json()).catch(() => ({ error: "请求失败" }));
  if (r.ok) { btn.classList.toggle("on", on); toast("自动翻译已" + (on ? "开启（发布时自动送翻）" : "关闭")); }
  else toast("保存失败：" + (r.error || "未知"));
}
// ---- 烧制（真端点代理）----
const burnState = { json: null, slug: null, allOpen: false };
async function loadTemplates() {
  try {
    const kits = await fetch("/api/templates").then((r) => r.json());
    const sel = $("burnTemplate");
    if (!sel) return;
    sel.innerHTML = `<option value="">默认（页族内自动选模版）</option>` + (kits || []).map((k) =>
      `<option value="${k.family}:${k.name}" ${k.complete ? "" : "disabled"}>${k.family === "products" ? "产品" : "文章"} · ${k.name}${k.complete ? "" : "（缺三件套不可烧）"}</option>`).join("");
  } catch { /* 忽略 */ }
}
// ---- JSON 折叠树（替代整块 pre：无横向滚动，按需展开）----
const J_CAP = 6000; // 展开全部时的渲染行数上限，防止超大 JSON 卡死
function jSpan(cls, text, extra) {
  const s = document.createElement("span");
  s.className = cls;
  if (text !== undefined) s.textContent = text;
  if (extra) Object.assign(s, extra);
  return s;
}
function jVal(v) {
  if (typeof v === "string") {
    const s = JSON.stringify(v);
    if (s.length > 90) {
      const el = jSpan("js jtrunc", s.slice(0, 90) + "…");
      el.title = "点击展开完整文本";
      el.onclick = (e) => { e.stopPropagation(); const f = jSpan("js jfull", s); el.replaceWith(f); };
      return el;
    }
    return jSpan("js", s);
  }
  if (v === null) return jSpan("jn", "null");
  if (typeof v === "number") return jSpan("jn", String(v));
  if (typeof v === "boolean") return jSpan("jn", String(v));
  return jSpan("jn", JSON.stringify(v));
}
function jsonLine(key, val, depth, open, counter) {
  counter.n++;
  const line = document.createElement("div");
  line.className = "jline";
  const head = jSpan("jhead");
  const isC = val !== null && typeof val === "object";
  const isArr = Array.isArray(val);
  const n = isC ? (isArr ? val.length : Object.keys(val).length) : 0;
  if (isC) {
    const tg = jSpan("jtg", open ? "▾" : "▸");
    head.appendChild(tg);
  } else {
    head.appendChild(jSpan("jtg jtg-sp", ""));
  }
  if (key !== null && key !== undefined) head.appendChild(jSpan("jk", JSON.stringify(key) + ": "));
  if (!isC) {
    head.appendChild(jVal(val));
  } else {
    head.appendChild(jSpan("jmeta", open ? (isArr ? "[ " : "{ ") : (isArr ? `[…] ${n} 项` : `{…} ${n} 键`)));
  }
  line.appendChild(head);
  if (isC) {
    const entries = () => (isArr ? val.map((v, i) => [i, v]) : Object.entries(val));
    const build = () => {
      const kids = document.createElement("div");
      kids.className = "jkids";
      const list = entries();
      let rest = 0;
      // 子节点展开态由「渲染模式 × 深度」决定，与父节点点击态无关：默认只展两层，展开全部模式才全展（受上限约束）
      const childOpen = burnState.allOpen ? depth + 1 < 40 : depth + 1 < 2;
      const budget = Math.min(list.length, burnState.allOpen ? Math.max(0, J_CAP - counter.n) : list.length);
      for (const [k, v] of list.slice(0, budget)) kids.appendChild(jsonLine(k, v, depth + 1, childOpen, counter));
      rest = list.length - budget;
      if (rest > 0) kids.appendChild(jSpan("jcap", `… 已截断 ${rest} 行（点「折叠」再逐层展开）`));
      return kids;
    };
    if (open) { const kids = build(); line._kids = kids; line.appendChild(kids); }
    head.style.cursor = "pointer";
    head.onclick = () => {
      const nowOpen = !line._open;
      line._open = nowOpen;
      head.querySelector(".jtg").textContent = nowOpen ? "▾" : "▸";
      head.querySelector(".jmeta").textContent = nowOpen ? (isArr ? "[ " : "{ ") : (isArr ? `[…] ${n} 项` : `{…} ${n} 键`);
      if (nowOpen) {
        if (!line._kids) { const c = { n: counter.n }; line._kids = build(); counter.n = c.n; }
        line.appendChild(line._kids);
      } else if (line._kids) {
        line._kids.remove();
      }
    };
  }
  return line;
}
function renderJsonTree() {
  const box = $("burnJson");
  if (!box || !burnState.json) { if (box) box.innerHTML = '<div class="jempty">尚未烧制 — JSON 结构树将在这里以可折叠节点显示</div>'; return; }
  burnState.allOpen = false;
  box.innerHTML = "";
  const counter = { n: 0 };
  box.appendChild(jsonLine(null, burnState.json, 0, true, counter));
  box.scrollTop = 0;
}
// 公开入口：任意 JSON 灌入树视图并切到 JSON 页签（页面屏「查看 JSON」等复用）
function showJsonTree(json, slug) {
  burnState.json = json;
  if (slug !== undefined) burnState.slug = slug;
  renderJsonTree();
  if (window.switchBurnTab) window.switchBurnTab("js");
}
function expandAllJson() {
  if (!burnState.json) { toast("先烧制再查看 JSON"); return; }
  burnState.allOpen = true;
  const box = $("burnJson");
  box.innerHTML = "";
  const counter = { n: 0 };
  box.appendChild(jsonLine(null, burnState.json, 0, true, counter));
  box.scrollTop = 0;
  if (counter.n >= J_CAP) toast("内容较大，已展开前 " + J_CAP + " 行（其余折叠后逐层展开）");
}
function collapseAllJson() {
  if (!burnState.json) return;
  renderJsonTree();
}
async function copyBurnJson() {
  if (!burnState.json) { toast("先烧制再复制"); return; }
  const text = JSON.stringify(burnState.json, null, 2);
  try { await navigator.clipboard.writeText(text); toast("已复制 JSON（" + Math.round(text.length / 1024) + " KB）"); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("已复制 JSON"); } catch { toast("复制失败，请用「下载」"); }
    ta.remove();
  }
}
function downloadBurnJson() {
  if (!burnState.json) { toast("先烧制再下载"); return; }
  const blob = new Blob([JSON.stringify(burnState.json, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (burnState.slug || "burn") + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function renderBurnReport(report) {
  if (!report || typeof report !== "object") return `<div class="report-item"><div class="t" style="color:var(--ink-3)">${esc(String(report ?? "—"))}</div></div>`;
  const html = [];
  const head = [];
  if (report.family) head.push(`页族 ${esc(report.family)}`);
  if (report.kit) head.push(`套件 ${esc(report.kit)}`);
  if (Array.isArray(report.images)) head.push(`图池 ${report.images.length} 张`);
  if (report.fieldMap) head.push(`字段映射 ${report.fieldMap.length} 项`);
  if (head.length) html.push(`<div class="report-item"><svg class="ok"><use href="#i-check"/></svg><div class="t">${head.join(" · ")}</div></div>`);
  const S = { ok: ["ok", "check", "✓ 通过"], repaired: ["warn", "warn", "修过"], failed: ["bad", "warn", "✗ 缺席"] };
  for (const s of report.sections || []) {
    const [cls, ico, label] = S[s.status] || ["warn", "warn", s.status || "?"];
    const extra = [];
    if (s.attempts > 1) extra.push(`重烧 ${s.attempts} 次`);
    if (s.issues) extra.push(esc(s.issues));
    html.push(`<div class="report-item"><svg class="${ico}"><use href="#i-${cls === "ok" ? "check" : "warn"}"/></svg><div class="t"><b>${esc(s.key)}</b> · ${label}${extra.length ? ` · ${extra.join(" · ")}` : ""}</div></div>`);
  }
  for (const u of report.unused || []) {
    html.push(`<div class="report-item"><svg class="warn"><use href="#i-warn"/></svg><div class="t"><b>未用段落</b> · ${esc(u.preview || u.n || "")}</div></div>`);
  }
  for (const n of report.notes || []) {
    html.push(`<div class="report-item"><svg class="warn"><use href="#i-warn"/></svg><div class="t">${esc(n)}</div></div>`);
  }
  return html.join("") || `<div class="report-item"><div class="t" style="color:var(--ink-3)">无报告字段</div></div>`;
}
async function doBurn() {
  const text = $("burnText")?.value?.trim() || "";
  const name = ($("burnName")?.value || "").trim();
  const slug = ($("burnSlug")?.value || "").trim();
  const famSel = $("burnFamily")?.value || "auto";
  const tplSel = $("burnTemplate")?.value || "";
  const family = tplSel ? tplSel : famSel;
  if (!name || !slug) { toast("产品名与 slug 必填（/__burn 契约）"); return; }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) { toast("slug 只允许小写字母/数字/连字符"); return; }
  if (!text) { toast("素材文本不能为空（或提供 URL）"); return; }
  const st = $("burnStatus"); st.textContent = "烧制中…（DeepSeek 一次成整页 JSON + 四道机器验收，约 1-2 分钟）"; st.style.color = "var(--warn)";
  const r = await fetch("/api/burn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, slug, productName: name, family }) }).then((x) => x.json()).catch(() => ({ error: "请求失败" }));
  if (r.ok) {
    burnState.json = r.json; burnState.slug = slug;
    st.textContent = "✓ 烧制完成 · 已过四道机器验收"; st.style.color = "var(--ok)";
    $("burnReport").innerHTML = renderBurnReport(r.report);
    renderJsonTree();
    const pvUrl = EDIT_BASE.slice(0, -1) + r.previewUrl;
    const pv = $("burnPv"); if (pv) { pv.src = pvUrl; pv.hidden = false; }
    const pvEmpty = $("burnPvEmpty"); if (pvEmpty) pvEmpty.hidden = true;
    const pvUrlEl = $("burnPvUrl"); if (pvUrlEl) pvUrlEl.textContent = r.previewUrl;
    const link = $("burnPreviewLink");
    if (link) { link.href = pvUrl; link.style.display = "inline-flex"; }
    const save = $("burnSave"); save.disabled = false; save.style.opacity = 1;
    if (window.switchBurnTab) window.switchBurnTab("rpt");
    toast("烧制完成 · 预览已就绪 · 保存为草稿后进内容列表");
  } else {
    st.textContent = "✗ 烧制失败：" + (r.error || "未知"); st.style.color = "var(--bad)";
    $("burnReport").innerHTML = `<div class="report-item"><svg class="warn"><use href="#i-warn"/></svg><div class="t">${esc(r.error || "未知")}</div></div>`;
    toast("烧制失败：" + (r.error || "未知"));
  }
}
async function saveBurn() {
  if (!burnState.json) { toast("先烧制再保存"); return; }
  const r = await fetch("/api/burn-save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: burnState.slug, json: burnState.json }) }).then((x) => x.json()).catch(() => ({ error: "请求失败" }));
  if (r.ok) {
    // 闭环：成功条给三个着落——去精修 / 回列表 / 烧下一篇；不自动跳走（批量烧文场景）
    const famDir = (r.editUrl || "").split("/")[1] === "posts" ? "posts" : "products";
    const done = $("burnDone");
    if (done) {
      $("burnDoneSlug").textContent = r.slug;
      $("burnDoneEdit").href = EDIT_BASE.slice(0, -1) + r.editUrl;
      $("burnDoneList").onclick = () => navTo(famDir);
      done.style.display = "flex";
    }
    const s = $("burnSave"); if (s) { s.disabled = true; s.style.opacity = 0.5; }  // 防重复保存出 -1 序号本
    toast("已落草稿：" + r.slug);
    init();
  }
  else toast("保存失败：" + (r.error || "未知"));
}
function resetBurn() {
  burnState.json = null; burnState.slug = null;
  const done = $("burnDone"); if (done) done.style.display = "none";
  const st = $("burnStatus"); if (st) { st.textContent = "等待烧制：填写左栏素材，选页族与模版后开始。"; st.style.color = "var(--ink-3)"; }
  if ($("burnReport")) $("burnReport").innerHTML = '<div class="report-item"><div class="t" style="color:var(--ink-3)">尚未烧制 — 校验报告将在烧制完成后显示在这里</div></div>';
  if ($("burnJson")) $("burnJson").innerHTML = '<div class="jempty">尚未烧制 — JSON 结构树将在这里以可折叠节点显示</div>';
  const pv = $("burnPv"); if (pv) { pv.hidden = true; pv.removeAttribute("src"); }
  const pvEmpty = $("burnPvEmpty"); if (pvEmpty) pvEmpty.hidden = false;
  const pvUrlEl = $("burnPvUrl"); if (pvUrlEl) pvUrlEl.textContent = "";
  if ($("burnPreviewLink")) $("burnPreviewLink").style.display = "none";
  const s = $("burnSave"); if (s) { s.disabled = true; s.style.opacity = 0.5; }
  if (window.switchBurnTab) window.switchBurnTab("rpt");
}
async function uploadMedia(file) {
  if (!file) return;
  toast("上传中…（压缩闸门 2560px / 质量压缩）");
  const r = await fetch("/api/upload?name=" + encodeURIComponent(file.name), { method: "POST", body: file }).then((x) => x.json()).catch(() => ({ error: "请求失败" }));
  if (r.ok) { toast("已上传：" + r.src); init(); }
  else toast("上传失败：" + (r.error || "未知"));
}
async function addMemory() {
  const text = (window.prompt("中文原文（整句）：") || "").trim();
  if (!text) return;
  const translation = (window.prompt("English 译文：") || "").trim();
  if (!translation) { toast("译文不能为空"); return; }
  const r = await fetch("/api/tm-save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, translation }) }).then((x) => x.json()).catch(() => ({ error: "请求失败" }));
  if (r.ok) { toast("已入记忆（approved · 人工）· 共 " + r.total + " 条"); init(); }
  else toast("保存失败：" + (r.error || "未知"));
}
window.createMirror = createMirror;
window.createAllMirrors = createAllMirrors;
window.translatePage = translatePage;
window.translateAll = translateAll;
window.approvePage = approvePage;
window.addLock = addLock;
window.addTerm = addTerm;
window.toggleAuto = toggleAuto;
window.doBurn = doBurn;
window.saveBurn = saveBurn;
window.resetBurn = resetBurn;
window.expandAllJson = expandAllJson;
window.collapseAllJson = collapseAllJson;
window.copyBurnJson = copyBurnJson;
window.downloadBurnJson = downloadBurnJson;
window.showJsonTree = showJsonTree;
window.rebuildSite = rebuildSite;
window.uploadMedia = uploadMedia;
window.addMemory = addMemory;
window.seoToggle = seoToggle;
window.pinDecideOne = pinDecideOne;
window.pinDecideAll = pinDecideAll;

// 工作台/编辑服务同机不同端口：固定链接改成跟随当前主机，局域网访问同样可用。
const prod = $("openProdPreview");
if (prod) prod.href = EDIT_BASE;

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
