#!/usr/bin/env node
// DeepSeek 烧制台·编排层：提示词组包 + HTTP 客户端 + burn() 流水线（一把梭出整页 + 代码逐格验收 + 失败格单独重烧）+ CLI。
// 纯逻辑全在 burn-lib；本文件只做「问 AI 要值」与「把值交给代码裁决」。
// 用法: DEEPSEEK_API_KEY=xxx node scripts/deepseek-burn.mjs --text <文件> --slug xxx --name 产品名 [--save]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as lib from '../src/burn-lib.mjs'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const COMPONENTS = join(SITE, 'src/components')   // 套件根

// ---------- 提示词（白名单自组件推导；AI 产 markdown，不产树） ----------
const RULES = `你是内容结构化器，把原料文章（产品页或文章）映射为格式化数据。铁律：
1. 只输出 JSON（不要解释、不要 markdown 围栏）；
2. 只许搬运原文文字，禁止用常识/行业知识补充任何原文没有的内容；没有就是缺席，不许凑；
3. body_md 用 markdown 语法（段落空行分隔、- 列表、| 表格 |）；
4. 标题允许轻微规范（去序号/标点），正文字句一律逐字；
5. 文字必须逐字来自给定原文；
6. 每段原文只许用于一个字段；严禁把同一段内容塞进两个字段，严禁把整篇或大段原文复制到多个字段里——你的角色是搬运工不是作者，只做对应和摘取。`

// 一把梭：一次出整页 JSON（格子缺席合法；代码侧逐格验收，不过的单格重烧）
// 格式契约按 shape 从 loadCatalog 目录分组生成——目录加段/加格时提示词不漂移
export function oneShotMessages(rawText, catalog, productName) {
  const contract = [
    ['section', '正文段', '"字段名":{"title":"段标题（原文有栏目名用栏目名；没有栏目名就用产品名，禁止自创）","body_md":"markdown 正文"}'],
    ['sections', '章节序列', '"字段名":{"items":[{"heading":"章节标题（用原文小标题，逐字；无小标题的段落并入相邻章节，禁止自创标题）","body_md":"markdown 正文"}，按原文顺序]}'],
    ['list', '列表', '"字段名":{"items":["逐字条目","…"]}'],
    ['text', '单句', '"字段名":{"text":"…"}'],
    ['seo', 'SEO', '"字段名":{"text":"150 字以内的中文 SEO 描述（本字段允许概括，其余一律逐字）"}'],
  ].map(([shape, label, fmt]) => {
    const keys = catalog.filter(c => c.shape === shape).map(c => c.key)
    return keys.length ? `- ${label}（${keys.join('/')}）：${fmt}` : null
  }).filter(Boolean).join('\n')
  return [
    { role: 'system', content: RULES },
    { role: 'user', content: `名称：${productName}\n\n可选字段白名单（逐字一致，别的禁止发明；原文没有的格子不写，缺席合法）：\n${catalog.map(c => c.key).join('、')}\n\n各字段返回格式：\n${contract}\n\n返回 JSON：{"fields":{…}}\n\n示例（仅示意格式）：{"fields":{"hero.headline":{"text":"5吨单梁起重机"},"overview":{"title":"概述","body_md":"5吨单梁起重机广泛用于车间物料搬运。"},"specs":{"items":["起重量 5吨","跨度 3-16米"]}}}\n\n原文：\n${rawText}` },
  ]
}

// 族目录名 → 人话标签/描述（站点层文案，非引擎逻辑；判族契约直接用族目录名，省一层映射）
const FAMILY_LABEL = { products: '产品页族', posts: '文章页族' }
const FAMILY_DESC = {
  products: '产品页族：工业产品的介绍/销售页，通常含参数表、优势、安装等栏目',
  posts: '文章页族：案例/培训/指南/新闻类散文',
}

export function classifyMessages(sample, builtFamilies) {
  return [
    { role: 'system', content: RULES },
    { role: 'user', content: `判断这份原料属于哪个页族。已建页族：${builtFamilies.map(f => `${f}（${FAMILY_DESC[f] ?? ''}）`).join('；')}。都不属于则 unknown。\n\n返回 JSON：{"family":${builtFamilies.map(f => `"${f}"`).join('|')}|"unknown","reason":"一句话理由"}\n\n原料开头：\n${sample}` },
  ]
}

