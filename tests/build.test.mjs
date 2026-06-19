import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function readSource(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

test("header owns the trust banner and stops before the breadcrumb", async () => {
  const header = await readSource("src/fragments/header.html");

  assert.match(header, /data-site-header/);
  assert.match(header, /data-trust-banner/);
  assert.doesNotMatch(header, /data-breadcrumb|面包屑|首页\s*&gt;/);
});

test("footer contains subscription, navigation, contact and legal regions", async () => {
  const footer = await readSource("src/fragments/footer.html");

  assert.match(footer, /data-site-footer/);
  assert.match(footer, /data-footer-subscribe/);
  assert.match(footer, /data-footer-navigation/);
  assert.match(footer, /sales@dgcrane\.com/);
  assert.match(footer, /隐私政策/);
});

test("shared fragments use local assets", async () => {
  const header = await readSource("src/fragments/header.html");
  const footer = await readSource("src/fragments/footer.html");
  const fragments = `${header}\n${footer}`;

  assert.doesNotMatch(fragments, /https?:\/\/www\.dgcrane\.com\/wp-content/);
  assert.doesNotMatch(fragments, /\/wp-content\//);
  assert.match(fragments, /\/assets\/site\//);
});

test("build creates iframe and flattened previews", async () => {
  await execFileAsync(process.execPath, ["scripts/build.mjs"]);

  const composed = await readFile("dist/shell-composed-preview.html", "utf8");
  const iframe = await readFile("dist/shell-iframe-preview.html", "utf8");

  assert.equal((composed.match(/data-site-header/g) ?? []).length, 1);
  assert.equal((composed.match(/data-site-footer/g) ?? []).length, 1);
  assert.equal((iframe.match(/<iframe/g) ?? []).length, 2);
  assert.match(iframe, /\/fragments\/header\.html/);
  assert.match(iframe, /\/fragments\/footer\.html/);
});
