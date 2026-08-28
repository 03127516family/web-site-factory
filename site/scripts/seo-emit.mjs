#!/usr/bin/env node
// build 后写 sitemap.xml + robots.txt 进产物目录（dist 与 dist-edit 双链都跑；BUILD_OUT 定去向）。
// pubSet 口径 = 生产门禁（status published 且过 isPublishable）——与 Chrome.astro 生产分支同一套函数；
// 预览产物里的 sitemap 也按生产口径（看「将上线什么」，不为草稿虚增条目）。
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanPages, buildGroups, isPublishable, SITE_BASE } from '../src/i18n/kernel.mjs'
import { sitemapXml, robotsTxt } from '../src/seo/kernel.mjs'

const site = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = process.env.BUILD_OUT || 'dist'
const pages = scanPages({ withJson: true })
const groups = buildGroups(pages)
const pubSet = new Set(pages.filter(p => p.status === 'published' && p.j?.page?.seo?.noindex !== true && isPublishable(p, groups, pages)).map(p => p.slug)) // seo.noindex 同草稿：不进 sitemap（spec §3）
mkdirSync(join(site, out), { recursive: true })
writeFileSync(join(site, out, 'sitemap.xml'), sitemapXml(groups, pages, pubSet, [SITE_BASE, SITE_BASE + 'products/', SITE_BASE + 'posts/']))
writeFileSync(join(site, out, 'robots.txt'), robotsTxt())
console.log(`seo-emit: sitemap ${pubSet.size} 条 + robots.txt → ${out}/`)
