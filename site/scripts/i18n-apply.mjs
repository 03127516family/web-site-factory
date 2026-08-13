#!/usr/bin/env node
// i18n:apply —— 翻译写回驱动（JSON 版，平移旧 i18n-apply.mjs）。
// 边界（用户拍定）：代码找活 + 代码写回，AI 只在中间「翻译」一个节点出手，既不选址也不落盘。
// 本命令切成两半，恰好夹住那个翻译节点：
//
//   ① node scripts/i18n-apply.mjs <pageId> --emit [--lang en]
//        代码算过期字段（translated_rev < i18n_rev），逐字段取【源文本】吐机器可读 JSON：
//        文本字段 → sourceText 字符串；body 树字段 → runs（{树内路径: 行内 md}，R41：
//        骨架代码保留，AI 只译文字、爆不了骨架）。相关术语（lock/map）一并注入提示。
//   ②（AI 在此翻译 → 写译文 json：文本字段 { "<字段>": "<译文>" }；树字段 { "<字段>": { "<路径>": "<译文md>" } }）
//   ③ node scripts/i18n-apply.mjs <pageId> --from <译文json> [--lang en]
//        代码【重新】从源 JSON 取坐标与骨架（不信外部传入）：文本逐字写回；树=克隆源树按 run
//        路径替换（覆盖不齐当场拒收）→ validateDoc 把关 → 落盘 → translated_rev 抬到源戳 + 记事件。
//
//   node scripts/i18n-apply.mjs <pageId> --sync-structure [--lang en]
//        镜像结构同步/新语言上户口（R42）：目标不存在 → 克隆源骨架（draft、全中文占位、空
//        translated_rev → 门禁挡）；已存在 → 名册里目标缺的字段用源文本灌占位。译文由 --from 转正。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { scanPages, buildGroups } from '../src/i18n.mjs'
import { fieldValueOf, extractRuns, applyRuns } from '../src/i18n-fields.mjs'
import { loadTerms, relevantTerms } from '../src/i18n-terms.mjs'
import { validateDoc } from '../src/content-schema.mjs'
import { setIn } from '../src/tree-utils.mjs'
import { i18nStatus } from './i18n-status.mjs'
import { logEvent } from './i18n-touch.mjs'

const readJ = file => JSON.parse(readFileSync(join(process.cwd(), 'content', file), 'utf8'))
const writeJ = (file, j) => {
  const abs = join(process.cwd(), 'content', file)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, JSON.stringify(j, null, 2) + '\n')
}

function resolvePair(pageId, targetLang) {
  const groups = buildGroups(scanPages())
  const members = groups.get(pageId)
  if (!members) throw new Error(`族谱里找不到：${pageId}`)
  const source = members.find(m => !m.langDir)
  if (!source) throw new Error(`${pageId} 无源语言页——先有源再谈翻译`)
  const target = members.find(m => m.lang === targetLang) || null // null = 该语言还没上户口
  return { source, target }
}

// 目标镜像的文件位置：与源同型同名的语言子目录（content/posts/x.json → content/<lang>/posts/x.json）
const targetFileOf = (source, lang) => join(lang, source.file)

// ---------- ① 找活 ----------
function emit(pageId, targetLang) {
  const { source, target } = resolvePair(pageId, targetLang)
  if (!target) throw new Error(`${pageId} 还没有 ${targetLang} 镜像——先 --sync-structure 上户口`)
  const srcJ = readJ(source.file)
  const tgtJ = readJ(target.file)
  const sourceRev = srcJ.i18n_rev || {}
  const translatedRev = tgtJ.i18n?.translated_rev || {}
  const stale = Object.keys(sourceRev).filter(f => (translatedRev[f] ?? 0) < sourceRev[f])

  const fields = stale.map(field => {
    const v = fieldValueOf(srcJ, field)
    if (v === undefined) throw new Error(`名册字段在源 JSON 里取不到值：${field}（名册漂移，先修 i18n_rev）`)
    if (v?.type === 'doc') return { field, kind: 'tree', runs: Object.fromEntries(extractRuns(v).map(r => [r.path, r.md])) }
    return { field, kind: 'text', sourceText: String(v) }
  })
  // 汇总本页相关术语交翻译节点遵守：各字段出现的 lock（并集）+ map（并集）。纯提示词（U-1/U-2）。
  const allTerms = loadTerms(source.lang, targetLang)
  const map = {}
  const lock = new Set()
  for (const f of fields) {
    const text = f.kind === 'tree' ? Object.values(f.runs).join('\n') : f.sourceText
    const r = relevantTerms(allTerms, text)
    r.lock.forEach(w => lock.add(w))
    Object.assign(map, r.map)
  }
  return {
    key: pageId,
    source: source.slug,
    sourceLang: source.lang,
    target: target.slug,
    targetLang,
    terms: { lock: [...lock], map },
    fields,
  }
}

