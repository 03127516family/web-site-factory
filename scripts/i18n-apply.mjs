// i18n:apply —— 翻译写回驱动（本地版 M3 translate 的骨架）。
// 边界（用户拍定）：代码找活 + 代码写回，AI 只在中间「翻译」这一个节点出手，既不选址也不落盘。
// 于是本命令切成两半，恰好夹住那个翻译节点：
//
//   ① node scripts/i18n-apply.mjs <目标slug> --emit
//        代码调 i18nStatus() 找出该目标语言页的过期字段，逐个由 fieldValue 判 fm/块得【坐标】+
//        取【源文本】，机器可读 JSON 吐到 stdout。零 AI —— 后台等价于一次 status 查询。
//   ②（AI 在此翻译 ①吐出的 sourceText → 写成 { "<字段>": "<译文MD>" } 的 json）
//   ③ node scripts/i18n-apply.mjs <目标slug> --from <译文json>
//        代码【重新】由源 doc 算坐标（不信外部传入），patchMarkdown 逐字写回，再 markTranslated
//        一次抬戳 + 记一条 translate 事件。全部确定性。
//
// 产品期：翻译节点=翻译服务 Lambda，①③代码原样进后台，三步收敛成一条链（决策㉗）。
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { pages, p } from "./build.mjs";
import { i18nStatus } from "./i18n-status.mjs";
import { patchMarkdown } from "./md-write.mjs";
import { parseDoc, fieldValue, markTranslated, logEvent } from "./i18n-touch.mjs";
import { loadTerms, relevantTerms } from "./i18n-terms.mjs";

// 字段名 → 编辑坐标：与 fieldValue 同一套语义（fm 点路径解析得到→fm:，否则→mdbody:）。
// 不含任何人工判断——坐标是字段在源 doc 里「实际取自哪」推出来的（对称于 coordToField 的逆）。
function fieldCoord(srcDoc, field) {
  const viaDot = field.split(".").reduce((o, seg) => (o == null ? undefined : o[seg]), srcDoc.fm);
  return viaDot !== undefined ? `fm:${field}` : `mdbody:${field}`;
}

function resolvePair(targetSlug) {
  const target = pages.find((pg) => pg.slug === targetSlug && pg.langDir);
  if (!target) throw new Error(`未找到目标语言页：${targetSlug}（须是语言子目录下的镜像页 slug）`);
  const source = pages.find((pg) => !pg.langDir && pg.i18nKey === target.i18nKey);
  if (!source) throw new Error(`${target.i18nKey} 无源语言页——先有源再谈翻译`);
  return { target, source };
}

// ① 找活：吐出该目标页的待翻译清单（坐标 + 源文本），由 i18nStatus 定「哪些字段过期」。
async function emit(targetSlug) {
  const { target, source } = resolvePair(targetSlug);
  const report = await i18nStatus();
  const t = report.find((g) => g.key === target.i18nKey)?.targets.find((x) => x.slug === targetSlug);
  const staleFields = t?.staleFields || [];
  const srcDoc = parseDoc(await readFile(p(source.content), "utf8"));
  const allTerms = await loadTerms(source.lang, target.lang);
  const fields = staleFields.map((field) => ({ field, coord: fieldCoord(srcDoc, field), sourceText: fieldValue(srcDoc, field) }));
  // 汇总本页相关术语交翻译节点遵守：各字段出现的 lock（并集）+ map（并集）。U-1 锁词原样保留、
  // U-2 术语用固定译法——emit 只"给料"，遵守与否由翻译节点（AI）执行、apply/lint 事后确定性校验。
  const map = {};
  const lock = new Set();
  for (const f of fields) {
    const r = relevantTerms(allTerms, f.sourceText);
    r.lock.forEach((w) => lock.add(w));
    Object.assign(map, r.map);
  }
  return {
    key: target.i18nKey,
    source: source.slug,
    sourceLang: source.lang,
    target: targetSlug,
    targetLang: target.lang,
    terms: { lock: [...lock], map },
    fields,
  };
}

