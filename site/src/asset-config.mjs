import { isAbsolute, join, resolve } from 'node:path'

const NAMESPACE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const VALUE_FORMATS = new Set(['filename', 'publicPath'])

const trimTrailingSlash = value => String(value || '').replace(/\/+$/, '')

export function loadSiteAssetConfig(env = process.env) {
  return {
    diskRoot: env.ASSET_DISK_ROOT || 'public/assets/img',
    publicBase: trimTrailingSlash(env.ASSET_PUBLIC_BASE || '/assets/img'),
  }
}

export function validateAssetPolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new Error('模板契约缺少 assets')
  if (!NAMESPACE_RE.test(policy.namespace || '')) throw new Error(`资源 namespace 非法: ${policy.namespace || ''}`)
  if (!VALUE_FORMATS.has(policy.valueFormat)) throw new Error(`资源 valueFormat 非法: ${policy.valueFormat || ''}`)
  return policy
}

export function publicAssetPolicy(policy, config = loadSiteAssetConfig()) {
  validateAssetPolicy(policy)
  const publicPrefix = `${trimTrailingSlash(config.publicBase)}/${policy.namespace}/`
  return { namespace: policy.namespace, valueFormat: policy.valueFormat, publicPrefix }
}

export function assetUploadTarget(site, policy, fileName, config = loadSiteAssetConfig()) {
  const publicPolicy = publicAssetPolicy(policy, config)
  const diskRoot = isAbsolute(config.diskRoot) ? config.diskRoot : resolve(site, config.diskRoot)
  const diskDir = join(diskRoot, policy.namespace)
  const publicUrl = publicPolicy.publicPrefix + fileName
  return {
    ...publicPolicy,
    diskDir,
    publicUrl,
    storageValue: policy.valueFormat === 'filename' ? fileName : publicUrl,
  }
}

export function toStoredAssetValue(src, policy) {
  if (typeof src !== 'string' || !policy || !src.startsWith(policy.publicPrefix)) return src
  return policy.valueFormat === 'filename' ? src.slice(policy.publicPrefix.length) : src
}
