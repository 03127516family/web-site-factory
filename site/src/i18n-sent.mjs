// 句级切分（D5）：翻译单元 = 句。指纹 = 源句归一文本 sha1 前 12，位置无关（重排/跨页免疫）。
// 护栏：小数点不切（3.5）；字母缩写不切（U.S.A.）；英文句点须跟空格/换行/结尾；
// hardBreak 强制成界；链接跨句不硬切（合并为一单元，保 marks 不烂）。
import { createHash } from 'node:crypto'
import { inlineMdToNodes } from './mdast-tree.mjs'

export const norm = t => String(t ?? '').trim().replace(/\s+/g, ' ')
export const fp = text => createHash('sha1').update(norm(text)).digest('hex').slice(0, 12)

// 纯文本句界 → 区间 [{start,end,text}]（保留原字符含尾标点；句界后随空白归前一句；空白区间忽略）
export function splitPlain(text) {
  const s = String(text ?? '')
  const cuts = [0]
  const pushCut = from => { let j = from; while (j < s.length && (s[j] === ' ' || s[j] === '\n')) j++; cuts.push(j) }
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '。' || c === '！' || c === '？' || c === '…' || c === '!' || c === '?') { pushCut(i + 1); continue }
    if (c === '.') {
      if (/\d/.test(s[i - 1] ?? '') && /\d/.test(s[i + 1] ?? '')) continue      // 小数点
      if (/(?:^|\s)(?:[A-Za-z]\.)+$/.test(s.slice(0, i + 1))) continue           // U.S.A. 类缩写
      const next = s[i + 1] ?? ''
      if (next === '' || next === ' ' || next === '\n') pushCut(i + 1)
    }
  }
  if (cuts[cuts.length - 1] !== s.length) cuts.push(s.length)
  const out = []
  for (let i = 0; i + 1 < cuts.length; i++) {
    const t = s.slice(cuts[i], cuts[i + 1])
    if (t.trim()) out.push({ start: cuts[i], end: cuts[i + 1], text: t })
  }
  return out
}

// 行内节点 → { text, spans:[{start,end}] }。hardBreak 强制界；链接节点字符区间内部的界丢弃（跨句合并）。
export function inlineSpans(nodes) {
  let text = ''
  const linkRanges = []
  const breaks = []
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') { breaks.push(text.length + 1); text += '\n'; continue }
    if (n.type !== 'text') throw new Error(`行内位未知节点 "${n.type}"`)
    if ((n.marks ?? []).some(m => m.type === 'link')) linkRanges.push([text.length, text.length + n.text.length])
    text += n.text
  }
  const cuts = new Set([0, text.length])
  for (const sp of splitPlain(text)) cuts.add(sp.end)
  for (const b of breaks) cuts.add(b)
  for (const [lo, hi] of linkRanges) for (const c of [...cuts]) if (c > lo && c < hi) cuts.delete(c)
  const sorted = [...cuts].sort((a, b) => a - b)
  const spans = []
  for (let i = 0; i + 1 < sorted.length; i++) {
    const t = text.slice(sorted[i], sorted[i + 1])
    if (t.trim()) spans.push({ start: sorted[i], end: sorted[i + 1] })
  }
  return { text, spans }
}

const escMd = s => s.replace(/\\/g, '\\\\').replace(/([`*_[\]])/g, '\\$1')
function wrapMarks(text, marks) {
  return (marks ?? []).reduce((acc, m) => {
    switch (m.type) {
      case 'bold': return `**${acc}**`
      case 'italic': return `*${acc}*`
      case 'code': return acc.includes('`') ? `` ` ${acc} ` `` : `\`${acc}\``
      case 'link': return `[${acc}](${m.attrs?.href ?? ''})`
      case 'span': throw new Error('span 不进句 md（i18n-pending 注解须先剥离）')
      default: throw new Error(`未知标记 "${m.type}"`)
    }
  }, escMd(text))
}

// 字符区间 → 行内 md（marks 按节点重挂；hardBreak → "  \n"）
export function sliceInlineMd(nodes, start, end) {
  const parts = []
  let pos = 0
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') { pos += 1; if (pos > start && pos <= end) parts.push('  \n'); continue }
    const s = Math.max(start, pos), e = Math.min(end, pos + n.text.length)
    if (s < e) parts.push(wrapMarks(n.text.slice(s - pos, e - pos), n.marks))
    pos += n.text.length
  }
  return parts.join('').trim()
}

// 段落/标题行内容 → 句单元 [{si, md}]
export function extractInlineUnits(nodes) {
  const { spans } = inlineSpans(nodes)
  return spans.map((sp, si) => ({ si, md: sliceInlineMd(nodes, sp.start, sp.end) })).filter(u => u.md)
}

// 译文回植：第 si 句替换为 inlineMdToNodes(newMd)，其余原样（保序保 marks）
export function applyInlineUnit(nodes, si, newMd) {
  const { spans } = inlineSpans(nodes)
  const sp = spans[si]
  if (!sp) throw new Error(`句序号越界 si=${si}（共 ${spans.length} 句）`)
  const fresh = inlineMdToNodes(newMd)
  const out = []
  let pos = 0, inserted = false
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') {
      const p = pos; pos += 1
      if (p + 1 <= sp.start || p >= sp.end) out.push(n)
      else if (!inserted) { out.push(...fresh); inserted = true }
      continue
    }
    const len = n.text.length
    const headTo = Math.min(sp.start, pos + len)
    if (pos < headTo) out.push({ ...n, text: n.text.slice(0, headTo - pos) })
    if (pos + len > sp.start && pos < sp.end && !inserted) { out.push(...fresh); inserted = true }
    const tailFrom = Math.max(sp.end, pos)
    if (tailFrom < pos + len) out.push({ ...n, text: n.text.slice(tailFrom - pos) })
    pos += len
  }
  if (!inserted) out.push(...fresh)
  return out.filter(n => n.type !== 'text' || n.text !== '')
}
