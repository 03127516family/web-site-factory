import { validateContract } from './writeback-core.mjs'

const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function getAt(value, path) {
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  if (keys.some(key => !key || BLOCKED_KEYS.has(key))) return undefined
  let current = value
  for (const key of keys) {
    if (current == null) return undefined
    current = current[key]
  }
  return current
}

function fieldValue(owner, field) {
  if (field.type === 'image') {
    return {
      src: getAt(owner, field.path),
      alt: field.altPath ? getAt(owner, field.altPath) ?? '' : '',
    }
  }
  const value = getAt(owner, field.path)
  return value === undefined ? undefined : structuredClone(value)
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function addFieldDiff(items, targetId, field, beforeOwner, afterOwner) {
  const before = fieldValue(beforeOwner, field)
  const after = fieldValue(afterOwner, field)
  if (equal(before, after)) return
  items.push({ kind: 'field', targetId, type: field.type, before, after })
}

export function diffContent({ published, candidate, contract }) {
  validateContract(contract)
  if (published == null) return { firstPublish: true, items: [] }

  const items = []
  for (const [fieldId, field] of Object.entries(contract.fields)) {
    addFieldDiff(items, fieldId, field, published, candidate)
  }

  for (const [regionId, region] of Object.entries(contract.repeats)) {
    const beforeItems = getAt(published, region.path) ?? []
    const afterItems = getAt(candidate, region.path) ?? []
    const idField = region.itemIdField
    const beforeById = new Map(beforeItems.map(item => [item?.[idField], item]))
    const afterById = new Map(afterItems.map(item => [item?.[idField], item]))

    for (const item of beforeItems) {
      const itemId = item?.[idField]
      if (!afterById.has(itemId)) items.push({ kind: 'repeat-delete', regionId, itemId })
    }
    for (const item of afterItems) {
      const itemId = item?.[idField]
      if (!beforeById.has(itemId)) items.push({ kind: 'repeat-insert', regionId, itemId })
    }

    const beforeOrder = beforeItems.map(item => item?.[idField]).filter(itemId => afterById.has(itemId))
    const afterOrder = afterItems.map(item => item?.[idField]).filter(itemId => beforeById.has(itemId))
    if (!equal(beforeOrder, afterOrder)) {
      items.push({ kind: 'repeat-order', regionId, before: beforeOrder, after: afterOrder })
    }

    for (const itemId of afterOrder) {
      const beforeItem = beforeById.get(itemId)
      const afterItem = afterById.get(itemId)
      for (const [fieldId, field] of Object.entries(region.fields)) {
        addFieldDiff(items, `${regionId}/${itemId}/${fieldId}`, field, beforeItem, afterItem)
      }
    }
  }

  return { firstPublish: false, items }
}
