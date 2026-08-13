#!/usr/bin/env node
// 一次性迁移：terms.<src>.<tgt>.yaml → .json（D7）。跑完可删（保留无害）。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

const src = process.argv[2] || 'zh-CN'
const tgt = process.argv[3] || 'en'
const yf = join(process.cwd(), 'src', 'i18n', `terms.${src}.${tgt}.yaml`)
if (!existsSync(yf)) { console.error(`无 ${yf}，跳过`); process.exit(0) }
const y = yaml.load(readFileSync(yf, 'utf8')) || {}
const j = { lock: Array.isArray(y.lock) ? y.lock : [], map: y.map ?? {} }
writeFileSync(yf.replace(/\.yaml$/, '.json'), JSON.stringify(j, null, 2) + '\n')
console.log(`✓ 迁移 ${yf} → .json（lock ${j.lock.length} 条 / map ${Object.keys(j.map).length} 条）`)
