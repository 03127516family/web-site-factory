#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { applyChanges, validateContract, WritebackError } from '../src/writeback/core.mjs'
import { revisionOf, writeJsonAtomic } from '../src/content/revision.mjs'
import { browserContract, loadEditContract } from '../src/edit-contract.mjs'
import { prepareWriteback } from '../src/writeback/request.mjs'
import { createEditContext, editContextScript } from '../src/edit-context.mjs'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const doc = text => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

const contract = {
  version: 1,
  assets: { namespace: 'product', valueFormat: 'filename' },
  fields: {
    title: { path: 'title', type: 'text', required: true },
    count: { path: 'count', type: 'number', min: 0, max: 20 },
    body: { path: 'body', type: 'richText' },
    hero_image: { path: 'hero.image', altPath: 'hero.alt', type: 'image' },
    website: { path: 'website', type: 'link' },
    highlights: { path: 'hero.highlights', type: 'stringList' },
  },
  repeats: {
    specs: {
      path: 'specs', itemIdField: 'id', minItems: 1, maxItems: 3,
      prototype: { id: null, text: '', note: 'preserved-default' },
      fields: {
        text: { path: 'text', type: 'text' },
      },
    },
  },
}

const data = () => ({
  title: 'Old', count: 1, body: doc('Old body'), website: 'https://example.com',
  hero: { image: 'old.jpg', alt: 'Old alt', highlights: ['One'] },
  specs: [
    { id: 'spec_a', text: 'A', note: 'keep-a' },
    { id: 'spec_b', text: 'B', note: 'keep-b' },
  ],
})

const errorCode = fn => {
  try { fn() } catch (error) {
    assert.ok(error instanceof WritebackError)
    return error.code
  }
  assert.fail('expected WritebackError')
}

test('validates a minimal contract', () => {
  assert.equal(validateContract(contract), contract)
})

test('rejects removed inlineHtml fields', () => {
  const unsafe = structuredClone(contract)
  unsafe.fields.title.type = 'inlineHtml'
  assert.equal(errorCode(() => validateContract(unsafe)), 'CONTRACT_INVALID')
})

test('validates template asset storage policy', () => {
  const unsafeNamespace = structuredClone(contract)
  unsafeNamespace.assets.namespace = '../outside'
  assert.equal(errorCode(() => validateContract(unsafeNamespace)), 'CONTRACT_INVALID')
  const unsafeFormat = structuredClone(contract)
  unsafeFormat.assets.valueFormat = 'absoluteDiskPath'
  assert.equal(errorCode(() => validateContract(unsafeFormat)), 'CONTRACT_INVALID')
})

test('rejects unsafe contract paths', () => {
  const unsafe = structuredClone(contract)
  unsafe.fields.title.path = '__proto__.polluted'
  assert.equal(errorCode(() => validateContract(unsafe)), 'CONTRACT_INVALID')
})

test('updates fixed fields without mutating input', () => {
  const input = data()
  const result = applyChanges({ data: input, contract, changes: [{ targetId: 'title', value: 'New' }] })
  assert.equal(result.data.title, 'New')
  assert.equal(input.title, 'Old')
  assert.deepEqual(result.touchedTargets, ['title'])
  assert.deepEqual(result.inverseChanges, [{ targetId: 'title', value: 'Old' }])
})

test('rejects undeclared targets', () => {
  assert.equal(errorCode(() => applyChanges({ data: data(), contract, changes: [{ targetId: 'hero.secret', value: 'x' }] })), 'TARGET_NOT_FOUND')
})

test('validates number bounds', () => {
  assert.equal(errorCode(() => applyChanges({ data: data(), contract, changes: [{ targetId: 'count', value: 21 }] })), 'INVALID_VALUE')
})

test('validates rich text with the site schema', () => {
  const bad = { type: 'doc', content: [{ type: 'video' }] }
  assert.equal(errorCode(() => applyChanges({ data: data(), contract, changes: [{ targetId: 'body', value: bad }] })), 'INVALID_VALUE')
})

