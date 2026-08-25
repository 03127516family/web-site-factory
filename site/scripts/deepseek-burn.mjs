#!/usr/bin/env node
// DeepSeek 烧制台·编排层：提示词组包 + HTTP 客户端 + burn() 流水线（一把梭出整页 + 代码逐格验收 + 失败格单独重烧）+ CLI。
// 纯逻辑全在 burn-lib；本文件只做「问 AI 要值」与「把值交给代码裁决」。
// 用法: DEEPSEEK_API_KEY=xxx node scripts/deepseek-burn.mjs --text <文件> --slug xxx --name 产品名 [--save]
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as lib from '../src/burn-lib.mjs'
import { draftPath, publishedPath, writeDraft as writeWorkspaceDraft } from '../src/draft-store.mjs'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const COMPONENTS = join(SITE, 'src/components')   // 套件根

// ---------- 提示词（白名单自组件推导；AI 产 markdown，不产树） ----------
const RULES = `你是内容结构化器，把原料文章（产品页或文章）映射为格式化数据。铁律：
1. 只输出 JSON（不要解释、不要 markdown 围栏）；
2. 只许搬运原文文字，禁止用常识/行业知识补充任何原文没有的内容；没有就是缺席，不许凑；
3. body_md 用 markdown 语法（段落空行分隔、- 列表、| 表格 |）；
4. 标题允许轻微规范（去序号/标点），正文字句一律逐字；
5. 文字必须逐字来自给定原文；
6. 每段原文只许用于一个字段；严禁把同一段内容塞进两个字段，严禁把整篇或大段原文复制到多个字段里——你的角色是搬运工不是作者，只做对应和摘取；
7. 原文里若贴了示例 JSON 结构（如 example.json），它只作格式参考、不是正文：正文段落必须全部映射进对应格子，示例 JSON 里的文字不是搬运对象；
8. 一次给全：白名单里原文有对应内容的每一个格子都必须输出，漏格会被逐个补烧；只有原文里真没有内容的格子才缺席。`

// 一把梭：一次出整页 JSON（格子缺席合法；代码侧逐格验收，不过的单格重烧）
// 格式契约按 shape 从 loadCatalog 目录分组生成——目录加段/加格时提示词不漂移；
// 示例文字从套件 example 现取（真字段真值，换站随模版走，引擎不内置站味）
export function oneShotMessages(rawText, catalog, productName, sample, strict = false) {
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
  const sampleLine = sample ? `\n\n示例（仅示意格式）：${sample}` : ''
  // 各格含义（治本，2026-08-17）：光秃英文名模型看不懂→漏格（实战只出 3 格）；desc 由套件 meta.json 自带，换站随模版走
  const descBlock = catalog.filter(c => c.desc).map(c => `- ${c.key}：${c.desc}`).join('\n')
  const descLine = descBlock ? `\n\n各格含义（判断哪段原文进哪格；格名照白名单逐字抄，别抄冒号后的解释）：\n${descBlock}` : ''
  // 整行粒度铁律（「我已整理好」模式）：用户的边界一个不许切——只许整行/连续整行搬运
  const strictLine = strict ? '\n\n搬运粒度铁律（用户已整理好的内容）：每段正文必须正好是原文的一整行或连续几整行（允许连续行拼接还原）；不许截半句、不许跳行挑句拼接。' : ''
  return [
    { role: 'system', content: RULES },
    { role: 'user', content: `名称：${productName}\n\n可选字段白名单（格名必须逐字照抄这份名单；名单里是点号连写的扁平格名，如 summary.intro、hero.headline、hero.highlights——页面 JSON 里的嵌套块 summary/hero 不是格名，禁止整块输出；原文没有的格子不写，缺席合法）：\n${catalog.map(c => c.key).join('、')}${descLine}${strictLine}\n\n各字段返回格式：\n${contract}\n\n返回 JSON：{"fields":{…}}${sampleLine}\n\n原文：\n${rawText}` },
  ]
}

