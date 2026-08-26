// 机器验收（§5）：译文硬校验，不合格不落盘。六道：lock/map/数字/URL/CJK 残留/覆盖率。
import { hasToken } from './terms.mjs'

export function checkSentence(srcText, tgtMd, terms) {
  const fails = []
  for (const w of terms.lock) if (hasToken(srcText, w) && !hasToken(tgtMd, w)) fails.push(`lock:${w}`)
  const normTerm = s => s.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim() // map 表层归一：Title Case/连字符不卡自然行文（fails 消息仍报原形）
  for (const [zh, en] of Object.entries(terms.map)) {
    if (!srcText.includes(zh)) continue
    if (!normTerm(tgtMd).includes(normTerm(en))) fails.push(`map-missing:${zh}→${en}`)
    if (tgtMd.includes(zh)) fails.push(`map-residual:${zh}`)
  }
  const stripDates = s => s.replace(/\d{4}年\d{1,2}月(\d{1,2}日?)?/g, ' ') // 中文日期英译成月份名属正确译法，源侧豁免
  // 千分位归一须替换到不动点（评审 M3）：单遍 replace 处理不了 1,234,567——'1,234' 先并、',567' 残留第二轮才并
  const stripThousands = s => { let t = String(s), p; while ((p = t.replace(/(\d),(\d{3})/g, '$1$2')) !== t) t = p; return t }
  const nums = s => (stripThousands(s).match(/\d+(?:\.\d+)?/g) ?? [])
  const rest = nums(tgtMd)
  for (const n of nums(stripDates(srcText))) {
    const i = rest.indexOf(n)
    if (i === -1) fails.push(`number:${n}`)
    else rest.splice(i, 1)
  }
  for (const u of (String(srcText).match(/https?:\/\/[^\s)\]。，；！？…」』）]+/g) ?? []).map(u => u.replace(/[.,;:!?]+$/, ''))) // 尾随 ASCII 标点剥离；CJK 排除是非显然 WHY，注释留着
    if (!tgtMd.includes(u)) fails.push(`url:${u}`)
  if (/[㐀-鿿]/.test(tgtMd)) fails.push('cjk-residual') // 第六道：译文零中文残留（auto 语言的兜底闸）
  return { ok: fails.length === 0, fails }
}

// 覆盖率：送翻 id 全有译文。返回 missing 清单（空=齐）。
export function checkCoverage(ids, translations) {
  const bad = id => typeof translations[id] !== 'string' || !translations[id].trim() // 畸形值（非字符串）不抛、记 missing
  return { ok: !ids.some(bad), missing: ids.filter(bad) }
}
