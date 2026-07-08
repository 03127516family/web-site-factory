// i18n:touch —— 过渡期"改完自动加戳"的那根线（决策⑳ 的兜底路径 §3.3 的本地实体）。
// 产品期由编辑器保存链路在写值那一刻加戳（M3）；本地期编辑器绕过时（直接在文本编辑器改 MD）
// 用它补加戳。**基准不取 git**（决策㉗：git 只是代码仓、非内容真相）——改取【MD 自存指纹】：
// frontmatter 里 i18n_fp.<字段> 存「上次抬戳时该字段值的指纹」，touch 重算当前指纹逐字段比对，
// 变了的给 i18n_rev +1、并把指纹刷到当前，另追加一条【字段级事件】到 .i18n-events.jsonl
//（= M3 DynamoDB 事件日志的本地预览）。一次检测，两个产物：喂戳（状态）+ 留痕（历史）。
// 不变式：i18n_fp[字段] == 上次 i18n_rev 抬戳时刻的字段值指纹（stampOnSave 与 touch 共同维护）。
//
// 用法：node scripts/i18n-touch.mjs <slug|文件名>   （改完中文、翻译英文之前跑）
// 首次运行（无 i18n_fp）= 只落基准指纹、不抬戳；此后 touch 幂等（同内容再跑不重复加戳）。
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse as parseYaml, parseDocument } from "yaml";
import { pages, p, ROOT } from "./build.mjs";

// 把一份 MD 文本解析成 { fm(frontmatter 对象), blocks(块KEY→正文文本) }
export function parseDoc(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { fm: {}, blocks: {} };
  const fm = parseYaml(m[1]) || {};
  const blocks = {};
  let cur = null;
  for (const line of m[2].split(/\r?\n/)) {
    const h = /^##\s+.*<!--block:([A-Za-z0-9_]+)-->/.exec(line);
    if (h) {
      cur = h[1];
      blocks[cur] = [];
    } else if (cur) blocks[cur].push(line);
  }
  for (const k of Object.keys(blocks)) blocks[k] = blocks[k].join("\n").trim();
  return { fm, blocks };
}

// 按 i18n_rev 的字段名取值：先当 frontmatter 点路径解析，解析不到则当正文块 KEY。
// 与渲染/编辑同一套字段语义（点路径→frontmatter，裸名→## 块），不另立规则。
export function fieldValue(doc, key) {
  const viaDot = key.split(".").reduce((o, seg) => (o == null ? undefined : o[seg]), doc.fm);
  if (viaDot !== undefined) return typeof viaDot === "string" ? viaDot.trim() : JSON.stringify(viaDot);
  return doc.blocks[key]; // 正文块
}