test('writes image src and declared alt sibling', () => {
  const result = applyChanges({ data: data(), contract, changes: [{ targetId: 'hero_image', value: { src: 'new.jpg', alt: 'New alt' } }] })
  assert.deepEqual(result.data.hero, { image: 'new.jpg', alt: 'New alt', highlights: ['One'] })
})

test('rejects dangerous link protocols', () => {
  assert.equal(errorCode(() => applyChanges({ data: data(), contract, changes: [{ targetId: 'website', value: 'javascript:alert(1)' }] })), 'INVALID_VALUE')
})

test('validates string lists', () => {
  const result = applyChanges({ data: data(), contract, changes: [{ targetId: 'highlights', value: ['A', 'B'] }] })
  assert.deepEqual(result.data.hero.highlights, ['A', 'B'])
  assert.equal(errorCode(() => applyChanges({ data: data(), contract, changes: [{ targetId: 'highlights', value: ['A', 2] }] })), 'INVALID_VALUE')
})

test('updates repeat child by stable item id', () => {
  const result = applyChanges({ data: data(), contract, changes: [{ targetId: 'specs/spec_b/text', value: 'B2' }] })
  assert.equal(result.data.specs[1].text, 'B2')
  assert.equal(result.data.specs[1].note, 'keep-b')
})

test('inserts repeat item from the contract prototype', () => {
  const result = applyChanges({ data: data(), contract, changes: [{ op: 'insertItem', regionId: 'specs', itemId: 'spec_c', afterItemId: 'spec_a' }] })
  assert.deepEqual(result.data.specs[1], { id: 'spec_c', text: '', note: 'preserved-default' })
  assert.deepEqual(result.inverseChanges[0], { op: 'deleteItem', regionId: 'specs', itemId: 'spec_c' })
})

test('rejects duplicate repeat ids and max overflow', () => {
  assert.equal(errorCode(() => applyChanges({ data: data(), contract, changes: [{ op: 'insertItem', regionId: 'specs', itemId: 'spec_a' }] })), 'DUPLICATE_ITEM_ID')
  const full = data(); full.specs.push({ id: 'spec_c', text: 'C' })
  assert.equal(errorCode(() => applyChanges({ data: full, contract, changes: [{ op: 'insertItem', regionId: 'specs', itemId: 'spec_d' }] })), 'MAX_ITEMS_VIOLATION')
})

test('deletes repeat item by id and returns a lossless inverse', () => {
  const result = applyChanges({ data: data(), contract, changes: [{ op: 'deleteItem', regionId: 'specs', itemId: 'spec_b' }] })
  assert.deepEqual(result.data.specs.map(x => x.id), ['spec_a'])
  assert.deepEqual(result.inverseChanges[0], { op: 'restoreItem', regionId: 'specs', item: { id: 'spec_b', text: 'B', note: 'keep-b' }, index: 1 })
})

test('enforces repeat minimum', () => {
  const one = data(); one.specs = [one.specs[0]]
  assert.equal(errorCode(() => applyChanges({ data: one, contract, changes: [{ op: 'deleteItem', regionId: 'specs', itemId: 'spec_a' }] })), 'MIN_ITEMS_VIOLATION')
})

test('moves repeat item by id', () => {
  const result = applyChanges({ data: data(), contract, changes: [{ op: 'moveItem', regionId: 'specs', itemId: 'spec_b', afterItemId: null }] })
  assert.deepEqual(result.data.specs.map(x => x.id), ['spec_b', 'spec_a'])
})

test('applies a batch transactionally', () => {
  const input = data()
  assert.equal(errorCode(() => applyChanges({ data: input, contract, changes: [
    { targetId: 'title', value: 'Would be partial' },
    { targetId: 'missing', value: 'x' },
  ] })), 'TARGET_NOT_FOUND')
  assert.equal(input.title, 'Old')
})

test('computes deterministic byte revisions', () => {
  assert.equal(revisionOf('abc'), revisionOf(Buffer.from('abc')))
  assert.notEqual(revisionOf('abc'), revisionOf('abcd'))
})

