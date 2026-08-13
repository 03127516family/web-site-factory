// 机器验收（§5）：译文硬校验，不合格不落盘。五道：lock/map/数字/URL/覆盖率。
import { hasToken } from './i18n-terms.mjs'

export function checkSentence(srcText, tgtMd, terms) {
  const fails = []
  for (const w of terms.lock) if (hasToken(srcText, w) && !hasToken(tgtMd, w)) fails.push(`lock:${w}`)
  for (const [zh, en] of Object.entries(terms.map)) {
    if (!srcText.includes(zh)) continue
    if (!tgtMd.includes(en)) fails.push(`map-missing:${zh}→${en}`)
    if (tgtMd.includes(zh)) fails.push(`map-residual:${zh}`)
  }
  const nums = s => (String(s).match(/\d+(?:\.\d+)?/g) ?? [])
  const rest = nums(tgtMd)
  for (const n of nums(srcText)) {
    const i = rest.indexOf(n)
    if (i === -1) fails.push(`number:${n}`)
    else rest.splice(i, 1)
  }
  for (const u of String(srcText).match(/https?:\/\/[^\s)\]]+/g) ?? [])
    if (!tgtMd.includes(u)) fails.push(`url:${u}`)
  return { ok: fails.length === 0, fails }
}

// 覆盖率：送翻 id 全有译文。返回 missing 清单（空=齐）。
export function checkCoverage(ids, translations) {
  return { ok: ids.every(id => translations[id]?.trim()), missing: ids.filter(id => !translations[id]?.trim()) }
}
