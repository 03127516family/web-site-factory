// TM 翻译记忆库（D5/D7）：翻译唯一真相。读写收口本文件（R13：换库=改这里+一次性脚本）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

// 语言码白名单（评审 C1：路径穿越防线）：src/tgt 只许 [\w-]，"../" 越狱当场拒——
// 进文件路径的唯一闸口，terms 表同款复用；端点层无需各自再防。
export const assertLangCode = x => {
  if (!/^[\w-]+$/.test(String(x))) throw new Error(`语言码非法: ${JSON.stringify(String(x))}`)
  return x
}

export const tmPath = (src, tgt) => join(process.cwd(), 'src', 'i18n', 'data', `tm.${assertLangCode(src)}.${assertLangCode(tgt)}.json`)

export function loadTm(src, tgt) {
  const f = tmPath(src, tgt)
  if (!existsSync(f)) return { pair: `${src}>${tgt}`, sentences: {}, pins: {} }
  const j = JSON.parse(readFileSync(f, 'utf8'))
  return { pair: j.pair ?? `${src}>${tgt}`, sentences: j.sentences ?? {}, pins: j.pins ?? {} }
}
export function saveTm(src, tgt, tm) {
  const f = tmPath(src, tgt)
  mkdirSync(dirname(f), { recursive: true })
  writeFileSync(f, JSON.stringify(tm, null, 2) + '\n')
}
// 部分更新：未提字段保留；updatedAt 自动盖
export function upsert(tm, fp, entry) {
  tm.sentences[fp] = { ...tm.sentences[fp], ...entry, updatedAt: new Date().toISOString() }
}

// 站点层 i18n 配置（控制台开关 + 语言分级）
const CONFIG = () => join(process.cwd(), 'src', 'i18n', 'data', 'config.json')
const DEFAULTS = { auto: true, review: { en: 'required' } }
export function loadConfig() {
  if (!existsSync(CONFIG())) return structuredClone(DEFAULTS)
  let j
  try { j = JSON.parse(readFileSync(CONFIG(), 'utf8')) } catch (e) { throw new Error(`i18n 配置文件损坏 ${CONFIG()}: ${e.message}`) }
  if (!j || typeof j !== 'object') throw new Error(`i18n 配置文件非法（须为对象）: ${CONFIG()}`)
  return { ...structuredClone(DEFAULTS), ...j, review: { ...DEFAULTS.review, ...(j.review ?? {}) } }
}
export function saveConfig(patch) {
  const cur = loadConfig()
  const next = { ...cur, ...patch, review: { ...cur.review, ...(patch.review ?? {}) } }
  mkdirSync(dirname(CONFIG()), { recursive: true })
  writeFileSync(CONFIG(), JSON.stringify(next, null, 2) + '\n')
  return next
}
