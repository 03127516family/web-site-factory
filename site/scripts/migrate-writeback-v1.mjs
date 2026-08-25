#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migratePageWritebackV1 } from '../src/writeback-migrate.mjs'
import { writeJsonAtomic } from '../src/content-revision.mjs'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')

function jsonFiles(root) {
  return readdirSync(root, { recursive: true })
    .filter(name => name.endsWith('.json'))
    .map(name => join(root, name))
}

const files = [
  ...jsonFiles(join(SITE, 'content')),
  ...readdirSync(join(SITE, 'src/components'), { recursive: true })
    .filter(name => name.endsWith('/example.json'))
    .map(name => join(SITE, 'src/components', name)),
]

let changed = 0
for (const file of files) {
  const before = JSON.parse(readFileSync(file, 'utf8'))
  if (!before.page?.template) continue
  const after = migratePageWritebackV1(before)
  if (JSON.stringify(before) === JSON.stringify(after)) continue
  changed++
  console.log(`${check ? '需迁移' : '已迁移'} ${file.slice(SITE.length + 1)}`)
  if (!check) writeJsonAtomic(file, after)
}

console.log(`writeback-v1: ${changed} 个文件${check ? '待迁移' : '已更新'}`)
if (check && changed) process.exit(1)
