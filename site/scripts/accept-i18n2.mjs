#!/usr/bin/env node
// accept-i18n2：翻译块重设计全链验收（引擎 mock，无 key 全绿）。
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { loadTm, saveTm, upsert, loadConfig, saveConfig } from '../src/i18n-tm.mjs'
const cases = []
const test = (name, fn) => cases.push([name, fn])

// ---------- Task 1: 句切分 ----------
import { splitPlain, inlineSpans, sliceInlineMd, extractInlineUnits, applyInlineUnit, fp } from '../src/i18n-sent.mjs'

test('切句:中文句界', () => {
  const r = splitPlain('起重量为3吨。它采用变频控制！适用吗？')
  assert.deepEqual(r.map(s => s.text), ['起重量为3吨。', '它采用变频控制！', '适用吗？'])
})
test('切句:小数点不切', () => {
  const r = splitPlain('跨度7.5米。自重3.5吨')
  assert.deepEqual(r.map(s => s.text), ['跨度7.5米。', '自重3.5吨'])
})
test('切句:英文句点须跟空格/结尾+缩写不切', () => {
  const r = splitPlain('Made in U.S.A. standard. It works.')
  assert.deepEqual(r.map(s => s.text), ['Made in U.S.A. standard. ', 'It works.'])
})
test('切句:空白段忽略+指纹归一', () => {
  assert.equal(splitPlain('  ').length, 0)
  assert.equal(fp('起重量为3吨。'), fp(' 起重量为3吨。\n'))
})
test('行内:链接跨句合并', () => {
  const nodes = [
    { type: 'text', text: '前句。' },
    { type: 'text', text: '跨句链接。后半。', marks: [{ type: 'link', attrs: { href: '/x' } }] },
  ]
  const { spans } = inlineSpans(nodes)
  assert.equal(spans.length, 2) // '前句。' + 链接整体一句
})
test('行内:加粗内切片+回植往返', () => {
  const nodes = [{ type: 'text', text: '这台' }, { type: 'text', text: '起重机', marks: [{ type: 'bold' }] }, { type: 'text', text: '很好。第二句。' }]
  const units = extractInlineUnits(nodes)
  assert.equal(units.length, 2)
  assert.equal(units[0].md, '这台**起重机**很好。')
  const out = applyInlineUnit(nodes, 1, 'Second sentence.')
  assert.equal(out.map(n => n.text ?? '').join(''), '这台起重机很好。Second sentence.')
})
test('行内:hardBreak 强制界+回植保 hardBreak', () => {
  const nodes = [{ type: 'text', text: '起重量：3吨' }, { type: 'hardBreak' }, { type: 'text', text: '跨度：7.5米' }]
  const units = extractInlineUnits(nodes)
  assert.equal(units.length, 2)
  const out = applyInlineUnit(nodes, 0, 'Capacity: 3t')
  assert.equal(out.map(n => n.type === 'hardBreak' ? '\n' : n.text).join(''), 'Capacity: 3t\n跨度：7.5米')
})
test('行内:回植保尾随空格', () => {
  const nodes = [{ type: 'text', text: 'Made in U.S.A. standard. It works.' }]
  const out = applyInlineUnit(nodes, 0, '中国制造。')
  assert.equal(out.map(n => n.text).join(''), '中国制造。 It works.')
})

// ---------- Task 2: TM 库 ----------
test('TM:空语言对=空表', () => {
  const tm = loadTm('zh-CN', 'xx-nonexist')
  assert.deepEqual(tm.sentences, {})
})
test('TM:upsert 写读往返+状态机', () => {
  const tm = loadTm('zh-CN', 'xx-nonexist')
  upsert(tm, 'abc123', { text: '源句', translation: 'draft one', status: 'draft', origin: 'engine' })
  assert.equal(tm.sentences['abc123'].status, 'draft')
  upsert(tm, 'abc123', { status: 'approved' }) // 部分更新不丢字段
  assert.equal(tm.sentences['abc123'].translation, 'draft one')
  assert.equal(tm.sentences['abc123'].status, 'approved')
  assert.ok(tm.sentences['abc123'].updatedAt)
})
test('配置:缺文件给默认', () => {
  const c = loadConfig()
  assert.equal(typeof c.auto, 'boolean')
  assert.equal(c.review.en, 'required')
})
test('TM:saveTm/loadTm 真落盘往返', () => {
  const f = join(process.cwd(), 'src', 'i18n', 'tm.t-x.t-y.json')
  const tm = loadTm('t-x', 't-y')
  upsert(tm, 'k1', { text: '源', translation: '译', status: 'draft', origin: 'engine' })
  saveTm('t-x', 't-y', tm)
  assert.equal(loadTm('t-x', 't-y').sentences['k1'].translation, '译')
  rmSync(f) // 清理，不留测试残留
})
test('配置:saveConfig review 深合并不丢键', () => {
  const f = join(process.cwd(), 'src', 'i18n', 'config.json')
  saveConfig({ review: { de: 'auto' } })
  saveConfig({ review: { en: 'auto' } })
  const c = loadConfig()
  assert.equal(c.review.de, 'auto')  // de 不被顶掉
  assert.equal(c.review.en, 'auto')
  rmSync(f) // 还原「缺文件」初始态（前面用例依赖它）
})

// ---------- 汇总（勿动） ----------
let pass = 0
for (const [name, fn] of cases) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`) }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`) }
}
console.log(`\naccept-i18n2: ${pass}/${cases.length}`)
process.exit(pass === cases.length ? 0 : 1)
