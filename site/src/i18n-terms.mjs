// 术语/锁词表（D7/D8）：JSON 存储 + 读写收口。控制台④表格管理的落盘点。
//   lock = 原样保留词（型号/品牌/标准代号，译文必须逐字含；纯 alnum 走词边界）
//   map  = 中文术语 → 固定英文译法（源含该词，译文须含固定英文且不得残留中文）
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { assertLangCode } from './i18n-tm.mjs' // 评审 C1：src/tgt 进路径，同 TM 一道白名单闸

const file = (src, tgt) => join(process.cwd(), 'src', 'i18n', `terms.${assertLangCode(src)}.${assertLangCode(tgt)}.json`)

export function loadTerms(srcLang, tgtLang) {
  const f = file(srcLang, tgtLang)
  if (!existsSync(f)) return { lock: [], map: {} }
  let j
  try { j = JSON.parse(readFileSync(f, 'utf8')) } catch (e) { throw new Error(`术语表损坏 ${f}: ${e.message}`) }
  return { lock: Array.isArray(j.lock) ? j.lock : [], map: j.map && typeof j.map === 'object' ? j.map : {} }
}

// 校验：lock 去重非空；map 键值非空。烂词条拒收不落盘（schema 纪律同款）。
export function saveTerms(srcLang, tgtLang, { lock, map }) {
  if (!Array.isArray(lock) || typeof map !== 'object' || !map || Array.isArray(map)) throw new Error('术语表结构非法')
  const cleanLock = lock.map(w => (typeof w === 'string' ? w.trim() : w))
  const seen = new Set()
  for (const w of cleanLock) {
    if (typeof w !== 'string' || !w) throw new Error('锁词空值拒收')
    if (seen.has(w)) throw new Error(`锁词重复拒收：${w}`) // trim 后判重——' HD' 与 'HD ' 撞车当场抓
    seen.add(w)
  }
  const cleanMap = {}
  for (const [zh, en] of Object.entries(map)) {
    const k = zh.trim(), v = typeof en === 'string' ? en.trim() : en
    if (!k || typeof v !== 'string' || !v) throw new Error(`固定译法空值拒收：${zh}`)
    cleanMap[k] = v
  }
  const f = file(srcLang, tgtLang)
  mkdirSync(dirname(f), { recursive: true })
  writeFileSync(f, JSON.stringify({ lock: cleanLock, map: cleanMap }, null, 2) + '\n')
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
