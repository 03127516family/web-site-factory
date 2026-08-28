// geom 共享件：内嵌静态服务（零依赖）+ 两套测量脚本（products 用坐标块，posts 用选择器）。
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.gif': 'image/gif', '.mp4': 'video/mp4', '.xml': 'application/xml', '.txt': 'text/plain' }

export function serveStatic(dir) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let fp = join(dir, normalize(url).replace(/^([/\\])+/, ''))
    if (!fp.startsWith(dir)) { res.writeHead(403); res.end(); return }
    if (url.endsWith('/')) fp = join(fp, 'index.html')
    let data
    try { data = readFileSync(fp) } catch { res.writeHead(404); res.end('not found'); return }
    res.writeHead(200, { 'content-type': MIME[extname(fp)] ?? 'application/octet-stream' })
    res.end(data)
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () =>
    resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })))
}

export const POST_SELECTORS = ['.toptitle h1', '.breadcrumb .crumb', '.breadcrumb .current', '.craneinfo', '.craneinfo > *', '.craneinfo img', '.craneinfo table', '.craneinfo tr', '#rank-math-toc', '.post-inquiry']

export const MEASURE_BLOCKS = `(()=>{const out=[];for(const el of document.querySelectorAll('[data-block-id]')){const r=el.getBoundingClientRect();out.push({id:el.getAttribute('data-block-id'),x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)});}return out})()`

export const MEASURE_POST = `(()=>{const out=[];for(const sel of ${JSON.stringify(POST_SELECTORS)}){document.querySelectorAll(sel).forEach((el,i)=>{const r=el.getBoundingClientRect();out.push({id:sel+'#'+i,x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)})})}return out})()`
