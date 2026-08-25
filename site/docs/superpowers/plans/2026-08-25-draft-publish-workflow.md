# Draft And Publish Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep one latest editable draft separate from the last published page, provide complete published-baseline previews, and publish only after an atomic successful Astro build.

**Architecture:** Store draft envelopes under `.drafts`, merge them over `content` only for edit builds, and keep contract-driven `changes` as the sole browser write protocol. A focused draft store owns revisions and migration; a content-diff module owns save previews; the edit server orchestrates draft-only builds and transactional publish promotion.

**Tech Stack:** Node.js ESM, Astro 6, existing contract/writeback modules, Playwright Core, Node `assert`.

---

### Task 1: Draft Store And Working Copy

**Files:**
- Create: `src/draft-store.mjs`
- Create: `scripts/accept-drafts.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing draft-store tests**

Cover safe slug resolution, published fallback, draft precedence, envelope validation, base revision retention, stale working revision rejection, draft discard, and new-page drafts. Use temporary directories and real JSON bytes rather than mocks.

```js
const saved = saveDraft({ site, slug: 'products/x', expectedRevision, changes })
assert.equal(saved.workspace.hasDraft, true)
assert.equal(readPublished(site, slug).title, 'Published')
assert.equal(readWorking(site, slug).content.title, 'Draft')
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run accept:drafts`

Expected: FAIL because `src/draft-store.mjs` does not exist.

- [ ] **Step 3: Implement the draft envelope and workspace API**

Export narrow operations:

```js
draftPath(site, slug)
readWorkspace(site, slug)
writeDraftEnvelope(site, slug, envelope)
discardDraft(site, slug, expectedRevision)
```

The workspace result must contain `workingContent`, `workingRevision`, `publishedContent`, `publishedRevision`, `baseRevision`, `hasDraft`, and `hasPublished`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm run accept:drafts`

Expected: all draft-store assertions pass.

- [ ] **Step 5: Commit**

```bash
git add src/draft-store.mjs scripts/accept-drafts.mjs package.json
git commit -m "feat: add isolated draft workspace storage"
```

### Task 2: Draft-Aware Astro Content Source

**Files:**
- Create: `src/content-source.mjs`
- Modify: `src/pages/products/[slug].astro`
- Modify: `src/pages/posts/[slug].astro`
- Modify: `src/pages/[lang]/products/[slug].astro`
- Modify: `src/pages/[lang]/posts/[slug].astro`
- Extend: `scripts/accept-drafts.mjs`

- [ ] **Step 1: Add failing merge tests**

Verify production reads only published `content`, edit mode overlays a same-slug draft, and edit mode includes a draft-only new page.

```js
assert.deepEqual(loadPageRecords(site, { type: 'products', includeDrafts: false }).map(x => x.j.title), ['Published'])
assert.deepEqual(loadPageRecords(site, { type: 'products', includeDrafts: true }).map(x => x.j.title), ['Draft', 'New draft'])
```

- [ ] **Step 2: Verify RED**

Run: `npm run accept:drafts`

Expected: FAIL because draft overlay records are missing.

- [ ] **Step 3: Implement one shared page-record loader and route all four page families through it**

The helper must unwrap draft envelopes, reject unsafe language/type segments, preserve existing template availability filters, and never expose `.drafts` to production builds.

- [ ] **Step 4: Verify tests and both builds**

Run:

```bash
npm run accept:drafts
npm run build
INCLUDE_DRAFTS=1 BUILD_OUT=dist-edit npm run build
```

Expected: production excludes draft-only pages; edit output includes them.

- [ ] **Step 5: Commit**

```bash
git add src/content-source.mjs src/pages scripts/accept-drafts.mjs
git commit -m "feat: overlay drafts in edit builds"
```

### Task 3: Published-Baseline Content Diff

