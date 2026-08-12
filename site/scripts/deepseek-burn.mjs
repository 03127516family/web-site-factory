#!/usr/bin/env node
// DeepSeek 烧制台·编排层：提示词组包 + HTTP 客户端 + burn() 流水线（段级重修）+ CLI。
// 纯逻辑全在 burn-lib；本文件只做「问 AI 要值」与「把值交给代码裁决」。
// 用法: DEEPSEEK_API_KEY=xxx node scripts/deepseek-burn.mjs --text <文件> --slug xxx --name 产品名 [--save]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as lib from '../src/burn-lib.mjs'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const ASTRO = join(SITE, 'src/components/ProductPage.astro')
const REF_JSON = join(SITE, 'content/products/single-girder-eot-cranes.json')

// ---------- 提示词（白名单自组件推导；AI 产 markdown，不产树） ----------
const RULES = `你是内容结构化器，把起重机产品原料文章映射为格式化数据。铁律：
1. 只输出 JSON（不要解释、不要 markdown 围栏）；
2. 只许搬运原文文字，禁止用常识/行业知识补充任何原文没有的内容；没有就是缺席，不许凑；
3. body_md 用 markdown 语法（段落空行分隔、- 列表、| 表格 |），文字必须逐字来自给定原文块；
4. 标题允许轻微规范（去序号/标点），正文字句一律逐字；
5. 原文块用 [块号] 引用，块号只许用给定编号。`

export function planMessages(numbered, catalogKeys) {
  return [
    { role: 'system', content: RULES },
    { role: 'user', content: `下面是按空行预编号的产品文章块。可选字段白名单（别的字段禁止发明）：\n${catalogKeys.join('、')}\n\n把文章映射为字段计划，返回 JSON：{"fields":[{"field":"字段名","blocks":[块号…]}…]}。字段按原文出现顺序排列；每个原文块最多归一个字段；**每个字段只许出现一次——同字段的多个块全部放进它自己的 blocks 数组**；不确定的块宁可不归。\n\n注意：字段名必须与白名单**逐字一致**（例如只有 specs，没有 specification）；应用场景/用途类内容归 overview，产品介绍/总结类归 summary_intro，仍归不进去的块放弃归类（会由人工处理）。\n\n示例（仅示意格式，内容不许照抄）：\n输入块：\n[1] 5吨单梁起重机\n[2] 5吨单梁起重机广泛用于车间物料搬运。\n[3] 它结构紧凑、操作简便。\n[4] 主要参数：\n起重量 5吨\n跨度 3-16米\n对应返回：\n{"fields":[{"field":"hero.headline","blocks":[1]},{"field":"overview","blocks":[2,3]},{"field":"specs","blocks":[4]}]}\n\n现在处理真实文章：\n${numbered}` },
  ]
}

export function classifyMessages(sample) {
  return [
    { role: 'system', content: RULES },
    { role: 'user', content: `判断这份原料属于哪个页族。已建页族：product（产品页族：起重机产品的介绍/销售页，通常含参数表、优势、安装等栏目）。未建页族：post（文章族：案例/培训/指南/新闻类散文）。都不是则 unknown。\n\n返回 JSON：{"family":"product"|"post"|"unknown","reason":"一句话理由"}\n\n原料开头：\n${sample}` },
  ]
}

export function sectionMessages(key, shape, sliceText, productName) {
  const contract = {
    section: `返回 {"title":"段标题","body_md":"markdown 正文"}`,
    list: `返回 {"items":["逐字条目","…"]}`,
    text: `返回 {"text":"一句话"}`,
    seo: `返回 {"text":"150 字以内的中文 SEO 描述（本字段允许概括，其余禁止）"}`,
  }[shape]
  const example = {
    section: `示例输出：{"title":"概述","body_md":"第一段原文。\\n\\n第二段原文。"}`,
    list: `示例输出：{"items":["起重量 5吨","跨度 3-16米"]}`,
    text: `示例输出：{"text":"5吨单梁起重机"}`,
    seo: `示例输出：{"text":"5吨单梁起重机制造商，跨度3-16米，出口120国。"}`,
  }[shape]
  return [
    { role: 'system', content: RULES },
    { role: 'user', content: `产品名：${productName}\n字段：${key}\n${contract}\n${example}\n\n原文块：\n${sliceText}` },
  ]
}

