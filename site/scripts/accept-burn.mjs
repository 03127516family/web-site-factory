#!/usr/bin/env node
// DeepSeek 烧制台验收（无 key 全链 mock；真 key 验收为手动步骤，见计划 Task 9）。
// 惯例同 accept-poc5/f3：ok() 累计，结尾非零退出。
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(SITE, '../src/content/raw/overhead-cranes-for-sale.txt')
const results = []
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`) }

const lib = await import('../src/burn-lib.mjs')

// ---------- T1 原文切块编号 / 图清单 / 剥壳 ----------
{
  const blocks = lib.numberBlocks('甲段\n\n乙段\n\n\n丙段\n')
  ok('numberBlocks 按空行切块并编号', blocks.length === 3 && blocks[0].n === 1 && blocks[2].n === 3 && blocks[2].text === '丙段')

  const raw = readFileSync(RAW, 'utf8')
  const rb = lib.numberBlocks(raw)
  ok('numberBlocks 吃真实裸文章', rb.length > 30 && rb.every((b, i) => b.n === i + 1), `${rb.length} 块`)

  const imgs = lib.extractImages(raw)
  ok('extractImages 提取配图标记', imgs.length >= 5 && imgs.some(i => i.name === 'cross-girder3.jpg' && i.caption === '横梁'), `${imgs.length} 张`)

  const { text, images } = lib.stripHtml('<html><head><style>x{}</style><script>y()</script></head><body><nav>菜单</nav><main><p>第一段</p><p>第二段 <img src="/wp-content/uploads/ab-c.jpg"></p></main><footer>脚</footer></body></html>')
  ok('stripHtml 去脚本样式导航页脚、留正文、收图', text.includes('第一段') && text.includes('第二段') && !text.includes('菜单') && !text.includes('脚') && !text.includes('y()') && images.includes('ab-c.jpg'))
}

// ---------- T2 字段目录 / 规划表硬查 ----------
{
  const blocks = lib.numberBlocks(readFileSync(RAW, 'utf8'))
  const catalog = lib.loadCatalog(
    join(SITE, 'src/components/ProductPage.astro'),
    join(SITE, 'content/products/single-girder-eot-cranes.json'))
  const keys = catalog.map(c => c.key)
  for (const k of ['overview', 'introduction', 'advantages', 'protection', 'specs', 'hero.headline', 'page.description'])
    ok(`目录含 ${k} 且已核验`, keys.includes(k) && catalog.find(c => c.key === k).verified)

  const good = { fields: [
    { field: 'hero.headline', blocks: [1] },
    { field: 'overview', blocks: [2] },
    { field: 'specs', blocks: [3] },
    { field: 'introduction', blocks: [6] },
  ] }
  const r1 = lib.checkPlan(good, blocks)
  ok('合法规划表零 error', r1.errors.length === 0, r1.errors[0])

  const bad = { fields: [
    { field: 'overview', blocks: [2, 3] },
    { field: 'specs', blocks: [3, 4] },            // 重叠
    { field: 'no_such_field', blocks: [5] },       // 未知字段
    { field: 'introduction', blocks: [1, 9999] },  // 越界 + 顺序在 overview 前（非单调）
  ] }
  const r2 = lib.checkPlan(bad, blocks)
  const msg = r2.errors.join(';')
  ok('重叠被抓', /重叠/.test(msg))
  ok('未知字段被抓', /未知字段/.test(msg))
  ok('块号越界被抓', /越界/.test(msg))
  ok('非单调被抓', /单调|顺序/.test(msg))
  ok('未覆盖块进 uncovered', r2.uncovered.length > 0 && r2.uncovered.includes(7))

  const noDigit = { fields: [{ field: 'specs', blocks: [2] }] } // 块2是纯散文无数字
  const r3 = lib.checkPlan(noDigit, blocks)
  ok('specs 映射无数字块被打回', r3.errors.some(e => /数字/.test(e)), r3.errors[0])
}

// ---------- T2.1 checkPlan 边界加固（质量审查 Important 修复的回归钉） ----------
{
  const blocks = lib.numberBlocks(readFileSync(RAW, 'utf8'))
  const r1 = lib.checkPlan(null, blocks)
  ok('null 规划不崩且报结构非法', r1.errors.length > 0 && /结构非法/.test(r1.errors[0]))
  const r2 = lib.checkPlan({ fields: [] }, blocks)
  ok('空 fields 报错', r2.errors.some(e => /为空/.test(e)))
  const r3 = lib.checkPlan({ fields: [null, { field: 'overview', blocks: [2] }] }, blocks)
  ok('null 条目报错跳过不崩', r3.errors.some(e => /不是对象/.test(e)))
  const r4 = lib.checkPlan({ fields: [{ field: 'overview', blocks: [2, 'x'] }, { field: 'introduction', blocks: [1] }] }, blocks)
  ok('脏值不污染单调判定（该抓还抓）', r4.errors.some(e => /越界/.test(e)) && r4.errors.some(e => /单调|顺序/.test(e)))
  const r5 = lib.checkPlan({ fields: [{ field: 'overview', blocks: [9999] }, { field: 'introduction', blocks: [2] }] }, blocks)
  ok('越界高值不冤枉后续字段', r5.errors.some(e => /越界/.test(e)) && !r5.errors.some(e => /单调|顺序/.test(e)))
}

// ---------- 汇总 ----------
const fails = results.filter(r => !r.pass)
console.log(`\n${results.length - fails.length}/${results.length} 通过`)
if (fails.length) { console.log('失败:', fails.map(f => f.name).join(' | ')); process.exit(1) }
