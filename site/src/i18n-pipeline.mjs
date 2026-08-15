// 流水线（spec §4/§5/§6）：中文发布 → 检测 → 送翻 → 回写 TM → 重投影镜像。
// 结构同步 = 重投影的免费结果（镜像骨架恒 ≡ 源树，无需独立同步逻辑）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { scanPages, buildGroups } from './i18n.mjs'
import { collectUnits } from './i18n-collect.mjs'
import { projectPage, PENDING_CLASS, ANNO_CLASSES } from './i18n-project.mjs'
import { loadTm, saveTm, upsert, loadConfig } from './i18n-tm.mjs'
import { loadTerms } from './i18n-terms.mjs'
import { translateSegments } from './i18n-engine.mjs'
import { extractInlineUnits, inlineSpans, sliceInlineMd, norm } from './i18n-sent.mjs'
import { getIn } from './tree-utils.mjs'
import { logEvent } from './i18n-events.mjs'

const CONTENT = () => join(process.cwd(), 'content')
const readJ = f => { // M-2：报错带文件路径（loadConfig 同款纪律）
  const abs = join(CONTENT(), f)
  try { return JSON.parse(readFileSync(abs, 'utf8')) } catch (e) { throw new Error(`内容 JSON 损坏/不可读 ${abs}: ${e.message}`) }
}
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

// 主入口：中文「发布」事件（或手动送翻）。translate=false = 开关关：只检测+重投影；
// retryFailed=true = 人工救济通道（I-1）：failed 句重送——发布钩子默认 false 不反复烧钱。
export async function runPipeline(pageId, { lang = 'en', translate = true, retryFailed = false, callAI = null } = {}) {
  const source = findSource(pageId)
  const srcJ = readJ(source.file)
  const tm = loadTm(srcJ.page.lang, lang)
  const units = collectUnits(srcJ)
  const missing = withContext(units).filter(u => !tm.sentences[u.fp] || (retryFailed && tm.sentences[u.fp]?.status === 'failed'))
  let translated = 0, failed = 0
  if (translate && missing.length) {
    const terms = loadTerms(srcJ.page.lang, lang)
    const r = await translateSegments(missing, terms, { callAI })
    // 竞态防护（T10 质量审 Major-1）：翻译窗口（秒~分钟）里其他演员（审阅页人审/approve/另一次发布）
    // 可能已往盘上 TM 落了新条目——本副本已陈旧。写前重读盘上现值，只合并本次触碰的 fp；
    // 不降级：盘上 approved 是人审终态，胜过引擎 draft/failed。
    const fresh = loadTm(srcJ.page.lang, lang)
    for (const u of missing) {
      if (r.ok[u.id]) {
        if (fresh.sentences[u.fp]?.status === 'approved') continue // 窗口内已被人工审过，机器稿让位
        upsert(fresh, u.fp, { text: u.text, translation: r.ok[u.id], status: 'draft', origin: 'engine' })
        delete fresh.sentences[u.fp].error // 失败转正清旧 error 键（upsert 浅合并不清旧键，数据卫生）
        translated++
      }
      else { upsert(fresh, u.fp, { text: u.text, translation: '', status: 'failed', origin: 'engine', error: r.fail[u.id] ?? 'unknown' }); failed++ }
    }
    Object.assign(tm, fresh) // 后续投影/待审计数用合并后的账本
    saveTm(srcJ.page.lang, lang, fresh)
    logEvent(source.slug, 'auto-translate', { lang, translated, failed })
  }
  // 重投影镜像（结构同步在此）：full 模式 + 保留现有 status；auto 语言直发
  const mirFile = join(lang, source.file)
  const existing = existsSync(join(CONTENT(), mirFile)) ? readJ(mirFile) : null
  const cfg = loadConfig()
  // M-6：auto 直发还要求源本身 published——草稿源页的新镜像永 draft
  const status = existing?.page?.status ?? (cfg.review[lang] === 'auto' && srcJ.page.status === 'published' ? 'published' : 'draft')
  const mirror = projectPage(srcJ, tm, 'full', { lang, existingStatus: status, existingTrail: existing?.breadcrumb?.trail })
  writeJ(mirFile, mirror)
  return { pageId, lang, translated, failed, pending: units.filter(u => tm.sentences[u.fp]?.status !== 'approved').length }
}

// 全站批量（控制台③ / 存量补翻 D6）：人工救济通道——failed 重送（I-1）；M-6：草稿源页不送翻不建镜像
export async function translateAll({ lang = 'en', callAI } = {}) {
  const out = []
  for (const pg of scanPages().filter(p => !p.langDir)) {
    if (readJ(pg.file).page.status !== 'published') { out.push({ pageId: pg.pageId, lang, skipped: 'draft-source' }); continue }
    out.push(await runPipeline(pg.pageId, { lang, translate: true, retryFailed: true, callAI }))
  }
  return out
}

