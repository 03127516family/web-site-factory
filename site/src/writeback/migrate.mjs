import { createHash } from 'node:crypto'
import { splitByHeading } from '../render/tree-utils.mjs'

const canonicalSlug = slug => String(slug || 'page').replace(/^[a-z]{2}(?:-[A-Z]{2})?\/(?=(?:products|posts)\/)/, '')
const shortHash = value => createHash('sha256').update(value).digest('hex').slice(0, 10)

function stableId(page, region, prefix, index) {
  return `${prefix}_${shortHash(`${canonicalSlug(page?.slug)}|${region}|${index}`)}`
}

function ensureIds(items, page, region, prefix) {
  if (!Array.isArray(items)) return items
  return items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    return { ...item, id: item.id || stableId(page, region, prefix, index) }
  })
}

function inlineText(node) {
  if (!node) return ''
  if (typeof node.text === 'string') return node.text
  return (node.content ?? []).map(inlineText).join('')
}

function bodyParts(doc) {
  if (!doc?.content) return []
  return splitByHeading(doc).map(part => ({
    heading: inlineText(part.heading),
    body: { type: 'doc', content: structuredClone(part.nodes) },
  }))
}

function mergeParallel(section, images, page, region, prefix) {
  if (section?.items) return { ...section, items: ensureIds(section.items, page, region, prefix) }
  const parts = bodyParts(section?.body)
  const count = Math.max(Array.isArray(images) ? images.length : 0, parts.length)
  const items = Array.from({ length: count }, (_, index) => {
    const image = images?.[index] ?? {}
    const part = parts[index]
    const item = {
      ...structuredClone(image),
      name: image.name ?? part?.heading ?? '',
    }
    if (part) item.body = part.body
    return item
  })
  const { body: _body, ...rest } = section ?? {}
  return { ...rest, items: ensureIds(items, page, region, prefix) }
}

export function migratePageWritebackV1(input) {
  const j = structuredClone(input)
  const page = j.page ?? {}

  if (j.breadcrumb?.trail) j.breadcrumb.trail = ensureIds(j.breadcrumb.trail, page, 'breadcrumb.trail', 'crumb')

  if (page.template === 'ProductPage') {
    if (j.specs) j.specs = ensureIds(j.specs, page, 'specs', 'spec')
    if (j.gallery) j.gallery = ensureIds(j.gallery, page, 'gallery', 'gallery')
    if (j.production_flow?.steps) j.production_flow.steps = ensureIds(j.production_flow.steps, page, 'production_flow.steps', 'flow')
    if (j.installation?.cases) j.installation.cases = ensureIds(j.installation.cases, page, 'installation.cases', 'case')
    if (j.related_products?.seed) j.related_products.seed = ensureIds(j.related_products.seed, page, 'related_products.seed', 'related')

    if (j.components || j.components_images) {
      j.components = mergeParallel(j.components, j.components_images, page, 'components.items', 'component')
      delete j.components_images
    }
    if (j.crane_types || j.crane_types_images) {
      j.crane_types = mergeParallel(j.crane_types, j.crane_types_images, page, 'crane_types.items', 'crane_type')
      delete j.crane_types_images
    }
  }

  if (page.template === 'PostPage' && j.body?.sections) {
    j.body.sections = ensureIds(j.body.sections, page, 'body.sections', 'section')
  }
  return j
}
