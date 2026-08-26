import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { revisionOf, writeJsonAtomic } from '../content/revision.mjs'
import { WritebackError } from '../writeback/core.mjs'

const fail = (code, message, details) => { throw new WritebackError(code, message, details) }

function checkedSlug(slug) {
  if (typeof slug !== 'string' || !/^[\w-]+(?:\/[\w-]+)*$/.test(slug) || slug.includes('..')) {
    fail('CONTENT_INVALID', `slug 非法: ${slug || ''}`)
  }
  return slug
}

const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n')

function readJson(file, code, label) {
  const bytes = readFileSync(file)
  try { return { bytes, value: JSON.parse(bytes.toString('utf8')) } }
  catch (error) { fail(code, `${label} JSON 无法解析: ${error.message}`) }
}

function validateContent(content, label) {
  if (!content || typeof content !== 'object' || Array.isArray(content) || !content.page) {
    fail('CONTENT_INVALID', `${label}缺少 page`)
  }
  return content
}

function validateEnvelope(envelope, slug) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
    || envelope.version !== 1
    || !('content' in envelope)
    || !(envelope.baseRevision === null || typeof envelope.baseRevision === 'string')) {
    fail('DRAFT_INVALID', `草稿格式非法: ${slug}`)
  }
  validateContent(envelope.content, '草稿')
  return envelope
}

export function draftPath(site, slug) {
  return join(site, '.drafts', checkedSlug(slug) + '.json')
}

export function publishedPath(site, slug) {
  return join(site, 'content', checkedSlug(slug) + '.json')
}

export function readWorkspace(site, slug) {
  checkedSlug(slug)
  const publishedFile = publishedPath(site, slug)
  const draftFile = draftPath(site, slug)
  let publishedContent = null
  let publishedBytes = null
  let publishedRevision = null
  if (existsSync(publishedFile)) {
    const loaded = readJson(publishedFile, 'CONTENT_INVALID', '正式内容')
    publishedContent = validateContent(loaded.value, '正式内容')
    publishedBytes = loaded.bytes
    publishedRevision = revisionOf(loaded.bytes)
  }

  let envelope = null
  if (existsSync(draftFile)) {
    envelope = validateEnvelope(readJson(draftFile, 'DRAFT_INVALID', '草稿').value, slug)
  }
  if (!publishedContent && !envelope) fail('CONTENT_NOT_FOUND', `页面不存在: ${slug}`)

  const workingContent = envelope?.content ?? publishedContent
  const workingBytes = envelope ? jsonBytes(workingContent) : publishedBytes
  return {
    slug,
    hasPublished: !!publishedContent,
    hasDraft: !!envelope,
    publishedContent,
    publishedBytes,
    publishedRevision,
    draftEnvelope: envelope,
    baseRevision: envelope?.baseRevision ?? publishedRevision,
    workingContent,
    workingBytes,
    workingRevision: envelope ? revisionOf(workingBytes) : publishedRevision,
  }
}

export function writeDraft(site, slug, { expectedRevision, baseRevision, content }) {
  checkedSlug(slug)
  let current = null
  try { current = readWorkspace(site, slug) }
  catch (error) { if (!(error instanceof WritebackError) || error.code !== 'CONTENT_NOT_FOUND') throw error }

  if (expectedRevision !== undefined && expectedRevision !== current?.workingRevision) {
    fail('REVISION_CONFLICT', '草稿已被其他页面更新，请刷新后重试', {
      expectedRevision,
      currentRevision: current?.workingRevision ?? null,
    })
  }
  const retainedBase = current?.hasDraft ? current.baseRevision : baseRevision
  if (!(retainedBase === null || typeof retainedBase === 'string')) fail('DRAFT_INVALID', '草稿缺少正式版本基线')

  const nextContent = structuredClone(validateContent(content, '草稿'))
  nextContent.page.status = 'draft'
  const envelope = {
    version: 1,
    baseRevision: retainedBase,
    savedAt: new Date().toISOString(),
    content: nextContent,
  }
  const file = draftPath(site, slug)
  mkdirSync(dirname(file), { recursive: true })
  writeJsonAtomic(file, envelope)
  return readWorkspace(site, slug)
}

export function discardDraft(site, slug, expectedRevision) {
  const workspace = readWorkspace(site, slug)
  if (!workspace.hasDraft) fail('DRAFT_NOT_FOUND', `页面没有草稿: ${slug}`)
  if (expectedRevision !== workspace.workingRevision) {
    fail('REVISION_CONFLICT', '草稿已被其他页面更新，请刷新后重试', {
      expectedRevision,
      currentRevision: workspace.workingRevision,
    })
  }
  rmSync(draftPath(site, slug))
  return workspace.hasPublished ? readWorkspace(site, slug) : null
}
