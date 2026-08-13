// 术语/锁词表（D7/D8）：JSON 存储 + 读写收口。控制台④表格管理的落盘点。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

const file = (src, tgt) => join(process.cwd(), 'src', 'i18n', `terms.${src}.${tgt}.json`)

export function loadTerms(srcLang, tgtLang) {
  const f = file(srcLang, tgtLang)
  if (!existsSync(f)) return { lock: [], map: {} }
  const j = JSON.parse(readFileSync(f, 'utf8'))
  return { lock: Array.isArray(j.lock) ? j.lock : [], map: j.map && typeof j.map === 'object' ? j.map : {} }
}

// 校验：lock 去重非空；map 键值非空。烂词条拒收不落盘（schema 纪律同款）。
export function saveTerms(srcLang, tgtLang, { lock, map }) {
  if (!Array.isArray(lock) || typeof map !== 'object' || !map) throw new Error('术语表结构非法')
  const seen = new Set()
  for (const w of lock) {
    if (typeof w !== 'string' || !w.trim()) throw new Error('锁词空值拒收')
    if (seen.has(w)) throw new Error(`锁词重复拒收：${w}`)
    seen.add(w)
  }
  for (const [zh, en] of Object.entries(map)) {
    if (!zh.trim() || typeof en !== 'string' || !en.trim()) throw new Error(`固定译法空值拒收：${zh}`)
  }
  const f = file(srcLang, tgtLang)
  mkdirSync(dirname(f), { recursive: true })
  writeFileSync(f, JSON.stringify({ lock, map }, null, 2) + '\n')
}

// 纯字母数字锁词按词边界匹配（CD 不误伤 LDC）；含非 alnum 照子串。
export function hasToken(text, token) {
  const s = String(text ?? '')
  if (/^[A-Za-z0-9]+$/.test(token)) return new RegExp(`(?<![A-Za-z0-9])${token}(?![A-Za-z0-9])`).test(s)
  return s.includes(token)
}

export function relevantTerms(terms, text) {
  const s = String(text ?? '')
  const map = {}
  for (const [zh, en] of Object.entries(terms.map)) if (s.includes(zh)) map[zh] = en
  return { lock: terms.lock.filter(w => hasToken(s, w)), map }
}
