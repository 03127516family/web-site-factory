#!/usr/bin/env node
// 多语言同步状态报告（JSON 版，平移旧 i18n-status.mjs）。
// 判据不变：目标 translated_rev.<字段> < 源 i18n_rev.<字段> 即待更新——只读两个当前 JSON 的戳，
// 不取历史、不碰 git、零数据库。族谱现算派生（registry.json 只是它的快照）。
// 用法：node scripts/i18n-status.mjs   （退出码恒 0：报告工具，非门禁）
import { scanPages, buildGroups } from '../src/i18n.mjs'

export function i18nStatus() {
  const pages = scanPages({ withJson: true })
  const groups = buildGroups(pages)
  const report = []
  for (const [key, members] of groups) {
    const source = members.find(m => !m.langDir)
    if (!source) continue // 孤儿镜像属校验范畴，此处跳过不误报
    const sourceRev = source.j.i18n_rev || {}
    const targets = []
    for (const target of members.filter(m => m.langDir)) {
      const translatedRev = target.j.i18n?.translated_rev || {}
      const staleFields = Object.keys(sourceRev).filter(f => (translatedRev[f] ?? 0) < sourceRev[f])
      targets.push({ lang: target.lang, slug: target.slug, status: staleFields.length ? 'stale' : 'fresh', staleFields })
    }
    if (targets.length) report.push({ key, sourceLang: source.lang, sourceStamped: Object.keys(sourceRev).length, targets })
  }
  return { report, singles: pages.filter(pg => !pg.langDir && !(groups.get(pg.pageId) || []).some(m => m.langDir)) }
}

if (process.argv[1]?.endsWith('i18n-status.mjs')) {
  const { report, singles } = i18nStatus()
  console.log(`多语言状态（翻译组 ${report.length} 个；未配对源页面 ${singles.length} 个）\n`)
  for (const g of report) {
    console.log(`◆ ${g.key}（源 ${g.sourceLang}，已埋戳字段 ${g.sourceStamped}）`)
    for (const t of g.targets) {
      if (t.status === 'fresh') console.log(`   ${t.lang}: ✅ 已同步（/${t.slug}/）`)
      else console.log(`   ${t.lang}: ⚠ ${t.staleFields.length} 个字段待更新 → ${t.staleFields.join(', ')}`)
    }
  }
  if (singles.length) console.log(`\n（无翻译版本：${singles.map(pg => pg.slug).join('、')}）`)
}
