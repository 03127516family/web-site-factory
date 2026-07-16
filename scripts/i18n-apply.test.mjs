// 回归：i18n 翻译写回对【结构化 fm 字段（列表/对象，如 hero.highlights）】必须落成真 YAML 列表，
// 不能压成字符串（否则渲染期该字段不再是列表 → 结构损坏）。锁 patchMarkdown 的写层契约 + 记录
// 「JSON 字符串直接写会变字符串」这个坑（正是 i18n-apply.mjs::apply 必须先 JSON.parse 的原因）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { patchMarkdown } from "./md-write.mjs";

const fmOf = (raw) => parseDocument(/^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)[1]).toJS();

test("结构化 fm 字段：传真数组 → 写成 YAML 列表", async () => {
  const dir = await mkdtemp(join(tmpdir(), "i18n-apply-"));
  const f = join(dir, "t.md");
  await writeFile(f, "---\nhero:\n  highlights:\n    - 甲\n    - 乙\n---\n正文\n", "utf8");
  await patchMarkdown(f, "fm:hero.highlights", "text", ["A", "B", "C"]);
  const v = fmOf(await readFile(f, "utf8")).hero.highlights;
  assert.ok(Array.isArray(v), "应为数组而非字符串");
  assert.deepEqual(v, ["A", "B", "C"]);
  await rm(dir, { recursive: true, force: true });
});

test("坑：结构化字段传 JSON 字符串 → 被写成字符串（故 apply 必须先 parse）", async () => {
  const dir = await mkdtemp(join(tmpdir(), "i18n-apply-"));
  const f = join(dir, "t.md");
  await writeFile(f, "---\nhero:\n  highlights:\n    - 甲\n---\n正文\n", "utf8");
  await patchMarkdown(f, "fm:hero.highlights", "text", '["A","B"]');
  const v = fmOf(await readFile(f, "utf8")).hero.highlights;
  assert.equal(typeof v, "string", "未 parse 的 JSON 串会落成字符串，列表结构塌陷");
  await rm(dir, { recursive: true, force: true });
});
