#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateDrafts } from './migrate-drafts-v1.mjs'
import { draftPath, readWorkspace } from '../src/draft-store.mjs'

const site = mkdtempSync(join(tmpdir(), 'draft-migration-'))
mkdirSync(join(site, 'content/products'), { recursive: true })
const publishedFile = join(site, 'content/products/published.json')
const draftFile = join(site, 'content/products/legacy.json')
const published = { page: { status: 'published' }, title: 'Published' }
const draft = { page: { status: 'draft' }, title: 'Legacy draft' }
writeFileSync(publishedFile, JSON.stringify(published, null, 2) + '\n')
writeFileSync(draftFile, JSON.stringify(draft, null, 2) + '\n')

try {
  const before = migrateDrafts(site, { check: true })
  assert.deepEqual(before.legacy, ['products/legacy'])
  assert.equal(existsSync(draftFile), true)

  const first = migrateDrafts(site)
  assert.deepEqual(first.migrated, ['products/legacy'])
  assert.equal(existsSync(draftFile), false)
  assert.equal(existsSync(draftPath(site, 'products/legacy')), true)
  assert.deepEqual(readWorkspace(site, 'products/legacy').workingContent, draft)
  assert.deepEqual(JSON.parse(readFileSync(publishedFile, 'utf8')), published)

  assert.deepEqual(migrateDrafts(site).migrated, [])
  assert.equal(migrateDrafts(site, { check: true }).ok, true)
  console.log('accept-draft-migration: 8/8')
} finally {
  rmSync(site, { recursive: true, force: true })
}
