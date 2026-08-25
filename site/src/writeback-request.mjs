import { loadEditContract } from './edit-contract.mjs'
import { revisionOf } from './content-revision.mjs'
import { applyChanges, WritebackError } from './writeback-core.mjs'
import { loadSiteAssetConfig, publicAssetPolicy, toStoredAssetValue } from './asset-config.mjs'

const fail = (code, message, details) => { throw new WritebackError(code, message, details) }
const CLIENT_OPERATIONS = new Set(['insertItem', 'deleteItem', 'moveItem'])

function fieldForTarget(contract, targetId) {
  const parts = String(targetId || '').split('/')
  if (parts.length === 1) return contract.fields[parts[0]]
  if (parts.length === 3) return contract.repeats[parts[0]]?.fields?.[parts[2]]
  return null
}

function normalizeTreeAssets(node, policy) {
  if (Array.isArray(node)) return node.map(value => normalizeTreeAssets(value, policy))
  if (!node || typeof node !== 'object') return node
  const next = { ...node }
  if (node.attrs) next.attrs = { ...node.attrs }
  if (node.type === 'image' && typeof next.attrs?.src === 'string') {
    next.attrs.src = toStoredAssetValue(next.attrs.src, policy)
  }
  if (node.content) next.content = normalizeTreeAssets(node.content, policy)
  return next
}

function normalizeAssetChanges(contract, changes) {
  const policy = publicAssetPolicy(contract.assets, loadSiteAssetConfig())
  return changes.map(change => {
    if (change?.op) return change
    const field = fieldForTarget(contract, change?.targetId)
    if (field?.type === 'image' && change.value && typeof change.value === 'object') {
      return { ...change, value: { ...change.value, src: toStoredAssetValue(change.value.src, policy) } }
    }
    if (field?.type === 'richText') return { ...change, value: normalizeTreeAssets(change.value, policy) }
    return change
  })
}

function patchValue(patch) {
  if (patch.kind === 'html') return patch.value
  if (patch.kind === 'tree') return patch.value
  if (patch.kind === 'image') return { src: patch.src, alt: patch.alt ?? '' }
  if (patch.kind === 'link') return patch.href
  fail('LEGACY_PATCH_UNSUPPORTED', `旧 patch 类型不再支持: ${patch.kind}`)
}

export function legacyPatchesToChanges(data, contract, patches) {
  if (!Array.isArray(patches)) fail('INVALID_OPERATION', 'patches 必须是数组')
  const fixedByPath = new Map(Object.entries(contract.fields).map(([targetId, field]) => [field.path, targetId]))
  const changes = []
  for (const patch of patches) {
    const fixed = fixedByPath.get(patch?.path)
    if (fixed) {
      changes.push({ targetId: fixed, value: patchValue(patch) })
      continue
    }
    let matched = false
    for (const [regionId, region] of Object.entries(contract.repeats)) {
      const escaped = region.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const match = String(patch?.path || '').match(new RegExp(`^${escaped}\\[(\\d+)\\]\\.(.+)$`))
      if (!match) continue
      const fieldEntry = Object.entries(region.fields).find(([, field]) => field.path === match[2])
      if (!fieldEntry) break
      const items = region.path.split('.').reduce((value, key) => value?.[key], data)
      const item = items?.[Number(match[1])]
      const itemId = item?.[region.itemIdField]
      if (!itemId) fail('ITEM_NOT_FOUND', `旧 patch 对应项缺少稳定 ID: ${patch.path}`)
      changes.push({ targetId: `${regionId}/${itemId}/${fieldEntry[0]}`, value: patchValue(patch) })
      matched = true
      break
    }
    if (!matched) fail('TARGET_NOT_FOUND', `模板未授权旧 patch 路径: ${patch?.path || ''}`, { path: patch?.path })
  }
  return changes
}

export function prepareWriteback({ site, bytes, expectedRevision, changes, patches, status }) {
  const currentRevision = revisionOf(bytes)
  if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
    fail('REVISION_CONFLICT', '页面内容已被其他保存更新，请刷新后重试', { expectedRevision, currentRevision })
  }
  if (changes !== undefined && expectedRevision === undefined) fail('REVISION_REQUIRED', 'Changes 保存必须携带 revision')

  let current
  try { current = JSON.parse(Buffer.from(bytes).toString('utf8')) }
  catch (error) { fail('CONTENT_INVALID', `内容 JSON 无法解析: ${error.message}`) }
  if (!current.page) fail('CONTENT_INVALID', '内容 JSON 缺少 page')

  const contract = loadEditContract(site, current.page)
  const normalizedChanges = normalizeAssetChanges(contract, changes ?? legacyPatchesToChanges(current, contract, patches ?? []))
  for (const change of normalizedChanges) {
    if (change?.op && !CLIENT_OPERATIONS.has(change.op)) {
      fail('INVALID_OPERATION', `客户端不允许提交 repeat 操作: ${change.op}`)
    }
  }
  const result = applyChanges({ data: current, contract, changes: normalizedChanges })

  if (status !== undefined) {
    if (!['draft', 'published'].includes(status)) fail('INVALID_STATUS', `status 非法: ${status}`)
    result.data.page.status = status
  }
  return { ...result, contract, currentRevision }
}