export function sectionMessages(key, shape, sliceText, productName) {
  const contract = {
    section: `返回 {"title":"段标题","body_md":"markdown 正文"}`,
    sections: `返回 {"items":[{"heading":"章节标题","body_md":"markdown 正文"}，按原文顺序]}`,
    list: `返回 {"items":["逐字条目","…"]}`,
    text: `返回 {"text":"一句话"}`,
    seo: `返回 {"text":"150 字以内的中文 SEO 描述（本字段允许概括，其余禁止）"}`,
  }[shape]
  const example = {
    section: `示例输出：{"title":"概述","body_md":"第一段原文。\\n\\n第二段原文。"}`,
    sections: `示例输出：{"items":[{"heading":"安全要求","body_md":"第一段原文。\\n\\n第二段原文。"}]}`,
    list: `示例输出：{"items":["起重量 5吨","跨度 3-16米"]}`,
    text: `示例输出：{"text":"5吨单梁起重机"}`,
    seo: `示例输出：{"text":"5吨单梁起重机制造商，跨度3-16米，出口120国。"}`,
  }[shape]
  return [
    { role: 'system', content: RULES },
    { role: 'user', content: `名称：${productName}\n字段：${key}\n${contract}\n${example}\n\n原文：\n${sliceText}` },
  ]
}

// caller 已归位 src/deepseek.mjs（i18n 引擎复用）；此处 re-export 保持既有 import 不破
// （export...from 不产生本地绑定，burn() 内部 callAI ??= createDeepseekCaller() 需 import 兜底）
import { createDeepseekCaller } from '../src/deepseek.mjs'
export { createDeepseekCaller }

