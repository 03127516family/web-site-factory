import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateContract, WritebackError } from './writeback/core.mjs'
import { loadSiteAssetConfig, publicAssetPolicy } from './asset-config.mjs'

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const TYPE_DIRS = { product: 'products', post: 'posts' }

export function contractFile(site, page) {
  const typeDir = TYPE_DIRS[page?.type]
  if (!typeDir || !SAFE_NAME.test(page?.template || '')) {
    throw new WritebackError('CONTRACT_INVALID', `页面模板标识非法: ${page?.type || ''}/${page?.template || ''}`)
  }
  return join(site, 'src', 'components', typeDir, page.template, 'edit-contract.json')
}

export function loadEditContract(site, page) {
  const file = contractFile(site, page)
  let value
  try {
    value = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') throw new WritebackError('CONTRACT_NOT_FOUND', `模板缺少编辑契约: ${page.template}`, { file })
    throw new WritebackError('CONTRACT_INVALID', `模板编辑契约无法读取: ${page.template}: ${error.message}`, { file })
  }
  return validateContract(value)
}

function publicField(field) {
  const out = { type: field.type }
  for (const key of ['required', 'min', 'max', 'maxLength', 'profile']) {
    if (field[key] !== undefined) out[key] = field[key]
  }
  return out
}

export function browserContract(contract, assetConfig = loadSiteAssetConfig()) {
  validateContract(contract)
  return {
    version: contract.version,
    assets: publicAssetPolicy(contract.assets, assetConfig),
    fields: Object.fromEntries(Object.entries(contract.fields).map(([key, field]) => [key, publicField(field)])),
    repeats: Object.fromEntries(Object.entries(contract.repeats).map(([key, region]) => [key, {
      minItems: region.minItems,
      maxItems: region.maxItems,
      fields: Object.fromEntries(Object.entries(region.fields).map(([fieldKey, field]) => [fieldKey, publicField(field)])),
    }])),
  }
}
