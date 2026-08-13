#!/usr/bin/env node
// F3 i18n 平移验收（R35-R45）：族谱 / 切换器 / 检测抬戳 / 文本+树翻译回路 / 拒收 / 发布门禁 / 结构同步 / 保存抬戳。
// 前置：8092 编辑服务在跑（新代码）。跑完自动还原 zh/en JSON 并重建。
import { readFileSync, writeFileSync, copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { deriveRegistry } from './i18n-registry.mjs'
import { touch } from './i18n-touch.mjs'
import { i18nStatus } from './i18n-status.mjs'
import { emit, apply, syncStructure } from './i18n-apply.mjs'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const ZH = join(SITE, 'content/posts/5-ton-overhead-crane.json')
const EN = join(SITE, 'content/en/posts/5-ton-overhead-crane.json')
const DIST_EN = join(SITE, 'dist/en/posts/5-ton-overhead-crane/index.html')
const DEDIT_EN = join(SITE, 'dist-edit/en/posts/5-ton-overhead-crane/index.html')
const readJ = p => JSON.parse(readFileSync(p, 'utf8'))
const writeJ = (p, j) => writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
const results = []
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`) }
const build = env => execSync(`${process.execPath} ${join(SITE, 'node_modules/astro/bin/astro.mjs')} build`, { cwd: SITE, env: { ...process.env, ...env }, stdio: 'pipe' })
const save = (slug, patches, status = 'published') =>
  fetch('http://localhost:8092/__save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, status, patches }) })

for (const f of [ZH, EN]) if (existsSync(f + '.bak-f3')) copyFileSync(f + '.bak-f3', f) // 上次中断残留先还原
copyFileSync(ZH, ZH + '.bak-f3')
copyFileSync(EN, EN + '.bak-f3')

try {
  // ---------- T1 族谱派生（R37） ----------
  const reg = deriveRegistry()
  ok('T1 族谱 8 个逻辑页', Object.keys(reg.pages).length === 8)
  const g5 = reg.pages['5-ton-overhead-crane']
  ok('T1 5-ton 组 = zh源+en镜像', g5.langs['zh-CN']?.source === true && g5.langs.en?.slug === 'en/posts/5-ton-overhead-crane')
  ok('T1 gantry 仅 zh（未配对）', !reg.pages['gantry-cranes-for-sale'].langs.en)

  // ---------- T2 语言切换器（R38，读 dist 产物） ----------
  build({}) // 基线：全量生产 build
  const distZh = readFileSync(join(SITE, 'dist/posts/5-ton-overhead-crane/index.html'), 'utf8')
  const distEn = readFileSync(DIST_EN, 'utf8')
  const distGantry = readFileSync(join(SITE, 'dist/posts/gantry-cranes-for-sale/index.html'), 'utf8')
  ok('T2 zh 页：当前简体中文禁用 pill + 指 en 真链接', distZh.includes('title="简体中文">简体中文</a>') && distZh.includes('href="https://www.dgcrane.com/en/posts/5-ton-overhead-crane/"'))
  ok('T2 en 页：当前 English 禁用 pill + 指 zh 真链接', distEn.includes('title="English">English</a>') && distEn.includes('href="https://www.dgcrane.com/zh/posts/5-ton-overhead-crane/"'))
  ok('T2 zh-only 页：无 en 链接（无死链）', !distGantry.includes('/en/posts/gantry-cranes-for-sale'))

  // ---------- T3 改源检测 + 抬戳（R43/R36 指纹） ----------
  const zh0 = readJ(ZH)
  const rev0 = zh0.i18n_rev['inquiry_form.title']
  zh0.inquiry_form.title += '·F3验收'
  writeJ(ZH, zh0)
  const t1 = touch('5-ton-overhead-crane')
  ok('T3 touch 检出修改并抬戳', t1.changed.length === 1 && readJ(ZH).i18n_rev['inquiry_form.title'] === rev0 + 1, t1.changed.join(','))
  const t2 = touch('5-ton-overhead-crane')
  ok('T3 touch 幂等（再跑无变化）', t2.changed.length === 0)

  // ---------- T4 status + emit 文本字段 ----------
  const st = i18nStatus().report.find(g => g.key === '5-ton-overhead-crane')
  ok('T4 status 报 en stale=该字段', st.targets[0].staleFields.join(',') === 'inquiry_form.title')
  const em = emit('5-ton-overhead-crane', 'en')
  ok('T4 emit 吐文本字段 sourceText', em.fields[0]?.kind === 'text' && em.fields[0].sourceText.includes('·F3验收'))

  // ---------- T5 apply 文本字段：写回 + 抬戳 ----------
  writeFileSync('/tmp/f3-acc-text.json', JSON.stringify({ 'inquiry_form.title': 'Fill in your details, 24h reply! (F3)' }))
  apply('5-ton-overhead-crane', 'en', '/tmp/f3-acc-text.json')
  const en1 = readJ(EN)
  ok('T5 译文写回 en 字段', en1.inquiry_form.title === 'Fill in your details, 24h reply! (F3)')
  ok('T5 translated_rev 抬到源戳', en1.i18n.translated_rev['inquiry_form.title'] === readJ(ZH).i18n_rev['inquiry_form.title'])
  ok('T5 status 回 fresh', i18nStatus().report.find(g => g.key === '5-ton-overhead-crane').targets[0].status === 'fresh')

  // ---------- T6 树字段翻译（R41：骨架代码保留） ----------
  const zh1 = readJ(ZH)
  zh1.conclusion.body.content[0].content[0].text += '（树验收）'
  writeJ(ZH, zh1)
  touch('5-ton-overhead-crane')
  const em2 = emit('5-ton-overhead-crane', 'en')
  const treeField = em2.fields.find(f => f.field === 'conclusion')
  ok('T6 emit 树字段抽 run', treeField?.kind === 'tree' && Object.keys(treeField.runs).length === 3, Object.keys(treeField.runs || {}).join(','))
  const runs = Object.fromEntries(Object.entries(treeField.runs).map(([p], i) =>
    [p, i === 0 ? 'The **5 ton overhead crane** remains the mid-capacity first choice. (F3-tree)' : `F3 tree run ${i} translated.`]))
  writeFileSync('/tmp/f3-acc-tree.json', JSON.stringify({ conclusion: runs }))
  apply('5-ton-overhead-crane', 'en', '/tmp/f3-acc-tree.json')
  const en2 = readJ(EN)
  const blockTypes = en2.conclusion.body.content.map(n => n.type)
  ok('T6 块骨架 ≡ 源（3 段不动）', blockTypes.join(',') === 'paragraph,paragraph,paragraph', blockTypes.join(','))
  const inline0 = en2.conclusion.body.content[0].content
  ok('T6 行内 marks 由译文重排（bold 保留）', inline0.some(n => n.marks?.some(m => m.type === 'bold')))

  // ---------- T7 apply 拒收：run 覆盖不齐，en 文件零污染 ----------
  const before = readFileSync(EN, 'utf8')
  writeFileSync('/tmp/f3-acc-bad.json', JSON.stringify({ conclusion: { 'content[0]': 'incomplete.' } }))
  let rejected = false
  try { apply('5-ton-overhead-crane', 'en', '/tmp/f3-acc-bad.json') } catch (e) { rejected = /run 覆盖不齐/.test(e.message) }
  ok('T7 覆盖不齐被拒（点名缺 run）', rejected)
  ok('T7 拒收后 en 零污染', readFileSync(EN, 'utf8') === before)

  // ---------- T8 发布门禁（R43/F3-5）：从未翻译字段 → dist 除名、预览仍在 ----------
  const en3 = readJ(EN)
  delete en3.i18n.translated_rev['body.h_conclusion'] // 制造「从未翻译」
  writeJ(EN, en3)
  build({})
  ok('T8 dist 除名（门禁挡）', !existsSync(DIST_EN))
  build({ INCLUDE_DRAFTS: '1', BUILD_OUT: 'dist-edit' })
  ok('T8 dist-edit 预览仍在', existsSync(DEDIT_EN))
  copyFileSync(EN + '.bak-f3', EN) // 先还原 en 再继续
  build({})
  ok('T8 还原后 dist 回来', existsSync(DIST_EN))

  // ---------- T9 sync-structure：缺字段灌源占位，不写 translated_rev ----------
  const en4 = readJ(EN)
  delete en4.conclusion
  delete en4.i18n.translated_rev.conclusion
  writeJ(EN, en4)
  const sync = syncStructure('5-ton-overhead-crane', 'en')
  const en5 = readJ(EN)
  ok('T9 缺字段灌源占位', sync.seeded.includes('conclusion') && en5.conclusion.body.content[0].content[0].text.includes('桥式起重机'))
  ok('T9 占位不写 translated_rev', en5.i18n.translated_rev.conclusion === undefined)
  copyFileSync(EN + '.bak-f3', EN)

  // ---------- T10 编辑器保存抬戳（R43，HTTP 全链） ----------
  const revA = readJ(ZH).i18n_rev['inquiry_form.title']
  const r1 = await save('posts/5-ton-overhead-crane', [{ kind: 'html', path: 'inquiry_form.title', value: '填写资料24小时回复（T10）' }])
  ok('T10 zh 保存端点 200', r1.status === 200)
  ok('T10 zh 源戳 +1', readJ(ZH).i18n_rev['inquiry_form.title'] === revA + 1)

  // ---------- T11 镜像保存 = 人工翻译抬戳（R44，HTTP 全链） ----------
  const r2 = await save('en/posts/5-ton-overhead-crane', [{ kind: 'html', path: 'inquiry_form.title', value: 'Fill in, 24h reply (T11)' }])
  ok('T11 en 保存端点 200', r2.status === 200)
  ok('T11 translated_rev 抬到源戳', readJ(EN).i18n.translated_rev['inquiry_form.title'] === readJ(ZH).i18n_rev['inquiry_form.title'])

  // ---------- T12 事件留痕 ----------
  const events = readFileSync(join(SITE, '.i18n-events.jsonl'), 'utf8')
  ok('T12 source-edit 与 translate 事件都在', events.includes('"source-edit"') && events.includes('"translate"'))
} finally {
  copyFileSync(ZH + '.bak-f3', ZH)
  copyFileSync(EN + '.bak-f3', EN)
  for (const f of [ZH + '.bak-f3', EN + '.bak-f3']) unlinkSync(f)
  await save('posts/5-ton-overhead-crane', []) // 触发双产物重建回还原态
  await new Promise(r => setTimeout(r, 3000))
  console.log('\n（JSON 已还原，双产物已重建）')
}

const failed = results.filter(r => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} 通过`)
process.exit(failed ? 1 : 0)
