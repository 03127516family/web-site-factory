// i18n 内核（站点层，R35-R45）：族谱派生 + 页面 URL + 语言切换器 + 发布门禁。
// 全站唯一一份 i18n 逻辑，四个消费方共用：Astro 路由（门禁）、Chrome 布局（切换器）、
// i18n 脚本（status/touch/apply）、edit-server（保存抬戳）。纯 Node、零 Astro 依赖。
//
// 族谱是【派生索引】（R37）：真相 = content 目录树本身（content/<type>/<pageId>.json = zh 源；
// content/<lang>/<type>/<pageId>.json = 语言镜像，配对键 = 文件名）。registry.json 是它的
// 物化快照（scripts/i18n-registry.mjs --write），供外部/检查用——可全量重建，不是第二真相。
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// ---------- 站点层 i18n 配置（终态迁 site.config，同旧系统决策） ----------
export const SITE_ROOT = 'https://www.dgcrane.com/'
export const SITE_BASE = SITE_ROOT + 'zh/' // zh 源走 /zh/ 子路径（2026-07-02 拍板）
export const DEPLOY_LANGS = ['zh-CN', 'en']
export const LANG_LABEL = { 'zh-CN': '简体中文', en: 'English' }
export const langLabel = lang => LANG_LABEL[lang] || lang

const CONTENT = () => join(process.cwd(), 'content')
const escAttr = (s = '') => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')

// ---------- 族谱派生 ----------
// 扫 content 树 → 页面登记列表。每项：{ pageId, type, lang, langDir(null=源), slug, status, file, j? }
// withJson=true 时把 JSON 内容一并读进来（门禁/状态报告要戳；路由已有 j 不必）。
export function scanPages({ withJson = false } = {}) {
  const dir = CONTENT()
  const out = []
  const walk = (sub, langDir) => {
    const abs = join(dir, sub)
    if (!existsSync(abs)) return
    for (const typeDir of readdirSync(abs, { withFileTypes: true })) {
      if (!typeDir.isDirectory()) continue
      const type = typeDir.name === 'products' ? 'product' : typeDir.name === 'posts' ? 'post' : null
      if (!type) continue
      for (const f of readdirSync(join(abs, typeDir.name))) {
        if (!f.endsWith('.json')) continue // .bak 等杂物不登记
        const file = join(sub, typeDir.name, f)
        const j = JSON.parse(readFileSync(join(dir, file), 'utf8'))
        const pg = {
          pageId: f.replace(/\.json$/, ''), // 跨语言配对键（R36 身份）
          type,
          lang: j.page.lang,
          langDir, // null = zh 源（根目录权威位）；'en' 等 = 语言镜像
          slug: j.page.slug,
          status: j.page.status ?? 'published',
          file, // content 相对路径
        }
        if (withJson) pg.j = j
        out.push(pg)
      }
    }
  }
  walk('', null) // zh 源：content/<type>/*.json
  for (const sub of readdirSync(dir, { withFileTypes: true })) {
    // 语言镜像：content/<lang>/<type>/*.json（一级子目录且非已知类型目录即语言目录）
    if (sub.isDirectory() && !['products', 'posts'].includes(sub.name)) walk(sub.name, sub.name)
  }
  return out.sort((a, b) => (a.slug < b.slug ? -1 : 1))
}

// 族谱：pageId → 该逻辑页的全部语言版本（升序：源在前）。
export function buildGroups(pages) {
  const groups = new Map()
  for (const pg of pages) {
    const g = groups.get(pg.pageId) || []
    g.push(pg)
    groups.set(pg.pageId, g)
  }
  for (const g of groups.values()) g.sort((a, b) => (a.langDir === null ? -1 : b.langDir === null ? 1 : 0))
  return groups
}

// ---------- URL ----------
// zh 源 → SITE_BASE + slug（dist→/zh/ 部署拓扑）；镜像 slug 自带 "<lang>/" 前缀（URL 即路径）。
export const pageUrl = pg => (pg.langDir ? SITE_ROOT + pg.slug + '/' : SITE_BASE + pg.slug + '/')

// 同组、且在 deploy 闸内的语言版本（含自身）。publishable 未传 = 预览/测试不设限（同旧系统语义）。
export function siblingsOf(pg, groups, publishable = null) {
  return (groups.get(pg.pageId) || []).filter(
    m => DEPLOY_LANGS.includes(m.lang) && (!publishable || publishable.has(m.slug)),
  )
}

// ---------- 语言切换器（旧 build.mjs::langSwitcher 逐字平移） ----------
// 当前语言 = 禁用 pill，其余真实语言 = 指向各自 pageUrl 的链接；只 1 种语言 → 只出当前 pill。
// 结构/类名逐字沿用 trp-* DOM，main.css 样式与测宽脚本原样生效。
export function langSwitcher(pg, siblings) {
  const others = siblings.filter(m => m.lang !== pg.lang)
  const disabled = lang =>
    `<a href="javascript:void(0)" class="trp-ls-shortcode-disabled-language trp-ls-disabled-language" title="${escAttr(langLabel(lang))}">${langLabel(lang)}</a>`
  const linkTo = m => `<a href="${pageUrl(m)}" title="${escAttr(langLabel(m.lang))}">${langLabel(m.lang)}</a>`
  const list = [disabled(pg.lang), ...others.map(linkTo)].join('\n            ')
  return `<div class="trp-language-switcher trp-language-switcher-container" data-no-translation>
    <div class="trp-ls-shortcode-current-language">
        ${disabled(pg.lang)}
    </div>
    <div class="trp-ls-shortcode-language">
            ${list}
    </div>
    <script type="application/javascript">
        var trp_ls_shortcodes = document.querySelectorAll('.trp-language-switcher');
        if ( trp_ls_shortcodes.length > 0) {
            var trp_el = trp_ls_shortcodes[trp_ls_shortcodes.length - 1];
            var trp_shortcode_language_item = trp_el.querySelector('.trp-ls-shortcode-language')
            var trp_ls_shortcode_width = trp_shortcode_language_item.offsetWidth + 5;
            trp_shortcode_language_item.style.width = trp_ls_shortcode_width + 'px';
            trp_el.querySelector('.trp-ls-shortcode-current-language').style.width = trp_ls_shortcode_width + 'px';
            trp_shortcode_language_item.style.display = 'none';
        }
    </script>
</div>`
}

// ---------- 发布门禁（U-3/R43） ----------
// 源语言页恒可发；镜像页仅当【无任何「从未翻译」字段】才可发（已译但过期=照显上次译文，可发）。
// 孤儿镜像（无源）不发。渲染不参与——只路由/build 用它决定出不出。
export function neverTranslated(sourceRev, translatedRev) {
  return Object.keys(sourceRev).filter(f => !(translatedRev[f] > 0))
}
export function isPublishable(pg, groups, pagesWithJson) {
  if (!pg.langDir) return true
  const source = (groups.get(pg.pageId) || []).find(m => !m.langDir)
  if (!source) return false
  const srcJ = (pagesWithJson || []).find(m => m.pageId === source.pageId && !m.langDir)?.j
    ?? JSON.parse(readFileSync(join(CONTENT(), source.file), 'utf8'))
  const tgtJ = pg.j ?? JSON.parse(readFileSync(join(CONTENT(), pg.file), 'utf8'))
  return neverTranslated(srcJ.i18n_rev || {}, tgtJ.i18n?.translated_rev || {}).length === 0
}
