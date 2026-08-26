import { validateDoc } from '../content/schema.mjs'
import { normalizeTree } from '../render/tree-utils.mjs'

const FIELD_TYPES = new Set(['text', 'number', 'richText', 'image', 'link', 'stringList', 'boolean'])
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/

export class WritebackError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'WritebackError'
    this.code = code
    this.details = details
  }
}

const fail = (code, message, details) => { throw new WritebackError(code, message, details) }

function pathKeys(path) {
  if (typeof path !== 'string' || !path.trim()) fail('CONTRACT_INVALID', '字段 path 必须是非空字符串')
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  if (keys.some(k => !k || BLOCKED_KEYS.has(k))) fail('CONTRACT_INVALID', `字段 path 非法: ${path}`)
  return keys
}

function getAt(obj, path) {
  let cur = obj
  for (const key of pathKeys(path)) {
    if (cur == null) return undefined
    cur = cur[key]
  }
  return cur
}

function setAt(obj, path, value) {
  const keys = pathKeys(path)
  let cur = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur == null || typeof cur !== 'object' || !(keys[i] in cur)) {
      fail('TARGET_NOT_FOUND', `写回路径不存在: ${path}`, { path })
    }
    cur = cur[keys[i]]
  }
  if (cur == null || typeof cur !== 'object') fail('TARGET_NOT_FOUND', `写回路径不存在: ${path}`, { path })
  cur[keys.at(-1)] = value
}

function validateField(field, label) {
  if (!field || typeof field !== 'object' || Array.isArray(field)) fail('CONTRACT_INVALID', `${label} 定义必须是对象`)
  pathKeys(field.path)
  if (!FIELD_TYPES.has(field.type)) fail('CONTRACT_INVALID', `${label} 类型不支持: ${field.type}`)
  if (field.altPath !== undefined) pathKeys(field.altPath)
}

export function validateContract(contract) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) fail('CONTRACT_INVALID', '模板契约必须是对象')
  if (contract.version !== 1) fail('CONTRACT_INVALID', `不支持的模板契约版本: ${contract.version}`)
  if (!contract.fields || typeof contract.fields !== 'object' || Array.isArray(contract.fields)) fail('CONTRACT_INVALID', '模板契约缺少 fields')
  if (!contract.repeats || typeof contract.repeats !== 'object' || Array.isArray(contract.repeats)) fail('CONTRACT_INVALID', '模板契约缺少 repeats')
  if (!contract.assets || typeof contract.assets !== 'object' || Array.isArray(contract.assets)) fail('CONTRACT_INVALID', '模板契约缺少 assets')
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(contract.assets.namespace || '')) fail('CONTRACT_INVALID', '模板契约 assets.namespace 非法')
  if (!['filename', 'publicPath'].includes(contract.assets.valueFormat)) fail('CONTRACT_INVALID', '模板契约 assets.valueFormat 非法')

  for (const [key, field] of Object.entries(contract.fields)) {
    if (!ID_RE.test(key)) fail('CONTRACT_INVALID', `字段 key 非法: ${key}`)
    validateField(field, `字段 ${key}`)
  }
  for (const [key, region] of Object.entries(contract.repeats)) {
    if (!ID_RE.test(key)) fail('CONTRACT_INVALID', `repeat key 非法: ${key}`)
    if (!region || typeof region !== 'object' || Array.isArray(region)) fail('CONTRACT_INVALID', `repeat ${key} 定义必须是对象`)
    pathKeys(region.path)
    if (!ID_RE.test(region.itemIdField || '')) fail('CONTRACT_INVALID', `repeat ${key} itemIdField 非法`)
    if (!region.prototype || typeof region.prototype !== 'object' || Array.isArray(region.prototype)) fail('CONTRACT_INVALID', `repeat ${key} 缺少 prototype`)
    if (!region.fields || typeof region.fields !== 'object' || Array.isArray(region.fields)) fail('CONTRACT_INVALID', `repeat ${key} 缺少 fields`)
    if (!Number.isInteger(region.minItems) || region.minItems < 0) fail('CONTRACT_INVALID', `repeat ${key} minItems 非法`)
    if (!Number.isInteger(region.maxItems) || region.maxItems < region.minItems) fail('CONTRACT_INVALID', `repeat ${key} maxItems 非法`)
    for (const [fieldKey, field] of Object.entries(region.fields)) {
      if (!ID_RE.test(fieldKey)) fail('CONTRACT_INVALID', `repeat ${key} 字段 key 非法: ${fieldKey}`)
      validateField(field, `repeat ${key}.${fieldKey}`)
    }
  }
  return contract
}

