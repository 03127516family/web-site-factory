import test from "node:test";
import assert from "node:assert/strict";
import { pages, composePage } from "./build.mjs";

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
