// 流水线（spec §4/§5/§6）：中文发布 → 检测 → 送翻 → 回写 TM → 重投影镜像。
// 结构同步 = 重投影的免费结果（镜像骨架恒 ≡ 源树，无需独立同步逻辑）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { scanPages, buildGroups } from './i18n.mjs'
import { collectUnits } from './i18n-collect.mjs'
import { projectPage } from './i18n-project.mjs'
import { loadTm, saveTm, upsert, loadConfig } from './i18n-tm.mjs'
import { loadTerms } from './i18n-terms.mjs'
import { translateSegments } from './i18n-engine.mjs'
import { extractInlineUnits, norm } from './i18n-sent.mjs'
import { getIn } from './tree-utils.mjs'
import { logEvent } from './i18n-events.mjs'

const CONTENT = () => join(process.cwd(), 'content')
const readJ = f => JSON.parse(readFileSync(join(CONTENT(), f), 'utf8'))
const writeJ = (f, j) => {
  const abs = join(CONTENT(), f)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, JSON.stringify(j, null, 2) + '\n')
}

function findSource(pageId) {
  const groups = buildGroups(scanPages())
  const members = groups.get(pageId)
  if (!members) throw new Error(`族谱里找不到：${pageId}`)
  const source = members.find(m => !m.langDir)
  if (!source) throw new Error(`${pageId} 无源语言页`)
  return source
}

// 单元上下文：同字段内相邻句（前后各一）。输入须是【未过滤的全量单元】——先挂上下文再滤送翻集，
// 否则 before/after 会跳过 TM 已命中的邻居句（质量审 M-4）。
function withContext(units) {
  return units.map((u, i) => ({
    ...u,
    before: units[i - 1]?.field === u.field ? units[i - 1].text : null,
    after: units[i + 1]?.field === u.field ? units[i + 1].text : null,
  }))
}

// 主入口：中文「发布」事件（或手动送翻）。translate=false = 开关关：只检测+重投影
export async function runPipeline(pageId, { lang = 'en', translate = true, callAI = null } = {}) {
  const source = findSource(pageId)
  const srcJ = readJ(source.file)
  const tm = loadTm(srcJ.page.lang, lang)
  const units = collectUnits(srcJ)
  const missing = withContext(units).filter(u => !tm.sentences[u.fp])
  let translated = 0, failed = 0
  if (translate && missing.length) {
    const terms = loadTerms(srcJ.page.lang, lang)
    const r = await translateSegments(missing, terms, { callAI })
    for (const u of missing) {
      if (r.ok[u.id]) { upsert(tm, u.fp, { text: u.text, translation: r.ok[u.id], status: 'draft', origin: 'engine' }); translated++ }
      else { upsert(tm, u.fp, { text: u.text, translation: '', status: 'failed', origin: 'engine', error: r.fail[u.id] ?? 'unknown' }); failed++ }
    }
    saveTm(srcJ.page.lang, lang, tm)
    logEvent(source.slug, 'auto-translate', { lang, translated, failed })
  }
  // 重投影镜像（结构同步在此）：full 模式 + 保留现有 status；auto 语言直发
  const mirFile = join(lang, source.file)
  const existing = existsSync(join(CONTENT(), mirFile)) ? readJ(mirFile) : null
  const cfg = loadConfig()
  const status = existing?.page?.status ?? (cfg.review[lang] === 'auto' ? 'published' : 'draft')
  const mirror = projectPage(srcJ, tm, 'full', { lang, existingStatus: status, existingTrail: existing?.breadcrumb?.trail })
  writeJ(mirFile, mirror)
  return { pageId, lang, translated, failed, pending: units.filter(u => tm.sentences[u.fp]?.status !== 'approved').length }
}

// 全站批量（控制台③ / 存量补翻 D6）
export async function translateAll({ lang = 'en', callAI } = {}) {
  const pages = scanPages().filter(p => !p.langDir)
  const out = []
  for (const pg of pages) out.push(await runPipeline(pg.pageId, { lang, translate: true, callAI }))
  return out
}

// 修正③（我已裁定，照此实现）：sameish 守卫——投影 artifact 与真人工编辑的区分线。
// 重投影写镜像时句尾分隔符可能有合成/清边差异（T4 空格合成、approved 清边），
// 严格不等会把自家投影误当人工审批（adoptMirror 空跑也 approve 全部=假审）。
const sameish = (a, b) =>
  norm(a).replace(/[\s。！？）)」』.,;:!?]+$/g, '') === norm(b).replace(/[\s。！？）)」』.,;:!?]+$/g, '')

// 镜像保存 = 人审写回（R44）：镜像句与 TM 不同 → approved；未译占位被改 → 新建 approved。返回写回句数。
export function adoptMirror(mirrorJ, srcJ, tm, lang) {
  const units = collectUnits(srcJ)
  let n = 0
  for (const u of units) {
    const cur = mirrorSentence(mirrorJ, u)
    if (cur === null) continue // 镜像里该坐标不存在（人删了）——重投影会恢复，跳过
    const e = tm.sentences[u.fp]
    if (e) {
      if (sameish(cur, u.text)) continue // 仍是中文占位/未变
      if (sameish(cur, e.translation)) continue // 只是投影 artifact，非人工编辑
      upsert(tm, u.fp, { translation: cur, status: 'approved', origin: 'human' }); n++
    } else if (!sameish(cur, u.text)) {
      upsert(tm, u.fp, { text: u.text, translation: cur, status: 'approved', origin: 'human' }); n++
    }
  }
  if (n) { saveTm(srcJ.page.lang, lang, tm); logEvent(srcJ.page.slug, 'review-edit', { lang, sentences: n }) }
  return n
}