// ③ 写回：把译文按坐标写进目标 MD（坐标代码重算，逐字写不触发 htmlToMd），再抬戳记事件。
async function apply(targetSlug, fromPath) {
  const { target, source } = resolvePair(targetSlug);
  const translations = JSON.parse(await readFile(fromPath, "utf8")); // { <字段>: <译文MD> }
  const srcDoc = parseDoc(await readFile(p(source.content), "utf8"));
  const fields = Object.keys(translations);
  if (!fields.length) throw new Error(`译文 json 为空：${fromPath}`);
  for (const field of fields) {
    // "text"（非 rich）→ applyPatch 逐字写：fm 忽略 kind；mdbody 走 String(value)。译文本就是 MD、
    // 非编辑器 HTML，绝不能触发 htmlToMd。坐标由源 doc 重算，外部传什么都不信。
    const coord = fieldCoord(srcDoc, field);
    let value = translations[field];
    // 结构化 fm 字段（源是列表/对象，如 hero.highlights）：fieldValue 用 JSON.stringify 序列化，
    // 故译文按同一 JSON 形态传入；此处 parse 回结构再写——patchFrontmatter 的 doc.setIn 直接落
    // 结构会写成 YAML 列表，若把 JSON 字符串原样 setIn 则被当普通字符串，列表结构被压塌（数据损坏）。
    if (coord.startsWith("fm:")) {
      const srcVal = field.split(".").reduce((o, s) => (o == null ? undefined : o[s]), srcDoc.fm);
      if (srcVal !== null && typeof srcVal === "object") {
        try {
          value = JSON.parse(translations[field]);
        } catch {
          throw new Error(`字段 ${field} 是结构化数据（列表/对象），译文须是合法 JSON：${String(translations[field]).slice(0, 80)}`);
        }
      }
    }
    await patchMarkdown(p(target.content), coord, "text", value);
  }
  await markTranslated(target, fields); // 一次抬 translated_rev 到源戳 + 一条 translate 事件
  return { target: targetSlug, applied: fields };
}

// C3 镜像结构同步（U-3）：源有、目标缺的字段/段，用【源文本】灌占位（不写 translated_rev →
// 从未翻译 → 被发布门禁挡住），保证镜像结构完整、build 不因必填缺段中止。译文由 apply 逐字转正。
// 用于「源新增了段/字段」的传播：目标先有占位才谈得上翻译。
export async function syncStructure(targetSlug) {
  const { target, source } = resolvePair(targetSlug);
  const srcRaw = await readFile(p(source.content), "utf8");
  const srcDoc = parseDoc(srcRaw);
  const roster = Object.keys(srcDoc.fm.i18n_rev || {});
  const seeded = [];
  for (const field of roster) {
    const tgtDoc = parseDoc(await readFile(p(target.content), "utf8")); // 每轮重读（上轮可能已写盘）
    if (fieldValue(tgtDoc, field) !== undefined) continue; // 目标已有该字段
    const coord = fieldCoord(srcDoc, field);
    const srcVal = fieldValue(srcDoc, field);
    if (coord.startsWith("fm:")) {
      await patchMarkdown(p(target.content), coord, "text", srcVal); // fm: setIn 建路径
    } else {
      // 缺块：把源的「## 标题 <!--block:KEY-->」整块（标题+正文）追加到目标末尾。render 按 KEY
      // 定位、与 MD 顺序无关，故追加安全（决策②/§9：块由 KEY 接线）。
      const key = coord.slice("mdbody:".length);
      const heading = (new RegExp(`^##\\s+.*<!--\\s*block:${key}\\s*-->.*$`, "m").exec(srcRaw) || [`## ${key} <!--block:${key}-->`])[0];
      const raw = await readFile(p(target.content), "utf8");
      await writeFile(p(target.content), raw.replace(/\s*$/, "") + `\n\n${heading}\n${srcVal}\n`, "utf8");
    }
    seeded.push(field);
  }
  if (seeded.length) await logEvent(target.slug, "seed-placeholder", seeded);
  return { target: targetSlug, seeded };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [slug, flag, arg] = process.argv.slice(2);
  const usage =
    "用法：\n  node scripts/i18n-apply.mjs <目标slug> --emit\n  node scripts/i18n-apply.mjs <目标slug> --from <译文json>\n  node scripts/i18n-apply.mjs <目标slug> --sync-structure";
  if (!slug || !flag) {
    console.error(usage);
    process.exit(1);
  }
  if (flag === "--emit") {
    const out = await emit(slug);
    if (!out.fields.length) console.error(`○ ${slug}：无待翻译字段（已全部同步）`);
    console.log(JSON.stringify(out, null, 2));
  } else if (flag === "--from") {
    if (!arg) {
      console.error(usage);
      process.exit(1);
    }
    const { applied } = await apply(slug, arg);
    console.log(`✓ ${slug}：写回 ${applied.length} 个字段并抬戳 → ${applied.join(", ")}`);
    console.log(`  → 跑 npm run i18n:status 确认转「已同步」`);
  } else if (flag === "--sync-structure") {
    const { seeded } = await syncStructure(slug);
    if (!seeded.length) console.log(`○ ${slug}：镜像结构已完整，无缺字段`);
    else {
      console.log(`✓ ${slug}：灌源占位 ${seeded.length} 个缺字段 → ${seeded.join(", ")}`);
      console.log(`  （占位=源文本、未写 translated_rev → 发布门禁暂扣，待 --from 翻译转正）`);
    }
  } else {
    console.error(usage);
    process.exit(1);
  }
}

export { emit, apply, fieldCoord };