// 修正③（我已裁定，照此实现）：sameish 守卫——投影 artifact 与真人工编辑的区分线。
// 重投影写镜像时句尾分隔符可能有合成/清边差异（T4 空格合成、approved 清边），
// 严格不等会把自家投影误当人工审批（adoptMirror 空跑也 approve 全部=假审）。
// M-1 代价明示：仅改句尾标点/引号的编辑会被当投影 artifact 丢弃（防误审的另一面，已裁定接受）。
const sameish = (a, b) =>
  norm(a).replace(/[\s。！？）)」』.,;:!?]+$/g, '') === norm(b).replace(/[\s。！？）)」』.,;:!?]+$/g, '')

// 镜像保存 = 人审写回（R44）：镜像句与 TM 不同 → approved；未译占位被改 → 新建 approved。
// 返回 { n, skipped }。代价明示：段内译文句数与源不一致时整段不 adopt——人就地改该段不会被采纳
// （返回 skipped 供调用方提示：整段重写保持句数，或用通过按钮）；skipped>0 也留事件——编辑被吞不静默。
export function adoptMirror(mirrorJ, srcJ, tm, lang) {
  const units = collectUnits(srcJ)
  const { aligned, skipped } = alignSentGroups(mirrorJ, units) // C-1：sent 句级必须先过段守卫
  let n = 0
  for (const u of units) {
    const cur = u.kind === 'sent' ? aligned.get(`${u.field}|${u.path}`)?.[u.si] ?? null : mirrorSentence(mirrorJ, u)
    if (cur === null) continue // 坐标不存在（人删了）或段守卫跳过——重投影会恢复，不猜
    const e = tm.sentences[u.fp]
    if (e) {
      if (sameish(cur, u.text)) continue // 仍是中文占位/未变
      if (sameish(cur, e.translation)) continue // 只是投影 artifact，非人工编辑
      upsert(tm, u.fp, { translation: cur, status: 'approved', origin: 'human' })
      delete tm.sentences[u.fp].error // 人审转正清旧 error 键（评审 D1：引擎路 2c5be01 清了，人审两条路漏同款）
      n++
    } else if (!sameish(cur, u.text)) {
      upsert(tm, u.fp, { text: u.text, translation: cur, status: 'approved', origin: 'human' }); n++
    }
  }
  if (n || skipped) { if (n) saveTm(srcJ.page.lang, lang, tm); logEvent(srcJ.page.slug, 'review-edit', { lang, sentences: n, skipped }) }
  return { n, skipped }
}