**Files:**
- Create: `src/content-diff.mjs`
- Create: `scripts/accept-content-diff.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing typed-diff tests**

Cover fixed text, rich-text block summaries, string lists, image src/alt, links, repeat insert/delete/move, repeat field edits by item ID, unchanged values, and first publish.

```js
const diff = diffContent({ published, candidate, contract })
assert.deepEqual(diff.items[0], {
  targetId: 'gallery/gallery_b/image',
  type: 'image',
  before: { src: 'old.jpg', alt: 'Old' },
  after: { src: 'new.jpg', alt: 'New' },
})
```

- [ ] **Step 2: Verify RED**

Run: `npm run accept:content-diff`

Expected: FAIL because the diff module does not exist.

- [ ] **Step 3: Implement schema-directed comparisons**

Read values only through contract paths. Repeat comparisons must address objects with `itemIdField`, report order changes separately, and never use array index as identity.

- [ ] **Step 4: Verify GREEN**

Run: `npm run accept:content-diff`

Expected: all typed diff assertions pass.

- [ ] **Step 5: Commit**

```bash
git add src/content-diff.mjs scripts/accept-content-diff.mjs package.json
git commit -m "feat: compare drafts with published content"
```

### Task 4: Changes-Only Request Protocol

**Files:**
- Modify: `src/writeback-request.mjs`
- Modify: `scripts/accept-writeback.mjs`
- Modify: `scripts/accept-poc5.mjs`

- [ ] **Step 1: Change tests to require `changes` and revision**

Add explicit rejection tests for `patches`, missing `changes`, and missing revision. Convert schema rejection tests to contract target IDs.

- [ ] **Step 2: Verify RED**

Run: `npm run accept:writeback`

Expected: FAIL while legacy patches are still accepted.

- [ ] **Step 3: Remove `patchValue`, `legacyPatchesToChanges`, `patches`, and status mutation from `prepareWriteback`**

The resulting signature is:

```js
prepareWriteback({ site, bytes, expectedRevision, changes })
```

- [ ] **Step 4: Verify GREEN**

Run: `npm run accept:writeback`

Expected: changes-only protocol assertions pass.

- [ ] **Step 5: Commit**

```bash
git add src/writeback-request.mjs scripts/accept-writeback.mjs scripts/accept-poc5.mjs
git commit -m "refactor: remove legacy path patch protocol"
```

### Task 5: Edit Context And Save Preview API

**Files:**
- Modify: `src/edit-context.mjs`
- Modify: `scripts/edit-server.mjs`
- Extend: `scripts/accept-drafts.mjs`

- [ ] **Step 1: Add failing context and preview tests**

Verify draft context precedence, `hasDraft`, `hasPublished`, working/published revisions, first-publish summary, persisted draft differences, and pending changes applied only in memory.

- [ ] **Step 2: Verify RED**

Run: `npm run accept:drafts`

Expected: FAIL because context still reads `content` directly and no preview endpoint exists.

- [ ] **Step 3: Make edit context workspace-aware and add `POST /__preview-save`**

The endpoint accepts only:

```json
{ "slug": "...", "intent": "draft", "revision": "...", "publishedRevision": null, "changes": [] }
```

It revision-checks, applies pending changes in memory, and returns the complete typed diff.

- [ ] **Step 4: Verify GREEN and script-safe context serialization**

Run:

```bash
npm run accept:drafts
npm run accept:writeback
```

- [ ] **Step 5: Commit**

```bash
git add src/edit-context.mjs scripts/edit-server.mjs scripts/accept-drafts.mjs
git commit -m "feat: preview complete unpublished changes"
```

### Task 6: Draft Save, Discard, And Transactional Publish

**Files:**
- Modify: `scripts/edit-server.mjs`
- Modify: `src/draft-store.mjs`
- Create: `scripts/accept-draft-server.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing HTTP lifecycle tests**

Use a temporary site fixture and injectable build runner. Verify:

- draft save leaves published JSON and production output byte-identical;
- draft save updates only the latest envelope;
- stale tab gets HTTP 409;
- discard keeps uploads and restores published edit view;
- failed publish restores published JSON, keeps draft, and leaves both outputs unchanged;
- successful publish replaces content and outputs, then removes draft.

- [ ] **Step 2: Verify RED**

Run: `npm run accept:draft-server`

Expected: lifecycle requests fail against the current status-based save route.

- [ ] **Step 3: Split build staging from activation**

Create helpers that stage `dist` and `dist-edit`, activate only after every required stage succeeds, and clean all `*-next-*`/`*-previous-*` directories in `finally` blocks.

- [ ] **Step 4: Implement `intent: draft|publish` and `/__discard-draft`**

Draft save writes the envelope and rebuilds edit output only. Publish keeps the candidate as draft, verifies `baseRevision`, builds under the serialized lock, promotes on success, and restores on failure. Discard rebuilds edit output before deleting/activating so a failed build preserves the draft.

- [ ] **Step 5: Verify GREEN**

Run: `npm run accept:draft-server`

