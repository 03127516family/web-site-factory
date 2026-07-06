// i18n:touch —— 过渡期"改完自动加戳"的那根线（决策⑳ 的 git 兜底路径 §3.3 的本地实体）。
// 产品期由编辑器保存链路在写值那一刻加戳（M3）；本地期编辑器还没接自动加戳，于是用
// git 这个现成的"修改日志"补：比对工作区 vs HEAD，认出源 MD 里哪些【字段】变了，给
// 对应的 i18n_rev 戳 +1，并追加一条【字段级事件】到 .i18n-events.jsonl（= M3 DynamoDB
// 事件日志的本地预览）。一次检测，两个产物：喂戳（状态）+ 留痕（历史），不互相抢答。
//
// 用法：node scripts/i18n-touch.mjs <slug|文件名>   （改完中文、翻译英文之前跑）
// 基准 = git HEAD（上次提交）：所以工作流是「改 → touch → 处理英文 → 一起 commit」，
// commit 后基准重置。已提交但没 touch 的改动它看不到（编辑器被绕过的已知局限，同 §3.3）。
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { pages, p, ROOT } from "./build.mjs";

// 把一份 MD 文本解析成 { fm(frontmatter 对象), blocks(块KEY→正文文本) }
function parseDoc(text) {
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
function fieldValue(doc, key) {
  const viaDot = key.split(".").reduce((o, seg) => (o == null ? undefined : o[seg]), doc.fm);
  if (viaDot !== undefined) return typeof viaDot === "string" ? viaDot.trim() : JSON.stringify(viaDot);
  return doc.blocks[key]; // 正文块
}

// 在 frontmatter 的 i18n_rev 段内，把某字段的戳 +1（只动这一段，避免误伤同名行）
function bumpStamp(text, key, from) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)[1];
  const start = fm.search(/^i18n_rev:/m);
  const after = fm.slice(start).search(/\n(?=\S)/); // i18n_rev 段到下一个顶格键为止
  const end = after === -1 ? fm.length : start + after;
  const region = fm.slice(start, end);
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bumped = region.replace(new RegExp(`^(\\s+${esc}:\\s*)${from}\\s*$`, "m"), `$1${from + 1}`);
  return text.replace(region, bumped);
}

export async function touch(slug) {
  // i18nKey 跨语言相同（zh/en 同 key），故按 key 匹配时优先选源语言页（langDir 为空）
  const hits = pages.filter((pg) => pg.slug === slug || pg.i18nKey === slug || pg.slug.endsWith("/" + slug));
  const page = hits.find((pg) => !pg.langDir) || hits[0];
  if (!page) throw new Error(`未找到页面：${slug}`);
  if (page.langDir) throw new Error(`${slug} 是目标语言页；戳只加在源语言页（改源才触发同步）`);

  const rel = page.content; // src/content/....md（repo 相对）
  const working = await readFile(p(rel), "utf8");
  let headText;
  try {
    headText = execSync(`git show HEAD:"${rel}"`, { cwd: ROOT, encoding: "utf8" });
  } catch {
    throw new Error(`${rel} 在 HEAD 中不存在（新文件）——首次翻译不需要 touch，直接翻即可`);
  }

  const cur = parseDoc(working);
  const head = parseDoc(headText);
  const curRev = cur.fm.i18n_rev || {};
  const headRev = head.fm.i18n_rev || {};

  const changed = [];
  for (const key of Object.keys(curRev)) {
    if (fieldValue(cur, key) === fieldValue(head, key)) continue; // 内容没变
    if ((curRev[key] ?? 0) > (headRev[key] ?? 0)) continue; // 已经 touch 过（幂等）
    changed.push(key);
  }

  let out = working;
  for (const key of changed) out = bumpStamp(out, key, curRev[key]);
  if (changed.length) await writeFile(p(rel), out, "utf8");

  // 追加字段级事件（本地 .i18n-events.jsonl = M3 事件日志的本地预览；持久底账仍是 git 提交）
  if (changed.length) {
    let actor = "unknown";
    try {
      actor = execSync("git config user.name", { cwd: ROOT, encoding: "utf8" }).trim() || actor;
    } catch { /* 无 git 身份时留 unknown */ }
    const entry = {
      ts: new Date().toISOString(),
      actor,
      slug: page.slug,
      action: "source-edit",
      fields: changed,
    };
    await appendFile(p(".i18n-events.jsonl"), JSON.stringify(entry) + "\n", "utf8");
  }
  return { slug: page.slug, changed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const slug = process.argv[2];
  if (!slug) {
    console.error("用法：node scripts/i18n-touch.mjs <slug|文件名>");
    process.exit(1);
  }
  const { slug: full, changed } = await touch(slug);
  if (!changed.length) {
    console.log(`○ ${full}：源内容相对 HEAD 无字段变化（或已 touch 过），未加戳`);
  } else {
    console.log(`✓ ${full}：${changed.length} 个字段检测到修改，已加戳并记入 .i18n-events.jsonl`);
    console.log(`  字段：${changed.join(", ")}`);
    console.log(`  → 跑 npm run i18n:status 查看各语言待更新，再处理翻译`);
  }
}
