#!/usr/bin/env node
// i18n 戳与指纹（JSON 版，平移旧 i18n-touch.mjs）：检测「改源」→ 抬 i18n_rev，编辑器/手动两路共用。
// 基准 = JSON 自存指纹 i18n_fp（决策㉗：git 只是代码仓、非内容真相）——
// 不变式：i18n_fp[字段] == 上次抬戳时刻该字段值的指纹（touch 与 stampAfterSave 共同维护）。
// 产物两份：喂戳（i18n_rev，状态判据）+ 留痕（.i18n-events.jsonl 字段级事件，M3 事件日志本地预览）。
//
// 用法：node scripts/i18n-touch.mjs <pageId>   （改了 zh 源、翻译之前跑；首次运行只落基准不抬戳）
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { scanPages, buildGroups } from '../src/i18n.mjs'
import { fieldValueOf, fp } from '../src/i18n-fields.mjs'

const EVENTS = () => join(process.cwd(), '.i18n-events.jsonl')
const readJ = file => JSON.parse(readFileSync(join(process.cwd(), 'content', file), 'utf8'))
const writeJ = (file, j) => writeFileSync(join(process.cwd(), 'content', file), JSON.stringify(j, null, 2) + '\n')

function gitActor() {
  try {
    return execSync('git config user.name', { encoding: 'utf8' }).trim() || 'unknown'
  } catch {
    return 'unknown' // 归因（非变更检测），git 不可用不挡路
  }
}
export function logEvent(slug, action, fields) {
  const entry = { ts: new Date().toISOString(), actor: gitActor(), slug, action, fields }
  appendFileSync(EVENTS(), JSON.stringify(entry) + '\n')
}

// 编辑补丁路径 → 名册字段：剥一层 '.body' 尾缀（tree/chunk 补丁），其余原样；
// 不在 i18n_rev 名册的一律跳过（图/数组/breadcrumb.trail 等非译文字段）。
const patchField = path => path.replace(/\.body$/, '')

function findPage(pageId) {
  const pages = scanPages()
  const groups = buildGroups(pages)
  const members = groups.get(pageId)
  if (!members) throw new Error(`族谱里找不到：${pageId}`)
  return { pages, source: members.find(m => !m.langDir), mirrors: members.filter(m => m.langDir) }
}

// ---------- 编辑器保存链路（edit-server 调用） ----------
// zh 源保存：名册字段抬戳 + 指纹刷到当前值（此刻文件已写入新值，维护不变式）。
// en 镜像保存 = 人工翻译（R44）：translated_rev 抬到源当前戳。两路都记事件。
export function stampAfterSave(file, patchPaths) {
  // file = content 相对路径：'<type>/x.json'（zh 源，2 段）| '<lang>/<type>/x.json'（镜像，3 段）
  const segments = file.replaceAll('\\', '/').split('/')
  const langDir = segments.length === 3 ? segments[0] : null
  const j = readJ(file)
  if (langDir) {
    const pageId = file.split(/[\\/]/).pop().replace(/\.json$/, '')
    const { source } = findPage(pageId)
    if (!source) throw new Error(`${pageId} 无源语言页——镜像保存无法抬戳`)
    const srcRev = readJ(source.file).i18n_rev || {}
    const fields = [...new Set(patchPaths.map(patchField))].filter(f => f in srcRev)
    if (!fields.length) return null
    j.i18n ??= {}
    j.i18n.translated_rev ??= {}
    for (const f of fields) j.i18n.translated_rev[f] = srcRev[f] ?? 1
    writeJ(file, j)
    logEvent(j.page.slug, 'translate', fields)
    return { kind: 'mirror', fields }
  }
  const roster = j.i18n_rev || {}
  const fields = [...new Set(patchPaths.map(patchField))].filter(f => f in roster)
  if (!fields.length) return null
  j.i18n_fp ??= {}
  for (const f of fields) {
    j.i18n_rev[f] = (j.i18n_rev[f] ?? 0) + 1
    j.i18n_fp[f] = fp(fieldValueOf(j, f) ?? '')
  }
  writeJ(file, j)
  logEvent(j.page.slug, 'source-edit', fields)
  return { kind: 'source', fields }
}

// ---------- 兜底检测（编辑器绕过时：直接改了 JSON 文件） ----------
export function touch(pageId) {
  const { source } = findPage(pageId)
  if (!source) throw new Error(`${pageId} 没有源语言页（戳只加在 zh 源；改镜像=人工翻译，走保存链路）`)
  const j = readJ(source.file)
  const roster = j.i18n_rev || {}
  const storedFp = j.i18n_fp || {}
  const firstRun = Object.keys(storedFp).length === 0

  const changed = []
  const fpUpdates = {}
  for (const f of Object.keys(roster)) {
    const now = fp(fieldValueOf(j, f) ?? '')
    fpUpdates[f] = now // 总把指纹刷到当前值
    if (storedFp[f] === undefined) continue // 无基线（首次/新增字段）：只落基准、不判改
    if (storedFp[f] !== now) changed.push(f)
  }
  for (const f of changed) j.i18n_rev[f] = (j.i18n_rev[f] ?? 0) + 1
  j.i18n_fp = { ...storedFp, ...fpUpdates }
  writeJ(source.file, j)
  if (changed.length) logEvent(source.slug, 'source-edit', changed)
  return { slug: source.slug, changed, baselined: firstRun }
}

if (process.argv[1]?.endsWith('i18n-touch.mjs')) {
  const pageId = process.argv[2]
  if (!pageId) {
    console.error('用法：node scripts/i18n-touch.mjs <pageId>')
    process.exit(1)
  }
  const { slug, changed, baselined } = touch(pageId)
  if (baselined) console.log(`◆ ${slug}：首次运行，已落基准指纹 i18n_fp（未抬戳）——此后改内容再 touch 即检测`)
  else if (!changed.length) console.log(`○ ${slug}：源内容相对上次抬戳指纹无变化（或已 touch 过），未加戳`)
  else {
    console.log(`✓ ${slug}：${changed.length} 个字段检测到修改，已加戳并记入 .i18n-events.jsonl`)
    console.log(`  字段：${changed.join(', ')}`)
    console.log(`  → 跑 node scripts/i18n-status.mjs 查看各语言待更新，再处理翻译`)
  }
}