// ---------- DeepSeek 客户端（OpenAI 兼容；单次 120s 超时；失败重试 2 次；json_object 模式） ----------
export function createDeepseekCaller({ apiKey = process.env.DEEPSEEK_API_KEY, model = process.env.DEEPSEEK_MODEL || 'deepseek-chat', baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', backoffMs = 1000 } = {}) {
  if (!apiKey) throw new Error('未配置 DEEPSEEK_API_KEY（服务端环境变量，浏览器永远见不到）')
  const fatal = msg => { const e = new Error(msg); e.noRetry = true; return e }
  return async function callAI(messages, tag) {
    let lastErr
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal: AbortSignal.timeout(120_000),
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, temperature: 0, response_format: { type: 'json_object' }, max_tokens: 4096, messages }),
        })
        if (!res.ok) {
          const body = (await res.text()).slice(0, 200)
          if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429)
            throw fatal(`DeepSeek HTTP ${res.status}（确定性错误，不重试）: ${body}`)
          throw new Error(`DeepSeek HTTP ${res.status}: ${body}`)
        }
        const data = await res.json()
        if (data.choices?.[0]?.finish_reason === 'length') throw fatal('输出被 max_tokens 截断（段太长，重试无义）')
        return JSON.parse(data.choices?.[0]?.message?.content ?? '')
      } catch (e) {
        if (e.noRetry) throw new Error(`DeepSeek 调用失败（${tag}）: ${e.message}`)
        lastErr = e
        if (attempt < 2) await new Promise(r => setTimeout(r, backoffMs * (attempt + 1)))
      }
    }
    throw new Error(`DeepSeek 调用失败（${tag}，已重试 2 次）: ${lastErr.message}`)
  }
}

// ---------- 编排：两阶段 + 分级校验 + 段级重修（≤2 次/段） ----------
export async function burn({ text, url, slug, productName, family = 'auto' }, { callAI } = {}) {
  callAI ??= createDeepseekCaller()
  const { rawText, images } = await lib.fetchSource({ text, url })

  // 判族：人工显式指定跳过；auto 让 AI 判；未建族/无法识别干净拒绝（不硬烧）
  let resolved = family
  const preNotes = []
  if (family === 'auto') {
    const verdict = await callAI(classifyMessages(rawText.slice(0, 3000)), 'classify')
    resolved = verdict?.family
    if (resolved !== 'product') {
      const label = lib.FAMILIES[resolved]?.label ?? '无法识别'
      throw new Error(`自动判族：这份原料像「${label}」——${verdict?.reason ?? '无理由'}。该族烧制未建；若确为产品页原料，请人工改选「产品页族」重试`)
    }
    preNotes.push(`自动判族：产品页族（${verdict.reason}）`)
  } else if (!lib.FAMILIES[family]?.built) {
    throw new Error(`页族「${lib.FAMILIES[family]?.label ?? family}」烧制未建`)
  }

  const catalog = lib.loadCatalog(ASTRO, REF_JSON)
  const blocks = lib.numberBlocks(rawText)
  const numbered = blocks.map(b => `[${b.n}] ${b.text}`).join('\n\n')
  const slice = ns => blocks.filter(b => ns.includes(b.n)).map(b => b.text).join('\n\n')

  const report = { slug, productName, family: resolved, images: images.map(i => i.name), uncovered: [], sections: [], notes: [...preNotes] }

  // 阶段 1：规划（≤2 次重修；仍不合法 → 整次烧失败，不落任何东西）
  let plan, check
  for (let attempt = 0; attempt < 3; attempt++) {
    const msgs = planMessages(numbered, catalog.map(c => c.key))
    if (attempt > 0) msgs.push({ role: 'user', content: `上次返回被代码拒收：${check.errors.join('；')}。请修正后重发 JSON。` })
    plan = await callAI(msgs, 'plan')
    check = lib.checkPlan(plan, blocks)
    if (check.errors.length === 0) break
    if (attempt === 2) throw new Error(`段映射表 3 次仍不合法：${check.errors.join('；')}`)
  }
  report.plan = { fields: check.fields } // 报告展示实际执行的形态（合并后），合并事件已在 notes 记录
  report.uncovered = check.uncovered
  if (blocks.length > 200) report.notes.push(`剥壳后块数异常多（${blocks.length}），页面可能带噪，建议改贴裸文本`)
  if (check.merged?.length) report.notes.push(`同字段多条目已自动合并：${check.merged.join('、')}`)

  // 阶段 2：逐段烧（每段独立重修，失败段缺席标红）；消费合并后字段——同字段只烧一次、内容不丢
  const sectionResults = []
  for (const f of check.fields) {
    const spec = catalog.find(c => c.key === f.field)
    const src = slice(f.blocks)
    const rec = { key: f.field, status: 'ok', attempts: 1, issues: [] }
    let data = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const msgs = sectionMessages(f.field, spec.shape, src, productName)
      if (attempt > 0) msgs.push({ role: 'user', content: `上次返回被代码溯源拒收：${rec.issues.at(-1)}。只允许逐字搬运原文，请重发。` })
      try {
        data = await callAI(msgs, f.field)
      } catch (e) {
        rec.attempts = attempt + 1
        rec.issues.push(`调用失败：${e.message}`) // 段级硬失败降级：不拖垮整次烧（设计契约=失败段缺席标红）
        rec.status = 'failed'
        data = null
        break
      }
      rec.attempts = attempt + 1
      const bad = verifyByShape(spec, data, src, productName, blocks, f.blocks)
      if (!bad) { if (attempt > 0) rec.status = 'repaired'; break }
      rec.issues.push(bad)
      if (attempt === 2) { rec.status = 'failed'; data = null }
    }
    report.sections.push(rec)
    sectionResults.push({ key: f.field, shape: spec.shape, data })
  }

  const json = await lib.assemble({ slug, productName, sectionResults, imagePool: images })
  if (!images.length) report.notes.push('图池为空：gallery 缺席（known-leftover）')
  if (sectionResults.some(r => r.key === 'page.description' && r.data)) report.notes.push('page.description 为 AI 概括（溯源豁免），人工过目')
  report.notes.push('hero 横幅图 v1 不烧（图池全进 gallery），待编辑器补传（known-leftover）') // v1 恒提示
  report.notes.push('breadcrumb.trail 仅[首页]，二级分类人工确认')
  if (report.sections.some(s => s.status === 'failed')) report.notes.push('有段烧败缺席（标红），可在编辑器人工补或重新烧')
  return { json, report, previewHtml: lib.previewHtml(json) }
}

