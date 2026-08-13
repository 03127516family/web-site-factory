// 翻译引擎层（D4）：DeepSeek 首发，引擎可换（callAI 依赖注入）。
// 句级送翻：批次 30 句/次；每句带前后句上下文（仅供连贯，回写只写目标句）；
// 术语注入提示词 + 机器验收硬校验（不过→带原因重翻 ≤2 → failed）。
// callAI 契约（与真 caller 一致）：callAI(messages, tag) → 解析后的 content 对象。
import { checkSentence, checkCoverage } from './i18n-checks.mjs'

const RULES = `你是工业起重机外贸网站的翻译引擎（中→英）。铁律：
1. 只输出 JSON（不要解释、不要 markdown 围栏）；
2. lock 锁词原样保留，一个字母都不许变（型号/品牌/标准代号）；
3. map 固定译法：源句含该中文词，译文必须用它指定的英文，且不得残留中文；
4. 数字、单位、URL 一个不许丢不许改；
5. 保留行内 markdown 标记（**加粗**、[链接](url)）；
6. 只翻译 sentences 里 id 对应的 text；before/after 是上下文仅供把握连贯，绝不翻译它们；
7. B2B 工业营销腔：简洁、专业、直接。`

export function translateMessages(batch, terms) {
  const sentences = batch.map(s => ({ id: s.id, text: s.text, before: s.before ?? null, after: s.after ?? null }))
  return [
    { role: 'system', content: RULES },
    { role: 'user', content: `lock 锁词：${JSON.stringify(terms.lock)}\nmap 固定译法：${JSON.stringify(terms.map)}\n\nsentences：\n${JSON.stringify(sentences)}\n\n返回：{"translations":{"<id>":"<译文>"}}，必须覆盖每个 id` },
  ]
}

// segments: [{id, text, before, after}]；返回 { ok: {id: md}, fail: {id: reason} }
export async function translateSegments(segments, terms, { callAI, batchSize = 30, maxRetries = 2 } = {}) {
  if (!callAI) throw new Error('translateSegments 需要 callAI（依赖注入；生产=createDeepseekCaller()）')
  const ok = {}, fail = {}
  for (let off = 0; off < segments.length; off += batchSize) {
    const batch = segments.slice(off, off + batchSize)
    let pending = [...batch]
    for (let round = 0; round <= maxRetries && pending.length; round++) {
      let translations = {}
      try {
        const res = await callAI(translateMessages(pending, terms), 'i18n')
        translations = res?.translations ?? {} // callAI 契约 = 解析后的 content 对象
      } catch (e) {
        for (const s of pending) fail[s.id] = `engine:${e.message}`
        if (e.noRetry) { pending = []; break } // 4xx/截断等快败不重试
        continue
      }
      const next = []
      for (const s of pending) {
        const md = translations[s.id]
        if (typeof md !== 'string' || !md.trim()) { fail[s.id] = 'coverage:无译文'; next.push(s); continue }
        const chk = checkSentence(s.text, md, terms)
        if (chk.ok) { ok[s.id] = md.trim(); delete fail[s.id] }
        else { fail[s.id] = chk.fails.join(';'); next.push(s) } // 带原因重翻（提示词输入已变，非确定性重放）
      }
      pending = next
    }
  }
  return { ok, fail }
}
