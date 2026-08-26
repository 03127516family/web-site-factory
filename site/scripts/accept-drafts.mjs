#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  discardDraft,
  draftPath,
  readWorkspace,
  writeDraft,
} from '../src/draft/store.mjs'
import { loadPageRecords } from '../src/content/source.mjs'
import { revisionOf } from '../src/content/revision.mjs'
import { WritebackError } from '../src/writeback/core.mjs'
import { createEditContext, previewWorkspaceChanges } from '../src/edit-context.mjs'

const site = mkdtempSync(join(tmpdir(), 'draft-store-'))
const publishedFile = join(site, 'content/products/x.json')
mkdirSync(join(site, 'content/products'), { recursive: true })
writeFileSync(publishedFile, JSON.stringify({ page: { status: 'published', type: 'product', template: 'ProductPage' }, title: 'Published' }, null, 2) + '\n')
const contractDir = join(site, 'src/components/products/ProductPage')
mkdirSync(contractDir, { recursive: true })
writeFileSync(join(contractDir, 'edit-contract.json'), JSON.stringify({
  version: 1,
  assets: { namespace: 'product', valueFormat: 'filename' },
  fields: { title: { path: 'title', type: 'text' } },
  repeats: {},
}))

const tests = []
const test = (name, fn) => tests.push({ name, fn })
const codeOf = fn => {
  try { fn() } catch (error) {
    assert.ok(error instanceof WritebackError)
    return error.code
  }
  assert.fail('expected WritebackError')
}

test('rejects unsafe draft slugs', () => {
  assert.equal(codeOf(() => draftPath(site, '../outside')), 'CONTENT_INVALID')
  assert.equal(codeOf(() => draftPath(site, 'products/x.json')), 'CONTENT_INVALID')
})

test('uses published content when no draft exists', () => {
  const workspace = readWorkspace(site, 'products/x')
  assert.equal(workspace.hasPublished, true)
  assert.equal(workspace.hasDraft, false)
  assert.equal(workspace.workingContent.title, 'Published')
  assert.equal(workspace.workingRevision, workspace.publishedRevision)
})

test('draft overrides published content without changing it', () => {
  const before = readFileSync(publishedFile)
  const publishedRevision = revisionOf(before)
  const saved = writeDraft(site, 'products/x', {
    baseRevision: publishedRevision,
    content: { page: { status: 'draft', type: 'product', template: 'ProductPage' }, title: 'Draft' },
  })
  assert.equal(saved.baseRevision, publishedRevision)
  assert.equal(saved.hasDraft, true)
  assert.equal(saved.workingContent.title, 'Draft')
  assert.deepEqual(readFileSync(publishedFile), before)
  assert.ok(existsSync(draftPath(site, 'products/x')))
})

test('rewriting a draft retains the original published base', () => {
  const first = readWorkspace(site, 'products/x')
  const saved = writeDraft(site, 'products/x', {
    expectedRevision: first.workingRevision,
    baseRevision: first.baseRevision,
    content: { page: { status: 'draft', type: 'product', template: 'ProductPage' }, title: 'Draft 2' },
  })
  assert.equal(saved.workingContent.title, 'Draft 2')
  assert.equal(saved.baseRevision, first.baseRevision)
})

test('rejects a stale working revision', () => {
  assert.equal(codeOf(() => writeDraft(site, 'products/x', {
    expectedRevision: 'stale',
    baseRevision: readWorkspace(site, 'products/x').baseRevision,
    content: { page: { status: 'draft', type: 'product', template: 'ProductPage' }, title: 'Lost update' },
  })), 'REVISION_CONFLICT')
})

test('discard requires the latest revision and restores published working content', () => {
  assert.equal(codeOf(() => discardDraft(site, 'products/x', 'stale')), 'REVISION_CONFLICT')
  const latest = readWorkspace(site, 'products/x')
  discardDraft(site, 'products/x', latest.workingRevision)
  const restored = readWorkspace(site, 'products/x')
  assert.equal(restored.hasDraft, false)
  assert.equal(restored.workingContent.title, 'Published')
})

test('supports a never-published draft', () => {
  const saved = writeDraft(site, 'products/new-page', {
    baseRevision: null,
    content: { page: { status: 'draft' }, title: 'New page' },
  })
  assert.equal(saved.hasPublished, false)
  assert.equal(saved.hasDraft, true)
  assert.equal(saved.baseRevision, null)
  assert.equal(saved.workingContent.title, 'New page')
})

test('rejects malformed draft envelopes', () => {
  const file = draftPath(site, 'products/bad')
  mkdirSync(join(site, '.drafts/products'), { recursive: true })
  writeFileSync(file, '{"version":9,"content":{}}\n')
  assert.equal(codeOf(() => readWorkspace(site, 'products/bad')), 'DRAFT_INVALID')
})

test('production records ignore drafts while edit records overlay them', () => {
  rmSync(draftPath(site, 'products/bad'), { force: true })
  writeDraft(site, 'products/x', {
    baseRevision: readWorkspace(site, 'products/x').publishedRevision,
    content: { page: { status: 'draft', type: 'product', template: 'ProductPage' }, title: 'Overlay draft' },
  })
  const production = loadPageRecords(site, { type: 'products', includeDrafts: false })
  const editing = loadPageRecords(site, { type: 'products', includeDrafts: true })
  assert.deepEqual(production.map(record => record.j.title), ['Published'])
  assert.deepEqual(editing.map(record => record.j.title).sort(), ['New page', 'Overlay draft'])
  assert.equal(editing.find(record => record.j.title === 'Overlay draft').source, 'draft')
})

test('edit context describes the latest workspace without exposing storage paths', () => {
  const workspace = readWorkspace(site, 'products/x')
  const context = createEditContext(site, 'products/x')
  assert.equal(context.revision, workspace.workingRevision)
  assert.equal(context.publishedRevision, workspace.publishedRevision)
  assert.equal(context.hasDraft, true)
  assert.equal(context.hasPublished, true)
  assert.equal(context.contract.fields.title.path, undefined)
})

test('preview compares pending changes with published content without writing them', () => {
  const before = readWorkspace(site, 'products/x')
  const preview = previewWorkspaceChanges(site, {
    slug: 'products/x',
    revision: before.workingRevision,
    publishedRevision: before.publishedRevision,
    changes: [{ targetId: 'title', value: 'Pending title' }],
  })
  assert.deepEqual(preview.diff.items, [{
    kind: 'field', targetId: 'title', type: 'text', before: 'Published', after: 'Pending title',
  }])
  assert.equal(readWorkspace(site, 'products/x').workingContent.title, 'Overlay draft')
  assert.equal(codeOf(() => previewWorkspaceChanges(site, {
    slug: 'products/x', revision: before.workingRevision, publishedRevision: 'stale', changes: [],
  })), 'REVISION_CONFLICT')
})

try {
  for (const { name, fn } of tests) {
    fn()
    console.log(`✓ ${name}`)
  }
  console.log(`\naccept-drafts: ${tests.length}/${tests.length}`)
} finally {
  rmSync(site, { recursive: true, force: true })
}
