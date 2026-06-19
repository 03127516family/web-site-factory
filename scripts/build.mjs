import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

const [layout, header, footer] = await Promise.all([
  readFile("src/layouts/document.html", "utf8"),
  readFile("src/fragments/header.html", "utf8"),
  readFile("src/fragments/footer.html", "utf8")
]);

const document = layout
  .replace("<!-- HEADER -->", header)
  .replace("<!-- FOOTER -->", footer);

const fragmentDocument = (title, fragment) => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="stylesheet" href="/assets/site.css">
  </head>
  <body>${fragment}<script src="/assets/site.js" defer></script></body>
</html>`;

const iframePreview = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>DGCRANE iframe 临时预览</title>
    <style>html,body{margin:0;background:#f5f6f8}iframe{display:block;width:100%;border:0}main{height:420px;display:grid;place-items:center;font:16px sans-serif;color:#667085}</style>
  </head>
  <body>
    <iframe src="/fragments/header.html" title="Header 临时预览" height="330"></iframe>
    <main>产品页 Body 开发区域</main>
    <iframe src="/fragments/footer.html" title="Footer 临时预览" height="744"></iframe>
  </body>
</html>`;

await mkdir("dist/fragments", { recursive: true });
await mkdir("dist/assets", { recursive: true });
await writeFile("dist/shell-composed-preview.html", document);
await writeFile("dist/shell-iframe-preview.html", iframePreview);
await writeFile("dist/fragments/header.html", fragmentDocument("DGCRANE Header", header));
await writeFile("dist/fragments/footer.html", fragmentDocument("DGCRANE Footer", footer));
await cp("src/styles/site.css", "dist/assets/site.css");
await cp("src/scripts/site.js", "dist/assets/site.js");
await cp("public/assets/site", "dist/assets/site", { recursive: true });