Expected: all lifecycle and rollback assertions pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/edit-server.mjs src/draft-store.mjs scripts/accept-draft-server.mjs package.json
git commit -m "feat: add transactional draft publishing"
```

### Task 7: Editor Workflow And Clean Views

**Files:**
- Modify: `scripts/edit-server.mjs`
- Modify: `edit-layer/edit-layer.js`
- Create: `scripts/accept-draft-ui.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing browser workflow tests**

Verify separate Save draft and Publish/Update buttons, full published-baseline summary, action-specific confirmation, dirty leave warning state, draft status, refresh-resume, clean `?view=draft`, clean `?view=published`, discard confirmation, first-publish labeling, and no generic duplicate Save button.

- [ ] **Step 2: Verify RED**

Run: `EDIT_PORT=8094 npm run accept:draft-ui`

Expected: FAIL on the current duplicated save controls and direct-save behavior.

- [ ] **Step 3: Implement the two-action dialog and status controls**

`showSave(intent)` calls `/__preview-save`; one modal confirm button calls `/__save`. Add preview, published-view, and discard controls. Keep `beforeunload` tied only to in-browser dirty changes.

- [ ] **Step 4: Serve clean views**

`?view=draft` serves `dist-edit` without context/editor injection. `?view=published` serves `dist` without injection and returns 404 when no published page exists.

- [ ] **Step 5: Verify GREEN plus existing interaction regressions**

Run:

```bash
EDIT_PORT=8094 npm run accept:draft-ui
EDIT_PORT=8094 npm run accept:image-alt
EDIT_PORT=8094 npm run accept:item-menu
```

- [ ] **Step 6: Commit**

```bash
git add scripts/edit-server.mjs edit-layer/edit-layer.js scripts/accept-draft-ui.mjs package.json
git commit -m "feat: add explicit draft and publish controls"
```

### Task 8: Legacy Draft Migration And Burn Integration

**Files:**
- Create: `scripts/migrate-drafts-v1.mjs`
- Modify: `scripts/deepseek-burn.mjs`
- Modify: `scripts/edit-server.mjs`
- Modify: `scripts/accept-burn.mjs`
- Modify: `content/products/free-standing-jib-cranes.json`
- Create: `.drafts/products/free-standing-jib-cranes.json`
- Modify: `package.json`

- [ ] **Step 1: Add failing idempotent migration and burn tests**

Verify only `status: draft` source pages move, published content never moves, draft envelopes preserve bytes semantically, running migration twice is a no-op, and AI-created drafts are written directly to `.drafts`.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm run accept:burn
node scripts/migrate-drafts-v1.mjs --check
```

- [ ] **Step 3: Implement migration and route all draft creation through the draft store**

Migrate `free-standing-jib-cranes` as a never-published draft with `baseRevision: null`. Regenerate derived registry data without treating `.drafts` as production content.

- [ ] **Step 4: Verify GREEN and migration idempotence**

Run:

```bash
npm run accept:burn
node scripts/migrate-drafts-v1.mjs --check
```

- [ ] **Step 5: Commit**

```bash
git add .drafts content scripts src package.json
git commit -m "feat: migrate content drafts to isolated storage"
```

### Task 9: Full Verification And Final Review

**Files:**
- Modify only files required by failures found during verification.

- [ ] **Step 1: Run focused suites**

```bash
npm run accept:drafts
npm run accept:content-diff
npm run accept:writeback
npm run accept:draft-server
npm run accept:burn
npm run accept:i18n2
```

- [ ] **Step 2: Start the edit server and run browser suites**

```bash
PORT=8094 npm run edit
EDIT_PORT=8094 npm run accept:draft-ui
EDIT_PORT=8094 npm run accept:image-alt
EDIT_PORT=8094 npm run accept:item-menu
```

- [ ] **Step 3: Run production and edit builds**

```bash
npm run build
INCLUDE_DRAFTS=1 BUILD_OUT=dist-edit npm run build
```

- [ ] **Step 4: Inspect real desktop and mobile views**

Use the in-app browser to verify the editor controls do not overlap content, the clean previews contain no editor UI, draft refresh resumes, published output remains stable after draft save, and discard/publish transitions are correct.

- [ ] **Step 5: Review repository state**

```bash
git diff --check
git status --short
git log --oneline -12
```

- [ ] **Step 6: Commit any verification-only fixes**

```bash
git add <verified-files>
git commit -m "fix: close draft workflow verification gaps"
```
