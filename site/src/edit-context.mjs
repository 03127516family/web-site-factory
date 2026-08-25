import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { browserContract, loadEditContract } from './edit-contract.mjs'
import { revisionOf } from './content-revision.mjs'
import { WritebackError } from './writeback-core.mjs'

export function createEditContext(site, slug) {
  if (!/^[\w/-]+$/.test(slug || '') || slug.includes('..')) throw new WritebackError('CONTENT_INVALID', `slug 非法: ${slug || ''}`)
  const bytes = readFileSync(join(site, 'content', `${slug}.json`))
  const page = JSON.parse(bytes.toString('utf8')).page
  if (!page) throw new WritebackError('CONTENT_INVALID', `页面缺少 page: ${slug}`)
  return {
    slug,
    revision: revisionOf(bytes),
    contract: browserContract(loadEditContract(site, page)),
  }
}

export function editContextScript(context) {
  const json = JSON.stringify(context)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
  return `<script>window.__EDIT_CONTEXT__=${json}</script>`
}