function safeHref(value) {
  if (typeof value !== 'string') return false
  const href = value.trim()
  if (!href) return true
  return /^(?:https?:|mailto:|tel:|\/|#)/i.test(href)
}

function normalizeValue(field, value, targetId) {
  const invalid = message => fail('INVALID_VALUE', `${targetId}: ${message}`, { targetId })
  switch (field.type) {
    case 'boolean':
      if (typeof value !== 'boolean') invalid('必须是布尔值')
      return value
    case 'text':
      if (typeof value !== 'string') invalid('必须是字符串')
      if (field.required && !value.trim()) invalid('不能为空')
      if (field.maxLength && value.length > field.maxLength) invalid(`长度不能超过 ${field.maxLength}`)
      return value
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) invalid('必须是有限数字')
      if (field.min !== undefined && value < field.min) invalid(`不能小于 ${field.min}`)
      if (field.max !== undefined && value > field.max) invalid(`不能大于 ${field.max}`)
      return value
    case 'richText': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('必须是富文本 JSON')
      const normalized = normalizeTree(value)
      try { validateDoc(normalized, targetId) } catch (error) { invalid(error.message) }
      return normalized
    }
    case 'image':
      if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.src !== 'string') invalid('图片值必须包含 src')
      if (value.alt !== undefined && typeof value.alt !== 'string') invalid('图片 alt 必须是字符串')
      return { src: value.src, alt: value.alt ?? '' }
    case 'link':
      if (!safeHref(value)) invalid('链接协议不允许')
      return value
    case 'stringList':
      if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) invalid('必须是字符串数组')
      return structuredClone(value)
    default:
      fail('INVALID_FIELD_TYPE', `${targetId}: 未知字段类型 ${field.type}`, { targetId })
  }
}

function regionItems(data, region, regionId) {
  const items = getAt(data, region.path)
  if (!Array.isArray(items)) fail('REGION_NOT_FOUND', `repeat 数据不存在: ${regionId}`, { regionId })
  return items
}

function itemIndex(items, idField, itemId) {
  return items.findIndex(item => item?.[idField] === itemId)
}

function requireItem(items, region, regionId, itemId) {
  const index = itemIndex(items, region.itemIdField, itemId)
  if (index < 0) fail('ITEM_NOT_FOUND', `repeat 项不存在: ${regionId}/${itemId}`, { regionId, itemId })
  return index
}

function ensurePath(data, path) { // 契约声明过的路径中间层缺失 → 建空对象（声明即可写，如 page.seo.og.* 首次落键；setAt 的「不存在即拒」防的是未声明乱写）
  const keys = pathKeys(path)
  let cur = data
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur == null || typeof cur !== 'object') fail('TARGET_NOT_FOUND', `写回路径不存在: ${path}`, { path })
    if (!(keys[i] in cur)) cur[keys[i]] = {}
    cur = cur[keys[i]]
  }
}

function applyValue(data, contract, change) {
  if (typeof change.targetId !== 'string' || !change.targetId) fail('TARGET_NOT_FOUND', 'change 缺少 targetId')
  const parts = change.targetId.split('/')
  if (parts.length === 1) {
    const field = contract.fields[change.targetId]
    if (!field) fail('TARGET_NOT_FOUND', `模板未声明字段: ${change.targetId}`, { targetId: change.targetId })
    const value = normalizeValue(field, change.value, change.targetId)
    const old = field.type === 'image'
      ? { src: getAt(data, field.path), alt: field.altPath ? getAt(data, field.altPath) ?? '' : '' }
      : structuredClone(getAt(data, field.path))
    if (field.type === 'image') {
      setAt(data, field.path, value.src)
      if (field.altPath) setAt(data, field.altPath, value.alt)
    } else { ensurePath(data, field.path); setAt(data, field.path, value) }
    return { inverse: { targetId: change.targetId, value: old }, touched: change.targetId }
  }
  if (parts.length !== 3) fail('TARGET_NOT_FOUND', `repeat targetId 格式非法: ${change.targetId}`, { targetId: change.targetId })
  const [regionId, itemId, fieldKey] = parts
  const region = contract.repeats[regionId]
  if (!region) fail('REGION_NOT_FOUND', `模板未声明 repeat: ${regionId}`, { regionId })
  const field = region.fields[fieldKey]
  if (!field) fail('TARGET_NOT_FOUND', `模板未声明 repeat 字段: ${change.targetId}`, { targetId: change.targetId })
  const items = regionItems(data, region, regionId)
  const index = requireItem(items, region, regionId, itemId)
  const value = normalizeValue(field, change.value, change.targetId)
  const old = field.type === 'image'
    ? { src: getAt(items[index], field.path), alt: field.altPath ? getAt(items[index], field.altPath) ?? '' : '' }
    : structuredClone(getAt(items[index], field.path))
  if (field.type === 'image') {
    setAt(items[index], field.path, value.src)
    if (field.altPath) setAt(items[index], field.altPath, value.alt)
  } else setAt(items[index], field.path, value)
  return { inverse: { targetId: change.targetId, value: old }, touched: change.targetId }
}

