// 静态派生页（404/搜索/首页/列表页）的 chrome 组装：这些页不在 content 树里、没有 j，
// 走不了 Chrome.astro（它强制族谱坐标）。document.html + header/footer 逐字复用，
// 语言切换器出「仅当前语言」pill（siblings 空 → 与旧 dist 派生页逐字同构）。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { langSwitcher } from './i18n/kernel.mjs'

export function composeStatic(site, { lang = 'zh-CN', title, description, seo = '' }) {
  const doc = readFileSync(join(site, 'src/chrome/document.html'), 'utf8')
  const composed = doc
    .replaceAll('{{LANG}}', lang)
    .replaceAll('{{TITLE}}', title)
    .replaceAll('{{DESCRIPTION}}', description)
    .replaceAll('{{SEO}}', seo)
    .replace('{{HEADER}}', readFileSync(join(site, 'src/chrome/header.html'), 'utf8'))
    .replace('{{FOOTER}}', readFileSync(join(site, 'src/chrome/footer.html'), 'utf8'))
    .replaceAll('{{LANG_SWITCH}}', langSwitcher({ lang }, []))
  return composed.split('{{BODY}}') // [head, tail]
}
