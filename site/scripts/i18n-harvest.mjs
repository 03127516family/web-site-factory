#!/usr/bin/env node
// 存量收割（D6 前置）：把现有 en 镜像里已翻好的句子收进 TM（status=approved, origin=harvest）。
// 段错位的句跳过不收（skipped 如实报）；收割后镜像重投影（full），错位段回到中文占位——
// 缺口走引擎补翻+人审回来，原人译在 git 历史里。
// 用法：node scripts/i18n-harvest.mjs [lang]   （默认 en）
import { scanPages, buildGroups } from '../src/i18n.mjs'
import { harvestMirror } from '../src/i18n-pipeline.mjs'

const lang = process.argv[2] || 'en'
const groups = buildGroups(scanPages())
let totalH = 0
let totalS = 0
for (const [pageId, members] of groups) {
  if (!members.some(m => m.lang === lang)) continue
  const { harvested, skipped } = harvestMirror(pageId, lang)
  totalH += harvested
  totalS += skipped
  console.log(`✓ ${pageId}（${lang}）：收割 ${harvested} 句已审译文，跳过 ${skipped} 句（段错位不收）`)
}
console.log(`\n收割完成：共 ${totalH} 句进 TM（approved），${totalS} 句跳过`)
