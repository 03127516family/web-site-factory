// i18n 字段与 run 库（翻译回路共用，R40/R41）。
// 名册字段语义平移旧 fieldValue：点路径解析；命中 {title, body:doc} 容器 → 取 body 树（≡ 旧 ## 块）。
// run = 树里一处可译文字（段落/标题的行内容，或图片 alt），按路径寻址——
// 树骨架由代码保留，译文永远爆不了骨架（R41 的 JSON 化红利）。
import { createHash } from 'node:crypto'
import { getIn } from './tree-utils.mjs'
import { inlineMdToNodes } from './mdast-tree.mjs'

// 名册字段 → JSON 当前值（string | doc树 | undefined）
export function fieldValueOf(j, field) {
  const v = getIn(j, field)
  if (v && typeof v === 'object' && !Array.isArray(v) && v.body?.type === 'doc') return v.body
  return v
}

// ---------- 指纹（i18n_fp）：字符串直接 sha1；树/结构走键排序规范化串行（免疫键序漂移） ----------
const canon = v =>
  Array.isArray(v) ? `[${v.map(canon).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`
  : JSON.stringify(v)
export const fp = value =>
  createHash('sha1').update(typeof value === 'string' ? value : canon(value ?? '')).digest('hex').slice(0, 12)

// ---------- 行内节点 → 单行 markdown（emit 给翻译节点的载体；与 inlineMdToNodes 互逆） ----------
const escMd = s => s.replace(/\\/g, '\\\\').replace(/([`*_[\]])/g, '\\$1')
function inlineNode(n) {
  if (n.type === 'hardBreak') return '  \n'
  if (n.type !== 'text') throw new Error(`行内位未知节点 "${n.type}"（先定语义再扩，不静默降级）`)
  return (n.marks ?? []).reduce((s, m) => {
    switch (m.type) {
      case 'bold': return `**${s}**`
      case 'italic': return `*${s}*`
      case 'code': return s.includes('`') ? `` ` ${s} ` `` : `\`${s}\``
      case 'link': return `[${s}](${m.attrs?.href ?? ''})`
      case 'span': throw new Error('span 标记 markdown 表达不了（class 会丢）——该字段不能走 run 翻译，需人工')
      default: throw new Error(`未知标记 "${m.type}"`)
    }
  }, escMd(n.text))
}
export const inlineToMd = nodes => (nodes ?? []).map(inlineNode).join('')

// ---------- 抽 run：段落/标题 → 行内容 md；图片 → alt。路径 = 树内寻址（'content[3].content[1]'） ----------
export function extractRuns(node, path = '', out = []) {
  if (node.type === 'paragraph' || node.type === 'heading') {
    const md = inlineToMd(node.content)
    if (md.trim()) out.push({ path, md }) // 空段无可译内容，不占位
    return out // 段落/标题没有更深的可译内容
  }
  if (node.type === 'image') {
    if (node.attrs?.alt?.trim()) out.push({ path, md: node.attrs.alt })
    return out
  }
  ;(node.content ?? []).forEach((c, i) => extractRuns(c, path ? `${path}.content[${i}]` : `content[${i}]`, out))
  return out
}

// ---------- 套译文：克隆源树 + 按 run 路径替换 —— 骨架恒 ≡ 源树（R36 镜像随源，结构零漂移） ----------
// runs: { '<path>': '<译文 md>' }。覆盖率硬校验：译文 runs 必须与源树抽出的 runs 一一对应，
// 缺 run = 那段会留着中文静默漏译，多 run = 译文与源版本错位——都抛错，回去重 emit。
export function applyRuns(srcTree, runs) {
  const expected = extractRuns(srcTree).map(r => r.path)
  const got = Object.keys(runs)
  const missing = expected.filter(p => !(p in runs))
  const extra = got.filter(p => !expected.includes(p))
  if (missing.length || extra.length)
    throw new Error(`run 覆盖不齐：缺 [${missing.join(', ') || '无'}] 多 [${extra.join(', ') || '无'}]——重新 --emit 取最新清单`)
  const tree = structuredClone(srcTree)
  for (const [path, md] of Object.entries(runs)) {
    const node = getIn(tree, path)
    if (!node) throw new Error(`run 路径在源树不存在：${path}（译文与源版本错位，重新 --emit）`)
    if (node.type === 'image') node.attrs.alt = String(md) // alt 是纯文本，不走 md 解析
    else if (node.type === 'paragraph' || node.type === 'heading') node.content = inlineMdToNodes(md)
    else throw new Error(`run 路径落到了 ${node.type}（只认 paragraph/heading/image）：${path}`)
  }
  return tree
}
