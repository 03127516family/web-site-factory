import test from "node:test";
import assert from "node:assert/strict";
import { pages, composePage, seoHead, sitemapXml, SITE_BASE } from "./build.mjs";

test("all registered pages declare their generation mode and type", () => {
  assert.ok(pages.length > 0);
  for (const page of pages) {
    assert.equal(page.mode, "render", `${page.slug} should be a render-mode page`);
    assert.match(page.type, /^(product|post)$/);
    assert.ok(page.template, `${page.slug} should declare a template`);
    assert.ok(page.content, `${page.slug} should declare content`);
  }
});

test("post pages are generated from per-post templates and support edit coordinates", async () => {
  const page = pages.find((candidate) => candidate.slug === "posts/32t-rail-mounted-container-gantry-crane-exported-to-russia");
  assert.ok(page, "expected the Russian RMG post to be registered");
  assert.equal(page.type, "post");
  assert.equal(page.mode, "render");
  assert.equal(page.template, "src/templates/posts/32t-rail-mounted-container-gantry-crane-exported-to-russia.html");

  const html = await composePage(page, { editMode: true });
  assert.match(html, /32吨轨道式集装箱龙门起重机出口俄罗斯/);
  assert.match(html, /data-md="mdbody:req"/);
  assert.match(html, /data-md="fm:body\.img_hero"/);
  assert.match(html, /window\.__EDIT__=\{"slug":"posts\/32t-rail-mounted-container-gantry-crane-exported-to-russia"\}/);
});

test("registry is derived from content dir: sorted, unique slugs, md-backed", () => {
  const slugs = pages.map((page) => page.slug);
  assert.equal(new Set(slugs).size, slugs.length, "slug 不得重复");
  assert.deepEqual(slugs, [...slugs].sort(), "登记按 slug 稳定排序");
  for (const page of pages) assert.match(page.content, /^src\/content\/.+\.md$/);
});

test("SEO head: canonical unique, OG present, JSON-LD parses (product + post)", async () => {
  for (const slug of ["products/overhead-cranes-for-sale", "posts/crane-lifting-safety-training"]) {
    const page = pages.find((candidate) => candidate.slug === slug);
    const html = await composePage(page);

    const canonicals = html.match(/<link rel="canonical"/g) || [];
    assert.equal(canonicals.length, 1, `${slug}: canonical 必须恰好一个`);
    assert.ok(html.includes(`${SITE_BASE}${slug}/`), `${slug}: canonical/og:url 必须带 /zh/ 前缀`);
    assert.match(html, /<meta property="og:title"/, slug);
    assert.match(html, /<meta property="og:image"/, `${slug}: 应有 og:image（两页都有首图）`);

    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(blocks.length >= 1, `${slug}: 应有 JSON-LD`);
    for (const block of blocks) {
      const parsed = JSON.parse(block[1]);
      assert.match(JSON.stringify(parsed), /BreadcrumbList/, slug);
    }
  }
  const productHtml = await composePage(pages.find((c) => c.slug === "products/overhead-cranes-for-sale"));
  assert.match(productHtml, /"@type":"Product"/);
  const postHtml = await composePage(pages.find((c) => c.slug === "posts/crane-lifting-safety-training"));
  assert.match(postHtml, /"@type":"Article"/);
});

test("sitemapXml derives from registry (same-source, no page left out)", () => {
  const entries = pages
    .filter((page) => (page.mode || "render") === "render")
    .map((page) => ({ loc: SITE_BASE + page.slug + "/", lastmod: "2026-07-03" }));
  const xml = sitemapXml(entries);
  assert.equal((xml.match(/<url>/g) || []).length, pages.length, "sitemap 条数 = 登记页面数");
  for (const page of pages) assert.ok(xml.includes(`${SITE_BASE}${page.slug}/`), page.slug);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
});

test("seoHead escapes attribute values", () => {
  const head = seoHead(
    { slug: "products/x", type: "product", lang: "zh-CN", title: 'A"B<C&D', description: "d" },
    {},
  );
  assert.ok(!head.includes('og:title" content="A"B'), "双引号必须转义");
  assert.match(head, /A&quot;B&lt;C&amp;D/);
});
