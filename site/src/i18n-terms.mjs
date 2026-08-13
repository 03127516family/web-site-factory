// 站点层术语/锁词表的加载与注入选料（U-1 行内保护词 + U-2 术语，合一；平移旧 i18n-terms.mjs）。
// 表文件：src/i18n/terms.<src>.<tgt>.yaml（lock: 锁词原样保留；map: 中文→固定英文）。
// 用途：i18n-apply --emit 把本页相关术语注入翻译提示，交翻译节点（AI）遵守——纯提示词，不做
// 后置硬校验（对能读指令的 AI 属过度设计；日后若换笨 MT 读不懂提示，再加回 lint）。变更走评审。
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

export function loadTerms(srcLang, tgtLang) {
  const file = join(process.cwd(), 'src', 'i18n', `terms.${srcLang}.${tgtLang}.yaml`)
  if (!existsSync(file)) return { lock: [], map: {} } // 无术语文件 = 空表，不强制（该站点未声明术语）
  const y = yaml.load(readFileSync(file, 'utf8')) || {}
  return { lock: Array.isArray(y.lock) ? y.lock : [], map: y.map && typeof y.map === 'object' ? y.map : {} }
}

// 纯字母数字锁词按【词边界】匹配（避免 CD/MD/LD 命中 LDC 或单词内部）；含非 alnum 的照子串。
function hasToken(text, token) {
  const s = String(text ?? '')
  if (/^[A-Za-z0-9]+$/.test(token)) return new RegExp(`(?<![A-Za-z0-9])${token}(?![A-Za-z0-9])`).test(s)
  return s.includes(token)
}

// 取与给定文本相关的术语（emit 注入用）：文本里出现的 lock + map 键。
export function relevantTerms(terms, text) {
  const s = String(text ?? '')
  const map = {}
  for (const [zh, en] of Object.entries(terms.map)) if (s.includes(zh)) map[zh] = en
  return { lock: terms.lock.filter(w => hasToken(s, w)), map }
}
