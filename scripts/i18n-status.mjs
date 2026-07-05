// 多语言同步状态报告 —— 12 章 §3.1.1 manifest（关联清单）的最小内核。
// 纯函数 f(登记, 各 MD 当前内容) → 每逻辑页每目标语言 { fresh | stale + 待更新字段 }。
// 判据 = 决策⑳：目标 translated_rev.<字段> < 源 i18n_rev.<字段> 即该字段待更新——
// 只读两个「当前」MD 里的版本戳，不取历史、不碰 git、零数据库（决策㉗：产品期 MD 在
// S3、本函数原样进后台 API——CLI 与后台两个前端、一个内核）。
// 用法：node scripts/i18n-status.mjs   （退出码恒 0：报告工具，非门禁；U-4 校验落地时再分级）
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { pages, i18nGroups, p } from "./build.mjs";

async function readFm(relPath) {
  const raw = await readFile(p(relPath), "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  return m ? parseYaml(m[1]) || {} : {};
}

// 报告结构：[{ key, sourceLang, targets: [{ lang, slug, status, staleFields }] }]
export async function i18nStatus() {
  const report = [];
  for (const [key, members] of i18nGroups) {
    const source = members.find((m) => !m.langDir);
    if (!source) continue; // 孤儿镜像（有目标无源）属 U-4 校验范畴，此处跳过不误报
    const sourceRev = (await readFm(source.content)).i18n_rev || {};
    const targets = [];
    for (const target of members.filter((m) => m.langDir)) {
      const translatedRev = (await readFm(target.content)).i18n?.translated_rev || {};
      // 源有戳而目标缺记录，与 目标戳<源戳 同判「待更新」（从未译到该版=过期）
      const staleFields = Object.keys(sourceRev).filter((f) => (translatedRev[f] ?? 0) < sourceRev[f]);
      targets.push({ lang: target.lang, slug: target.slug, status: staleFields.length ? "stale" : "fresh", staleFields });
    }
    if (targets.length) report.push({ key, sourceLang: source.lang, sourceStamped: Object.keys(sourceRev).length, targets });
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await i18nStatus();
  const singles = pages.filter((pg) => !pg.langDir && !(i18nGroups.get(pg.i18nKey) || []).some((m) => m.langDir));
  console.log(`多语言状态（翻译组 ${report.length} 个；未配对源页面 ${singles.length} 个）\n`);
  for (const group of report) {
    console.log(`◆ ${group.key}（源 ${group.sourceLang}，已埋戳字段 ${group.sourceStamped}）`);
    for (const t of group.targets) {
      if (t.status === "fresh") console.log(`   ${t.lang}: ✅ 已同步（/${t.slug}/）`);
      else console.log(`   ${t.lang}: ⚠ ${t.staleFields.length} 个字段待更新 → ${t.staleFields.join(", ")}`);
    }
  }
  if (singles.length) console.log(`\n（无翻译版本：${singles.map((pg) => pg.slug).join("、")}）`);
}
