#!/usr/bin/env node
// 存量收割（D6 前置）：把现有 en 镜像里已翻好的句子收进 TM（status=approved, origin=harvest）。
// 段错位的句跳过不收（skipped 如实报）；收割后镜像重投影（full），错位段回到中文占位——
// 缺口走引擎补翻+人审回来，原人译在 git 历史里。
// ⚠ 跨进程注意（评审 M1）：本 CLI 与编辑服（edit-server）并发时，TM 侧已做合并防护（只补新句不覆盖），
// 但镜像文件的重投影仍是整文件覆盖——收割期间最好停编辑服，避免并发人审被重投影回退。
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
