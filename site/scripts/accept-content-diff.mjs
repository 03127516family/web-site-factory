#!/usr/bin/env node
import assert from 'node:assert/strict'
import { diffContent } from '../src/content-diff.mjs'

const doc = text => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const contract = {
  version: 1,
  assets: { namespace: 'product', valueFormat: 'filename' },
  fields: {
    title: { path: 'title', type: 'text' },
    count: { path: 'count', type: 'number' },
    body: { path: 'body', type: 'richText' },
    hero_image: { path: 'hero.image', altPath: 'hero.alt', type: 'image' },
    website: { path: 'website', type: 'link' },
    highlights: { path: 'hero.highlights', type: 'stringList' },
  },
  repeats: {
    specs: {
      path: 'specs', itemIdField: 'id', minItems: 0, maxItems: 10,
      prototype: { id: null, text: '', image: '', alt: '' },
      fields: {
        text: { path: 'text', type: 'text' },
        image: { path: 'image', altPath: 'alt', type: 'image' },
      },
    },
  },
}

const published = {
  title: 'Old', count: 1, body: doc('Old body'), website: 'https://old.example',
  hero: { image: 'old.jpg', alt: 'Old alt', highlights: ['A', 'B'] },
  specs: [
    { id: 'spec_a', text: 'A', image: 'a.jpg', alt: 'A image' },
    { id: 'spec_b', text: 'B', image: 'b.jpg', alt: 'B image' },
    { id: 'spec_c', text: 'C', image: 'c.jpg', alt: 'C image' },
  ],
}

const candidate = {
  title: 'New', count: 2, body: doc('New body'), website: '/new',
  hero: { image: 'new.jpg', alt: 'New alt', highlights: ['A', 'C'] },
  specs: [
    { id: 'spec_b', text: 'B2', image: 'b2.jpg', alt: 'B image 2' },
    { id: 'spec_a', text: 'A', image: 'a.jpg', alt: 'A image' },
    { id: 'spec_d', text: 'D', image: 'd.jpg', alt: 'D image' },
  ],
}

const diff = diffContent({ published, candidate, contract })
assert.equal(diff.firstPublish, false)
assert.deepEqual(diff.items.find(item => item.targetId === 'title'), {
  kind: 'field', targetId: 'title', type: 'text', before: 'Old', after: 'New',
})
assert.deepEqual(diff.items.find(item => item.targetId === 'hero_image'), {
  kind: 'field', targetId: 'hero_image', type: 'image',
  before: { src: 'old.jpg', alt: 'Old alt' }, after: { src: 'new.jpg', alt: 'New alt' },
})
assert.deepEqual(diff.items.find(item => item.targetId === 'specs/spec_b/text'), {
  kind: 'field', targetId: 'specs/spec_b/text', type: 'text', before: 'B', after: 'B2',
})
assert.deepEqual(diff.items.find(item => item.targetId === 'specs/spec_b/image').after, { src: 'b2.jpg', alt: 'B image 2' })
assert.deepEqual(diff.items.find(item => item.kind === 'repeat-delete'), {
  kind: 'repeat-delete', regionId: 'specs', itemId: 'spec_c',
})
assert.deepEqual(diff.items.find(item => item.kind === 'repeat-insert'), {
  kind: 'repeat-insert', regionId: 'specs', itemId: 'spec_d',
})
assert.deepEqual(diff.items.find(item => item.kind === 'repeat-order'), {
  kind: 'repeat-order', regionId: 'specs', before: ['spec_a', 'spec_b'], after: ['spec_b', 'spec_a'],
})
assert.ok(diff.items.some(item => item.targetId === 'body' && item.type === 'richText'))
assert.ok(diff.items.some(item => item.targetId === 'highlights' && item.type === 'stringList'))
assert.ok(diff.items.some(item => item.targetId === 'website' && item.type === 'link'))
assert.equal(diff.items.some(item => item.targetId === 'specs/spec_a/text'), false)

assert.deepEqual(diffContent({ published, candidate: structuredClone(published), contract }), {
  firstPublish: false,
  items: [],
})
assert.deepEqual(diffContent({ published: null, candidate, contract }), {
  firstPublish: true,
  items: [],
})

console.log('accept-content-diff: 15/15')
