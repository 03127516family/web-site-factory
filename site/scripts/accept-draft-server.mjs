#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDraftWorkflow } from '../src/draft-workflow.mjs'
import { draftPath, readWorkspace } from '../src/draft-store.mjs'
import { WritebackError } from '../src/writeback-core.mjs'
import { createOutputBuilder } from '../src/build-outputs.mjs'

const site = mkdtempSync(join(tmpdir(), 'draft-server-'))
const slug = 'products/x'
const contentFile = join(site, 'content', `${slug}.json`)
const assetFile = join(site, 'public/assets/img/product/uploaded.jpg')
const distFile = join(site, 'dist/page.txt')
const editFile = join(site, 'dist-edit/page.txt')
mkdirSync(join(site, 'src/components/products/ProductPage'), { recursive: true })
mkdirSync(join(site, 'content/products'), { recursive: true })
mkdirSync(join(site, 'public/assets/img/product'), { recursive: true })
mkdirSync(join(site, 'dist'), { recursive: true })
mkdirSync(join(site, 'dist-edit'), { recursive: true })
writeFileSync(join(site, 'src/components/products/ProductPage/edit-contract.json'), JSON.stringify({
  version: 1,
  assets: { namespace: 'product', valueFormat: 'filename' },
  fields: { title: { path: 'title', type: 'text' } },
  repeats: {},
}))
writeFileSync(contentFile, JSON.stringify({
  page: { type: 'product', template: 'ProductPage', status: 'published' }, title: 'Published',
}, null, 2) + '\n')
writeFileSync(assetFile, 'upload')
writeFileSync(distFile, 'published-output')
writeFileSync(editFile, 'published-edit-output')

let failEdit = false
let failPublish = false
const workflow = createDraftWorkflow({
  site,
  rebuildEdit: async () => {
    if (failEdit) throw new Error('edit build failed')
    writeFileSync(editFile, readWorkspace(site, slug).workingContent.title)
  },
  stagePublish: async () => {
    if (failPublish) throw new Error('publish build failed')
    const title = JSON.parse(readFileSync(contentFile, 'utf8')).title
    return {
      activate: async () => {
        writeFileSync(distFile, title)
        writeFileSync(editFile, title)
      },
      cleanup: async () => {},
    }
  },
})

const tests = []
const test = (name, fn) => tests.push({ name, fn })
const codeOf = async fn => {
  try { await fn() } catch (error) {
    assert.ok(error instanceof WritebackError)
    return error.code
  }
  assert.fail('expected WritebackError')
}
const payload = (workspace, title, intent = 'draft') => ({
  slug,
  intent,
  revision: workspace.workingRevision,
  publishedRevision: workspace.publishedRevision,
  changes: [{ targetId: 'title', value: title }],
})

test('draft save leaves published content and production output untouched', async () => {
  const beforeContent = readFileSync(contentFile)
  const beforeDist = readFileSync(distFile)
  const saved = await workflow.saveDraft(payload(readWorkspace(site, slug), 'Draft one'))
  assert.deepEqual(readFileSync(contentFile), beforeContent)
  assert.deepEqual(readFileSync(distFile), beforeDist)
  assert.equal(saved.workspace.workingContent.title, 'Draft one')
  assert.equal(readFileSync(editFile, 'utf8'), 'Draft one')
})

test('one latest draft replaces the previous draft and rejects stale tabs', async () => {
  const first = readWorkspace(site, slug)
  const staleRevision = first.workingRevision
  await workflow.saveDraft(payload(first, 'Draft two'))
  const filesBefore = readFileSync(draftPath(site, slug), 'utf8')
  assert.equal(JSON.parse(filesBefore).content.title, 'Draft two')
  assert.equal(await codeOf(() => workflow.saveDraft({
    ...payload(readWorkspace(site, slug), 'Lost update'), revision: staleRevision,
  })), 'REVISION_CONFLICT')
})