test('atomically replaces JSON and leaves no temporary file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'writeback-'))
  try {
    const file = join(dir, 'page.json')
    writeFileSync(file, '{"old":true}\n')
    const result = writeJsonAtomic(file, { next: true })
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { next: true })
    assert.equal(result.revision, revisionOf(readFileSync(file)))
    assert.deepEqual(readdirSync(dir), ['page.json'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loads a contract from the active page template directory', () => {
  const site = mkdtempSync(join(tmpdir(), 'contract-'))
  try {
    const dir = join(site, 'src/components/products/ProductPage')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'edit-contract.json'), JSON.stringify(contract))
    const loaded = loadEditContract(site, { type: 'product', template: 'ProductPage' })
    assert.deepEqual(loaded, contract)
  } finally {
    rmSync(site, { recursive: true, force: true })
  }
})

test('rejects unsafe template names before reading files', () => {
  assert.equal(errorCode(() => loadEditContract('/tmp/site', { type: 'product', template: '../secret' })), 'CONTRACT_INVALID')
})

test('browser contract exposes capabilities but not storage paths or prototypes', () => {
  const publicView = browserContract(contract, { publicBase: '/cdn/assets/' })
  assert.deepEqual(publicView.fields.title, { type: 'text', required: true })
  assert.equal(publicView.fields.title.path, undefined)
  assert.equal(publicView.repeats.specs.prototype, undefined)
  assert.deepEqual(publicView.repeats.specs.fields.text, { type: 'text' })
  assert.deepEqual(publicView.assets, {
    namespace: 'product',
    valueFormat: 'filename',
    publicPrefix: '/cdn/assets/product/',
  })
})

test('all page templates use the shared inquiry component', () => {
  const site = join(import.meta.dirname, '..')
  const templates = [
    'src/components/products/ProductPage/index.astro',
    'src/components/posts/PostPage/index.astro',
    'src/components/posts/5-ton-overhead-crane/index.astro',
    'src/components/posts/gantry-cranes-for-sale/index.astro',
    'src/components/posts/crane-lifting-safety-training/index.astro',
    'src/components/posts/32t-rail-mounted-container-gantry-crane-exported-to-russia/index.astro',
  ]
  for (const file of templates) {
    const source = readFileSync(join(site, file), 'utf8')
    assert.match(source, /import InquiryForm from ['"]@src\/components\/shared\/InquiryForm\.astro['"]/)
    assert.match(source, /<InquiryForm\s/)
    assert.doesNotMatch(source, /repoFrag\(['"]inquiry-form['"]\)/)
  }
})

test('every template used by real content has an edit contract', () => {
  const site = join(import.meta.dirname, '..')
  const files = readdirSync(join(site, 'content'), { recursive: true })
    .filter(name => name.endsWith('.json'))
  const templates = new Map()
  for (const name of files) {
    const page = JSON.parse(readFileSync(join(site, 'content', name), 'utf8')).page
    if (!page?.type || !page?.template) continue
    templates.set(`${page.type}/${page.template}`, page)
  }
  for (const page of templates.values()) loadEditContract(site, page)
  assert.equal(templates.size, 5)
})

test('prepares a revision-checked contract writeback request', () => {
  const site = mkdtempSync(join(tmpdir(), 'request-'))
  try {
    const dir = join(site, 'src/components/products/ProductPage')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'edit-contract.json'), JSON.stringify(contract))
    const input = { ...data(), page: { type: 'product', template: 'ProductPage', status: 'published' } }
    const bytes = Buffer.from(JSON.stringify(input))
    const result = prepareWriteback({
      site, bytes, expectedRevision: revisionOf(bytes),
      changes: [{ targetId: 'title', value: 'Request title' }],
    })
    assert.equal(result.data.title, 'Request title')
    assert.equal(result.data.page.status, 'published')
  } finally {
    rmSync(site, { recursive: true, force: true })
  }
})

test('normalizes image URLs with the template asset policy', () => {
  const site = mkdtempSync(join(tmpdir(), 'request-assets-'))
  try {
    const dir = join(site, 'src/components/products/ProductPage')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'edit-contract.json'), JSON.stringify(contract))
    const input = { ...data(), page: { type: 'product', template: 'ProductPage', status: 'published' } }
    const bytes = Buffer.from(JSON.stringify(input))
    const result = prepareWriteback({
      site, bytes, expectedRevision: revisionOf(bytes),
      changes: [{ targetId: 'hero_image', value: { src: '/assets/img/product/new.jpg', alt: 'New' } }],
    })
    assert.equal(result.data.hero.image, 'new.jpg')
  } finally {
    rmSync(site, { recursive: true, force: true })
  }
})

test('rejects stale writeback revisions', () => {
  const bytes = Buffer.from(JSON.stringify({ page: { type: 'product', template: 'ProductPage' } }))
  assert.equal(errorCode(() => prepareWriteback({ site: '/tmp/site', bytes, expectedRevision: 'stale', changes: [] })), 'REVISION_CONFLICT')
})

test('rejects client-submitted internal restore operations', () => {
  const site = mkdtempSync(join(tmpdir(), 'request-restore-'))
  try {
    const dir = join(site, 'src/components/products/ProductPage')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'edit-contract.json'), JSON.stringify(contract))
    const input = { ...data(), page: { type: 'product', template: 'ProductPage', status: 'published' } }
    const bytes = Buffer.from(JSON.stringify(input))
    assert.equal(errorCode(() => prepareWriteback({
      site, bytes, expectedRevision: revisionOf(bytes),
      changes: [{ op: 'restoreItem', regionId: 'specs', item: { id: 'injected', text: '<script>x</script>', extra: true }, index: 0 }],
    })), 'INVALID_OPERATION')
  } finally {
    rmSync(site, { recursive: true, force: true })
  }
})