function insertionIndex(items, region, regionId, afterItemId) {
  if (afterItemId === null) return 0
  if (afterItemId === undefined) return items.length
  return requireItem(items, region, regionId, afterItemId) + 1
}

function applyOperation(data, contract, change) {
  const region = contract.repeats[change.regionId]
  if (!region) fail('REGION_NOT_FOUND', `模板未声明 repeat: ${change.regionId}`, { regionId: change.regionId })
  const items = regionItems(data, region, change.regionId)
  const idField = region.itemIdField
  if (change.op === 'insertItem') {
    if (!ID_RE.test(change.itemId || '')) fail('INVALID_VALUE', '新增 repeat 项缺少合法 itemId')
    if (itemIndex(items, idField, change.itemId) >= 0) fail('DUPLICATE_ITEM_ID', `repeat itemId 重复: ${change.itemId}`)
    if (items.length >= region.maxItems) fail('MAX_ITEMS_VIOLATION', `${change.regionId} 最多 ${region.maxItems} 项`)
    const item = structuredClone(region.prototype)
    item[idField] = change.itemId
    items.splice(insertionIndex(items, region, change.regionId, change.afterItemId), 0, item)
    return { inverse: { op: 'deleteItem', regionId: change.regionId, itemId: change.itemId }, touched: change.regionId }
  }
  if (change.op === 'deleteItem') {
    if (items.length <= region.minItems) fail('MIN_ITEMS_VIOLATION', `${change.regionId} 至少 ${region.minItems} 项`)
    const index = requireItem(items, region, change.regionId, change.itemId)
    const [item] = items.splice(index, 1)
    return { inverse: { op: 'restoreItem', regionId: change.regionId, item: structuredClone(item), index }, touched: change.regionId }
  }
  if (change.op === 'restoreItem') {
    const itemId = change.item?.[idField]
    if (!ID_RE.test(itemId || '') || itemIndex(items, idField, itemId) >= 0) fail('DUPLICATE_ITEM_ID', `无法恢复 repeat 项: ${itemId}`)
    const index = Math.max(0, Math.min(Number.isInteger(change.index) ? change.index : items.length, items.length))
    items.splice(index, 0, structuredClone(change.item))
    return { inverse: { op: 'deleteItem', regionId: change.regionId, itemId }, touched: change.regionId }
  }
  if (change.op === 'moveItem') {
    const from = requireItem(items, region, change.regionId, change.itemId)
    if (change.afterItemId === change.itemId) fail('INVALID_VALUE', 'repeat 项不能移动到自己后面')
    const oldAfterItemId = from === 0 ? null : items[from - 1][idField]
    const [item] = items.splice(from, 1)
    items.splice(insertionIndex(items, region, change.regionId, change.afterItemId), 0, item)
    return { inverse: { op: 'moveItem', regionId: change.regionId, itemId: change.itemId, afterItemId: oldAfterItemId }, touched: change.regionId }
  }
  fail('INVALID_OPERATION', `不支持的 repeat 操作: ${change.op}`)
}

export function applyChanges({ data, contract, changes }) {
  validateContract(contract)
  if (!Array.isArray(changes)) fail('INVALID_OPERATION', 'changes 必须是数组')
  const next = structuredClone(data)
  const inverseChanges = []
  const touchedTargets = []
  for (const change of changes) {
    if (!change || typeof change !== 'object' || Array.isArray(change)) fail('INVALID_OPERATION', 'change 必须是对象')
    const result = change.op ? applyOperation(next, contract, change) : applyValue(next, contract, change)
    inverseChanges.unshift(result.inverse)
    if (!touchedTargets.includes(result.touched)) touchedTargets.push(result.touched)
  }
  return { data: next, inverseChanges, touchedTargets }
}
