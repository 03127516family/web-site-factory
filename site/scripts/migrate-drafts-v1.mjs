#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { draftPath, readWorkspace, writeDraft } from '../src/draft-store.mjs'

const DEFAULT_SITE = join(fileURLToPath(new URL('.', import.meta.url)), '..')

function contentFiles(root) {
  if (!existsSync(root)) return []
  const files = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const file = join(root, entry.name)
    if (entry.isDirectory()) files.push(...contentFiles(file))
    else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'registry.json') files.push(file)
  }
  return files
}

export function migrateDrafts(site, { check = false } = {}) {
  const root = join(site, 'content')
  const legacy = []
  for (const file of contentFiles(root)) {
    let content
    try { content = JSON.parse(readFileSync(file, 'utf8')) } catch { continue }
    if (content?.page?.status !== 'draft') continue
    const slug = relative(root, file).split(sep).join('/').replace(/\.json$/, '')
    legacy.push({ file, slug, content })
  }
  if (check) return { ok: legacy.length === 0, migrated: [], legacy: legacy.map(item => item.slug) }

  const migrated = []
  for (const item of legacy) {
    const target = draftPath(site, item.slug)
    if (existsSync(target)) {
      const existing = readWorkspace(site, item.slug).workingContent
      if (JSON.stringify(existing) !== JSON.stringify(item.content)) {
        throw new Error(`草稿冲突，未迁移: ${item.slug}`)
      }
    } else {
      writeDraft(site, item.slug, { baseRevision: null, content: item.content })
    }
    rmSync(item.file)
    migrated.push(item.slug)
  }
  return { ok: true, migrated, legacy: [] }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check')
  const result = migrateDrafts(DEFAULT_SITE, { check })
  if (check && !result.ok) {
    console.error(`发现 ${result.legacy.length} 个旧式 content 草稿: ${result.legacy.join(', ')}`)
    process.exit(1)
  }
  console.log(check ? 'draft migration: clean' : `draft migration: migrated ${result.migrated.length}`)
}