// ---------- 编排：一把梭出整页 + 代码验收（逐字/位置/漏段）+ 失败格单独重烧（≤2 次/格） ----------
export async function burn({ text, url, slug, productName, family = 'auto' }, { callAI } = {}) {
  callAI ??= createDeepseekCaller()
  const { rawText, images } = await lib.fetchSource({ text, url })

  // 判族：人工显式指定跳过；auto 让 AI 判；族能不能烧 = 有没有完整套件（scanKits 现算，注册表退役）
  // 套件选择：auto 判族后默认「通用件」（命名约定 <族名单数>Page，如 posts→PostPage）；
  // 「族:套件名」可指定任一具体模版（一 astro 一模版，自己套自己，fit 由用户判断、缺席即裁）。
  let resolved, kitName
  const preNotes = []
  const kits = lib.scanKits(COMPONENTS)
  const familyKit = (fam) => kits.find(k => k.family === fam && k.complete)
  const canonicalKit = (fam) => kits.find(k => k.family === fam && k.complete && k.name === fam.replace(/s$/, '') + 'Page')?.name ?? familyKit(fam)?.name
  if (family === 'auto') {
    const built = [...new Set(kits.filter(k => k.complete).map(k => k.family))]
    const verdict = await callAI(classifyMessages(rawText.slice(0, 3000), built), 'classify')
    resolved = { product: 'products', post: 'posts' }[verdict?.family] ?? verdict?.family // 契约用族目录名；短名别名兜一层防抖
    if (!resolved || !familyKit(resolved)) {
      const label = verdict?.family && verdict.family !== 'unknown' ? (FAMILY_LABEL[verdict.family] ?? verdict.family) : '无法识别'
      throw new Error(`自动判族：这份原料像「${label}」——${verdict?.reason ?? '无理由'}。已建页族：${built.map(f => FAMILY_LABEL[f] ?? f).join('/')}；请人工改选或换原料`)
    }
    kitName = canonicalKit(resolved)
    preNotes.push(`自动判族：${FAMILY_LABEL[resolved] ?? resolved}（${verdict.reason}）`)
  } else {
    // 手动选：族目录名(products/posts) / 控制台短名(product/post) / 「族:套件名」（指定具体模版）
    const [rawFam, rawKit] = String(family).split(':')
    const fam = { product: 'products', post: 'posts' }[rawFam] ?? rawFam
    if (!familyKit(fam)) throw new Error(`页族「${family}」烧制未建（无完整套件）`)
    resolved = fam
    kitName = rawKit ?? canonicalKit(fam)
  }

  const kitDir = lib.findKit(COMPONENTS, resolved, kitName) // findKit 已返回套件目录（缺件明说：不存在/不完整带清单）
  const catalog = lib.loadCatalog(
    join(kitDir, 'meta.json'), join(kitDir, 'index.astro'), join(kitDir, 'example.json'))
  const paragraphs = lib.numberBlocks(rawText) // 仅供反查漏段/位置审计，不给 AI 编号
  const report = { slug, productName, family: resolved, kit: kitName, images: images.map(i => i.name), sections: [], unused: [], notes: [...preNotes] }
  if (paragraphs.length > 200) report.notes.push(`剥壳后段数异常多（${paragraphs.length}），页面可能带噪，建议改贴裸文本`)

  // 一把梭：一次出整页；调用失败（含截断）→ 干净报错（自动逐格降级是 roadmap）
  let out
  try {
    out = await callAI(oneShotMessages(rawText, catalog, productName), 'oneshot')
  } catch (e) {
    throw new Error(`整页烧失败：${e.message}。原文过长可先分段贴（自动逐格降级在 roadmap）`)
  }
  const fields = out?.fields
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('返回结构非法（须为 {fields:{…}}）')

  // 逐格验收（全文逐字查）+ 失败格单独重烧（≤2 次，给全文只出这格）
  const sectionResults = []
  for (const [key, data0] of Object.entries(fields)) {
    const spec = catalog.find(c => c.key === key)
    const rec = { key, status: 'ok', attempts: 1, issues: [] }
    if (!spec) { rec.status = 'failed'; rec.issues.push('格子名不在白名单（发明字段）'); report.sections.push(rec); continue }
    let data = data0
    let bad = verifyByShape(spec, data, rawText, productName, paragraphs)
    if (bad) rec.issues.push(bad)
    for (let attempt = 1; bad && attempt < 3; attempt++) {
      const msgs = sectionMessages(key, spec.shape, rawText, productName)
      msgs.push({ role: 'user', content: `上次返回被代码拒收：${bad}。只允许逐字搬运原文，请重发。` }) // 喂回拒收原因：温度 0 下同消息重发是确定性重放
      rec.attempts = attempt + 1
      let fix
      try {
        fix = await callAI(msgs, key)
      } catch (e) {
        rec.issues.push(`调用失败：${e.message}`) // 重烧硬失败降级：该格 failed 缺席，不拖垮整次
        rec.status = 'failed'
        data = null
        break
      }
      bad = verifyByShape(spec, fix, rawText, productName, paragraphs)
      if (!bad) { data = fix; rec.status = 'repaired' } else rec.issues.push(bad)
    }
    if (bad) { rec.status = 'failed'; data = null }
    report.sections.push(rec)
    sectionResults.push({ key, shape: spec.shape, titlePath: spec.titlePath, path: spec.path, data })
  }

  // 重叠硬闸：两格正文重叠 >50% → 带原因重烧一轮；终检仍犯 → failed 缺席
  const dupReason = d => `正文与其他格大面积重复（${d.a}×${d.b}，${d.pct}%）：每格只许用原文中属于它的那一部分，禁止多格共用同一段`
  let dups = lib.findDuplicates(sectionResults.filter(r => r.data))
  if (dups.length) {
    const involved = [...new Set(dups.flatMap(d => [d.a, d.b]))]
    for (const key of involved) {
      const rec = report.sections.find(s => s.key === key)
      const spec = catalog.find(c => c.key === key)
      const idx = sectionResults.findIndex(r => r.key === key)
      const reason = dupReason(dups.find(d => d.a === key || d.b === key))
      let data = null
      for (let attempt = 1; attempt < 3; attempt++) {
        const msgs = sectionMessages(key, spec.shape, rawText, productName)
        msgs.push({ role: 'user', content: `上次返回被代码拒收：${reason}。请重发。` })
        try { data = await callAI(msgs, key) } catch (e) { data = null; rec.issues.push(`调用失败：${e.message}`); rec.status = 'failed'; break }
        rec.attempts += 1
        const bad = verifyByShape(spec, data, rawText, productName, paragraphs)
        if (!bad) { rec.status = 'repaired'; break }
        rec.issues.push(bad)
        if (attempt === 2) data = null
      }
      if (!data) { rec.status = 'failed'; rec.issues.push(reason) } // 重烧全败=格子缺席，状态必须跟上，不留假 repaired
      sectionResults[idx] = { ...sectionResults[idx], data }
    }
    dups = lib.findDuplicates(sectionResults.filter(r => r.data))
    for (const d of dups) for (const key of [d.a, d.b]) {
      const rec = report.sections.find(s => s.key === key)
      rec.status = 'failed'; rec.issues.push(dupReason(d))
      const idx = sectionResults.findIndex(r => r.key === key)
      sectionResults[idx] = { ...sectionResults[idx], data: null }
    }
  }

  // 位置审计（防错位）+ 反查漏段
  const audit = lib.auditPositions(sectionResults.filter(r => r.data), rawText, paragraphs)
  for (const w of audit.warnings) report.notes.push(w)
  report.fieldMap = audit.fieldMap // 人审辅助：每格命中的原文段号
  const acceptedTexts = [] // 所有已收格子的文字（段=标题+树块，list=条目，text/seo=text）
  for (const r of sectionResults) {
    if (!r.data) continue
    if (r.shape === 'section') acceptedTexts.push(r.data.title, ...lib.treeBlocks(lib.mdToDoc(r.data.body_md)))
    else if (r.shape === 'list') acceptedTexts.push(...r.data.items)
    else if (r.data.text) acceptedTexts.push(r.data.text)
  }
  const jsonTextNorm = acceptedTexts.map(t => lib.normalizeText(t)).join('\n')
  report.unused = paragraphs.filter(p => !jsonTextNorm.includes(lib.normalizeText(p.text))).map(p => ({ n: p.n, preview: p.text.slice(0, 40) }))

  const json = await lib.assemble({ slug, productName, family: resolved, sectionResults, imagePool: images })
  json.page.template = kitName // 草稿自带套件名：路由按它派发（writeDraft 的 ??= 不覆盖）
  if (resolved === 'products') {
    if (!images.length) report.notes.push('图池为空：gallery 缺席（known-leftover）')
    report.notes.push('hero 横幅图 v1 不烧（图池全进 gallery），待编辑器补传（known-leftover）') // v1 恒提示
    report.notes.push('breadcrumb.trail 仅[首页]，二级分类人工确认')
  } else {
    if (images.length) {
      if (catalog.some(c => c.shape === 'sections')) report.notes.push(`图池 ${images.length} 张按顺序配到第 i 段（余图挂末段），人工在编辑器确认`)
      else report.notes.push('图池未自动落位（该套件无图槽语义），编辑器人工配图')
    } else report.notes.push('图池为空：待编辑器补传（known-leftover）')
  }
  if (sectionResults.some(r => r.key === 'page.description' && r.data)) report.notes.push('page.description 为 AI 概括（溯源豁免），人工过目')
  if (report.sections.some(s => s.status === 'failed')) report.notes.push('有格烧败缺席（标红），可在编辑器人工补或重新烧')
  return { json, report, previewHtml: lib.previewHtml(json, catalog) }
}