test('discard restores published edit output and keeps uploaded assets', async () => {
  const current = readWorkspace(site, slug)
  const discarded = await workflow.discardDraft({ slug, revision: current.workingRevision })
  assert.equal(discarded.workspace.workingContent.title, 'Published')
  assert.equal(existsSync(draftPath(site, slug)), false)
  assert.equal(readFileSync(editFile, 'utf8'), 'Published')
  assert.equal(readFileSync(assetFile, 'utf8'), 'upload')
})

test('failed publish restores published bytes and outputs while retaining latest draft', async () => {
  const beforeContent = readFileSync(contentFile)
  const beforeDist = readFileSync(distFile)
  const beforeEdit = readFileSync(editFile)
  failPublish = true
  await assert.rejects(() => workflow.publish(payload(readWorkspace(site, slug), 'Will fail', 'publish')), /publish build failed/)
  failPublish = false
  assert.deepEqual(readFileSync(contentFile), beforeContent)
  assert.deepEqual(readFileSync(distFile), beforeDist)
  assert.deepEqual(readFileSync(editFile), beforeEdit)
  assert.equal(readWorkspace(site, slug).workingContent.title, 'Will fail')
})

test('successful publish promotes content and outputs then removes the draft', async () => {
  const current = readWorkspace(site, slug)
  const result = await workflow.publish(payload(current, 'Published two', 'publish'))
  assert.equal(result.workspace.hasDraft, false)
  assert.equal(result.workspace.workingContent.title, 'Published two')
  assert.equal(result.workspace.workingContent.page.status, 'published')
  assert.equal(readFileSync(distFile, 'utf8'), 'Published two')
  assert.equal(readFileSync(editFile, 'utf8'), 'Published two')
})

test('discarding a never-published draft removes the whole draft page', async () => {
  const newSlug = 'products/new-page'
  const created = await workflow.createDraft({
    slug: newSlug,
    content: { page: { type: 'product', template: 'ProductPage', status: 'draft' }, title: 'New' },
  })
  assert.equal(created.workspace.hasPublished, false)
  const discarded = await workflow.discardDraft({ slug: newSlug, revision: created.workspace.workingRevision })
  assert.equal(discarded.workspace, null)
  assert.equal(existsSync(draftPath(site, newSlug)), false)
})

test('output staging does not activate either directory before both builds pass', async () => {
  writeFileSync(distFile, 'old-dist')
  writeFileSync(editFile, 'old-edit')
  const builder = createOutputBuilder({
    site,
    runBuild: async ({ out }) => {
      mkdirSync(join(site, out), { recursive: true })
      writeFileSync(join(site, out, 'page.txt'), out.startsWith('dist-edit') ? 'new-edit' : 'new-dist')
    },
  })
  const staged = await builder.stagePublished()
  assert.equal(readFileSync(distFile, 'utf8'), 'old-dist')
  assert.equal(readFileSync(editFile, 'utf8'), 'old-edit')
  await staged.activate()
  await staged.cleanup()
  assert.equal(readFileSync(distFile, 'utf8'), 'new-dist')
  assert.equal(readFileSync(editFile, 'utf8'), 'new-edit')
})

test('failed output staging preserves both active directories', async () => {
  writeFileSync(distFile, 'stable-dist')
  writeFileSync(editFile, 'stable-edit')
  const builder = createOutputBuilder({
    site,
    runBuild: async ({ out }) => {
      if (out.startsWith('dist-edit')) throw new Error('second output failed')
      mkdirSync(join(site, out), { recursive: true })
      writeFileSync(join(site, out, 'page.txt'), 'unused')
    },
  })
  await assert.rejects(() => builder.stagePublished(), /second output failed/)
  assert.equal(readFileSync(distFile, 'utf8'), 'stable-dist')
  assert.equal(readFileSync(editFile, 'utf8'), 'stable-edit')
  assert.equal(existsSync(join(site, 'dist-next-test')), false)
})

try {
  for (const { name, fn } of tests) {
    await fn()
    console.log(`✓ ${name}`)
  }
  console.log(`\naccept-draft-server: ${tests.length}/${tests.length}`)
} finally {
  rmSync(site, { recursive: true, force: true })
}
