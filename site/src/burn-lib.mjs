// DeepSeek 烧制台·纯逻辑库（零网络零 AI，全部可单测）。
// AI 只产 markdown/简单 JSON；树转换、校验、组装全在这里——结构归代码。
import { readFileSync } from 'node:fs'
import { mdToDoc } from './mdast-tree.mjs'
import { validateDoc } from './content-schema.mjs'
import { renderDoc } from './render-doc.mjs'
import { getIn } from './tree-utils.mjs'
import { probe } from '../scripts/img-probe.mjs'

export { mdToDoc, validateDoc, getIn }

// ---------- 原文切块编号（AI 只许引用块号，span 校验=纯集合运算） ----------
export function numberBlocks(rawText) {
  return rawText.split(/\n\s*\n/).map(t => t.trim()).filter(Boolean)
    .map((text, i) => ({ n: i + 1, text }))
}

// ---------- 配图标记提取：（配图：横梁 cross-girder3.jpg）/（配图 Main-girder.jpg）（冒号可省） ----------
export function extractImages(rawText) {
  const out = []
  const re = /（\s*配图\s*[:：]?\s*([^）]*?)([\w.-]+\.(?:jpe?g|png|webp))\s*）/gi
  for (const m of rawText.matchAll(re))
    out.push({ caption: m[1].trim(), name: m[2] })
  return out
}

// ---------- URL 剥壳（启发式，对 dgcrane 旧站调优；剥不好用户改贴文本） ----------
export function stripHtml(html) {
  const images = []
  for (const m of html.matchAll(/<img[^>]+src=["'][^"']*?\/([\w.-]+\.(?:jpe?g|png|webp))["'?\s]/gi))
    images.push(m[1])
  let t = html
    .replace(/<(script|style|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
  return { text: t, images: [...new Set(images)] }
}

// ---------- 取源：text 直通 / url 抓取剥壳 ----------
export async function fetchSource({ text, url }) {
  if (text) return { rawText: text, images: extractImages(text) }
  if (!/^https?:\/\//.test(url || '')) throw new Error('url 仅支持 http/https')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 burn-console' } })
    if (!res.ok) throw new Error(`抓取失败 HTTP ${res.status}`)
    const html = (await res.text()).slice(0, 2_000_000) // 大小上限 2MB
    const { text: rawText, images } = stripHtml(html)
    if (numberBlocks(rawText).length < 3) throw new Error('剥壳后正文过少，请改贴裸文本')
    return { rawText, images: images.map(name => ({ caption: '', name })) }
  } finally { clearTimeout(timer) }
}