// 按 shape 分级校验（对全文逐字查；标题候选=各段首行+产品名）：返回 null=过；字符串=拒收原因
export function verifyByShape(spec, data, src, productName, paragraphs) {
  const firstLines = paragraphs.map(p => p.text.split('\n')[0])
  try {
    if (spec.shape === 'section') {
      if (!data?.title || !data?.body_md) return '缺 title 或 body_md'
      const v = lib.verifyTree(lib.mdToDoc(data.body_md), src)
      if (!v.ok) return `原文里找不到：「${v.failures[0].slice(0, 40)}」`
      if (!lib.similarToAny(data.title, [...firstLines, ...paragraphs.map(p => p.text)], 0.85)
        && lib.similarity(data.title, productName) < 0.85)
        return `标题与原文及产品名都不像：「${data.title}」`
      return null
    }
    if (spec.shape === 'list') {
      if (!Array.isArray(data?.items) || !data.items.length) return 'items 为空'
      const badType = data.items.find(t => typeof t !== 'string' || !t.trim())
      if (badType !== undefined) return 'items 含非字符串或空条目'
      if (spec.level === 'verbatim') {
        const hay = lib.normalizeText(src)
        const badItem = data.items.find(t => !hay.includes(lib.normalizeText(t)))
        if (badItem) return `原文里找不到：「${badItem.slice(0, 40)}」`
      }
      return null
    }
    if (spec.shape === 'text') {
      if (!data?.text) return '缺 text'
      if (spec.level === 'verbatim' && !lib.normalizeText(src).includes(lib.normalizeText(data.text)))
        return `原文里找不到：「${data.text.slice(0, 40)}」`
      if (spec.level === 'similar'
        && !lib.similarToAny(data.text, firstLines, 0.85)
        && lib.similarity(data.text, productName) < 0.85)
        return `与原文及产品名都不像：「${data.text}」`
      return null
    }
    if (spec.shape === 'sections') {
      if (!Array.isArray(data?.items) || !data.items.length) return 'items 为空'
      for (const [i, it] of data.items.entries()) {
        if (!it?.heading || !it?.body_md) return `第 ${i + 1} 项缺 heading 或 body_md`
        const v = lib.verifyTree(lib.mdToDoc(it.body_md), src)
        if (!v.ok) return `第 ${i + 1} 项原文里找不到：「${v.failures[0].slice(0, 40)}」`
        if (!lib.similarToAny(it.heading, [...firstLines, ...paragraphs.map(p => p.text)], 0.85))
          return `第 ${i + 1} 项标题与原文不像：「${it.heading}」`
      }
      // 段间重叠闸（文章只有一个内容字段，闸收进字段内；产品侧在跨字段 findDuplicates 层）
      const blocks = data.items.map(it => lib.treeBlocks(lib.mdToDoc(it.body_md)).map(lib.normalizeText))
      for (let a = 0; a < blocks.length; a++) for (let b = a + 1; b < blocks.length; b++) {
        const sb = new Set(blocks[b])
        const shared = blocks[a].filter(t => sb.has(t)).length
        if (shared / Math.max(blocks[a].length, blocks[b].length) > 0.5)
          return `第 ${a + 1} 与第 ${b + 1} 项正文大面积重复——每章只许用原文中属于它的那部分`
      }
      return null
    }
    if (spec.shape === 'seo') return data?.text ? null : '缺 text'
    return `未知 shape ${spec.shape}`
  } catch (e) { return `校验异常：${e.message}` }
}