// sent 段级守卫（C-1）：按 (field,path) 分组——源段句数 = 该组单元数；镜像段重抽取句数 ≠ 源段句数
// （一源拆两译/译文无句点并句/人删句）→ 整段跳过不猜：宁可漏收养错，不可 si 漂移张冠李戴错判 approved。
// 返回 { aligned: Map(组键 → 句数组|null=跳过), skipped: 跳过句数 }。
function alignSentGroups(mirrorJ, units) {
  const groups = new Map()
  for (const u of units) if (u.kind === 'sent') {
    const key = `${u.field}|${u.path}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(u)
  }
  const aligned = new Map()
  let skipped = 0
  for (const [key, group] of groups) {
    const cleaned = mirrorInline(mirrorJ, group[0])
    const sents = cleaned ? extractInlineUnits(cleaned).map(x => x.md) : null
    if (sents && sents.length === group.length) aligned.set(key, sents)
    else { aligned.set(key, null); skipped += group.length }
  }
  return { aligned, skipped }
}

const stripPending = marks => (marks ?? []).filter(m => !(m.type === 'span' && ANNO_CLASSES.includes(m.attrs?.class))) // M-4：注解类全集判（pending+failed，红标句也要剥——不剥 wrapMarks 遇 span 抛错）

// 镜像段行内容（剥 pending 注解）；坐标取不到返 null
function mirrorInline(mirrorJ, u) {
  const tree = getIn(mirrorJ, u.field)
  if (tree?.type !== 'doc') return null
  const node = getIn(tree, u.path)
  if (!node) return null
  const inner = (node.type === 'heading' || node.type === 'paragraph') ? (node.content ?? []) : (node.content?.[0]?.content ?? [])
  return inner.map(x => x.type === 'text' ? { ...x, marks: stripPending(x.marks) } : x)
}

// 镜像某单元的当前文本：字段=值；alt=属性；block/cell=整段切——与 collectTreeUnits 严格对称
// （spans 首到尾整段 sliceInlineMd，保句间空格；units.map(join) 吞空格把自家投影判成人工编辑=失效形态 A）。
// sent 禁止走这里（句级必须过 alignSentGroups 段守卫）。取不到/空段返 null。
function mirrorSentence(mirrorJ, u) {
  if (u.kind === 'field') {
    const v = getIn(mirrorJ, u.field)
    return typeof v === 'string' ? v : null
  }
  if (u.kind === 'sent') throw new Error('sent 句级取句必须过 alignSentGroups 段守卫，禁止绕守卫单句直取')
  if (u.kind === 'alt') {
    const tree = getIn(mirrorJ, u.field)
    if (tree?.type !== 'doc') return null
    return getIn(tree, u.path)?.attrs?.alt ?? null
  }
  const cleaned = mirrorInline(mirrorJ, u)
  if (!cleaned) return null
  const { spans } = inlineSpans(cleaned)
  if (!spans.length) return null
  return sliceInlineMd(cleaned, spans[0].start, spans[spans.length - 1].end) || null
}

// 通过并发布（审阅页按钮）：本页全部 draft → approved，failed 不动；镜像 status → published；重投影。
// M-3：返回 { approved, remainingFailed, remainingUntranslated }——remaining 按 collectUnits 全量对 TM 现算，供控制台如实提示。
export function approvePage(pageId, lang, tm, readSrc) {
  const srcJ = readSrc(pageId)
  const units = collectUnits(srcJ)
  let approved = 0
  for (const u of units) {
    const e = tm.sentences[u.fp]
    if (e?.status === 'draft') { upsert(tm, u.fp, { status: 'approved', origin: 'human' }); delete tm.sentences[u.fp].error; approved++ } // 人审转正清旧 error 键（评审 D1）
  }
  saveTm(srcJ.page.lang, lang, tm)
  const source = findSource(pageId)
  const mirFile = join(lang, source.file)
  const existingTrail = existsSync(join(CONTENT(), mirFile)) ? readJ(mirFile).breadcrumb?.trail : null
  const mirror = projectPage(srcJ, tm, 'full', { lang, existingStatus: 'published', existingTrail })
  writeJ(mirFile, mirror)
  const remainingFailed = units.filter(u => tm.sentences[u.fp]?.status === 'failed').length
  const remainingUntranslated = units.filter(u => !tm.sentences[u.fp]).length
  logEvent(source.slug, 'approve-publish', { lang, sentences: approved, remainingFailed, remainingUntranslated })
  return { approved, remainingFailed, remainingUntranslated }
}

// 控制台数据源：每页×每镜像语言 待审/失败/总数
export function consoleData() {
  const cfg = loadConfig()
  const all = scanPages() // M-6：一次扫描，族谱与源页循环共用
  const groups = buildGroups(all)
  const pages = []
  for (const pg of all.filter(p => !p.langDir)) {
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

// 存量收割（Task 13 CLI 用）：把现有镜像里已翻好的句子收进 TM 当 approved。
// 评审 M1：本函数跑在 CLI 独立进程——与 edit-server 并发时整文件覆盖会丢窗口内 TM 更新，
// 故写前重读盘现值、只补收割新句（收割只增不改，天然可合并）；镜像重投影仍是整文件覆盖，
// 收割时最好停编辑服（跑法注明在 scripts/i18n-harvest.mjs 头部）。
export function harvestMirror(pageId, lang) {
  const source = findSource(pageId)
  const srcJ = readJ(source.file)
  const mirFile = join(lang, source.file)
  if (!existsSync(join(CONTENT(), mirFile))) throw new Error(`${pageId} 无 ${lang} 镜像可收割`)
  const mirrorJ = readJ(mirFile)
  const units = collectUnits(srcJ)
  const { aligned, skipped } = alignSentGroups(mirrorJ, units) // C-1：sent 只在段对齐成立时收
  const fresh = loadTm(srcJ.page.lang, lang) // 现读盘上现值（收割对齐耗时几十 ms~秒，防跨进程丢更新）
  let n = 0
  for (const u of units) {
    const cur = u.kind === 'sent' ? aligned.get(`${u.field}|${u.path}`)?.[u.si] ?? null : mirrorSentence(mirrorJ, u)
    if (cur && !sameish(cur, u.text) && !fresh.sentences[u.fp]) { upsert(fresh, u.fp, { text: u.text, translation: cur, status: 'approved', origin: 'harvest' }); n++ }
  }
  saveTm(srcJ.page.lang, lang, fresh)
  const mirror = projectPage(srcJ, fresh, 'full', { lang, existingStatus: mirrorJ.page.status ?? 'published', existingTrail: mirrorJ.breadcrumb?.trail })
  writeJ(mirFile, mirror)
  logEvent(source.slug, 'harvest', { lang, sentences: n, skipped }) // 段不对齐跳过的句数留痕（宁可漏收养错）
  return { harvested: n, skipped } // T13 CLI 如实报「收 N 句、跳 M 句」
}