// 镜像某单元的当前句（字段=值；树=按坐标取句；剥 i18n-pending 注解）。取不到返 null。
function mirrorSentence(mirrorJ, u) {
  if (u.kind === 'field') {
    const v = getIn(mirrorJ, u.field)
    return typeof v === 'string' ? v : null
  }
  const tree = getIn(mirrorJ, u.field)
  if (tree?.type !== 'doc') return null
  const node = getIn(tree, u.path)
  if (!node) return null
  const strip = marks => (marks ?? []).filter(m => !(m.type === 'span' && m.attrs?.class === 'i18n-pending'))
  if (u.kind === 'alt') return node.attrs?.alt ?? null
  const inner = (node.type === 'heading' || node.type === 'paragraph') ? (node.content ?? []) : (node.content?.[0]?.content ?? [])
  const cleaned = inner.map(x => x.type === 'text' ? { ...x, marks: strip(x.marks) } : x)
  if (u.kind === 'sent') {
    const units = extractInlineUnits(cleaned)
    return units[u.si]?.md ?? null
  }
  const units = extractInlineUnits(cleaned)
  return units.map(x => x.md).join('') || null // block/cell 整体
}

// 通过并发布（审阅页按钮）：本页全部 draft → approved，failed 不动；镜像 status → published；重投影
export function approvePage(pageId, lang, tm, readSrc) {
  const srcJ = readSrc(pageId)
  const units = collectUnits(srcJ)
  let n = 0
  for (const u of units) {
    const e = tm.sentences[u.fp]
    if (e?.status === 'draft') { upsert(tm, u.fp, { status: 'approved', origin: 'human' }); n++ }
  }
  saveTm(srcJ.page.lang, lang, tm)
  const source = findSource(pageId)
  const mirFile = join(lang, source.file)
  const existingTrail = existsSync(join(CONTENT(), mirFile)) ? readJ(mirFile).breadcrumb?.trail : null
  const mirror = projectPage(srcJ, tm, 'full', { lang, existingStatus: 'published', existingTrail })
  writeJ(mirFile, mirror)
  logEvent(source.slug, 'approve-publish', { lang, sentences: n })
  return n
}

// 控制台数据源：每页×每镜像语言 待审/失败/总数
export function consoleData() {
  const cfg = loadConfig()
  const groups = buildGroups(scanPages())
  const pages = []
  for (const pg of scanPages().filter(p => !p.langDir)) {
    const srcJ = readJ(pg.file)
    const units = collectUnits(srcJ)
    const mirrors = (groups.get(pg.pageId) ?? []).filter(x => x.langDir)
    for (const m of mirrors) {
      const tm = loadTm(srcJ.page.lang, m.lang)
      const pending = units.filter(u => tm.sentences[u.fp]?.status === 'draft').length
      const failed = units.filter(u => tm.sentences[u.fp]?.status === 'failed').length
      const untranslated = units.filter(u => !tm.sentences[u.fp]).length
      pages.push({ pageId: pg.pageId, lang: m.lang, pending, failed, untranslated, total: units.length, status: readJ(m.file).page.status })
    }
    if (!mirrors.length)
      pages.push({ pageId: pg.pageId, lang: null, pending: 0, failed: 0, untranslated: units.length, total: units.length, status: 'no-mirror' })
  }
  return { auto: cfg.auto, review: cfg.review, pages }
}

// 存量收割（Task 13 CLI 用）：把现有镜像里已翻好的句子收进 TM 当 approved
export function harvestMirror(pageId, lang) {
  const source = findSource(pageId)
  const srcJ = readJ(source.file)
  const mirFile = join(lang, source.file)
  if (!existsSync(join(CONTENT(), mirFile))) throw new Error(`${pageId} 无 ${lang} 镜像可收割`)
  const mirrorJ = readJ(mirFile)
  const tm = loadTm(srcJ.page.lang, lang)
  const units = collectUnits(srcJ)
  let n = 0
  for (const u of units) {
    const cur = mirrorSentence(mirrorJ, u)
    if (cur && !sameish(cur, u.text) && !tm.sentences[u.fp]) { upsert(tm, u.fp, { text: u.text, translation: cur, status: 'approved', origin: 'harvest' }); n++ }
  }
  saveTm(srcJ.page.lang, lang, tm)
  const mirror = projectPage(srcJ, tm, 'full', { lang, existingStatus: mirrorJ.page.status ?? 'published', existingTrail: mirrorJ.breadcrumb?.trail })
  writeJ(mirFile, mirror)
  logEvent(source.slug, 'harvest', { lang, sentences: n })
  return n
}