// 在 frontmatter 的 i18n_rev 段内，把某字段的戳 +1（只动这一段，避免误伤同名行）。
// 自读当前值，返回 { text, bumped, to }。字段不在 i18n_rev（如共享图/chrome）→ 原样返回。
export function bumpStampInText(text, key) {
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fmMatch) return { text, bumped: false };
  const fm = fmMatch[1];
  const start = fm.search(/^i18n_rev:/m);
  if (start === -1) return { text, bumped: false }; // 该页没有翻译设置
  const after = fm.slice(start).search(/\n(?=\S)/); // i18n_rev 段到下一个顶格键为止
  const end = after === -1 ? fm.length : start + after;
  const region = fm.slice(start, end);
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^(\\s+${esc}:\\s*)(\\d+)\\s*$`, "m");
  const m = re.exec(region);
  if (!m) return { text, bumped: false }; // 该字段未被 i18n_rev 追踪
  const to = Number(m[2]) + 1;
  return { text: text.replace(region, region.replace(re, `$1${to}`)), bumped: true, to };
}

// 编辑坐标 → i18n_rev 字段名：剥前缀（fm:/mdbody:/mdhead:）与重复项后缀（#n）。
// 与 fieldValue 的字段语义对称（点路径 frontmatter / 裸名 ## 块）。
export function coordToField(coord) {
  return coord.replace(/^(fm|mdbody|mdhead):/, "").replace(/#\d+$/, "");
}

// 字段值 → 短指纹（sha1 前 12 位）。入参用 fieldValue 的产出（已按同一套字段语义归一化），
// 故指纹的"值"定义与渲染/编辑/戳完全一致，不另立规则。
function fp(value) {
  const s = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return createHash("sha1").update(s).digest("hex").slice(0, 12);
}

// 把一批字段指纹写进 frontmatter 的 i18n_fp 段（无则新建；扁平点键，镜像 i18n_rev 结构）。
// 走 YAML CST 往返（保留注释/flow 风格，lineWidth:0 保持 flow 映射单行、diff 干净），与
// md-write::patchFrontmatter 同一手法。setIn 用显式二元路径 → "body.h_cases" 当字面键不被点拆。
function writeFingerprints(text, fpMap) {
  const keys = Object.keys(fpMap);
  if (!keys.length) return text;
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---)/.exec(text);
  if (!m) return text;
  const doc = parseDocument(m[2]);
  for (const k of keys) doc.setIn(["i18n_fp", k], fpMap[k]);
  const fmText = doc.toString({ lineWidth: 0 }).replace(/\n$/, "");
  return m[1] + fmText + m[3] + text.slice(m[0].length);
}

function gitActor() {
  try {
    return execSync("git config user.name", { cwd: ROOT, encoding: "utf8" }).trim() || "unknown";
  } catch {
    return "unknown";
  }
}

// 追加一条字段级事件到本地 .i18n-events.jsonl（= M3 事件日志的本地预览；产品期底账 = DynamoDB，非 git）
export async function logEvent(slug, action, fields) {
  const entry = { ts: new Date().toISOString(), actor: gitActor(), slug, action, fields };
  await appendFile(p(".i18n-events.jsonl"), JSON.stringify(entry) + "\n", "utf8");
}

// 在 en MD 的 i18n.translated_rev 段内，把某字段的值设为 target（=源当前戳）。只动该段。
function setTranslatedRev(text, key, value) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)[1];
  const start = fm.search(/^\s*translated_rev:/m);
  if (start === -1) return text;
  const lines = fm.slice(start).split("\n");
  let end = lines.length;
  for (let i = 1; i < lines.length; i++) if (/^\s{0,2}\S/.test(lines[i])) { end = i; break; }
  const region = lines.slice(0, end).join("\n");
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^(\\s+${esc}:\\s*)\\d+\\s*$`, "m");
  if (re.test(region)) return text.replace(region, region.replace(re, `$1${value}`));
  // 字段不在 translated_rev 名册（源新增了段）：按现有字段缩进在段末追加一行 —— 不静默 no-op，
  // 否则该字段即便译过 i18n:status 仍永久报 stale（决策⑳ 判据以「戳存在与否」为准）。
  const indent = (region.match(/\n(\s+)\S/) || [, "    "])[1];
  return text.replace(region, `${region.replace(/\s+$/, "")}\n${indent}${key}: ${value}`);
}

// 翻译任务落地那一步（代码侧）：译文已写入目标字段后，把 translated_rev.<字段> 抬到
// 源当前 i18n_rev.<字段> → 该字段回"已同步"。记一条 translate 事件。译文本身由 AI 产出、
// 经 patchMarkdown 按坐标写入（与本函数解耦）——本函数只做确定性的"抬戳 + 记账"。
export async function markTranslated(targetPage, fields) {
  const source = pages.find((pg) => !pg.langDir && pg.i18nKey === targetPage.i18nKey);
  if (!source) throw new Error(`找不到 ${targetPage.i18nKey} 的源语言页——无法抬戳（源 i18n_rev 是 translated_rev 的基准）`);
  const srcRev = parseDoc(await readFile(p(source.content), "utf8")).fm.i18n_rev || {};
  let text = await readFile(p(targetPage.content), "utf8");
  for (const f of fields) text = setTranslatedRev(text, f, srcRev[f] ?? 1);
  await writeFile(p(targetPage.content), text, "utf8");
  await logEvent(targetPage.slug, "translate", fields);
}

