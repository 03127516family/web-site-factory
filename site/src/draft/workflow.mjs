import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { discardDraft, draftPath, publishedPath, readWorkspace, writeDraft } from './store.mjs'
import { previewWorkspaceChanges } from '../edit-context.mjs'
import { writeJsonAtomic } from '../content/revision.mjs'
import { WritebackError } from '../writeback/core.mjs'

const fail = (code, message, details) => { throw new WritebackError(code, message, details) }

function requireIntent(payload, expected) {
  if (payload?.intent !== expected) fail('INVALID_INTENT', `此操作要求 intent=${expected}`)
}

export function createDraftWorkflow({ site, rebuildEdit, stagePublish }) {
  if (typeof rebuildEdit !== 'function' || typeof stagePublish !== 'function') {
    throw new TypeError('draft workflow requires rebuildEdit and stagePublish')
  }

  async function saveDraft(payload) {
    requireIntent(payload, 'draft')
    const preview = previewWorkspaceChanges(site, payload)
    const workspace = writeDraft(site, payload.slug, {
      expectedRevision: preview.workspace.workingRevision,
      baseRevision: preview.workspace.publishedRevision,
      content: preview.candidate,
    })
    try {
      await rebuildEdit()
      return { workspace, diff: preview.diff, rebuilt: true }
    } catch (error) {
      return { workspace, diff: preview.diff, rebuilt: false, rebuildError: error.message }
    }
  }

  async function createDraft({ slug, content }) {
    const workspace = writeDraft(site, slug, { baseRevision: null, content })
    try {
      await rebuildEdit()
      return { workspace, rebuilt: true }
    } catch (error) {
      return { workspace, rebuilt: false, rebuildError: error.message }
    }
  }

  async function discard({ slug, revision }) {
    const workspace = readWorkspace(site, slug)
    if (!workspace.hasDraft) fail('DRAFT_NOT_FOUND', `页面没有草稿: ${slug}`)
    if (revision !== workspace.workingRevision) {
      fail('REVISION_CONFLICT', '草稿已被其他页面更新，请刷新后重试', {
        expectedRevision: revision,
        currentRevision: workspace.workingRevision,
      })
    }

    const file = draftPath(site, slug)
    const hidden = `${file}.discard-${process.pid}-${randomUUID()}`
    renameSync(file, hidden)
    try {
      await rebuildEdit()
      rmSync(hidden, { force: true })
      return { workspace: workspace.hasPublished ? readWorkspace(site, slug) : null, rebuilt: true }
    } catch (error) {
      if (existsSync(hidden)) renameSync(hidden, file)
      throw error
    }
  }

  async function publish(payload) {
    requireIntent(payload, 'publish')
    const preview = previewWorkspaceChanges(site, payload)
    const saved = writeDraft(site, payload.slug, {
      expectedRevision: preview.workspace.workingRevision,
      baseRevision: preview.workspace.publishedRevision,
      content: preview.candidate,
    })
    if (saved.baseRevision !== saved.publishedRevision) {
      fail('REVISION_CONFLICT', '草稿基于较旧的正式版本，请刷新后重新确认', {
        expectedRevision: saved.baseRevision,
        currentRevision: saved.publishedRevision,
      })
    }

    const file = publishedPath(site, payload.slug)
    const originalBytes = saved.hasPublished ? readFileSync(file) : null
    const candidate = structuredClone(saved.workingContent)
    candidate.page.status = 'published'
    mkdirSync(dirname(file), { recursive: true })
    writeJsonAtomic(file, candidate)

    let staged
    let promoted = false
    try {
      staged = await stagePublish()
      await staged.activate()
      promoted = true
    } catch (error) {
      if (originalBytes) writeFileSync(file, originalBytes)
      else rmSync(file, { force: true })
      throw error
    } finally {
      try { await staged?.cleanup?.() } catch (cleanupError) {
        if (promoted) console.error(`publish staging cleanup failed: ${cleanupError.message}`)
      }
    }

    const workspace = discardDraft(site, payload.slug, saved.workingRevision)
    return { workspace, diff: preview.diff, rebuilt: true }
  }

  return { saveDraft, createDraft, discardDraft: discard, publish }
}
