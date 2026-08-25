# Contract-Driven Writeback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace browser-controlled JSON path patches with template contracts, stable repeat IDs, revision checks, and atomic writes without replacing Astro or Tiptap.

**Architecture:** A pure `writeback-core` applies target-based Changes against a validated template contract. The edit server owns path resolution, per-file transactions, revisions, atomic persistence, and rebuild reporting; the browser owns only target discovery and editing UI. Existing templates migrate incrementally, with compatibility patches restricted by the same contract.

**Tech Stack:** Node.js ESM, Astro 6, Tiptap 3, Playwright, JSON content files.

---

### Task 1: Contract Loader and Writeback Core

**Files:**
- Create: `scripts/accept-writeback.mjs`
- Create: `src/edit-contract.mjs`
- Create: `src/writeback-core.mjs`
- Modify: `package.json`

- [ ] Write failing tests for contract validation, unknown targets, blocked path segments, value types, rich-text schema validation, repeat insert/delete/move by ID, min/max limits, and inverse Changes.
- [ ] Run `npm run accept:writeback` and confirm it fails because the modules do not exist.
- [ ] Implement the minimum contract loader and pure writeback API:

```js
applyChanges({ data, contract, changes })
// -> { data, inverseChanges, touchedTargets }
```

- [ ] Run `npm run accept:writeback` and confirm the core tests pass.

### Task 2: Revision and Atomic JSON Persistence

**Files:**
- Modify: `scripts/accept-writeback.mjs`
- Create: `src/content-revision.mjs`

- [ ] Add failing tests for deterministic byte revisions, revision mismatch, atomic replacement, and cleanup of temporary files.
- [ ] Run the focused suite and confirm the expected failures.
- [ ] Implement `revisionOf(bytes)` and `writeJsonAtomic(file, data)` using sibling temporary files and rename.
- [ ] Run the focused suite and confirm it passes.

### Task 3: ProductPage and Post Contracts

**Files:**
- Create: `src/components/products/ProductPage/edit-contract.json`
- Create: `src/components/posts/PostPage/edit-contract.json`
- Create: `src/components/posts/5-ton-overhead-crane/edit-contract.json`
- Create: `src/components/posts/gantry-cranes-for-sale/edit-contract.json`
- Create: `src/components/posts/crane-lifting-safety-training/edit-contract.json`
- Create: `src/components/posts/32t-rail-mounted-container-gantry-crane-exported-to-russia/edit-contract.json`
- Modify: `scripts/accept-writeback.mjs`

- [ ] Add failing tests that load every template used by `content/**/*.json` and prove every editable marker is represented by its contract.
- [ ] Add template-local field and repeat declarations, keeping all concrete paths out of the core.
- [ ] Run the contract coverage tests.

### Task 4: Content and Template Repeat Migration

**Files:**
- Create: `scripts/migrate-writeback-v1.mjs`
- Modify: `src/components/products/ProductPage/index.astro`
- Modify: `src/components/products/ProductPage/example.json`
- Modify: `src/components/posts/PostPage/index.astro`
- Modify: `src/i18n-collect.mjs`
- Modify: `scripts/accept-i18n2.mjs`
- Modify: affected `content/**/*.json`

- [ ] Add failing migration tests for deterministic/stable IDs and lossless merging of component/crane-type parallel data.
- [ ] Add a failing i18n test proving `id` values are structural and never translated.
- [ ] Implement an idempotent migration that preserves all existing values, combines parallel arrays, and adds IDs.
- [ ] Update Astro repeat DOM to expose region/item/field identity and give PostPage sections a single root.
- [ ] Run the migration twice and verify the second run makes no changes.
- [ ] Run i18n, burn, and build tests.

### Task 5: Secure Save Endpoint

**Files:**
- Modify: `scripts/edit-server.mjs`
- Modify: `scripts/accept-writeback.mjs`

- [ ] Add endpoint-level failing tests for unknown target rejection, revision conflict HTTP 409, successful field Change, successful repeat Change, and atomic persistence.
- [ ] Add a per-file transaction queue.
- [ ] Load the active template contract from `page.type` and `page.template`.
- [ ] Apply Changes through the core and write atomically.
- [ ] Restrict transitional patches to contract-declared paths.
- [ ] Return `{ ok, revision, saved, rebuilt, rebuildError }` with save and rebuild results separated.
- [ ] Run endpoint tests.

### Task 6: Browser Change Protocol

**Files:**
- Modify: `edit-layer/edit-layer.js`
- Modify: `scripts/edit-server.mjs`
- Modify: `scripts/accept-poc5.mjs`

- [ ] Add browser acceptance assertions for injected edit context and target-based save payloads.
- [ ] Inject a browser-safe contract view and revision into editable HTML responses.
- [ ] Replace `pathOf` with target identity resolution.
- [ ] Replace DOM array reconstruction with explicit repeat operations.
- [ ] Read field type from the contract rather than inferring it from DOM shape.
- [ ] Submit `{ slug, revision, changes, status }` and update the local revision after a successful save.
- [ ] Keep Tiptap JSON capture for rich text.
- [ ] Run browser acceptance.

### Task 7: Full Regression and Runtime Verification

**Files:**
- Modify: `package.json`
- Modify: `docs/superpowers/specs/2026-08-24-contract-writeback-design.md` only if verified behavior differs.

- [ ] Run `npm run accept:writeback`.
- [ ] Run `npm run check`.
- [ ] Run `npm run accept:burn`.
- [ ] Run `npm run accept:poc5` against a running edit server.
- [ ] Run `PATH=/Users/vue/.nvm/versions/node/v22.23.2/bin:$PATH npm run build`.
- [ ] Inspect the final diff and confirm the user's pre-existing content edit and backup file were not reverted.
- [ ] Check ProductPage and PostPage in a real browser at desktop and mobile widths, including text edit, rich edit, repeat insert/delete, rejected stale save, and page reload.