test('requires revision and changes and rejects legacy patches', () => {
  const site = mkdtempSync(join(tmpdir(), 'request-shape-'))
  try {
    const dir = join(site, 'src/components/products/ProductPage')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'edit-contract.json'), JSON.stringify(contract))
    const input = { ...data(), page: { type: 'product', template: 'ProductPage', status: 'published' } }
    const bytes = Buffer.from(JSON.stringify(input))
    const revision = revisionOf(bytes)
    assert.equal(errorCode(() => prepareWriteback({ site, bytes, changes: [] })), 'REVISION_REQUIRED')
    assert.equal(errorCode(() => prepareWriteback({ site, bytes, expectedRevision: revision })), 'CHANGES_REQUIRED')
    assert.equal(errorCode(() => prepareWriteback({
      site, bytes, expectedRevision: revision, changes: [],
      patches: [{ path: 'title', kind: 'html', value: 'Legacy title' }],
    })), 'LEGACY_PATCH_UNSUPPORTED')
  } finally {
    rmSync(site, { recursive: true, force: true })
  }
})

test('creates a path-free browser edit context with current revision', () => {
  const site = mkdtempSync(join(tmpdir(), 'context-'))
  try {
    const dir = join(site, 'src/components/products/ProductPage')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'edit-contract.json'), JSON.stringify(contract))
    mkdirSync(join(site, 'content/products'), { recursive: true })
    const page = { ...data(), page: { type: 'product', template: 'ProductPage' } }
    const bytes = Buffer.from(JSON.stringify(page))
    writeFileSync(join(site, 'content/products/x.json'), bytes)
    const context = createEditContext(site, 'products/x')
    assert.equal(context.slug, 'products/x')
    assert.equal(context.revision, revisionOf(bytes))
    assert.equal(context.contract.fields.title.path, undefined)
    assert.equal(JSON.stringify(context).includes('hero.image'), false)
  } finally {
    rmSync(site, { recursive: true, force: true })
  }
})

test('serializes edit context without allowing script-tag breakout', () => {
  const script = editContextScript({ slug: '</script><script>alert(1)</script>', revision: 'r', contract: { version: 1, fields: {}, repeats: {} } })
  assert.equal(script.includes('</script><script>'), false)
  assert.match(script, /^<script>window\.__EDIT_CONTEXT__=/)
})

let failed = 0
for (const { name, fn } of tests) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    failed++
    console.error(`✗ ${name}`)
    console.error(error.stack || error)
  }
}

console.log(`\naccept-writeback: ${tests.length - failed}/${tests.length}`)
process.exit(failed ? 1 : 0)
