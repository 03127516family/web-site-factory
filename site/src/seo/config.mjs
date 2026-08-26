// SEO 站点配置（spec §1）：换站零改动的落点——本文件纯常量、零 import（禁环：pipeline 也 import 它）。
// 与 i18n 配置（kernel.mjs 的 SITE_ROOT/DEPLOY_LANGS）同层，终态同迁 site.config。
export const BRAND = 'DGCRANE'
// 标题模板：空 = 不套（page.title 烧制时已含品牌「- DGCRANE」，再套=双品牌）。
// 换站标题不带品牌时可设 '{title} | {brand}'，只作用于 seoHead 所辖 og:title / JSON-LD headline。
export const TITLE_TEMPLATE = ''
// 站级默认分享图：空 = 页面无图时不发 og:image（死图比缺标签更伤）；站里放好图后填 '/assets/img/xxx.jpg'。
export const DEFAULT_OG_IMAGE = ''
export const X_DEFAULT_LANG = 'en' // D7：34 语言都不匹配的用户兜底送英文（外贸 B2B 受众）
export const OG_IMAGE_PREFIX = '/assets/img/product/' // F14：hero.image 裸文件名的前缀（product/post 同 namespace）
export const OG_LOCALE = { 'zh-CN': 'zh_CN', en: 'en_US' }
// 翻译长度预算（字符）：治存量 14 处英文超长（spec §8）——提示词级约束，非硬闸（2026-08-17 概率判定只提示 doctrine）。
export const LENGTH_BUDGET = {
  'page.title': 60,
  'page.description': 160,
  'page.seo.og.title': 60,
  'page.seo.og.description': 160,
}
