#!/usr/bin/env node
// 族谱物化（R37）：把派生族谱写成 content/registry.json（索引快照，可全量重建）。
//   node scripts/i18n-registry.mjs           打印族谱摘要
//   node scripts/i18n-registry.mjs --write   重建并落盘 content/registry.json
//   node scripts/i18n-registry.mjs --check   校验落盘文件 ≡ 现算派生（防漂移，可进 check）
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { scanPages, buildGroups } from '../src/i18n/kernel.mjs'

export function deriveRegistry() {
  const pages = scanPages()
  const groups = buildGroups(pages)
  const out = {}
  for (const [pageId, members] of [...groups.entries()].sort()) {
    const langs = {}
    for (const m of members) {
      langs[m.lang] = {
        slug: m.slug,
        file: `content/${m.file}`,
        status: m.status,
        ...(m.langDir ? {} : { source: true }),
      }
    }
    out[pageId] = { type: members[0].type, langs }
  }
  return { pages: out }
}

const REGISTRY_PATH = () => join(process.cwd(), 'content', 'registry.json')

function summary(reg) {
  const rows = []
  for (const [pageId, g] of Object.entries(reg.pages)) {
    const langs = Object.entries(g.langs)
      .map(([lang, m]) => `${lang}${m.source ? '*' : ''}:${m.status}`)
      .join('  ')
    rows.push(`  ${pageId} (${g.type}) — ${langs}`)
  }
  return rows.join('\n')
}

if (process.argv[1]?.endsWith('i18n-registry.mjs')) {
const flag = process.argv[2]
const fresh = deriveRegistry()
if (flag === '--write') {
  writeFileSync(REGISTRY_PATH(), JSON.stringify(fresh, null, 2) + '\n')
  console.log(`✓ content/registry.json 已重建（${Object.keys(fresh.pages).length} 个逻辑页）`)
} else if (flag === '--check') {
  if (!existsSync(REGISTRY_PATH())) {
    console.error('✗ content/registry.json 不存在——跑 i18n-registry.mjs --write')
    process.exit(1)
  }
  const disk = readFileSync(REGISTRY_PATH(), 'utf8')
  if (disk === JSON.stringify(fresh, null, 2) + '\n') console.log('✓ registry.json ≡ 现算派生，无漂移')
  else {
    console.error('✗ registry.json 与 content 树漂移——跑 i18n-registry.mjs --write 重建')
    process.exit(1)
  }
} else {
  console.log(`族谱（${Object.keys(fresh.pages).length} 个逻辑页，* = 源语言页）：`)
  console.log(summary(fresh))
}
}
