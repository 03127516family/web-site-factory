// 站点层术语/锁词表的加载与确定性校验（U-1 行内保护词 + U-2 术语，合一）。
// 表文件：src/i18n/terms.<src>.<tgt>.yaml（lock: 锁词原样保留；map: 中文→固定英文）。
// 翻译节点（AI）遵守表；本模块提供代码侧的注入选料（relevantTerms）与违规校验（lintField），
// 供 i18n-apply（emit 注入 / apply 后 lint）与 i18n-lint（独立门禁）复用。变更走评审（决策 #8）。
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { p } from "./build.mjs";

export async function loadTerms(srcLang, tgtLang) {
  try {
    const y = parseYaml(await readFile(p(`src/i18n/terms.${srcLang}.${tgtLang}.yaml`), "utf8")) || {};
    return { lock: Array.isArray(y.lock) ? y.lock : [], map: y.map && typeof y.map === "object" ? y.map : {} };
  } catch {
    return { lock: [], map: {} }; // 无术语文件 = 空表，不强制（该站点未声明术语）
  }
}

// 纯字母数字锁词按【词边界】匹配（避免 CD/MD/LD 命中 LDC 或单词内部）；含非 alnum 的照子串。
function hasToken(text, token) {
  const s = String(text ?? "");
  if (/^[A-Za-z0-9]+$/.test(token)) return new RegExp(`(?<![A-Za-z0-9])${token}(?![A-Za-z0-9])`).test(s);
  return s.includes(token);
}

// 取与给定文本相关的术语（emit 注入用）：文本里出现的 lock + map 键。
export function relevantTerms(terms, text) {
  const s = String(text ?? "");
  const map = {};
  for (const [zh, en] of Object.entries(terms.map)) if (s.includes(zh)) map[zh] = en;
  return { lock: terms.lock.filter((w) => hasToken(s, w)), map };
}

// 校验一个字段译文是否遵守术语，返回违规数组（空 = 通过）。判据只看源/译两串文本，确定性。
// 只报【高置信】两类，避免跟译者正常选词（大小写/连字符/近义）打架：
//   lock-lost   —— 源里的锁词（型号/品牌）译文丢了（应逐字保留）
//   map-residual —— 源里的中文术语在英文译文里原样残留（= 漏译，英文页不该出现中文）
// 术语「固定译法」（map 的英文值）不做后置硬校验——那是给翻译节点的引导（emit 注入），
// 逐字精确匹配误报率过高（overhead crane / single-girder 等合法变体），故只在提示层用。
export function lintField(field, sourceText, targetText, terms) {
  const src = String(sourceText ?? "");
  const tgt = String(targetText ?? "");
  const v = [];
  for (const w of terms.lock) if (hasToken(src, w) && !hasToken(tgt, w)) v.push({ field, kind: "lock-lost", term: w });
  for (const zh of Object.keys(terms.map)) if (src.includes(zh) && tgt.includes(zh)) v.push({ field, kind: "map-residual", term: zh });
  return v;
}
