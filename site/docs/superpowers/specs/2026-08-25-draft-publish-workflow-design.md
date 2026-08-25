# Draft And Publish Workflow Design

## Goal

Add a single-user draft workflow to the Astro visual editor without changing the contract-driven field writeback protocol:

- a published page remains available while an unpublished draft is edited;
- manual draft saves never rebuild or replace production output;
- publishing succeeds only when the candidate content and both Astro outputs build successfully;
- the editor always resumes the latest draft;
- all save previews compare the working candidate with the last published version;
- the legacy `patches` protocol is removed after migration.

Deployment, authentication, audit history, multiple saved revisions, and autosave are out of scope.

## Confirmed Product Behavior

### Views

Each page can expose three views:

1. **Edit draft** uses `dist-edit`, injects the editor, and loads the latest draft when one exists.
2. **Preview draft** uses `dist-edit` without editor controls.
3. **View published** uses `dist` without editor controls and only appears when a published version exists.

An unpublished new page has only edit and draft-preview views.

### Save Draft

The editor has a dedicated `Save draft` button. Clicking it commits the active editor, validates the pending `changes`, asks the server for a complete diff against the published version, and shows a confirmation dialog. Confirming:

1. revision-checks the working copy;
2. applies the pending changes through the existing edit contract;
3. writes one latest draft;
4. rebuilds only `dist-edit`;
5. clears the in-browser dirty state.

No production build or translation pipeline runs. There is no autosave.

### Publish Or Update

The editor has a separate `Publish` button for never-published pages and `Update` for pages with a published version. Both show the complete draft-versus-published diff before confirmation.

Publishing is transactional from the user's perspective:

1. revision-check the working draft and its published base;
2. apply unsaved browser changes to create a candidate;
3. force the candidate status to `published`;
4. build production and edit outputs in staging directories;
5. only after every build succeeds, atomically replace the published JSON and both outputs;
6. delete the draft;
7. start the existing translation pipeline for source-language pages.

If validation or either build fails, the published JSON and production output remain unchanged and the candidate remains as the latest draft.

### Discard Draft

Discarding requires confirmation.

- For a published page it deletes the draft and restores the editor to the last published version.
- For a never-published page it deletes the whole draft page.
- Uploaded assets remain on disk.
- Only `dist-edit` is rebuilt.

### Navigation Protection

Unsaved browser changes keep the existing leave-page warning. Saving a draft clears that warning. A saved but unpublished draft is represented by a visible status indicator, not by the dirty warning.

## Storage Model

Published content remains under `content/<slug>.json` and always has `page.status: "published"`.

Drafts are stored outside the production content tree under `.drafts/<slug>.json` as an envelope:

```json
{
  "version": 1,
  "baseRevision": "published-byte-revision-or-null",
  "savedAt": "ISO-8601 timestamp",
  "content": {}
}
```

The envelope keeps the draft's published base revision without leaking metadata into the page schema. Draft content keeps `page.status: "draft"`.

When an editor opens a page, the working copy is the draft content when present, otherwise the published content. The browser receives both the working revision and the current published revision. A stale tab cannot overwrite a newer draft, and a draft cannot publish over a published file that changed after the draft was created.

The existing `free-standing-jib-cranes` source draft is migrated into this envelope as a never-published draft. Its published English mirror remains independent.

## Build Model

Production routes continue reading `content` only. Edit builds merge `.drafts` over `content`, so a draft with the same slug replaces the published record only in `dist-edit`; new draft-only pages are also included.

The build runner is split into staging and activation phases. A production publish stages both `dist` and `dist-edit` before replacing either final directory. Draft save and discard stage and replace only `dist-edit`.

The current editor server may temporarily expose the publish candidate to the Astro build under the global serialized build lock. On failure it restores the previous published file before returning. Staging output is never activated after a failed build.

## Diff Model

The current browser-only snapshot compares against the page loaded into the editor, which is incorrect once that page is already a draft. Diff generation moves to a server-side preview operation:

1. load published and working content;
2. revision-check and apply pending `changes` in memory;
3. compare every contract-declared fixed field and repeat item against published content;
4. return typed preview records for text, number, rich text, string lists, images, links, insertions, deletions, and moves.

For a never-published page, the preview states that the complete page will be published for the first time. Draft saves and publishes use the same published baseline.

## API

The editor keeps one contract-driven payload shape and never sends JSON paths:

```json
{
  "slug": "products/example",
  "intent": "draft",
  "revision": "working-revision",
  "publishedRevision": "published-revision-or-null",
  "changes": []
}
```

- `POST /__preview-save` validates and returns the complete diff without writing.
- `POST /__save` accepts `intent: "draft" | "publish"`.
- `POST /__discard-draft` revision-checks and discards the latest draft.

The old `patches`, `kind`, array-index patch conversion, and no-revision compatibility path are removed.

## UI

The duplicate generic `Save...` entry is removed. The full-screen editor chrome contains:

- draft status and last manual save time;
- `Preview draft`;
- `View published` when available;
- `Discard draft` when a draft exists;
- `Save draft`;
- `Publish` or `Update`.

`Save draft` and `Publish/Update` each open the same diff dialog with a single action-specific confirmation button. Buttons are disabled while requests or builds are active.

## Error Handling

- stale working revision: HTTP 409, keep local edits and ask for refresh;
- changed published base: HTTP 409, preserve the draft and published version;
- invalid contract value: HTTP 400 with the target-specific message;
- draft edit-build failure: keep the saved draft, report that preview generation failed;
- publish build failure: keep the draft, restore published content, and leave final outputs unchanged;
- discard build failure: keep the draft and existing edit output.

## Test Strategy

1. Unit-test draft path safety, envelope validation, working-copy precedence, revision conflicts, save, discard, and migration.
2. Unit-test typed full diffs, including stable repeat IDs and order changes.
3. Integration-test draft save preserving published JSON and `dist` while updating `dist-edit`.
4. Integration-test failed publish rollback and successful promotion.
5. Browser-test separate buttons, confirmation summaries, refresh-resume, clean previews, discard, and stale-tab rejection.
6. Run existing writeback, editor-menu, image-alt, i18n, build, and migration checks.

## Deferred Work

- automatic saving;
- multiple draft revisions and revision UI;
- authentication, permissions, and audit logs;
- deployment;
- automatic deletion of unreferenced uploads;
- nested repeat editing and drag-to-reorder UI.
