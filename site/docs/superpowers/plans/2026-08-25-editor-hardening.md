# Editor Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden shared editing across current product and post templates without adding template-specific branches to the common editor.

**Architecture:** A shared Astro inquiry component owns repeated form markup. Browser-visible contracts carry image storage metadata, the upload server resolves site asset configuration, and edit-mode behavior is driven by generic DOM markers. Plain list fields use native DOM editing instead of Tiptap.

**Tech Stack:** Astro, browser JavaScript, Node.js, Playwright, JSON edit contracts.

---

### Task 1: Add regression coverage

**Files:**
- Modify: `scripts/accept-writeback.mjs`
- Modify: `scripts/accept-poc5.mjs`

- [x] Assert inquiry component use, absence of `inlineHtml`, public image metadata, upload value formats, list DOM stability, and hit-testability.
- [x] Run focused tests and confirm they fail for the missing behavior.

### Task 2: Extract the inquiry component and remove inline HTML

**Files:**
- Create: `src/components/shared/InquiryForm.astro`
- Modify: all six product/post template components
- Modify: `src/components/products/ProductPage/edit-contract.json`
- Modify: `src/writeback-core.mjs`

- [x] Replace duplicated inquiry wrappers with the shared component.
- [x] Render specs as escaped text and remove `inlineHtml` from supported field types.
- [x] Run contract and build tests.

### Task 3: Make image storage configurable

**Files:**
- Create: `src/asset-config.mjs`
- Modify: `src/edit-contract.mjs`
- Modify: all image-bearing edit contracts
- Modify: `src/edit-context.mjs`
- Modify: `scripts/edit-server.mjs`
- Modify: `edit-layer/edit-layer.js`

- [x] Add site defaults plus contract `assetNamespace` and `valueFormat` validation.
- [x] Return `publicUrl` and `storageValue` from uploads.
- [x] Remove the product image constant from the browser editor.
- [x] Run writeback and upload tests.

### Task 4: Repair list and complex-layout editing

**Files:**
- Modify: `edit-layer/edit-layer.js`
- Modify: `scripts/edit-server.mjs`
- Modify: `src/components/products/ProductPage/index.astro`

- [x] Add a native string-list editor that never replaces the outer list.
- [x] Add generic stacking fixes and `data-edit-reveal` behavior.
- [x] Run Playwright hit-test and list-edit regressions.

### Task 5: Full verification

- [x] Bundle the editor.
- [x] Run writeback, browser, i18n, burn, migration, and production build checks.
- [x] Inspect the final diff and confirm unrelated user changes remain untouched.
