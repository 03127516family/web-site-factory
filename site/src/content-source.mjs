import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readWorkspace } from './draft-store.mjs'
import { WritebackError } from './writeback-core.mjs'

const fail = (message) => { throw new WritebackError('CONTENT_INVALID', message) }
const segment = (value, label) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) fail(`${label} 非法: ${value || ''}`)
  return value
}
const jsonNames = dir => existsSync(dir)
  ? readdirSync(dir).filter(name => /^[\w-]+\.json$/.test(name)).sort()
  : []

function contentDir(site, type, lang) {
  return join(site, 'content', ...(lang ? [lang] : []), type)
}

function draftsDir(site, type, lang) {
  return join(site, '.drafts', ...(lang ? [lang] : []), type)
}

export function loadPageRecords(site, { type, lang = null, includeDrafts = false }) {
  segment(type, '内容类型')
  if (lang !== null) segment(lang, '语言')
  const prefix = [...(lang ? [lang] : []), type].join('/')
  const baseDir = contentDir(site, type, lang)

  if (!includeDrafts) {
    return jsonNames(baseDir).flatMap(file => {
      const j = JSON.parse(readFileSync(join(baseDir, file), 'utf8'))
      if (j?.page?.status !== 'published') return []
      const slug = file.slice(0, -5)
      return [{ params: { slug }, j, source: 'published', slug: `${prefix}/${slug}` }]
    })
  }

  const names = new Set([...jsonNames(baseDir), ...jsonNames(draftsDir(site, type, lang))])
  return [...names].sort().map(file => {
    const name = file.slice(0, -5)
    const slug = `${prefix}/${name}`
    const workspace = readWorkspace(site, slug)
    return {
      params: { slug: name },
      j: workspace.workingContent,
      source: workspace.hasDraft ? 'draft' : 'published',
      slug,
    }
  })
}