// 从套件 example 提一段真值当提示词示例（每 shape 取一，找不到就略）
// 铁律：示例里的格名必须全部在白名单内——title 只在目录含 title 的页族（posts）出现，否则模型抄了必被枪毙
export function exampleSnippet(example, catalog) {
  const fields = {}
  const has = k => catalog.some(c => c.key === k)
  const sec = catalog.find(c => c.shape === 'section' && example?.[c.key])
  if (sec) fields[sec.key] = { title: example[sec.key].title, body_md: '（该段原文…）' }
  const secs = catalog.find(c => c.shape === 'sections' && lib.getIn(example, c.key)?.length)
  if (secs) fields[secs.key] = { items: [{ heading: lib.getIn(example, secs.key)[0].heading, body_md: '（该章原文…）' }] }
  const list = catalog.find(c => c.shape === 'list' && lib.getIn(example, c.key)?.length)
  if (list) fields[list.key] = { items: lib.getIn(example, list.key).slice(0, 2).map(x => x.text ?? x) }
  const text = catalog.find(c => c.shape === 'text' && lib.getIn(example, c.key) !== undefined)
  if (text) fields[text.key] = { text: String(lib.getIn(example, text.key)).slice(0, 40) + '…' }
  if (has('title') && example?.title) fields.title = { text: example.title }
  if (example?.page?.description) fields['page.description'] = { text: example.page.description.slice(0, 50) + '…' }
  return Object.keys(fields).length ? JSON.stringify({ fields }) : ''
}

// 族目录名 → 人话标签/描述（站点层文案，非引擎逻辑；判族契约直接用族目录名，省一层映射）
const FAMILY_LABEL = { products: '产品页族', posts: '文章页族' }
const FAMILY_DESC = {
  products: '产品页族：产品/服务的介绍销售页，通常含参数、优势、安装等栏目',
  posts: '文章页族：案例/培训/指南/新闻类散文',
}

export function classifyMessages(sample, builtFamilies) {
  return [
    { role: 'system', content: RULES },
    { role: 'user', content: `判断这份原料属于哪个页族。已建页族：${builtFamilies.map(f => `${f}（${FAMILY_DESC[f] ?? ''}）`).join('；')}。都不属于则 unknown。\n\n返回 JSON：{"family":${builtFamilies.map(f => `"${f}"`).join('|')}|"unknown","reason":"一句话理由"}\n\n原料开头：\n${sample}` },
  ]
}

export function sectionMessages(key, shape, sliceText, productName, desc, strict = false) {
  const contract = {
    section: `返回 {"title":"段标题","body_md":"markdown 正文"}`,
    sections: `返回 {"items":[{"heading":"章节标题","body_md":"markdown 正文"}，按原文顺序]}`,
    list: `返回 {"items":["逐字条目","…"]}`,
    text: `返回 {"text":"一句话"}`,
    seo: `返回 {"text":"150 字以内的中文 SEO 描述（本字段允许概括，其余禁止）"}`,
  }[shape]
  const example = {
    section: `示例输出：{"title":"<段标题>","body_md":"第一段原文。\\n\\n第二段原文。"}`,
    sections: `示例输出：{"items":[{"heading":"<章节标题>","body_md":"第一段原文。\\n\\n第二段原文。"}]}`,
    list: `示例输出：{"items":["<逐字条目1>","<逐字条目2>"]}`,
    text: `示例输出：{"text":"<一句原文>"}`,
    seo: `示例输出：{"text":"<150 字以内本页内容概括>"}`,
  }[shape]
  // 缺席阀门（2026-08-17）：单格追问必须给「真没内容」的合法出口，否则压力下模型把最像的段落错装进格（逐字闸拦不住错装）
  return [
    { role: 'system', content: RULES },
    { role: 'user', content: `名称：${productName}\n字段：${key}${desc ? `（${desc}）` : ''}\n${contract}\n${example}\n若原文真没有该字段的内容，返回 {"absent":true}（合法缺席，不硬凑）。${strict ? '\n本单为用户已整理好的内容：只许整行搬运（一整行或连续几整行），不许截半句、不许跳行拼接。' : ''}\n\n原文：\n${sliceText}` },
  ]
}

// caller 已归位 src/deepseek.mjs（i18n 引擎复用）；此处 re-export 保持既有 import 不破
// （export...from 不产生本地绑定，burn() 内部 callAI ??= createDeepseekCaller() 需 import 兜底）
import { createDeepseekCaller } from '../src/deepseek.mjs'
export { createDeepseekCaller }