// 按 shape 分级校验：返回 null=过；字符串=拒收原因
export function verifyByShape(spec, data, src, productName, blocks, ns) {
  const firstLines = ns.map(n => blocks[n - 1].text.split('\n')[0])
  try {
    if (spec.shape === 'section') {
      if (!data?.title || !data?.body_md) return '缺 title 或 body_md'
      const v = lib.verifyTree(lib.mdToDoc(data.body_md), src)
      if (!v.ok) return `溯源拒收：${v.failures[0].slice(0, 40)}…`
      if (!lib.similarToAny(data.title, [...firstLines, ...ns.map(n => blocks[n - 1].text)], 0.85)
        && lib.similarity(data.title, productName) < 0.85)
        return `标题与原文相似度不足："${data.title}"`
      return null
    }
    if (spec.shape === 'list') {
      if (!Array.isArray(data?.items) || !data.items.length) return 'items 为空'
      const badType = data.items.find(t => typeof t !== 'string' || !t.trim())
      if (badType !== undefined) return 'items 含非字符串或空条目'
      if (spec.level === 'verbatim') {
        const hay = lib.normalizeText(src)
        const badItem = data.items.find(t => !hay.includes(lib.normalizeText(t)))
        if (badItem) return `溯源拒收：条目"${badItem.slice(0, 40)}"非原文`
      }
      return null
    }
    if (spec.shape === 'text') {
      if (!data?.text) return '缺 text'
      if (spec.level === 'verbatim' && !lib.normalizeText(src).includes(lib.normalizeText(data.text)))
        return `溯源拒收："${data.text.slice(0, 40)}"非原文`
      if (spec.level === 'similar'
        && !lib.similarToAny(data.text, firstLines, 0.85)
        && lib.similarity(data.text, productName) < 0.85)
        return `与原文及产品名相似度均不足："${data.text}"`
      return null
    }
    if (spec.shape === 'seo') return data?.text ? null : '缺 text'
    return `未知 shape ${spec.shape}`
  } catch (e) { return `校验异常：${e.message}` }
}

// ---------- 落 draft（撞名加序号；写前全树过 schema；强制 draft 不信客户端） ----------
export function writeDraft(json, slug) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('slug 非法（小写字母数字连字符）')
  let final = slug, i = 2
  while (existsSync(join(SITE, 'content/products', `${final}.json`))) final = `${slug}-${i++}`
  json.page.slug = `products/${final}`
  json.page.status = 'draft'
  for (const c of lib.SECTION_CATALOG.filter(c => c.shape === 'section' && json[c.key]))
    lib.validateDoc(json[c.key].body, `${c.key}.body`)
  writeFileSync(join(SITE, 'content/products', `${final}.json`), JSON.stringify(json, null, 2) + '\n')
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
