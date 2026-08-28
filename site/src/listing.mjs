// 派生列表页助手（旧 build.mjs cardHtml/listingSection/wrap 平移，JSON 载体适配）。
import { scanPages, buildGroups, isPublishable } from './i18n/kernel.mjs'

export const escAttr = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// 卡片题图（旧 ogImagePath 同源语义）：product → hero.image / gallery[0].image（裸文件名补
// /assets/img/product/ 前缀）；post → body.img_hero 或首个 body.img_*（已是 /assets/img/post/ 绝对路径）。
export function cardImage(j) {
  if (j.page.type === 'post') {
    const body = j.body ?? {}
    const v = body.img_hero ?? Object.keys(body).filter(k => k.startsWith('img_')).map(k => body[k])[0] ?? null
    return v && String(v).startsWith('/') ? String(v) : null
  }
  const v = j.hero?.image ?? j.gallery?.[0]?.image ?? null
  return v ? (String(v).startsWith('/') ? String(v) : '/assets/img/product/' + v) : null
}

export function cardHtml(j) {
  const img = cardImage(j)
  const title = escAttr(j.page.title.split('|')[0].trim())
  const href = '/' + j.page.slug + '/'
  return `<a href="${href}" style="display:block;width:270px;text-decoration:none;color:inherit;border:1px solid #e3e7ec;border-radius:4px;overflow:hidden;background:#fff">
  ${img ? `<img src="${img}" alt="${title}" width="270" height="180" style="display:block;width:100%;height:180px;object-fit:cover">` : `<div style="height:180px;background:#f2f5f8"></div>`}
  <div style="padding:12px 14px 16px">
    <p style="margin:0 0 6px;font-size:16px;font-weight:600;color:#001A4F;line-height:1.4">${title}</p>
    <p style="margin:0;font-size:13px;color:#666;line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${escAttr(j.page.description)}</p>
  </div>
</a>`
}

export function listingSection(heading, cards) {
  return `<section style="margin:0 0 50px">
  <h2 style="font-size:22px;color:#001A4F;border-left:4px solid #036AAE;padding-left:12px;margin:0 0 20px">${heading}</h2>
  <div style="display:flex;flex-wrap:wrap;gap:20px">${cards.join('\n')}</div>
</section>`
}

export function wrap(inner, h1, intro) {
  return `<div class="wrap" style="max-width:1200px;margin:40px auto 80px;padding:0 20px">
  <h1 style="font-size:26px;color:#001A4F;margin:0 0 8px">${h1}</h1>
  <p style="color:#666;margin:0 0 34px">${intro}</p>
  ${inner}
</div>`
}

// 派生页收录口径 = 生产门禁（published 且过 isPublishable）的 zh 源页——与 seo-emit pubSet 同源。
export function listedPages() {
  const pages = scanPages({ withJson: true })
  const groups = buildGroups(pages)
  return pages.filter(p => p.lang === 'zh-CN' && p.status === 'published' && p.j && isPublishable(p, groups, pages))
}
