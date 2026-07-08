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
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { pages, p } from "./build.mjs";
import { i18nStatus } from "./i18n-status.mjs";
import { patchMarkdown } from "./md-write.mjs";
import { parseDoc, fieldValue, markTranslated } from "./i18n-touch.mjs";

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
  return {
    key: target.i18nKey,
    source: source.slug,
    sourceLang: source.lang,
    target: targetSlug,
    targetLang: target.lang,
    fields: staleFields.map((field) => ({ field, coord: fieldCoord(srcDoc, field), sourceText: fieldValue(srcDoc, field) })),
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
    await patchMarkdown(p(target.content), fieldCoord(srcDoc, field), "text", translations[field]);
  }
  await markTranslated(target, fields); // 一次抬 translated_rev 到源戳 + 一条 translate 事件
  return { target: targetSlug, applied: fields };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [slug, flag, arg] = process.argv.slice(2);
  const usage = "用法：\n  node scripts/i18n-apply.mjs <目标slug> --emit\n  node scripts/i18n-apply.mjs <目标slug> --from <译文json>";
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
  } else {
    console.error(usage);
    process.exit(1);
  }
}

export { emit, apply, fieldCoord };