// ---------- ③ 写回 ----------
function apply(pageId, targetLang, fromPath) {
  const { source, target } = resolvePair(pageId, targetLang)
  if (!target) throw new Error(`${pageId} 还没有 ${targetLang} 镜像——先 --sync-structure 上户口`)
  const translations = JSON.parse(readFileSync(fromPath, 'utf8'))
  const fields = Object.keys(translations)
  if (!fields.length) throw new Error(`译文 json 为空：${fromPath}`)
  const srcJ = readJ(source.file)
  const tgtJ = readJ(target.file)
  for (const field of fields) {
    // 坐标与骨架由源 JSON 重算，外部传什么都不信（同旧系统"代码重算坐标"原则）
    const srcVal = fieldValueOf(srcJ, field)
    if (srcVal === undefined) throw new Error(`字段 ${field} 在源 JSON 取不到值（不在名册/名册漂移）`)
    if (srcVal?.type === 'doc') {
      const runs = translations[field]
      if (!runs || typeof runs !== 'object' || Array.isArray(runs))
        throw new Error(`字段 ${field} 是 body 树，译文须是 { "<run路径>": "<译文md>" } 对象`)
      const tree = applyRuns(srcVal, runs) // 克隆源树 + 替换 run（覆盖不齐/路径错位当场抛）
      validateDoc(tree, `${field}.body`) // V4 同款把关：写坏不落盘
      setIn(tgtJ, `${field}.body`, tree)
    } else {
      if (typeof translations[field] !== 'string')
        throw new Error(`字段 ${field} 是文本字段，译文须是字符串`)
      setIn(tgtJ, field, translations[field])
    }
  }
  // 抬戳：translated_rev.<字段> = 源当前戳 → 回「已同步」。记一条 translate 事件。
  tgtJ.i18n ??= { source: srcJ.page.lang }
  tgtJ.i18n.translated_rev ??= {}
  for (const f of fields) tgtJ.i18n.translated_rev[f] = srcJ.i18n_rev[f] ?? 1
  writeJ(target.file, tgtJ)
  logEvent(target.slug, 'translate', fields)
  return { applied: fields }
}

// ---------- 镜像结构同步 / 新语言上户口（R42） ----------
function syncStructure(pageId, targetLang) {
  const { source, target } = resolvePair(pageId, targetLang)
  const srcJ = readJ(source.file)
  if (!target) {
    // 上户口：克隆源骨架当占位（全中文 = 未译），draft 状态 + 空 translated_rev，双闸门都挡
    const j = structuredClone(srcJ)
    j.page.slug = `${targetLang}/${srcJ.page.slug}`
    j.page.lang = targetLang
    j.page.status = 'draft'
    delete j.i18n_rev
    delete j.i18n_fp
    j.i18n = { source: srcJ.page.lang, translated_rev: {} }
    const file = targetFileOf(source, targetLang)
    writeJ(file, j)
    logEvent(j.page.slug, 'onboard', Object.keys(srcJ.i18n_rev || {}))
    return { onboarded: file, seeded: [] }
  }
  // 已存在：名册里目标缺的字段，用源文本灌占位（不写 translated_rev → 从未翻译 → 门禁挡）
  const tgtJ = readJ(target.file)
  const seeded = []
  for (const field of Object.keys(srcJ.i18n_rev || {})) {
    if (fieldValueOf(tgtJ, field) !== undefined) continue
    const srcVal = fieldValueOf(srcJ, field)
    if (srcVal?.type === 'doc') setIn(tgtJ, `${field}.body`, structuredClone(srcVal))
    else setIn(tgtJ, field, srcVal)
    seeded.push(field)
  }
  if (seeded.length) {
    writeJ(target.file, tgtJ)
    logEvent(target.slug, 'seed-placeholder', seeded)
  }
  return { onboarded: null, seeded }
}

export { emit, apply, syncStructure }

if (process.argv[1]?.endsWith('i18n-apply.mjs')) {
const [pageId, flag, ...rest] = process.argv.slice(2)
const langIdx = rest.indexOf('--lang')
const targetLang = langIdx === -1 ? 'en' : rest[langIdx + 1]
const positional = langIdx === -1 ? rest : rest.filter((_, i) => i !== langIdx && i !== langIdx + 1)
const usage = `用法：
  node scripts/i18n-apply.mjs <pageId> --emit [--lang en]
  node scripts/i18n-apply.mjs <pageId> --from <译文json> [--lang en]
  node scripts/i18n-apply.mjs <pageId> --sync-structure [--lang en]`
if (!pageId || !flag) {
  console.error(usage)
  process.exit(1)
}
if (flag === '--emit') {
  const out = emit(pageId, targetLang)
  if (!out.fields.length) console.error(`○ ${pageId}（${targetLang}）：无待翻译字段（已全部同步）`)
  console.log(JSON.stringify(out, null, 2))
} else if (flag === '--from') {
  const fromPath = positional[0]
  if (!fromPath) {
    console.error(usage)
    process.exit(1)
  }
  const { applied } = apply(pageId, targetLang, fromPath)
  console.log(`✓ ${pageId}（${targetLang}）：写回 ${applied.length} 个字段并抬戳 → ${applied.join(', ')}`)
  console.log(`  → 跑 node scripts/i18n-status.mjs 确认转「已同步」，再重新 build`)
} else if (flag === '--sync-structure') {
  const { onboarded, seeded } = syncStructure(pageId, targetLang)
  if (onboarded) {
    console.log(`✓ ${pageId} 的 ${targetLang} 镜像已上户口 → content/${onboarded}（draft、全源文占位）`)
    console.log(`  → --emit 取待译清单 → 翻译 → --from 转正 → status 转 published`)
  } else if (!seeded.length) console.log(`○ ${pageId}（${targetLang}）：镜像结构已完整，无缺字段`)
  else {
    console.log(`✓ ${pageId}（${targetLang}）：灌源占位 ${seeded.length} 个缺字段 → ${seeded.join(', ')}`)
    console.log(`  （占位=源文本、未写 translated_rev → 发布门禁暂扣，待 --from 翻译转正）`)
  }
} else {
  console.error(usage)
  process.exit(1)
}
}
