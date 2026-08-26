#!/usr/bin/env node
// accept-workbench：工作台数据层验收——自起 workbench server（随机端口），断言 API 口径与正源一致。
// 只读直算不依赖 8092；写代理冒烟用「8092 未起 → 502」形态（真写在 accept-seo/poc5 覆盖）。
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { scanPages, buildGroups, isPublishable } from '../src/i18n/kernel.mjs'
import { healthData } from '../src/seo/kernel.mjs'
import { pinQueue } from '../src/i18n/pipeline.mjs'
import { loadConfig } from '../src/i18n/tm.mjs'

const PORT = process.env.WB_TEST_PORT || 8790
const base = `http://localhost:${PORT}`
const results = []
const ok = (name, cond, extra = '') => { results.push(!!cond); console.log(`${cond ? '  ✓' : '  ✗'} ${name}${extra ? ' — ' + extra : ''}`) }
const j = async (p, opts) => { const r = await fetch(base + p, opts); try { return await r.json() } catch { return null } }

const srv = spawn(process.execPath, ['workbench/server.mjs'], { cwd: process.cwd(), env: { ...process.env, WORKBENCH_PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] })
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('server 15s 未就绪')), 15000)
  const poll = async () => { try { const r = await fetch(base + '/api/overview'); if (r.ok) { clearTimeout(t); res() } else setTimeout(poll, 250) } catch { setTimeout(poll, 250) } }
  poll()
})

try {
  const expectPages = scanPages()
  const apiPages = await j('/api/pages')
  ok('① /api/pages 行数 = scanPages（口径一致）', Array.isArray(apiPages) && apiPages.length === expectPages.length, `${apiPages?.length ?? '?'}/${expectPages.length}`)
  ok('① 行含过门禁语言覆盖 langs', Array.isArray(apiPages) && apiPages.every(p => Array.isArray(p.langs)))

  const ov = await j('/api/overview')
  ok('② /api/overview TM 统计非空（断路径已修）', ov.tmTotal > 0, `tmTotal=${ov.tmTotal}`)

  const seo = await j('/api/seo-health')
  const rows = healthData(scanPages({ withJson: true }))
  const pins = Object.keys(loadConfig().review).flatMap(l => pinQueue(l))
  ok('③ /api/seo-health rows = healthData 直算', seo && Array.isArray(seo.rows) && seo.rows.length === rows.length && seo.summary.flagged === rows.filter(r => r.issues.length).length, `${seo?.rows?.length ?? '?'} 行 / 异常 ${seo?.summary?.flagged}`)
  ok('③ pins = pinQueue 直算一致', seo && Array.isArray(seo.pins) && seo.pins.length === pins.length, `${seo?.pins?.length ?? '?'}`)

  ok('④ 语言覆盖非硬编码（镜像行数=族谱镜像行数）', apiPages.filter(p => p.langDir).length === expectPages.filter(p => p.langDir).length)

  const bad = await fetch(base + '/api/pin-decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: '../x', decisions: [] }) }).then(r => r.json()).catch(() => null)
  ok('⑤ 写代理活着（8092 未起→502 错误体）', bad && typeof bad.error === 'string', JSON.stringify(bad).slice(0, 60))
} finally { srv.kill('SIGTERM') }

const pass = results.filter(Boolean).length
console.log(`\naccept-workbench: ${pass}/${results.length}`)
process.exit(pass === results.length ? 0 : 1)