// ---------- 落 draft（撞名加序号；写前全树过 schema；强制 draft 不信客户端） ----------
// 页族从数据自带 page.type 推导（post→posts，缺省 products），edit-server 调用零改动。
export function writeDraft(json, slug) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('slug 非法（小写字母数字连字符）')
  const famDir = json.page.type === 'post' ? 'posts' : 'products'
  let final = slug, n = 2
  while (existsSync(join(SITE, 'content', famDir, `${final}.json`))) final = `${slug}-${n++}`
  json.page.slug = `${famDir}/${final}`
  json.page.status = 'draft'
  const kits = lib.scanKits(COMPONENTS)
  const kit = kits.find(k => k.family === famDir && k.name === json.page.template) // 优先按草稿声明的套件（多套件族）
    ?? kits.find(k => k.family === famDir && k.complete)
  if (!kit) throw new Error(`页族「${famDir}」无完整套件，无法落 draft`)
  json.page.template ??= basename(kit.dir) // 草稿必须自带 template：路由按它 glob 套件（缺则预览构建炸）
  const meta = lib.loadMeta(join(kit.dir, 'meta.json'))
  for (const c of meta) { // 形态驱动：固定段验根树，重复章节验每项树
    if (c.shape === 'section' && json[c.key]) lib.validateDoc(json[c.key].body, `${c.key}.body`)
    else if (c.shape === 'sections')
      for (const [idx, s] of (lib.getIn(json, c.key) ?? []).entries()) lib.validateDoc(s.body, `${c.key}[${idx}].body`)
  }
  writeFileSync(join(SITE, 'content', famDir, `${final}.json`), JSON.stringify(json, null, 2) + '\n')
  return final
}

// ---------- CLI ----------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined }
  const has = k => args.includes('--' + k)
  if ((!opt('text') && !opt('url')) || !opt('slug') || !opt('name')) {
    console.error('用法: DEEPSEEK_API_KEY=xxx node scripts/deepseek-burn.mjs (--text 文件 | --url 地址) --slug 裸slug --name 产品名 [--save]')
    process.exit(1)
  }
  try {
    const input = opt('text') ? { text: readFileSync(opt('text'), 'utf8') } : { url: opt('url') }
    const { json, report } = await burn({ ...input, slug: opt('slug'), productName: opt('name') })
    console.log(JSON.stringify(report, null, 2))
    if (has('save')) console.log('已落 draft:', writeDraft(json, opt('slug')))
    else console.log('（未落盘；加 --save 落 draft）')
  } catch (e) { console.error('❌ ' + e.message); process.exit(1) }
}
