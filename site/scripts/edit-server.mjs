#!/usr/bin/env node
// POC-5 编辑服务（8092）：静态(dist) + 编辑层注入 + /__save 写回端点。
// 写回链：应用补丁 → schema 校验（V4 拒收在此）→ 落盘 → astro build 重建 → 响应。
import http from 'node:http'
import { readFileSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs'
import { join, dirname, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { validateDoc } from '../src/content-schema.mjs'
import { normalizeTree, setIn, splitByHeading, joinByHeading } from '../src/tree-utils.mjs'
import { stampAfterSave } from './i18n-touch.mjs'
import { probe, IMG_DIR } from './img-probe.mjs'
import { burn, writeDraft } from './deepseek-burn.mjs'
import sharp from 'sharp'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(SITE, 'dist-edit') // 编辑/预览服「含草稿」产物（R33）；生产站另服 dist
const PORT = 8092
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
.edl-pill{position:fixed;right:20px;bottom:20px;z-index:99999;background:#1f2430;border-radius:999px;padding:6px;box-shadow:0 6px 24px rgba(0,0,0,.35);display:flex;gap:6px}
.edl-pill button{border:0;border-radius:999px;padding:8px 16px;background:transparent;color:#fff;cursor:pointer;font-size:14px}
.edl-pill button:hover{background:rgba(255,255,255,.12)}
#edlToggle{background:#2563eb}
#edlSave{background:#16a34a}
body.edl-on [data-field]:hover{outline:2px dashed rgba(37,99,235,.55);outline-offset:2px;cursor:text}
body.edl-on img[data-field]:hover{cursor:pointer}
body.edl-on .breadcrumb .current{pointer-events:none}
body.edl-on [data-field].edl-active{outline:2px solid rgba(37,99,235,.9);outline-offset:2px}
.ProseMirror{outline:none}.ProseMirror:focus{outline:none}
body.edl-on .edl-active > .ProseMirror{font:inherit!important;color:inherit!important;line-height:inherit!important;letter-spacing:inherit!important;text-align:inherit!important;text-transform:inherit!important;text-indent:inherit!important;background:none!important;padding:0!important;margin:0!important}
.ProseMirror p{margin:0 0 .5em}.ProseMirror table{border-collapse:collapse}
.ProseMirror img{max-width:100%}
.ProseMirror img.ProseMirror-selectednode{outline:2px solid #2563eb}
.ProseMirror .selectedCell{background:rgba(37,99,235,.12)}
.edl-toolbar{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;gap:2px;background:#1f2430;border-radius:8px;padding:4px;box-shadow:0 4px 16px rgba(0,0,0,.3)}
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
</style>
<script src="/__edit/edit-layer.js"></script>`

async function applyPatches(j, patches) {
  for (const p of patches) {
    if (p.kind === 'html') setIn(j, p.path, p.value)
    else if (p.kind === 'link') setIn(j, p.path, p.href)
    else if (p.kind === 'image') {
      setIn(j, p.path, p.src)
      // alt 兄弟字段存在才写（hero 这类模板派生 alt 的字段不无中生有）
      const keys = p.path.replace(/\.image$/, '.alt').replace(/\[(\d+)\]/g, '.$1').split('.')
      let cur = j
      for (let i = 0; i < keys.length - 1 && cur; i++) cur = cur[keys[i]]
      if (cur && typeof cur === 'object' && 'alt' in cur) setIn(j, keys.join('.').replace(/\.(\d+)\./g, '[$1].'), p.alt)
    }
    else if (p.kind === 'tree') {
      const tree = normalizeTree(p.value)
      validateDoc(tree, p.path) // V4：写坏当场拒收
      setIn(j, p.path, tree)
    }
    else if (p.kind === 'chunk') {
      const cur = p.path.split('.').reduce((o, k) => o?.[k], j)
      const parts = splitByHeading(cur)
      if (!parts[p.index]) throw new Error(`chunk 索引越界: ${p.path}#${p.index}`)
      const tree = normalizeTree(p.value)
      parts[p.index].nodes = tree.content
      const joined = joinByHeading(parts)
      validateDoc(joined, p.path)
      setIn(j, p.path, joined)
    }
    else if (p.kind === 'array') {
      if (!Array.isArray(p.value)) throw new Error(`array 补丁须为数组: ${p.path}`)
      setIn(j, p.path, p.value)
      // 尺寸类字段重探测（增删后索引漂移，直接全列重算，幂等）
      if (p.path === 'components_images') for (const c of j.components_images) if (c.image) Object.assign(c, await probe(c.image))
      if (p.path === 'production_flow.steps') {
        for (const s of j.production_flow.steps) {
          if (!s.image) continue
          const { width, height } = await probe(s.image)
          if (width) s.dataSize = `${width}x${height}`
        }
      }
    }
    else throw new Error(`未知补丁类型: ${p.kind}`)
  }
}

async function rebuild() {
  const run = (args, env = {}) => new Promise((res, rej) => {
    const c = spawn(process.execPath, args, { cwd: SITE, stdio: 'inherit', env: { ...process.env, ...env } })
    c.on('exit', code => (code === 0 ? res() : rej(new Error(args[args.length - 1] + ' 退出码 ' + code))))
  })
  await run([join(SITE, 'node_modules/astro/bin/astro.mjs'), 'build']) // 生产产物 dist（仅 published）
  await run([join(SITE, 'scripts/link-assets.mjs')])
  await run([join(SITE, 'node_modules/astro/bin/astro.mjs'), 'build'], { INCLUDE_DRAFTS: '1', BUILD_OUT: 'dist-edit' }) // 预览产物（含草稿）
  await run([join(SITE, 'scripts/link-assets.mjs')], { INCLUDE_DRAFTS: '1', BUILD_OUT: 'dist-edit' })
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/__save') {
      let body = ''
      for await (const chunk of req) body += chunk
      const { slug, status, patches = [] } = JSON.parse(body)
      if (!/^[\w/-]+$/.test(slug || '') || slug.includes('..')) throw new Error('slug 非法')
      // slug = 内容相对路径（posts/xxx、en/posts/xxx）——直接映射 content/<slug>.json，zh/镜像无歧义
      const rel = slug + '.json'
      const file = join(SITE, 'content', rel)
      if (!existsSync(file)) throw new Error('页面不存在: ' + slug)
      const j = JSON.parse(readFileSync(file, 'utf8'))
      await applyPatches(j, patches)
      if (status !== undefined) {
        if (!['draft', 'published'].includes(status)) throw new Error('status 非法: ' + status)
        j.page.status = status
      }
      writeFileSync(file, JSON.stringify(j, null, 2) + '\n')
      // i18n 保存抬戳（R43/R44）：zh 源 → 名册字段 i18n_rev+1 刷指纹；镜像 → translated_rev 抬到源戳
      const stamped = stampAfterSave(rel, patches.map(p => p.path).filter(Boolean))
      if (stamped) console.log(`  [i18n] ${stamped.kind === 'source' ? '源戳 +1' : '镜像抬戳'}: ${stamped.fields.join(', ')}`)
      await rebuild()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    if (req.method === 'POST' && req.url.startsWith('/__upload')) {
      const name = new URL(req.url, 'http://x').searchParams.get('name') || ''
      let base = name.replace(/[^\w.-]/g, '-').replace(/^-+/, '')
      if (!base.replace(/\.\w+$/, '').replace(/-/g, '')) base = 'img-' + Date.now() + (base.match(/\.\w+$/)?.[0] || '.jpg') // 纯中文名兜底
      if (!/\.(jpe?g|png|webp)$/i.test(base)) throw new Error('只收 jpg/png/webp')
      const chunks = []
      for await (const c of req) chunks.push(c)
      const buf = Buffer.concat(chunks)
      let out = base
      for (let i = 2; existsSync(join(IMG_DIR, out)); i++) out = base.replace(/(\.\w+)$/, `-${i}$1`) // 撞名自动加序号
      let img = sharp(buf).resize({ width: 2560, withoutEnlargement: true }) // 压缩闸门
      if (/\.jpe?g$/i.test(out)) img = img.jpeg({ quality: 82 })
      else if (/\.png$/i.test(out)) img = img.png({ compressionLevel: 9 })
      else img = img.webp({ quality: 82 })
      await img.toFile(join(IMG_DIR, out))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, src: '/assets/img/product/' + out }))
      return
    }
    if (req.method === 'POST' && req.url === '/__burn') {
      if (!process.env.DEEPSEEK_API_KEY) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '未配置 DEEPSEEK_API_KEY（服务端环境变量）' })); return }
      let body = ''
      for await (const chunk of req) body += chunk
      const { text, url, slug, productName, family } = JSON.parse(body)
      if ((!text && !url) || !slug || !productName) throw new Error('缺参数：text/url 二选一 + slug + productName')
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('slug 非法')
      console.log(`  [burn] 开始烧制 slug=${slug}`)
      const { json, report, previewHtml } = await burn({ text, url, slug, productName, family })
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
      console.log(`  [burn] 落 draft: content/products/${final}.json`)
      try {
        await rebuild()
      } catch (e) {
        rmSync(join(SITE, 'content/products', `${final}.json`)) // 毒草稿不留在盘上祸害后续 rebuild
        throw new Error(`落盘成功但重建失败，已自动删除该草稿：${e.message}`)
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, slug: final, editUrl: `/products/${final}/` }))
      return
    }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return }
    if (req.url === '/__edit/edit-layer.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' })
      res.end(readFileSync(join(SITE, 'edit-layer/dist/edit-layer.js')))
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
    let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file = normalize(join(DIST, pathname))
    if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) { res.writeHead(404); res.end('404'); return }
    const ext = extname(file)
    const data = readFileSync(file)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(ext === '.html' ? data.toString().replace('</body>', INJECT + '</body>') : data)
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: e.message }))
  }
})
server.requestTimeout = 600_000
const [NODE_MAJOR] = process.versions.node.split('.').map(Number)
if (NODE_MAJOR < 22) console.warn(`⚠ 当前 node ${process.version} <22：astro rebuild 会失败（/__save、/__burn-save 的重建链路），请用 node 22+ 启动本服务`)
server.listen(PORT, '127.0.0.1', () => console.log(`编辑服务 → http://localhost:${PORT}/products/single-girder-eot-cranes/`))
