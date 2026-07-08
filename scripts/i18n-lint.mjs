// 术语门禁：对目标语言页的译文做确定性术语校验（U-1 锁词逐字保留 + U-2 术语固定译法）。
// 无参 = 校验所有目标语言页；带 slug = 只校验该页。有违规即退出码 1（可进 CI / 发布前门禁），
// 与 i18n:status（报告非门禁）分工：status 看"译没译"，lint 看"译得对不对（术语）"。
import { pathToFileURL } from "node:url";
import { pages } from "./build.mjs";
import { lintTarget } from "./i18n-apply.mjs";

export async function lintAll() {
  const results = [];
  for (const t of pages.filter((pg) => pg.langDir)) results.push(await lintTarget(t.slug));
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const slug = process.argv[2];
  const results = slug ? [await lintTarget(slug)] : await lintAll();
  let bad = 0;
  for (const r of results) {
    if (!r.violations.length) {
      console.log(`✓ ${r.target}（${r.checked} 字段）`);
    } else {
      bad += r.violations.length;
      console.error(`✗ ${r.target}：${r.violations.length} 处`);
      for (const v of r.violations) console.error(`   [${v.kind}] ${v.field}: ${v.term}`);
    }
  }
  if (bad) {
    console.error(`\n术语 lint 失败：共 ${bad} 处违规`);
    process.exit(1);
  }
  console.log(`\n术语 lint 通过（${results.length} 个目标页）`);
}
