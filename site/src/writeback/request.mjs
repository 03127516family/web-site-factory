import { loadEditContract } from '../edit-contract.mjs'
import { revisionOf } from '../content/revision.mjs'
import { applyChanges, WritebackError } from './core.mjs'
import { loadSiteAssetConfig, publicAssetPolicy, toStoredAssetValue } from '../asset-config.mjs'

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

export function prepareWriteback(request) {
  if ('patches' in request) fail('LEGACY_PATCH_UNSUPPORTED', 'patches 协议已移除，请提交 changes')
  const { site, bytes, expectedRevision, changes } = request
  const currentRevision = revisionOf(bytes)
  if (expectedRevision === undefined) fail('REVISION_REQUIRED', '保存必须携带 revision')
  if (expectedRevision !== currentRevision) {
    fail('REVISION_CONFLICT', '页面内容已被其他保存更新，请刷新后重试', { expectedRevision, currentRevision })
  }
  if (!Array.isArray(changes)) fail('CHANGES_REQUIRED', '保存必须携带 changes 数组')

  let current
  try { current = JSON.parse(Buffer.from(bytes).toString('utf8')) }
  catch (error) { fail('CONTENT_INVALID', `内容 JSON 无法解析: ${error.message}`) }
  if (!current.page) fail('CONTENT_INVALID', '内容 JSON 缺少 page')

  const contract = loadEditContract(site, current.page)
  const normalizedChanges = normalizeAssetChanges(contract, changes)
  for (const change of normalizedChanges) {
    if (change?.op && !CLIENT_OPERATIONS.has(change.op)) {
      fail('INVALID_OPERATION', `客户端不允许提交 repeat 操作: ${change.op}`)
    }
  }
  const result = applyChanges({ data: current, contract, changes: normalizedChanges })
  return { ...result, contract, currentRevision }
}
