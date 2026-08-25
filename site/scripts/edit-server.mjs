#!/usr/bin/env node
// 编辑服务（8092）：静态预览 + 编辑层注入 + 契约写回端点。
// 写回链：revision/契约校验 → 原子落盘 → 原子替换构建产物 → 响应。
import http from 'node:http'
import { readFileSync, writeFileSync, existsSync, statSync, rmSync, mkdirSync, renameSync } from 'node:fs'
import { join, dirname, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { runPipeline, adoptMirror, approvePage, translateAll, consoleData } from '../src/i18n-pipeline.mjs'
import { loadTm, saveTm, upsert, loadConfig, saveConfig } from '../src/i18n-tm.mjs'
import { loadTerms, saveTerms } from '../src/i18n-terms.mjs'
import { projectPage, PENDING_CLASS, FAILED_CLASS, UNTRANSLATED_CLASS } from '../src/i18n-project.mjs'
import { fp } from '../src/i18n-sent.mjs'
import { logEvent } from '../src/i18n-events.mjs'
import { scanPages } from '../src/i18n.mjs'
import { collectUnits } from '../src/i18n-collect.mjs'
import { createDeepseekCaller } from '../src/deepseek.mjs'
import { burn, writeDraft } from './deepseek-burn.mjs'
import { scanKits } from '../src/burn-lib.mjs'
import { bindHost, accessUrls, lanHostAllowed } from './lan.mjs'
import { prepareWriteback } from '../src/writeback-request.mjs'
import { writeJsonAtomic } from '../src/content-revision.mjs'
import { createEditContext, editContextScript, previewWorkspaceChanges } from '../src/edit-context.mjs'
import { WritebackError } from '../src/writeback-core.mjs'
import { loadEditContract } from '../src/edit-contract.mjs'
import { assetUploadTarget } from '../src/asset-config.mjs'
import sharp from 'sharp'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
if (process.cwd() !== SITE) process.chdir(SITE) // TM/术语/流水线按 process.cwd() 寻址——从仓库根启动会读错位/写幽灵文件，锚回 site/
const DIST = join(SITE, 'dist-edit') // 编辑/预览服「含草稿」产物（R33）；生产站另服 dist
const PORT = Number(process.env.PORT) || 8092 // 可 PORT=8093 并存冒烟（默认不变）
const HOST = bindHost('0.0.0.0') // 局域网可访问；HOST=127.0.0.1 缩回仅本机（配 DEEPSEEK_API_KEY 时建议缩回）
const PREVIEWS = new Map() // 烧制预览暂存（内存，重启即清；上限 20 份 FIFO）
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4' }

// 注入编辑 UI（编辑服务专用；生产 dist 永远干净）
const INJECT = `
<div class="edl-ui edl-pill">
  <button id="edlToggle">✏️ 开始编辑</button>
  <button id="edlMode" hidden>工具条：开</button>
  <button id="edlSave" hidden>💾 保存…</button>
  <span id="edlDirty" style="align-self:center;font-size:12px"></span>
</div>
<div class="edl-ui edl-pop" id="edlImgPop" hidden>
  <div class="edl-pop-title">图片字段</div>
  <label>图片地址 <input id="edlImgSrc" type="text"></label>
  <label>alt <input id="edlImgAlt" type="text"></label>
  <div class="edl-pop-row">
    <label class="edl-file">选本地图…<input id="edlImgFile" type="file" accept="image/*" hidden></label>
    <button id="edlImgApply">应用</button>
    <button id="edlImgClose">关闭</button>
  </div>
</div>
<div class="edl-ui edl-pop" id="edlLinkPop" hidden>
  <div class="edl-pop-title">链接地址</div>
  <label>地址 <input id="edlLinkHref" type="text"></label>
  <div class="edl-pop-row">
    <button id="edlLinkApply">应用</button>
    <button id="edlLinkClose">关闭</button>
  </div>
</div>
<div class="edl-ui edl-modal" id="edlModal" hidden>
  <div class="edl-modal-body">
    <div class="edl-modal-head"><b>保存确认</b><span>以下改动将写回 JSON（过 schema 校验 → 落盘 → 重建页面）</span><button id="edlModalClose">✕</button></div>
    <div id="edlModalContent"></div>
    <div class="edl-modal-foot">
      <button id="edlSaveDraft" class="edl-btn-ghost">存草稿</button>
      <button id="edlSavePublish" class="edl-btn-main">发布</button>
    </div>
  </div>
</div>
<style>
.edl-ui[hidden]{display:none!important}
.edl-ui{font:14px/1.4 -apple-system,"PingFang SC",sans-serif;box-sizing:border-box}
.edl-pill{position:fixed;right:20px;bottom:58px;z-index:99999;background:#1f2430;border-radius:999px;padding:6px;box-shadow:0 6px 24px rgba(0,0,0,.35);display:flex;gap:6px}
.edl-pill button{border:0;border-radius:999px;padding:8px 16px;background:transparent;color:#fff;cursor:pointer;font-size:14px}
.edl-pill button:hover{background:rgba(255,255,255,.12)}
#edlToggle{background:#2563eb}
#edlSave{background:#16a34a}
body.edl-on [data-field]:hover{outline:2px dashed rgba(37,99,235,.55);outline-offset:2px;cursor:text}
body.edl-on img[data-field]:hover{cursor:pointer}
body.edl-on .edl-edit-lift{z-index:1!important}
body.edl-on .edl-edit-pointer{pointer-events:auto!important}
body.edl-on [data-edit-reveal]{display:block!important;visibility:visible!important;opacity:1!important;height:auto!important;max-height:none!important;overflow:visible!important}
body.edl-on [data-edit-overlay]{pointer-events:none!important}
body.edl-on [data-edit-overlay] [data-field],body.edl-on [data-edit-overlay] [data-edit-key]{pointer-events:auto!important}
body.edl-on [data-field].edl-active{outline:2px solid rgba(37,99,235,.9);outline-offset:2px}
body.edl-on .edl-list-active{outline:2px solid rgba(37,99,235,.9);outline-offset:2px}
body.edl-on .edl-new-item{min-height:1.5em}
body.edl-on .edl-new-item [data-item-field]:empty{display:inline-block;min-width:4rem;min-height:1.5em;outline:1px dashed rgba(37,99,235,.45);outline-offset:2px}
.ProseMirror{outline:none}.ProseMirror:focus{outline:none}
body.edl-on .edl-active > .ProseMirror{font:inherit!important;color:inherit!important;line-height:inherit!important;letter-spacing:inherit!important;text-align:inherit!important;text-transform:inherit!important;text-indent:inherit!important;background:none!important;padding:0!important;margin:0!important}
.ProseMirror p{margin:0 0 .5em}.ProseMirror table{border-collapse:collapse}
.ProseMirror img{max-width:100%}
.ProseMirror img.ProseMirror-selectednode{outline:2px solid #2563eb}
.ProseMirror .selectedCell{background:rgba(37,99,235,.12)}
.edl-toolbar{position:fixed;top:66px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;gap:2px;background:#1f2430;border-radius:8px;padding:4px;box-shadow:0 4px 16px rgba(0,0,0,.3)}
.edl-toolbar button{border:0;background:transparent;color:#fff;padding:5px 9px;border-radius:5px;cursor:pointer;font-size:13px}
.edl-toolbar button:hover{background:rgba(255,255,255,.15)}
.edl-tablechip{position:fixed;z-index:99998;display:flex;gap:4px}
.edl-tablechip button{border:0;border-radius:6px;background:#2563eb;color:#fff;padding:4px 10px;font-size:12px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)}
[data-repeat].edl-zoneflash{outline:2px dashed rgba(37,99,235,.75);outline-offset:3px}
.edl-itemmenu{position:fixed;z-index:9990;display:none;gap:3px}
.edl-itemmenu button{height:20px;border-radius:10px;border:0;padding:0 7px;font-size:11px;line-height:1;cursor:pointer;color:#fff;background:#2563eb;box-shadow:0 2px 6px rgba(0,0,0,.25)}
.edl-itemmenu button[data-op="del"]{background:#ef4444}
.edl-imgchip{position:fixed;z-index:99998;display:none;gap:4px}
.edl-imgchip button{border:0;border-radius:6px;background:#2563eb;color:#fff;padding:4px 10px;font-size:12px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)}
.edl-imgchip button[data-op="del"]{background:#ef4444}
.edl-pop{position:fixed;z-index:99999;background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.3);padding:14px;width:340px}
.edl-pop-title{font-weight:600;margin-bottom:8px}
.edl-pop label{display:block;font-size:12px;color:#555;margin-bottom:8px}
.edl-pop input[type=text]{width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:6px;margin-top:3px}
.edl-pop-row{display:flex;gap:8px;align-items:center}
.edl-pop-row button{border:0;border-radius:6px;padding:6px 14px;cursor:pointer;background:#2563eb;color:#fff}
.edl-pop-row button#edlImgClose{background:#e5e7eb;color:#333}
.edl-file{font-size:12px;color:#2563eb;cursor:pointer;text-decoration:underline}
.edl-modal{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center}
.edl-modal-body{background:#fff;border-radius:14px;width:min(860px,92vw);max-height:84vh;overflow:auto;padding:18px 22px}
.edl-modal-head{display:flex;gap:12px;align-items:center;margin-bottom:12px}
.edl-modal-head span{font-size:12px;color:#777;flex:1}
.edl-modal-head button{border:0;background:#e5e7eb;border-radius:6px;padding:4px 10px;cursor:pointer}
.edl-modal-foot{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}
.edl-btn-main{border:0;border-radius:6px;padding:8px 18px;cursor:pointer;background:#2563eb;color:#fff}
.edl-btn-ghost{border:0;border-radius:6px;padding:8px 18px;cursor:pointer;background:#e5e7eb;color:#333}
.edl-pv{border:1px solid #eee;border-radius:10px;margin-bottom:10px;overflow:hidden}
.edl-pv-head{display:flex;justify-content:space-between;background:#f6f7f9;padding:6px 12px;font-size:12px}
.edl-pv-head span{color:#888}
.edl-pv pre{margin:0;padding:10px 12px;font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:220px;overflow:auto}
.edl-diff{max-height:260px;overflow:auto;padding:6px 0}
.edl-diff div{padding:2px 12px;font-size:12px;white-space:pre-wrap;word-break:break-all;line-height:1.6}
.edl-add{color:#16a34a;background:#f0fdf4}
.edl-del{color:#dc2626;background:#fef2f2;text-decoration:line-through}
.edl-note{color:#999;padding:6px 12px;font-size:12px}
.${PENDING_CLASS}{background:#fef9c3;outline:1px dashed #eab308;border-radius:2px}
.${UNTRANSLATED_CLASS}{background:#fee2e2;outline:1px dashed #dc2626;border-radius:2px}
.${FAILED_CLASS}{background:#fecaca;outline:1px solid #b91c1c;border-radius:2px}
.${FAILED_CLASS}{background:#fee2e2;outline:1px dashed #dc2626;border-radius:2px}
</style>
<script src="/__edit/edit-layer.js"></script>`

async function rebuild() {
  const run = (args, env = {}) => new Promise((res, rej) => {
    const c = spawn(process.execPath, args, { cwd: SITE, stdio: 'inherit', env: { ...process.env, ...env } })
    c.on('exit', code => (code === 0 ? res() : rej(new Error(args[args.length - 1] + ' 退出码 ' + code))))
  })

  const buildOutput = async (out, env = {}) => {
    const staging = `${out}-next-${process.pid}`
    const previous = `${out}-previous-${process.pid}`
    rmSync(join(SITE, staging), { recursive: true, force: true })
    rmSync(join(SITE, previous), { recursive: true, force: true })
    try {
      await run([join(SITE, 'node_modules/astro/bin/astro.mjs'), 'build'], { ...env, BUILD_OUT: staging })
      await run([join(SITE, 'scripts/link-assets.mjs')], { ...env, BUILD_OUT: staging })

      const finalDir = join(SITE, out)
      const stagingDir = join(SITE, staging)
      const previousDir = join(SITE, previous)
      if (existsSync(finalDir)) renameSync(finalDir, previousDir)
      try {
        renameSync(stagingDir, finalDir)
      } catch (error) {
        if (existsSync(previousDir)) renameSync(previousDir, finalDir)
        throw error
      }
      rmSync(previousDir, { recursive: true, force: true })
    } finally {
      rmSync(join(SITE, staging), { recursive: true, force: true })
      rmSync(join(SITE, previous), { recursive: true, force: true })
    }
  }

  // 始终在旁路目录完成构建，再同步换入；后台翻译重建期间编辑页不会短暂 404。
  await buildOutput('dist')
  await buildOutput('dist-edit', { INCLUDE_DRAFTS: '1' })
}

// 重建串行链：/__save、烧制落盘、后台翻译流水线共用一条链排队——防两个 astro build 并发写同一 outDir
let rebuildChain = Promise.resolve()
const queueRebuild = () => { rebuildChain = rebuildChain.catch(() => {}).then(rebuild); return rebuildChain }
const contentChains = new Map()
function queueContentWrite(file, operation) {
  const previous = contentChains.get(file) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(operation)
  contentChains.set(file, current)
  return current.finally(() => { if (contentChains.get(file) === current) contentChains.delete(file) })
}
let translateAllBusy = false // 全站送翻防重入闸（双击防护）
const pageBusy = new Set() // 单页送翻防重入闸（pageId|lang）

const server = http.createServer(async (req, res) => {
  try {
    // 评审 F3（局域网版）：Host 白名单——拦跨站 CSRF（恶意网页 no-cors 直打本机端口）与
    // DNS rebinding（改 Host 名读 GET）。本机名/IP 字面量/mDNS .local 放行，保证局域网访问
    // 的同时不把任意公网域名放进来；特殊主机名可用 ALLOWED_HOSTS=host1,*.example.com。
    if (!lanHostAllowed(req.headers.host ?? '')) { res.writeHead(403); res.end('403 host not allowed'); return }
    if (req.method === 'POST' && req.url === '/__preview-save') {
      let body = ''
      for await (const chunk of req) body += chunk
      const payload = JSON.parse(body)
      if (!['draft', 'publish'].includes(payload.intent)) {
        throw new WritebackError('INVALID_INTENT', `保存意图非法: ${payload.intent || ''}`)
      }
      const preview = previewWorkspaceChanges(SITE, payload)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        ok: true,
        intent: payload.intent,
        diff: preview.diff,
        hasDraft: preview.workspace.hasDraft,
        hasPublished: preview.workspace.hasPublished,
        revision: preview.workspace.workingRevision,
        publishedRevision: preview.workspace.publishedRevision,
      }))
      return
    }
    if (req.method === 'POST' && req.url === '/__save') {
      let body = ''
      for await (const chunk of req) body += chunk
      const payload = JSON.parse(body)
      const { slug, status, patches, changes, revision } = payload
      if (!/^[\w/-]+$/.test(slug || '') || slug.includes('..')) throw new Error('slug 非法')
      // slug = 内容相对路径（posts/xxx、en/posts/xxx）——直接映射 content/<slug>.json，zh/镜像无歧义
      const rel = slug + '.json'
      const file = join(SITE, 'content', rel)
      if (!existsSync(file)) throw new Error('页面不存在: ' + slug)
      const segments = rel.split('/')
      const saved = await queueContentWrite(file, async () => {
        const bytes = readFileSync(file)
        const prepared = prepareWriteback({
          site: SITE,
          bytes,
          expectedRevision: revision,
          ...(changes !== undefined ? { changes } : { patches: patches ?? [] }),
          status,
        })
        if (segments.length === 3) {
          // 镜像（en/posts/xxx.json）：人审直改 → TM approved → 重投影（骨架恒 ≡ 源树）
          const [lang, , pageId] = [segments[0], segments[1], segments[2].replace(/\.json$/, '')]
          const srcFile = join(SITE, 'content', segments[1], `${pageId}.json`)
          const srcJ = JSON.parse(readFileSync(srcFile, 'utf8'))
          const tm = loadTm(srcJ.page.lang, lang)
          const { n, skipped } = adoptMirror(prepared.data, srcJ, tm, lang)
          const existingStatus = status !== undefined ? status : prepared.data.page.status ?? 'draft'
          const mirror = projectPage(srcJ, tm, 'full', { lang, existingStatus, existingTrail: prepared.data.breadcrumb?.trail })
          const written = writeJsonAtomic(file, mirror)
          if (n || skipped) console.log(`  [i18n] 镜像人审写回 ${n} 句${skipped ? `（${skipped} 句段错位被跳过：整段重写保持句数，或用审阅页通过按钮）` : ''}`)
          return { revision: written.revision, i18n: { adopted: n, skipped } }
        }
        const written = writeJsonAtomic(file, prepared.data)
        return { revision: written.revision }
      })
      if (segments.length !== 3 && status === 'published') {
        // zh 源发布：后台流水线——整页送翻可达分钟级，同步等会卡死编辑器保存响应（问题 #6）。
        // 完成后自己排队重建；失败留事件+console（下次发布/手动送翻会再跑）。
        const pageId = segments[segments.length - 1].replace(/\.json$/, '')
        const cfg = loadConfig()
        const callAI = process.env.DEEPSEEK_API_KEY ? createDeepseekCaller() : null
        ;(async () => {
          for (const lang of Object.keys(cfg.review)) {
            try {
              const r = await runPipeline(pageId, { lang, translate: cfg.auto && !!callAI, callAI })
              console.log(`  [i18n] 流水线 ${pageId}→${lang}: 新翻 ${r.translated} 失败 ${r.failed} 待审 ${r.pending}`)
            } catch (e) {
              console.error(`  [i18n] 流水线失败 ${pageId}→${lang}: ${e.message}`)
              logEvent(pageId, 'pipeline-error', { lang, error: e.message }) // 硬失败留痕——控制台/事件侧可见
            }
          }
          try { await queueRebuild() } catch (e) { console.error(`  [i18n] 流水线后重建失败 ${pageId}: ${e.message}`) }
        })()
      }
      let rebuildError = null
      try { await queueRebuild() } catch (e) { rebuildError = e.message } // 评审 M4：同镜像分支——保存成功与重建失败分开报
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        ok: true,
        saved: true,
        rebuilt: !rebuildError,
        revision: saved.revision,
        ...(saved.i18n ? { i18n: saved.i18n } : {}),
        ...(rebuildError ? { rebuildError } : {}),
      }))
      return
    }
    if (req.method === 'POST' && req.url.startsWith('/__upload')) {
      const uploadUrl = new URL(req.url, 'http://x')
      const name = uploadUrl.searchParams.get('name') || ''
      const slug = uploadUrl.searchParams.get('slug') || ''
      if (!/^[\w/-]+$/.test(slug) || slug.includes('..')) throw new Error('上传缺少合法 slug')
      const pageFile = join(SITE, 'content', `${slug}.json`)
      if (!existsSync(pageFile)) throw new Error('上传页面不存在: ' + slug)
      const page = JSON.parse(readFileSync(pageFile, 'utf8')).page
      const contract = loadEditContract(SITE, page)
      let base = name.replace(/[^\w.-]/g, '-').replace(/^-+/, '')
      if (!base.replace(/\.\w+$/, '').replace(/-/g, '')) base = 'img-' + Date.now() + (base.match(/\.\w+$/)?.[0] || '.jpg') // 纯中文名兜底
      if (!/\.(jpe?g|png|webp)$/i.test(base)) throw new Error('只收 jpg/png/webp')
      const chunks = []
      for await (const c of req) chunks.push(c)
      const buf = Buffer.concat(chunks)
      let out = base
      let target = assetUploadTarget(SITE, contract.assets, out)
      mkdirSync(target.diskDir, { recursive: true })
      for (let i = 2; existsSync(join(target.diskDir, out)); i++) {
        out = base.replace(/(\.\w+)$/, `-${i}$1`)
        target = assetUploadTarget(SITE, contract.assets, out)
      }
      let img = sharp(buf).resize({ width: 2560, withoutEnlargement: true }) // 压缩闸门
      if (/\.jpe?g$/i.test(out)) img = img.jpeg({ quality: 82 })
      else if (/\.png$/i.test(out)) img = img.png({ compressionLevel: 9 })
      else img = img.webp({ quality: 82 })
      await img.toFile(join(target.diskDir, out))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, src: target.publicUrl, publicUrl: target.publicUrl, storageValue: target.storageValue }))
      return
    }
    if (req.method === 'POST' && req.url === '/__i18n/tm') {
      let body = ''
      for await (const chunk of req) body += chunk
      const { text, translation, src = 'zh-CN', tgt = 'en' } = JSON.parse(body)
      if (!text || !translation) throw new Error('text 与 translation 必填')
      const tm = loadTm(src, tgt)
      upsert(tm, fp(text), { text, translation, status: 'approved', origin: 'human', updatedAt: new Date().toISOString() })
      saveTm(src, tgt, tm)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, total: Object.keys(tm.sentences).length }))
      return
    }
    if (req.method === 'POST' && req.url === '/__i18n/config') {
      let body = ''
      for await (const chunk of req) body += chunk
      const { auto } = JSON.parse(body)
      if (typeof auto !== 'boolean') throw new Error('auto 须为布尔')
      saveConfig({ auto })
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })); return
    }
    if (req.method === 'POST' && req.url === '/__i18n/terms') {
      let body = ''
      for await (const chunk of req) body += chunk
      const { src = 'zh-CN', tgt = 'en', lock, map } = JSON.parse(body)
      saveTerms(src, tgt, { lock, map }) // 校验不过会抛，走统一 400
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })); return
    }
    if (req.method === 'POST' && req.url === '/__i18n/translate-all') {
      if (!process.env.DEEPSEEK_API_KEY) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '未配置 DEEPSEEK_API_KEY' })); return }
      if (translateAllBusy) { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '全站翻译已在跑，等它完成再点' })); return }
      translateAllBusy = true // 防重入：双击=两个并发循环（TM 已有合并防护，这里再省一份钱）
      try {
        const results = []
        for (const lang of Object.keys(loadConfig().review)) results.push(...await translateAll({ lang, callAI: createDeepseekCaller() })) // 语言跟 cfg.review 走，与发布钩子同口径
        await queueRebuild()
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, results }))
      } finally { translateAllBusy = false }
      return
    }
    if (req.method === 'POST' && req.url === '/__i18n/approve') {
      let body = ''
      for await (const chunk of req) body += chunk
      const { pageId, lang = 'en' } = JSON.parse(body)
      const srcPg = scanPages().find(p => p.pageId === pageId && !p.langDir)
      if (!srcPg) throw new Error('页面不存在: ' + pageId)
      const srcJ = JSON.parse(readFileSync(join(SITE, 'content', srcPg.file), 'utf8'))
      const tm = loadTm(srcJ.page.lang, lang)
      const r = approvePage(pageId, lang, tm, () => srcJ)
      await queueRebuild()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, approved: r.approved, remainingFailed: r.remainingFailed, remainingUntranslated: r.remainingUntranslated })); return
    }
    if (req.method === 'POST' && req.url === '/__burn') {
      if (!process.env.DEEPSEEK_API_KEY) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '未配置 DEEPSEEK_API_KEY（服务端环境变量）' })); return }
      let body = ''
      for await (const chunk of req) body += chunk
      const { text, url, slug, productName, family, mode } = JSON.parse(body)
      if ((!text && !url) || !slug || !productName) throw new Error('缺参数：text/url 二选一 + slug + productName')
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('slug 非法')
      console.log(`  [burn] 开始烧制 slug=${slug}`)
      const { json, report, previewHtml } = await burn({ text, url, slug, productName, family, mode })
      console.log(`  [burn] 烧制完成 slug=${slug}`)
      // 预览走暂存+网址（srcdoc 在用户 Chrome 实证空白，换成浏览器任何内核都稳的加载方式）
      const pid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      PREVIEWS.set(pid, previewHtml)
      if (PREVIEWS.size > 20) PREVIEWS.delete(PREVIEWS.keys().next().value) // FIFO 上限 20 份
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, json, report, previewUrl: `/__burn-preview/${pid}` }))
      return
    }
    if (req.method === 'POST' && req.url === '/__burn-save') {
      let body = ''
      for await (const chunk of req) body += chunk
      const { slug, json } = JSON.parse(body)
      if (!json || typeof json !== 'object' || !json.page) throw new Error('json 缺失或非法')
      const final = writeDraft(json, slug) // 撞名加序号 + 全树 schema + 强制 draft
      const famDir = json.page.type === 'post' ? 'posts' : 'products' // 与 writeDraft 分族同口径（文章草稿不再指错族）
      console.log(`  [burn] 落 draft: content/${famDir}/${final}.json`)
      try {
        await queueRebuild()
      } catch (e) {
        rmSync(join(SITE, 'content', famDir, `${final}.json`)) // 毒草稿不留在盘上祸害后续 rebuild
        throw new Error(`落盘成功但重建失败，已自动删除该草稿：${e.message}`)
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, slug: final, editUrl: `/${famDir}/${final}/` }))
      return
    }
    if (req.method === 'POST' && req.url === '/__mirror') {
      // 镜像创建（onboarding 第一步）：克隆源骨架 → 中文占位(未译) → draft → 门禁拦到译完。
      // 与 runPipeline 的重投影创建同源（projectPage 'full'），并排队重建使镜像立即可预览。
      let body = ''
      for await (const chunk of req) body += chunk
      const { pageId, lang = 'en' } = JSON.parse(body)
      if (!/^[\w-]+$/.test(pageId || '')) throw new Error('pageId 非法')
      const srcPg = scanPages().find(p => p.pageId === pageId && !p.langDir)
      if (!srcPg) throw new Error('页面不存在: ' + pageId)
      if (scanPages().some(p => p.pageId === pageId && p.lang === lang)) throw new Error('镜像已存在: ' + lang + '/' + pageId)
      const srcJ = JSON.parse(readFileSync(join(SITE, 'content', srcPg.file), 'utf8'))
      const tm = loadTm(srcJ.page.lang, lang)
      const mirror = projectPage(srcJ, tm, 'full', { lang, existingStatus: 'draft', existingTrail: srcJ.breadcrumb?.trail })
      const file = join(SITE, 'content', lang, srcPg.file)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify(mirror, null, 2) + '\n')
      await queueRebuild()
      // 创建即送翻（用户期望「创建镜像 = 英文版出现」）：auto 开且有 key 时后台跑流水线。
      // 这是用户对该页的显式动作，覆盖 translateAll 的 draft-source 跳过——草稿源页明确要翻就翻。
      const cfg = loadConfig()
      const callAI = process.env.DEEPSEEK_API_KEY ? createDeepseekCaller() : null
      let autoTranslate = 'off'
      if (cfg.auto && callAI) {
        autoTranslate = 'queued'
        ;(async () => {
          try {
            const r = await runPipeline(pageId, { lang, translate: true, callAI })
            console.log(`  [i18n] 镜像后流水线 ${pageId}→${lang}: 新翻 ${r.translated} 失败 ${r.failed} 待审 ${r.pending}`)
          } catch (e) {
            console.error(`  [i18n] 镜像后流水线失败 ${pageId}→${lang}: ${e.message}`)
            logEvent(pageId, 'pipeline-error', { lang, error: e.message })
          }
          try { await queueRebuild() } catch (e) { console.error(`  [i18n] 镜像后重建失败 ${pageId}: ${e.message}`) }
        })()
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, file: 'content/' + lang + '/' + srcPg.file, slug: mirror.page.slug, status: mirror.page.status, rebuilt: true, autoTranslate, noKey: !callAI }))
      return
    }
    if (req.method === 'POST' && req.url === '/__i18n/translate') {
      // 单页送翻（人工救济通道）：覆盖全站批量的 draft-source 跳过；failed 默认重送（I-1）。
      let body = ''
      for await (const chunk of req) body += chunk
      const { pageId, lang = 'en', retryFailed = true } = JSON.parse(body)
      if (!/^[\w-]+$/.test(pageId || '')) throw new Error('pageId 非法')
      if (!process.env.DEEPSEEK_API_KEY) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '未配置 DEEPSEEK_API_KEY' })); return }
      const key = pageId + '|' + lang
      if (pageBusy.has(key)) { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '该页翻译已在跑，等它完成再点' })); return }
      pageBusy.add(key)
      try {
        const callAI = createDeepseekCaller()
        const r = await runPipeline(pageId, { lang, translate: true, retryFailed, callAI })
        let rebuildError = null
        try { await queueRebuild() } catch (e) { rebuildError = e.message } // 评审 M4：译文已落盘，重建失败≠送翻被拒，分开报
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, ...r, ...(rebuildError ? { rebuildError } : {}) }))
      } finally { pageBusy.delete(key) }
      return
    }
    if (req.method === 'POST' && req.url === '/__build') {
      await queueRebuild()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    if (req.method === 'GET' && req.url === '/__templates') {
      const kits = scanKits(join(SITE, 'src/components'))
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(kits))
      return
    }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return }
    if (req.url === '/__edit/edit-layer.js') {
      const js = readFileSync(join(SITE, 'edit-layer/dist/edit-layer.js')) // 先取数再写头——写头后抛错 catch 再 writeHead 会崩进程（评审实证）
      res.writeHead(200, { 'Content-Type': 'text/javascript' })
      res.end(js)
      return
    }
    if (req.url === '/__burn') {
      let html = readFileSync(join(SITE, 'edit-layer/burn-console.html'), 'utf8')
      if (!process.env.DEEPSEEK_API_KEY) html = html.replace('</body>', '<style>body{padding-top:44px}</style><div style="position:fixed;top:0;left:0;right:0;background:#fef2f2;color:#dc2626;padding:10px 16px;font:14px sans-serif;text-align:center;z-index:99999">未配置 DEEPSEEK_API_KEY（服务端环境变量）——配置后重启服务再烧制</div></body>')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }
    if (req.url?.startsWith('/__burn-preview/')) {
      const pid = req.url.split('/').pop()
      const html = PREVIEWS.get(pid)
      if (!html) { res.writeHead(404); res.end('预览不存在或已过期（服务重启即清），请重新烧制'); return }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }
    if (req.url === '/__i18n') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(readFileSync(join(SITE, 'edit-layer/i18n-console.html'), 'utf8'))
      return
    }
    if (req.url === '/__i18n/data') {
      const data = JSON.stringify(consoleData()) // 先取数再写头（同 /__edit 分支注释）
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(data)
      return
    }
    if (req.url?.startsWith('/__i18n/terms')) {
      const u = new URL(req.url, 'http://x')
      const src = u.searchParams.get('src') || 'zh-CN', tgt = u.searchParams.get('tgt') || 'en'
      const data = JSON.stringify(loadTerms(src, tgt)) // 语言码非法在此抛 → 统一 400（先取数再写头，防 headers 已发崩进程）
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(data)
      return
    }
    if (req.method === 'GET' && req.url?.startsWith('/__i18n/review-data')) {
      // 审阅清单数据：该页全部非 approved 单元（未译/拒收/待审）＋字段位置
      const u = new URL(req.url, 'http://x')
      const pageId = u.searchParams.get('pageId')
      const lang = u.searchParams.get('lang') || 'en'
      if (!/^[\w-]+$/.test(pageId || '')) throw new Error('pageId 非法')
      const srcPg = scanPages().find(p => p.pageId === pageId && !p.langDir)
      if (!srcPg) throw new Error('页面不存在: ' + pageId)
      const srcJ = JSON.parse(readFileSync(join(SITE, 'content', srcPg.file), 'utf8'))
      const tm = loadTm(srcJ.page.lang, lang)
      const items = collectUnits(srcJ).map(u => {
        const e = tm.sentences[u.fp]
        const status = e?.status ?? 'untranslated'
        return { field: u.field, path: u.path || '', text: u.text, translation: e?.translation || '', status }
      }).filter(i => i.status !== 'approved')
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true, pageId, lang, items }))
      return
    }
    if (req.url?.startsWith('/__i18n/review/')) {
      // 双页审阅（spec §5）：左=中文现状，右=英文草稿（黄底待审句；就地改+保存=人审写回）
      const u = new URL(req.url, 'http://x')
      const pageId = decodeURIComponent(u.pathname.split('/').pop())
      const lang = u.searchParams.get('lang') || 'en'
      if (!/^[a-z][a-z0-9-]*$/i.test(lang)) throw new Error('lang 非法') // 内联进 iframe/script，白名单形态防注入
      if (!/^[\w-]+$/.test(pageId)) throw new Error('pageId 非法') // 评审 M5：内联进标题/script，同款形态闸（存在性检查之外加一道）
      const srcPg = scanPages().find(p => p.pageId === pageId && !p.langDir)
      if (!srcPg) { res.writeHead(404); res.end('页面不存在'); return }
      const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>审校 ${pageId}</title>
<style>body{margin:0;font:14px -apple-system,"PingFang SC",sans-serif;display:flex;flex-direction:column;height:100vh}
.bar{display:flex;gap:12px;align-items:center;padding:8px 14px;background:#1f2430;color:#fff}
.bar button{border:0;border-radius:6px;padding:8px 18px;background:#16a34a;color:#fff;cursor:pointer}
.bar .tip{font-size:12px;color:#94a3b8}.panes{flex:1;display:flex}.panes iframe{flex:1;border:0;border-right:1px solid #ddd}
.tag{padding:2px 8px;border-radius:4px;background:#fef9c3;color:#854d0e;font-size:12px}
.tag.red{background:#fee2e2;color:#991b1b}
#listbar{max-height:220px;overflow:auto;background:#fff;border-bottom:1px solid #ddd}
#list{display:flex;flex-direction:column;padding:6px 14px}
.item{display:flex;gap:10px;align-items:baseline;padding:4px 8px;border-radius:6px;font-size:13px;margin:1px 0}
.item b{flex:none;font-size:11px;padding:1px 6px;border-radius:4px}
.item .f{flex:none;font-family:monospace;font-size:11px;color:#64748b;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.item .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.item.draft{background:#fefce8}.item.draft b{background:#fef9c3;color:#854d0e}
.item.untranslated{background:#fef2f2}.item.untranslated b{background:#fee2e2;color:#991b1b}
.item.failed{background:#fee2e2}.item.failed b{background:#fecaca;color:#7f1d1d}
.item.ok{color:#16a34a}</style></head>
<body><div class="bar"><b>${pageId}</b><span class="tag">黄底=待审句</span><span class="tag red">红底=未译/拒收句</span>
<span class="tip">左中文现状 · 右英文草稿；下方清单列出全部待处理句（含扁平字段，右键页面里 Ctrl+F 定位）</span>
<button id="ok">✓ 通过并发布</button><span id="msg" class="tip"></span></div>
<div id="listbar"><div id="list"></div></div>
<div class="panes"><iframe src="/${srcPg.slug}/"></iframe><iframe src="/${lang}/${srcPg.slug}/"></iframe></div>
<script>
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LABEL={draft:'待审',untranslated:'未译',failed:'拒收'};
fetch('/__i18n/review-data?pageId=${pageId}&lang=${lang}').then(r=>r.json()).then(d=>{
  const el=document.getElementById('list');
  const items=(d.items||[]).sort((a,b)=>(a.status==='untranslated'||a.status==='failed')&&!(b.status==='untranslated'||b.status==='failed')?-1:0);
  el.innerHTML=items.length
    ?items.map(i=>'<div class="item '+i.status+'"><b>'+LABEL[i.status]+'</b><span class="f">'+esc(i.field)+'</span><span class="t">'+esc(i.text.slice(0,90))+(i.translation?'  →  '+esc(i.translation.slice(0,90)):'')+'</span></div>').join('')
    :'<div class="item ok">✓ 该页没有待处理句</div>';
}).catch(()=>document.getElementById('list').innerHTML='<div class="item failed">清单加载失败</div>');
document.getElementById('ok').onclick=async()=>{const r=await fetch('/__i18n/approve',{method:'POST',body:JSON.stringify({pageId:'${pageId}',lang:'${lang}'})});const j=await r.json();document.getElementById('msg').textContent=j.ok?('已通过 '+j.approved+' 句并发布'+(j.remainingFailed?('；仍有 '+j.remainingFailed+' 句失败'):'')+(j.remainingUntranslated?('；'+j.remainingUntranslated+' 句未翻'):'')):('失败：'+j.error)}</script>
</body></html>`
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }
    let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file = normalize(join(DIST, pathname))
    if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) { res.writeHead(404); res.end('404'); return }
    const ext = extname(file)
    const data = readFileSync(file)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    if (ext === '.html') {
      const slug = pathname.replace(/^\/+|\/+$/g, '')
      let context = ''
      try { context = editContextScript(createEditContext(SITE, slug)) }
      catch (error) {
        if (!['ENOENT', 'CONTRACT_NOT_FOUND'].includes(error?.code)) console.warn(`  [edit] 上下文不可用 ${slug}: ${error.message}`)
      }
      res.end(data.toString().replace('</body>', context + INJECT + '</body>'))
    } else res.end(data)
  } catch (e) {
    // 评审加固：headers 已发（流中途抛错）时再 writeHead 会 ERR_HTTP_HEADERS_SENT 直接崩进程——降级尽力收尾
    if (!res.headersSent) {
      const status = e instanceof WritebackError && e.code === 'REVISION_CONFLICT' ? 409 : 400
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message, ...(e instanceof WritebackError ? { code: e.code, ...e.details } : {}) }))
    } else {
      try { res.end() } catch {}
      console.error(`  [edit] 中途失败 ${req.method} ${req.url}: ${e.message}`)
    }
  }
})
server.requestTimeout = 600_000
const [NODE_MAJOR] = process.versions.node.split('.').map(Number)
if (NODE_MAJOR < 22) console.warn(`⚠ 当前 node ${process.version} <22：astro rebuild 会失败（/__save、/__burn-save 的重建链路），请用 node 22+ 启动本服务`)
server.listen(PORT, HOST, () => {
  console.log(`编辑服务 → ${accessUrls(PORT, '/products/single-girder-eot-cranes/', HOST).join('  ')}`)
  console.log(`  监听：${HOST} · 写回/上传/烧制/翻译端点均可经上面局域网地址访问；HOST=127.0.0.1 缩回仅本机`)
})
