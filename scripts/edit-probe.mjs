// 编辑链路回归门（常驻）：把每个可编辑坐标真实写回 → 重渲 → 验证新值到位。
// 三类探针：① token 写回（改一处，重渲后该处出现新值）；② identity 无损往返
// （存回当前值，视觉零变化）；③ 重复组增删（3→4 加、中间删项后剩余序列精确）。
//
// 关键：全程在内存跑——用 render.mjs 的字符串入口 renderBodyFromString + md-write 的纯函数
// applyPatch/applyArrayOp，读盘只读一次、绝不写任何真实文件（崩了也不脏工作区）。
//
// 棘轮基线：已知未修的缺陷（1.8 / E-4，见 EXECUTION）登记在 KNOWN_BROKEN。门的判据是
// 「只能变好、不能变坏」：非基线坐标失败 → 退出码 1；基线坐标已修好 → 也提示（催促摘除基线）。
import { readFile } from "node:fs/promises";
import { parse as parseHtml } from "node-html-parser";
import { pages, p } from "./build.mjs";
import { renderBodyFromString } from "./render.mjs";
import { applyPatch, applyArrayOp } from "./md-write.mjs";

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// ── 棘轮基线：已知未修缺陷（修好后从这里删）────────────────────────────────
// 命中 test(page,coord) 的 token 失败视为「已知」，不判红；但若它其实通过了，会提示摘除。
const KNOWN_BROKEN = [
  {
    id: "1.8#1 双处结构 name 写回黑洞",
    test: (page, coord) => /^fm:(components_images|crane_types_images)\.\d+\.name$/.test(coord),
  },
  {
    id: "1.8#2 <p data-field> 槽装列表被拆到坐标外",
    test: (page, coord) => coord === "mdbody:components#6" && page === "products/overhead-cranes-for-sale",
  },
];
const isKnown = (page, coord) => KNOWN_BROKEN.find((k) => k.test(page, coord));

// ── 渲染一份「MD 字符串 → 编辑模式正文 DOM」（纯内存）─────────────────────
async function renderEdit(page, rawMd, templateCache) {
  const tmpl = templateCache.get(page.template) || (await readFile(p(page.template), "utf8"));
  templateCache.set(page.template, tmpl);
  const bodyHtml = renderBodyFromString(tmpl, rawMd, { editMode: true }, page.content);
  return parseHtml(bodyHtml);
}

function coordsOf(root) {
  const seen = new Map();
  for (const el of root.querySelectorAll("[data-md]")) {
    const c = el.getAttribute("data-md");
    if (!seen.has(c)) seen.set(c, { kind: el.getAttribute("data-edit"), tag: (el.tagName || "").toLowerCase() });
  }
  return seen;
}
const byCoord = (root, coord) => root.querySelectorAll("[data-md]").filter((e) => e.getAttribute("data-md") === coord);

const R = { tokenPass: 0, tokenFail: [], knownStillBroken: 0, knownNowFixed: [], idPass: 0, idFail: [], arrPass: 0, arrFail: [] };

const templateCache = new Map();

