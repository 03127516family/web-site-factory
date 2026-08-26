// SEO 内核（spec 2026-08-25）：三样现成原料（页面 JSON/族谱/站点配置）→ 三样成品。
// 纯 Node、零 Astro 依赖（与 i18n/kernel 同款纪律）；长在构建流水线上，无独立生命周期。
import { pageUrl, SITE_ROOT } from '../i18n/kernel.mjs'
import { BRAND, TITLE_TEMPLATE, DEFAULT_OG_IMAGE, X_DEFAULT_LANG, OG_IMAGE_PREFIX, OG_LOCALE } from './config.mjs'

const escAttr = (s = '') => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const absolutize = (s, root = SITE_ROOT) => (/^https?:\/\//.test(s) ? s : root + s.replace(/^\//, ''))
const applyTemplate = t => (TITLE_TEMPLATE ? TITLE_TEMPLATE.replaceAll('{title}', t).replaceAll('{brand}', BRAND) : t)

// seo 块类型执法（F8：无 page 级 schema，改坏构建当场红）
function readSeo(pg) {
  const seo = pg.j?.page?.seo ?? {}
  if (typeof seo !== 'object' || Array.isArray(seo)) throw new Error(`page.seo 须为对象: ${pg.slug}`)
  if (seo.canonical != null && typeof seo.canonical !== 'string') throw new Error(`page.seo.canonical 须为字符串: ${pg.slug}`)
  if (seo.noindex !== undefined && typeof seo.noindex !== 'boolean') throw new Error(`page.seo.noindex 须为布尔: ${pg.slug}`)
  for (const k of ['title', 'description', 'image'])
    if (seo.og?.[k] != null && typeof seo.og?.[k] !== 'string') throw new Error(`page.seo.og.${k} 须为字符串: ${pg.slug}`)
  return seo
}

function ogImageUrl(pg) {
  const s = readSeo(pg).og?.image
  if (s) return absolutize(s)
  if (pg.j.hero?.image) return absolutize(OG_IMAGE_PREFIX + pg.j.hero.image)
  if (DEFAULT_OG_IMAGE) return absolutize(DEFAULT_OG_IMAGE)
  return null
}

function jsonLd(pg, { title, desc, img }) {
  const j = pg.j, url = pageUrl(pg)
  const main = pg.type === 'post'
    ? { '@type': 'Article', headline: title, description: desc, ...(img ? { image: img } : {}), url }
    : { '@type': 'Product', name: title, description: desc, ...(img ? { image: img } : {}), url }
  const items = [
    ...(j.breadcrumb?.trail ?? []).map(t => ({ '@type': 'ListItem', name: t.label, item: t.url })),
    { '@type': 'ListItem', name: j.breadcrumb?.current ?? j.page.title, item: url },
  ].map((it, i) => ({ ...it, position: i + 1 }))
  return { '@context': 'https://schema.org', '@graph': [main, { '@type': 'BreadcrumbList', itemListElement: items }] }
}

// 每页 head 片段，贴 document.html 的 {{SEO}} 槽。不发 <title>/<meta description>（{{TITLE}}/{{DESCRIPTION}} 已发，F5）。
// siblings = siblingsOf(pg, groups, publishable) 的返回（生产=过门禁集合；预览=全集合）。
export function seoHead(pg, siblings, opts = {}) {
  const seo = readSeo(pg)
  const self = pageUrl(pg)
  const L = []
  if (pg.status !== 'published' || seo.noindex === true || opts.preview)
    L.push('<meta name="robots" content="noindex">')
  L.push(`<link rel="canonical" href="${escAttr(seo.canonical || self)}">`)
  for (const m of siblings)
    L.push(`<link rel="alternate" hreflang="${escAttr(m.lang)}" href="${escAttr(pageUrl(m))}">`)
  const xd = siblings.find(m => m.lang === X_DEFAULT_LANG)
  if (xd && siblings.length > 1) // 集合=1 且恰为兜底语言时省略（防重复行）
    L.push(`<link rel="alternate" hreflang="x-default" href="${escAttr(pageUrl(xd))}">`)
  const title = applyTemplate(seo.og?.title || pg.j.page.title)
  const desc = seo.og?.description || pg.j.page.description
  const img = ogImageUrl(pg)
  L.push(`<meta property="og:title" content="${escAttr(title)}">`)
  if (desc) L.push(`<meta property="og:description" content="${escAttr(desc)}">`)
  if (img) L.push(`<meta property="og:image" content="${escAttr(img)}">`)
  L.push(`<meta property="og:url" content="${escAttr(self)}">`)
  L.push(`<meta property="og:type" content="${pg.type === 'post' ? 'article' : 'product'}">`)
  if (OG_LOCALE[pg.lang]) L.push(`<meta property="og:locale" content="${OG_LOCALE[pg.lang]}">`)
  L.push(`<script type="application/ld+json">${JSON.stringify(jsonLd(pg, { title, desc, img }))}</script>`)
  return L.join('\n')
}

// sitemap：pubSet 逐成员 <url>，全员 xhtml:link 互认（WPML+Yoast 同款单文件合并式，D8-2）。
// 无 lastmod（无可靠时间源，瞎填有害——spec §8 已知限制）。
export function sitemapXml(groups, _pages, pubSet) {
  const rows = []
  for (const [, g] of groups) {
    const live = g.filter(m => pubSet.has(m.slug))
    for (const m of live)
      rows.push(['  <url>', `    <loc>${pageUrl(m)}</loc>`,
        ...live.map(s => `    <xhtml:link rel="alternate" hreflang="${escAttr(s.lang)}" href="${escAttr(pageUrl(s))}"/>`),
        '  </url>'].join('\n'))
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n  xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + rows.join('\n') + '\n</urlset>\n'
}

// robots：允许全站 + sitemap 指路。部署注意（spec §3）：与老站共存同域时 robots.txt 归域名根所有者，此文件不上传——代码照产。
export function robotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ROOT}sitemap.xml\n`
}

// 体检数据（总览台直接吃）：一行=一页，异常机器算（族谱+长度+状态），零人工登记。
export function healthData(pages) {
  return pages.map(p => {
    const title = p.j?.page?.title ?? '', desc = p.j?.page?.description ?? ''
    const issues = []
    if (!title) issues.push('title-missing')
    else if (title.length > 60) issues.push('title-overlength')
    if (!desc) issues.push('description-missing')
    else if (desc.length > 160) issues.push('description-overlength')
    if (p.status !== 'published') issues.push('noindex')
    if (p.j?.page?.seo?.noindex) issues.push('noindex-manual')
    return { pageId: p.pageId, lang: p.lang, slug: p.slug, type: p.type, title, titleLength: title.length, description: desc, descriptionLength: desc.length, issues }
  })
}