// ---------- 编排：一把梭出整页 + 代码验收（逐字/白名单/重叠/漏段；相似级只提示）+ 失败格单独重烧（≤2 次/格） ----------
export async function burn({ text, url, slug, productName, family = 'auto', mode = 'raw' }, { callAI, noBackfill = false } = {}) {
  callAI ??= createDeepseekCaller()
  const { rawText, images } = await lib.fetchSource({ text, url })
  const strict = mode === 'organized' // 「我已整理好」：整行闸（防切）+ 强制安置（防丢）

  // 判族：人工显式指定跳过；auto 让 AI 判；族能不能烧 = 有没有完整套件（scanKits 现算，注册表退役）
  // 套件选择：auto 判族后默认「通用件」（命名约定 <族名单数>Page，如 posts→PostPage）；
  // 「族:套件名」可指定任一具体模版（一 astro 一模版，自己套自己，fit 由用户判断、缺席即裁）。
  let resolved, kitName
  const preNotes = []
  const kits = lib.scanKits(COMPONENTS)
  const familyKit = (fam) => kits.find(k => k.family === fam && k.complete)
  const canonicalKit = (fam) => lib.canonicalKitOf(kits, fam)
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
  const example = JSON.parse(readFileSync(join(kitDir, 'example.json'), 'utf8')) // chrome 值与提示词示例的真值源（套件自带，引擎不认站）
  const paragraphs = lib.numberBlocks(rawText) // 仅供反查漏段/位置审计，不给 AI 编号
  const report = { slug, productName, family: resolved, kit: kitName, images: images.map(i => i.name), sections: [], unused: [], notes: [...preNotes] }
  if (paragraphs.length > 200) report.notes.push(`剥壳后段数异常多（${paragraphs.length}），页面可能带噪，建议改贴裸文本`)

  // 一把梭：一次出整页；调用失败（含截断）→ 干净报错（自动逐格降级是 roadmap）
  let out
  try {
    out = await callAI(oneShotMessages(rawText, catalog, productName, exampleSnippet(example, catalog), strict), 'oneshot')
  } catch (e) {
    throw new Error(`整页烧失败：${e.message}。原文过长可先分段贴（自动逐格降级在 roadmap）`)
  }
  const fields = out?.fields
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('返回结构非法（须为 {fields:{…}}）')

  // 逐格验收（全文逐字查）+ 失败格单独重烧（≤2 次，给全文只出这格）。
  // 先过自然名归一：照 example 结构输出的嵌套块（summary/hero）确定性拆回目录格名，不冤枉模型。
  // 漏格判定以归一化后的实际收货名单为准：用原始键会把拆回格误判成漏格→重复补烧且后栽覆盖正确值（2026-08-17 mock 实证）
  const normalized = lib.normalizeFields(fields, catalog, example)
  const deliveredKeys = new Set(normalized.filter(n => !n.unknown).map(n => n.key))
  const sectionResults = []
  for (const { key, data: data0, unknown } of normalized) {
    const spec = catalog.find(c => c.key === key)
    const rec = { key, status: 'ok', attempts: 1, issues: [] }
    if (unknown) { rec.status = 'failed'; rec.issues.push(unknown); report.sections.push(rec); continue }
    if (data0?.absent === true) { // one-shot 显式缺席：合法，不验不补（缺席即裁剪）
      rec.status = 'absent'; rec.issues.push('模型声明原文无此格内容（合法缺席，页面该段不渲染）')
      report.sections.push(rec)
      sectionResults.push({ key, shape: spec.shape, titlePath: spec.titlePath, path: spec.path, data: null })
      continue
    }
    let data = data0
    let warns = []
    let bad = verifyByShape(spec, data, rawText, productName, paragraphs, warns, strict)
    if (bad) rec.issues.push(bad)
    for (let attempt = 1; bad && attempt < 3; attempt++) {
      const msgs = sectionMessages(key, spec.shape, rawText, productName, spec.desc, strict)
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
      if (fix?.absent === true) { rec.status = 'absent'; rec.issues.push('模型声明原文无此格内容（合法缺席，页面该段不渲染）'); data = null; bad = null; break } // 缺席阀门：声明即停，不再施压
      warns = []
      bad = verifyByShape(spec, fix, rawText, productName, paragraphs, warns, strict)
      if (!bad) { data = fix; rec.status = 'repaired' } else rec.issues.push(bad)
    }
    if (bad) { rec.status = 'failed'; data = null }
    else rec.issues.push(...warns.map(w => `提示：${w}`)) // 只展示被收下那次判定的提示（被拒批次的提示无意义）
    report.sections.push(rec)
    sectionResults.push({ key, shape: spec.shape, titlePath: spec.titlePath, path: spec.path, data })
  }

  // 漏格补齐（一次输出不完整的兜底，2026-08-17）：one-shot 没返回的目录格逐格补烧——
  // 同一套提示词与逐字验收、≤2 次、喂回拒收原因；成功照常进后续重叠/schema 全链。
  // 只补「模型没给的」；给了但验不过的走上面的重烧循环，两条路不重不漏。
  const absent = catalog.filter(c => !deliveredKeys.has(c.key))
  if (absent.length && !noBackfill) {
    report.notes.push(`首次输出漏格 ${absent.length} 个，已逐格补烧（同一套验收标准）`)
    for (const spec of absent) {
      const rec = { key: spec.key, status: 'ok', attempts: 0, issues: [] }
      let data = null
      let bad = 'one-shot 未输出此格'
      for (let attempt = 0; attempt < 2 && bad; attempt++) {
        const msgs = sectionMessages(spec.key, spec.shape, rawText, productName, spec.desc, strict)
        msgs.push({ role: 'user', content: attempt === 0
          ? '上次整页输出没有这个格子，请现在只补这一个格。'
          : `上次返回被代码拒收：${bad}。只允许逐字搬运原文，请重发。` })
        rec.attempts = attempt + 1
        let fix
        try {
          fix = await callAI(msgs, spec.key)
        } catch (e) {
          rec.issues.push(`调用失败：${e.message}`) // 补烧硬失败降级：该格 failed 缺席，不拖垮整次
          rec.status = 'failed'
          data = null
          break
        }
        if (fix?.absent === true) { rec.status = 'absent'; rec.issues.push('模型声明原文无此格内容（合法缺席，页面该段不渲染）'); data = null; break } // 缺席阀门：声明即停，不再施压
        const warns = []
        bad = verifyByShape(spec, fix, rawText, productName, paragraphs, warns, strict)
        if (!bad) { data = fix; rec.status = 'repaired'; rec.issues.push(...warns.map(w => `提示：${w}`)) }
        else rec.issues.push(bad)
      }
      if (!data && rec.status !== 'absent') rec.status = 'failed'
      report.sections.push(rec)
      sectionResults.push({ key: spec.key, shape: spec.shape, titlePath: spec.titlePath, path: spec.path, data })
    }
  }
  const absentN = report.sections.filter(s => s.status === 'absent').length
  if (absentN) report.notes.push(`${absentN} 格模型声明原文无内容（合法缺席，页面相应段不渲染）`)

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
      let dwarns = []
      for (let attempt = 1; attempt < 3; attempt++) {
        const msgs = sectionMessages(key, spec.shape, rawText, productName, spec.desc, strict)
        msgs.push({ role: 'user', content: `上次返回被代码拒收：${reason}。请重发。` })
        try { data = await callAI(msgs, key) } catch (e) { data = null; rec.issues.push(`调用失败：${e.message}`); rec.status = 'failed'; break }
        if (data?.absent === true) { rec.status = 'absent'; rec.issues.push('模型声明原文无此格内容（合法缺席，页面该段不渲染）'); data = null; break } // 缺席阀门：声明即停
        rec.attempts += 1
        dwarns = []
        const bad = verifyByShape(spec, data, rawText, productName, paragraphs, dwarns, strict)
        if (!bad) { rec.status = 'repaired'; rec.issues.push(...dwarns.map(w => `提示：${w}`)); break }
        rec.issues.push(bad)
        if (attempt === 2) data = null
      }
      if (!data && rec.status !== 'absent') { rec.status = 'failed'; rec.issues.push(reason) } // 重烧全败=格子缺席，状态必须跟上，不留假 repaired
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

  // 位置归集（fieldMap 人审辅助）+ 反查漏段
  const audit = lib.auditPositions(sectionResults.filter(r => r.data), rawText, paragraphs)
  report.fieldMap = audit.fieldMap // 人审辅助：每格命中的原文段号（同段命中不另告警，见 burn-lib 函数注释）
  const acceptedHay = () => { // 所有已收格子的文字（段=标题+树块，章节=逐项标题+树块，list=条目，text/seo=text）
    const acceptedTexts = []
    for (const r of sectionResults) {
      if (!r.data) continue
      if (r.shape === 'section') acceptedTexts.push(r.data.title, ...lib.treeBlocks(lib.mdToDoc(r.data.body_md)))
      else if (r.shape === 'sections') acceptedTexts.push(...r.data.items.flatMap(it => [it.heading, ...lib.treeBlocks(lib.mdToDoc(it.body_md))]))
      else if (r.shape === 'list') acceptedTexts.push(...r.data.items)
      else if (r.data.text) acceptedTexts.push(r.data.text)
    }
    return acceptedTexts.map(t => lib.normalizeText(t)).join('\n')
  }
  // 按行判（2026-08-18 修）：整段匹配对多行块永远误报（行进树后分块、拼不回原样；清单块的「- 」标记同理）。
  // 一段有任一行不在已收文字里即算未用，preview 直接指到缺的那几行；剥行首标记与树侧口径对齐。
  const missingOf = (p, hay) => p.text.split('\n').map(x => lib.stripImgMarkers(x).trim()).filter(Boolean)
    .filter(line => !hay.includes(lib.normalizeText(lib.stripMdMarkers(line))))
  const computeUnused = () => {
    const hay = acceptedHay()
    return paragraphs
      .map(p => {
        const missing = missingOf(p, hay)
        return missing.length ? { n: p.n, preview: missing.join(' ').slice(0, 40) } : null
      })
      .filter(Boolean)
  }
  report.unused = computeUnused()

  // 强制安置（「我已整理好」模式，防丢兜底，2026-08-18）：用户铁律=内容全部有用、一段不许丢。
  // 补烧后仍有未用段落 → AI 必须逐段指定并入哪个「已有内容的格」（没有"没有"选项；段落只许整段并入不许拆）；
  // 无效分配重试 1 次（喂回原因）；仍败 → 确定性兜底：按原顺序并入最后一个有内容的格。
  // 安置位置是模型的次优判断，报告标出、人审编辑器可挪。
  if (strict && !noBackfill && report.unused.length) {
    const filled = sectionResults.filter(r => r.data && (r.shape === 'section' || r.shape === 'sections'))
    if (filled.length) {
      // 只安置每段「未用的行」：部分行已入格的段整段并入，会把已用行复制第二份（自检发现的行级防重）
      const hay0 = acceptedHay()
      const orphans = report.unused
        .map(u => paragraphs.find(p => p.n === u.n))
        .filter(Boolean)
        .map(p => ({ n: p.n, text: missingOf(p, hay0).join('\n') }))
        .filter(o => o.text)
      const cellList = filled.map(r => `- ${r.key}${catalog.find(c => c.key === r.key)?.desc ? `（${catalog.find(c => c.key === r.key).desc}）` : ''}`).join('\n')
      const placeMsgs = [
        { role: 'system', content: RULES },
        { role: 'user', content: `名称：${productName}\n下列原文内容尚未进入任何格子。用户铁律：内容全部有用、一个字都不许丢。请为每段指定并入哪个格子（只能从下列已有内容的格子里选，没有"没有"选项；内容只许整段并入，不许拆）：\n${cellList}\n\n返回 JSON：{"place":[{"n":段号,"key":"格名"}，每段一条]}\n\n段落：\n${orphans.map(p => `第${p.n}段：${p.text}`).join('\n\n')}` },
      ]
      let placement = null, placeErr = ''
      for (let attempt = 0; attempt < 2 && !placement; attempt++) {
        if (attempt === 1) placeMsgs.push({ role: 'user', content: `上次返回被代码拒收：${placeErr}。请重发。` })
        try {
          const v = await callAI(placeMsgs, 'place')
          const list = Array.isArray(v?.place) ? v.place : null
          if (!list) { placeErr = '返回结构非法（须为 {place:[…]}）'; continue }
          const badKey = list.find(x => !filled.some(r => r.key === x.key))
          if (badKey) { placeErr = `格名不在可选清单：${badKey.key}`; continue }
          const badN = list.find(x => !orphans.some(p => p.n === x.n))
          if (badN) { placeErr = `段号不在未用清单：${badN.n}（只许分配未用段落，不许动已入格的）`; continue }
          const missed = orphans.filter(p => !list.some(x => x.n === p.n))
          if (missed.length) { placeErr = `漏分配段：${missed.map(p => p.n).join('、')}（每段都必须有去处）`; continue }
          placement = list
        } catch (e) { placeErr = `调用失败：${e.message}` }
      }
      const placedKeys = new Set()
      const appendTo = (key, texts) => {
        const r = sectionResults.find(x => x.key === key && x.data)
        if (!r) return
        if (r.shape === 'section') r.data.body_md += '\n\n' + texts.join('\n\n')
        else if (r.shape === 'sections') r.data.items[r.data.items.length - 1].body_md += '\n\n' + texts.join('\n\n')
        placedKeys.add(key)
        const rec = report.sections.find(s => s.key === key)
        if (rec && !rec.issues.some(i => i.includes('强制安置'))) rec.issues.push('含强制安置段落（防丢兜底），位置请人工核对')
      }
      if (placement) {
        const byKey = new Map()
        for (const x of placement) {
          const p = orphans.find(q => q.n === x.n)
          if (!p) continue
          if (!byKey.has(x.key)) byKey.set(x.key, [])
          byKey.get(x.key).push(p.text)
        }
        for (const [key, texts] of byKey) appendTo(key, texts)
      } else {
        appendTo(filled[filled.length - 1].key, orphans.map(p => p.text))
        report.notes.push(`强制安置的自动分配失败（${placeErr}），未用段落已按原顺序兜底并入最后一个有内容的格，位置请人工核对`)
      }
      report.notes.push(`强制安置 ${orphans.length} 段（防丢兜底：并入 ${[...placedKeys].join('、') || '无'}），位置请人工核对`)
      report.unused = computeUnused()
    }
  }

  const json = await lib.assemble({ slug, productName, family: resolved, sectionResults, imagePool: images, example })
  json.page.template = kitName // 草稿自带套件名：路由按它派发（writeDraft 的 ??= 不覆盖）
  if (resolved === 'products') {
    if (!images.length) report.notes.push('图池为空：gallery 缺席（known-leftover）')
    // 「hero 图 v1 不烧」「trail 人工确认」是每次必发的恒提示——告警疲劳（每次都喊=没喊），
    // 已挪控制台静态常驻区（burn-console.html），不进 per-run 报告
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
// warns 出参收「提示」（不收进返回值）：相似级判定（标题/heading/标语像不像）只提示不拒收——
// 硬拒收只留给确定判定（子串有无/白名单/重叠/schema）；概率判定硬拒会误杀正文合格的整格（2026-08-17 裁定）
// strict=true（「我已整理好」模式）：verbatim 级从「子串即过」升为「整行才算搬运」（verifyTreeStrict），防切碎
export function verifyByShape(spec, data, src, productName, paragraphs, warns = [], strict = false) {
  const firstLines = paragraphs.map(p => p.text.split('\n')[0])
  try {
    if (spec.shape === 'section') {
      if (!data?.title || !data?.body_md) return '缺 title 或 body_md'
      if (lib.hasImgMarker(data.title) || lib.hasImgMarker(data.body_md)) return '配图标记是图池元数据不是正文，删去后重发'
      const v = strict ? lib.verifyTreeStrict(lib.mdToDoc(data.body_md), src) : lib.verifyTree(lib.mdToDoc(data.body_md), src)
      if (!v.ok) return strict
        ? `只许整行搬运（整段/整行），不许截半句或跳行拼接：「${v.failures[0].slice(0, 40)}」`
        : `原文里找不到：「${v.failures[0].slice(0, 40)}」`
      if (!lib.similarToAny(data.title, [...firstLines, ...paragraphs.map(p => p.text)], 0.85)
        && lib.similarity(data.title, productName) < 0.85)
        warns.push(`标题与原文及产品名都不像：「${data.title}」`)
      return null
    }
    if (spec.shape === 'list') {
      if (!Array.isArray(data?.items) || !data.items.length) return 'items 为空'
      const badType = data.items.find(t => typeof t !== 'string' || !t.trim())
      if (badType !== undefined) return 'items 含非字符串或空条目'
      if (data.items.some(t => lib.hasImgMarker(t))) return '配图标记是图池元数据不是正文，删去后重发'
      if (spec.level === 'verbatim') {
        if (strict) {
          const { whole } = lib.lineAtom(src)
          const badItem = data.items.find(t => !whole(t, false)) // 条目粒度=一整行，禁拼接
          if (badItem) return `只许整行搬运（条目须为原文一整行）：「${badItem.slice(0, 40)}」`
        } else {
          const hay = lib.normalizeText(src)
          const badItem = data.items.find(t => !hay.includes(lib.normalizeText(t)))
          if (badItem) return `原文里找不到：「${badItem.slice(0, 40)}」`
        }
      }
      return null
    }
    if (spec.shape === 'text') {
      if (!data?.text) return '缺 text'
      if (lib.hasImgMarker(data.text)) return '配图标记是图池元数据不是正文，删去后重发'
      if (spec.level === 'verbatim') {
        if (strict) {
          const { whole } = lib.lineAtom(src)
          if (!whole(data.text)) return `只许整行搬运（整段/整行），不许截半句或跳行拼接：「${data.text.slice(0, 40)}」`
        } else if (!lib.normalizeText(src).includes(lib.normalizeText(data.text)))
          return `原文里找不到：「${data.text.slice(0, 40)}」`
      }
      if (spec.level === 'similar'
        && !lib.similarToAny(data.text, firstLines, 0.85)
        && lib.similarity(data.text, productName) < 0.85)
        warns.push(`与原文及产品名都不像：「${data.text}」`)
      return null
    }
    if (spec.shape === 'sections') {
      if (!Array.isArray(data?.items) || !data.items.length) return 'items 为空'
      for (const [i, it] of data.items.entries()) {
        if (!it?.heading || !it?.body_md) return `第 ${i + 1} 项缺 heading 或 body_md`
        if (lib.hasImgMarker(it.heading) || lib.hasImgMarker(it.body_md)) return `第 ${i + 1} 项配图标记是图池元数据不是正文，删去后重发`
        const v = strict ? lib.verifyTreeStrict(lib.mdToDoc(it.body_md), src) : lib.verifyTree(lib.mdToDoc(it.body_md), src)
        if (!v.ok) return strict
          ? `第 ${i + 1} 项只许整行搬运（整段/整行），不许截半句或跳行拼接：「${v.failures[0].slice(0, 40)}」`
          : `第 ${i + 1} 项原文里找不到：「${v.failures[0].slice(0, 40)}」`
        if (!lib.similarToAny(it.heading, [...firstLines, ...paragraphs.map(p => p.text)], 0.85))
          warns.push(`第 ${i + 1} 项标题与原文不像：「${it.heading}」`)
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
export function writeDraft(json, slug, site = SITE) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('slug 非法（小写字母数字连字符）')
  const famDir = json.page.type === 'post' ? 'posts' : 'products'
  let final = slug, n = 2
  while (existsSync(publishedPath(site, `${famDir}/${final}`)) || existsSync(draftPath(site, `${famDir}/${final}`))) final = `${slug}-${n++}`
  json.page.slug = `${famDir}/${final}`
  json.page.status = 'draft'
  const kits = lib.scanKits(COMPONENTS)
  const kit = kits.find(k => k.family === famDir && k.name === json.page.template) // 优先按草稿声明的套件（多套件族）
    ?? kits.find(k => k.family === famDir && k.complete && k.name === lib.canonicalKitOf(kits, famDir)) // 无声明回通用件约定
  if (!kit) throw new Error(`页族「${famDir}」无完整套件，无法落 draft`)
  json.page.template ??= basename(kit.dir) // 草稿必须自带 template：路由按它 glob 套件（缺则预览构建炸）
  const meta = lib.loadMeta(join(kit.dir, 'meta.json'))
  for (const c of meta) { // 形态驱动：固定段验根树，重复章节验每项树
    if (c.shape === 'section' && json[c.key]) lib.validateDoc(json[c.key].body, `${c.key}.body`)
    else if (c.shape === 'sections')
      for (const [idx, s] of (lib.getIn(json, c.key) ?? []).entries()) lib.validateDoc(s.body, `${c.key}[${idx}].body`)
  }
  writeWorkspaceDraft(site, `${famDir}/${final}`, { baseRevision: null, content: json })
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
    const { json, report } = await burn({ ...input, slug: opt('slug'), productName: opt('name'), mode: has('organized') ? 'organized' : 'raw' })
    console.log(JSON.stringify(report, null, 2))
    if (has('save')) console.log('已落 draft:', writeDraft(json, opt('slug')))
    else console.log('（未落盘；加 --save 落 draft）')
  } catch (e) { console.error('❌ ' + e.message); process.exit(1) }
}