// 编辑器保存链路调用：源语言页某坐标被保存 → 给对应字段加戳 + 记事件。
// 目标语言页编辑=人工润色（§3.5），不动源戳；无翻译设置/字段未追踪=静默 no-op。
export async function stampOnSave(page, coord) {
  if (page.langDir) return null; // 目标语言页：人工润色，不加源戳
  const field = coordToField(coord);
  const text = await readFile(p(page.content), "utf8");
  const { text: bumpedText, bumped, to } = bumpStampInText(text, field);
  if (!bumped) return null;
  // 抬戳的同时把该字段指纹刷到当前值（此刻文件已被 patchMarkdown 写入新值）——维护不变式，
  // 否则事后 touch 会把这次编辑器改动再判一次「变了」→ 重复抬戳。
  const out = writeFingerprints(bumpedText, { [field]: fp(fieldValue(parseDoc(bumpedText), field)) });
  await writeFile(p(page.content), out, "utf8");
  await logEvent(page.slug, "source-edit", [field]);
  return { field, to };
}

export async function touch(slug) {
  // i18nKey 跨语言相同（zh/en 同 key），故按 key 匹配时优先选源语言页（langDir 为空）
  const hits = pages.filter((pg) => pg.slug === slug || pg.i18nKey === slug || pg.slug.endsWith("/" + slug));
  const page = hits.find((pg) => !pg.langDir) || hits[0];
  if (!page) throw new Error(`未找到页面：${slug}`);
  if (page.langDir) throw new Error(`${slug} 是目标语言页；戳只加在源语言页（改源才触发同步）`);

  const rel = page.content; // src/content/....md（repo 相对）
  const working = await readFile(p(rel), "utf8");
  const cur = parseDoc(working);
  const curRev = cur.fm.i18n_rev || {};
  const storedFp = cur.fm.i18n_fp || {}; // 基准 = MD 自存指纹（决策㉗：不取 git）
  const firstRun = Object.keys(storedFp).length === 0;

  const changed = [];
  const fpUpdates = {};
  for (const key of Object.keys(curRev)) {
    const now = fp(fieldValue(cur, key) ?? "");
    fpUpdates[key] = now; // 总把指纹刷到当前值
    if (storedFp[key] === undefined) continue; // 无基线（首次/新增字段）：只落基准、不判改
    if (storedFp[key] === now) continue; // 指纹一致 = 内容自上次抬戳未变
    changed.push(key); // 指纹变了 = 内容被改过
  }

  let out = working;
  for (const key of changed) out = bumpStampInText(out, key).text; // 变了的字段 i18n_rev +1
  out = writeFingerprints(out, fpUpdates); // 刷新全部指纹（含首次 baseline）→ 保证幂等
  if (out !== working) await writeFile(p(rel), out, "utf8");
  if (changed.length) await logEvent(page.slug, "source-edit", changed);
  return { slug: page.slug, changed, baselined: firstRun };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const slug = process.argv[2];
  if (!slug) {
    console.error("用法：node scripts/i18n-touch.mjs <slug|文件名>");
    process.exit(1);
  }
  const { slug: full, changed, baselined } = await touch(slug);
  if (baselined) {
    console.log(`◆ ${full}：首次运行，已落基准指纹 i18n_fp（未抬戳）——此后改内容再 touch 即检测`);
  } else if (!changed.length) {
    console.log(`○ ${full}：源内容相对上次抬戳指纹无变化（或已 touch 过），未加戳`);
  } else {
    console.log(`✓ ${full}：${changed.length} 个字段检测到修改，已加戳并记入 .i18n-events.jsonl`);
    console.log(`  字段：${changed.join(", ")}`);
    console.log(`  → 跑 npm run i18n:status 查看各语言待更新，再处理翻译`);
  }
}
