#!/usr/bin/env node
// 试衣间装配器(一次性演示): 切真实页面区段 + 注入真实表格段 → dist/_edit-demo/index.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const arg = process.argv[2] // 可选: dist 下相对目录(可带族前缀: posts/xxx; 裸 slug 默认 products/)
const rel = arg ? (arg.includes('/') ? arg : `products/${arg}`) : 'products/single-girder-eot-cranes'
const pagePath = join(root, 'dist', rel, 'index.html')
const tableSrcPath = join(root, 'dist/products/overhead-cranes-for-sale/index.html')
const outDir = join(root, 'dist', arg ? `_edit-demo-${rel.split('/').pop()}` : '_edit-demo')

const page = readFileSync(pagePath, 'utf8')

// 1. 原样取 head 里的 CSS 链接(保持外观逐字节一致)
const cssLinks = [...page.matchAll(/<link rel="stylesheet" href="[^"]+">/g)].map(m => m[0]).join('\n  ')

// 2. 切正文区段: 产品页从 hero 起; 文章页从蓝底标题横幅(.toptitle)起; 都切到 footer 前
const startMark = page.includes('data-template="hero@1"') ? '<section data-template="hero@1"'
  : page.includes('class="toptitle"') ? '<div class="toptitle"'
  : '<div class="breadcrumb"'
const endMark = '<footer id="footer"'
const start = page.indexOf(startMark)
const end = page.indexOf(endMark)
if (start < 0 || end < 0) throw new Error('区段标记没找到')
let body = page.slice(start, end)

// 3. 表格注入仅默认页需要(单梁页无表格段, 从 overhead 借一段); 其它页自带, 跳过
if (!arg) {
  const tableSrc = readFileSync(tableSrcPath, 'utf8')
  const tStart = tableSrc.indexOf('<section data-template="spec-compare@1"')
  const tEnd = tableSrc.indexOf('</section>', tStart)
  if (tStart < 0 || tEnd < 0) throw new Error('表格段标记没找到')
  const tableSection = tableSrc.slice(tStart, tEnd + '</section>'.length)
    .replace('简要技术参数比较', '简要技术参数比较(演示注入的真实表格)')
  const compMark = '<section data-template="components@1"'
  if (!body.includes(compMark)) throw new Error('components 标记没找到')
  body = body.replace(compMark, tableSection + '\n\n\t' + compMark)
}

// 4. 演示 UI(控制丸/浮条/图片浮层/写回预览弹窗) + 演示 CSS
const ui = `
<div class="edl-ui edl-pill">
  <button id="edlToggle">✏️ 开始编辑</button>
  <button id="edlMode" hidden>工具条：开</button>
  <button id="edlPreview" hidden>📄 写回预览</button>
</div>
<div class="edl-ui edl-pop" id="edlImgPop" hidden>
  <div class="edl-pop-title">图片字段</div>
  <label>路径 <input id="edlImgSrc" type="text"></label>
  <label>alt <input id="edlImgAlt" type="text"></label>
  <div class="edl-pop-row">
    <label class="edl-file">选本地图…<input id="edlImgFile" type="file" accept="image/*" hidden></label>
    <button id="edlImgApply">应用</button>
    <button id="edlImgClose">关闭</button>
  </div>
</div>
<div class="edl-ui edl-pop" id="edlLinkPop" hidden>
  <div class="edl-pop-title">链接地址</div>
  <label>href <input id="edlLinkHref" type="text"></label>
  <div class="edl-pop-row">
    <button id="edlLinkApply">应用</button>
    <button id="edlLinkClose">关闭</button>
  </div>
</div>
<div class="edl-ui edl-modal" id="edlModal" hidden>
  <div class="edl-modal-body">
    <div class="edl-modal-head"><b>写回预览</b><span>这些就是要落回 MD 的内容(演示只展示, 不写盘)</span><button id="edlModalClose">✕</button></div>
    <div id="edlModalContent"></div>
  </div>
</div>`

const css = `
/* 试衣间演示样式(全部 edl- 前缀, 与页面样式零耦合) */
.edl-ui[hidden]{display:none!important} /* hidden 属性优先于一切 display 设定(修"弹窗关不掉") */
.edl-ui{font:14px/1.4 -apple-system,"PingFang SC",sans-serif;box-sizing:border-box}
.edl-pill{position:fixed;right:20px;bottom:20px;z-index:99999;background:#1f2430;border-radius:999px;padding:6px;box-shadow:0 6px 24px rgba(0,0,0,.35);display:flex;gap:6px}
.edl-pill button{border:0;border-radius:999px;padding:8px 16px;background:transparent;color:#fff;cursor:pointer;font-size:14px}
.edl-pill button:hover{background:rgba(255,255,255,.12)}
#edlToggle{background:#2563eb}
body.edl-on [data-field]:hover{outline:2px dashed rgba(37,99,235,.55);outline-offset:2px;cursor:text}
body.edl-on img[data-field]:hover{cursor:pointer}
body.edl-on .breadcrumb .current{pointer-events:none} /* 原站怪癖: 当前页面包屑浮层盖住链接项, 编辑模式放穿它才能点到下面的链接 */
body.edl-on [data-field].edl-active{outline:2px solid rgba(37,99,235,.9);outline-offset:2px}
.ProseMirror{outline:none}.ProseMirror:focus{outline:none}
/* 挂载点透明化: PM 的挂载 div 不得接住任何 "...div" 直接规则(如 .content div{color:黑}),
   否则编辑时标题脱妆——文字属性一律随宿主, !important 压 ID 级规则; 只作用编辑态 */
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
[data-repeat].edl-zoneflash{outline:2px dashed rgba(37,99,235,.75);outline-offset:3px} /* 入场教学闪一下 */
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
.edl-pv{border:1px solid #eee;border-radius:10px;margin-bottom:10px;overflow:hidden}
.edl-pv-head{display:flex;justify-content:space-between;background:#f6f7f9;padding:6px 12px;font-size:12px}
.edl-pv-head span{color:#888}
.edl-pv pre{margin:0;padding:10px 12px;font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:220px;overflow:auto}
`

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>编辑试衣间 — 单梁桥式起重机(一次性演示)</title>
  ${cssLinks}
  <style>${css}</style>
</head>
<body>
${body}
${ui}
<script src="/assets/js/swiper.min.js"></script>
<script>
// 画廊轮播初始化(逐字摘自原站 page-init.js:25-43)
if (document.querySelector('.gallery-thumbs')) { // 有画廊才初始化(文章页没有)
var galleryThumbs = new Swiper('.gallery-thumbs', {
  spaceBetween: 1,
  slidesPerView: 3,
  freeMode: true,
  watchSlidesVisibility: true,
  watchSlidesProgress: true,
});
var galleryTop = new Swiper('.gallery-top', {
  spaceBetween: 1,
  effect: 'fade',
  thumbs: { swiper: galleryThumbs }
});
}
</script>
<script src="/assets/js/post-toc.js"></script>
<script src="${arg ? '/_edit-demo/edit-layer.js' : 'edit-layer.js'}?v=${Date.now()}"></script>
</body>
</html>
`

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'index.html'), html)
console.log(`OK → ${outDir.split('/').pop()}/index.html (${(html.length / 1024).toFixed(0)}KB)`)