for (const page of pages) {
  if ((page.mode || "render") !== "render" || !page.content) continue;
  const pristine = await readFile(p(page.content), "utf8");
  const baseRoot = await renderEdit(page, pristine, templateCache);
  const coords = coordsOf(baseRoot);

  // ① token 写回
  let tok = 0;
  for (const [coord, meta] of coords) {
    const token = `EDITPROBE_${++tok}`;
    let value, check;
    if (meta.kind === "image") {
      value = `probe-${tok}.jpg`;
      check = (els) => els.some((e) => (e.getAttribute("src") || "").includes(value));
    } else if (meta.kind === "link") {
      value = `https://probe.test/${tok}`;
      check = (els) => els.some((e) => (e.getAttribute("href") || "") === value);
    } else if (meta.kind === "rich") {
      value = `<p>${token} <strong>b</strong></p><ul><li>${token}_a</li><li>${token}_b</li></ul>`;
      check = (els) => els.some((e) => e.text.includes(`${token}_b`));
    } else {
      value = `${token}_t`;
      check = (els) => els.some((e) => e.text.includes(token));
    }
    let ok = false, note = "";
    try {
      const patched = applyPatch(pristine, coord, meta.kind, value);
      const root = await renderEdit(page, patched, templateCache);
      const els = byCoord(root, coord);
      ok = els.length > 0 && check(els);
      if (!ok) note = els.length === 0 ? "重渲后坐标消失" : "重渲后未见新值";
    } catch (e) {
      note = `写回抛错: ${e.message}`;
    }
    const known = isKnown(page.slug, coord);
    if (ok) {
      R.tokenPass++;
      if (known) R.knownNowFixed.push({ page: page.slug, coord, id: known.id });
    } else if (known) {
      R.knownStillBroken++;
    } else {
      R.tokenFail.push({ page: page.slug, coord, kind: meta.kind, note });
    }
  }

  // ② identity 无损往返（text/rich）
  for (const [coord, meta] of coords) {
    if (meta.kind !== "text" && meta.kind !== "rich") continue;
    const el0 = byCoord(baseRoot, coord)[0];
    if (!el0) continue;
    const current = meta.kind === "rich" ? el0.innerHTML.trim() : norm(el0.text);
    try {
      const patched = applyPatch(pristine, coord, meta.kind, current);
      const el1 = byCoord(await renderEdit(page, patched, templateCache), coord)[0];
      const after = el1 ? (meta.kind === "rich" ? el1.innerHTML.trim() : norm(el1.text)) : null;
      if (after !== null && norm(after) === norm(current)) R.idPass++;
      else R.idFail.push({ page: page.slug, coord, kind: meta.kind });
    } catch (e) {
      R.idFail.push({ page: page.slug, coord, kind: meta.kind, note: e.message });
    }
  }

  // ③ 重复组增删
  const groups = [...new Set(baseRoot.querySelectorAll("[data-group]").map((g) => g.getAttribute("data-group")))];
  for (const g of groups) {
    const unitsOf = (root) => {
      const c = root.querySelectorAll("[data-group]").find((x) => x.getAttribute("data-group") === g);
      return c ? c.querySelectorAll("[data-idx]").filter((u) => u.closest("[data-group]") === c) : [];
    };
    const sig = (u) => { const i = u.querySelector("img"); return norm(u.text).slice(0, 40) || (i ? i.getAttribute("src") : ""); };
    const before = unitsOf(baseRoot);
    const N = before.length;
    try {
      const after = unitsOf(await renderEdit(page, applyArrayOp(pristine, g, "add"), templateCache));
      if (after.length === N + 1) R.arrPass++; else R.arrFail.push({ page: page.slug, group: g, op: "add", note: `期望 ${N + 1} 实际 ${after.length}` });
    } catch (e) { R.arrFail.push({ page: page.slug, group: g, op: "add", note: e.message }); }
    if (N >= 2) {
      const idx = N >= 3 ? 1 : 0;
      try {
        const after = unitsOf(await renderEdit(page, applyArrayOp(pristine, g, "remove", idx), templateCache));
        const expect = before.map(sig).filter((_, k) => k !== idx);
        const got = after.map(sig);
        if (after.length === N - 1 && expect.every((s, k) => s === got[k])) R.arrPass++;
        else R.arrFail.push({ page: page.slug, group: g, op: `remove#${idx}`, note: `期望[${expect.join("⋮")}] 实际[${got.join("⋮")}]` });
      } catch (e) { R.arrFail.push({ page: page.slug, group: g, op: "remove", note: e.message }); }
    }
  }
}

// ── 报告 + 判定 ─────────────────────────────────────────────────────────
const hardFails = R.tokenFail.length + R.idFail.length + R.arrFail.length;
console.log(`\n编辑链路回归门：token ${R.tokenPass} 过 / ${R.tokenFail.length} 新坏 / ${R.knownStillBroken} 已知坏；identity ${R.idPass} 过 / ${R.idFail.length} 坏；arrays ${R.arrPass} 过 / ${R.arrFail.length} 坏`);
for (const f of R.tokenFail) console.log(`  ✗ token  ${f.page} ${f.coord} [${f.kind}] ${f.note}`);
for (const f of R.idFail) console.log(`  ✗ ident  ${f.page} ${f.coord} [${f.kind}] ${f.note || ""}`);
for (const f of R.arrFail) console.log(`  ✗ array  ${f.page} ${f.group} ${f.op} ${f.note}`);
if (R.knownStillBroken) console.log(`  · 已知未修（棘轮基线，不判红）：${R.knownStillBroken} 个 —— ${KNOWN_BROKEN.map((k) => k.id).join("；")}`);
for (const nf of R.knownNowFixed) console.log(`  ⚠ 基线坐标现已修好，请从 KNOWN_BROKEN 摘除：${nf.page} ${nf.coord}（${nf.id}）`);

if (hardFails > 0) {
  console.error(`\n❌ 编辑链路回归门失败：${hardFails} 个非基线缺陷（不得让 edit 变坏）`);
  process.exit(1);
}
console.log(`✅ 编辑链路回归门通过（新缺陷 0；已知基线 ${R.knownStillBroken} 个待 1.8/E-4 清零）`);
