import { browserContract, loadEditContract } from './edit-contract.mjs'
import { WritebackError } from './writeback-core.mjs'
import { readWorkspace } from './draft-store.mjs'
import { prepareWriteback } from './writeback-request.mjs'
import { diffContent } from './content-diff.mjs'

export function createEditContext(site, slug) {
  const workspace = readWorkspace(site, slug)
  const page = workspace.workingContent.page
  return {
    slug,
    revision: workspace.workingRevision,
    publishedRevision: workspace.publishedRevision,
    hasDraft: workspace.hasDraft,
    hasPublished: workspace.hasPublished,
    contract: browserContract(loadEditContract(site, page)),
  }
}

export function previewWorkspaceChanges(site, { slug, revision, publishedRevision, changes }) {
  const workspace = readWorkspace(site, slug)
  if (publishedRevision === undefined) {
    throw new WritebackError('PUBLISHED_REVISION_REQUIRED', '预览必须携带 publishedRevision')
  }
  if (publishedRevision !== workspace.publishedRevision) {
    throw new WritebackError('REVISION_CONFLICT', '正式版本已变化，请刷新后重试', {
      expectedRevision: publishedRevision,
      currentRevision: workspace.publishedRevision,
    })
  }
  const prepared = prepareWriteback({
    site,
    bytes: workspace.workingBytes,
    expectedRevision: revision,
    changes,
  })
  return {
    candidate: prepared.data,
    contract: prepared.contract,
    diff: diffContent({
      published: workspace.publishedContent,
      candidate: prepared.data,
      contract: prepared.contract,
    }),
    workspace,
  }
}

export function editContextScript(context) {
  const json = JSON.stringify(context)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
  return `<script>window.__EDIT_CONTEXT__=${json}</script>`
}
