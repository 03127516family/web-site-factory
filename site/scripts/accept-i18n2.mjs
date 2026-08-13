#!/usr/bin/env node
// accept-i18n2：翻译块重设计全链验收（引擎 mock，无 key 全绿）。
import assert from 'node:assert/strict'
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

// ---------- 汇总（勿动） ----------
let pass = 0
for (const [name, fn] of cases) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`) }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`) }
}
console.log(`\naccept-i18n2: ${pass}/${cases.length}`)
process.exit(pass === cases.length ? 0 : 1)
