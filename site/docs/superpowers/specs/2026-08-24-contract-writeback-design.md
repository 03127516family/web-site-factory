# Contract-Driven Web Writeback Design

## Goal

Replace the Web editor's browser-controlled raw JSON path patches with a template-authorized writeback pipeline while preserving Astro rendering, Tiptap rich text, content JSON, i18n, and the existing editor workflow.

This change applies only to `/Users/vue/Documents/websitere-placement-system/site`. It does not import the quotation application or its UI.

## Product Boundaries

- Astro templates remain immutable to content editors.
- Only fields declared by the active template contract are editable.
- Only declared repeat regions can insert, delete, or move fixed-shape items.
- The browser never chooses an arbitrary JSON path.
- Template-specific paths such as `hero.headline` live only in that template's contract.
- Tiptap remains responsible for rich-text interaction and JSON serialization, not authorization or path resolution.
- Legacy templates migrate gradually; old patch requests remain available only during migration and are restricted to a contract allowlist.

## Target Flow

```text
Astro DOM edit key / repeat item ID
    -> browser Change
    -> POST /__save { slug, revision, changes, status }
    -> load page.template contract
    -> resolve target ID to trusted path
    -> validate type and repeat rule
    -> apply to an in-memory clone
    -> validate rich documents and page invariants
    -> atomic JSON replacement
    -> rebuild with save/build outcomes reported separately
```

## New Modules

### `src/edit-contract.mjs`

Loads `src/components/<type>s/<template>/edit-contract.json`, validates contract shape, and returns a browser-safe view without storage paths.

### `src/writeback-core.mjs`

Pure operations for:

- fixed field changes;
- repeat item field changes by stable item ID;
- `insertItem`, `deleteItem`, and `moveItem`;
- field type validation;
- inverse change generation;
- blocked path segments.

The core receives a resolver/contract and never knows ProductPage paths.

### `src/content-revision.mjs`

Computes a stable SHA-256 revision from the exact JSON file bytes and atomically replaces JSON files through a sibling temporary file and rename.

## Template Contracts

Each editable template receives `edit-contract.json` with:

```json
{
  "version": 1,
  "fields": {
    "main_heading": { "path": "hero.headline", "type": "text" }
  },
  "repeats": {
    "specs": {
      "path": "specs",
      "itemIdField": "id",
      "minItems": 0,
      "maxItems": 50,
      "prototype": { "id": null, "text": "" },
      "fields": {
        "text": { "path": "text", "type": "inlineHtml" }
      }
    }
  }
}
```

Keys are template-local public edit identities. Paths are private storage details used only by the server.

## Change Protocol

Fixed value:

```json
{ "targetId": "main_heading", "value": "New heading" }
```

Repeat child value:

```json
{ "targetId": "specs/spec_a1/text", "value": "Capacity: 10t" }
```

Structural operations:

```json
{ "op": "insertItem", "regionId": "specs", "itemId": "spec_b2", "afterItemId": "spec_a1" }
{ "op": "deleteItem", "regionId": "specs", "itemId": "spec_a1" }
{ "op": "moveItem", "regionId": "specs", "itemId": "spec_b2", "afterItemId": null }
```

## Stable Repeat Identity

All editable object-array items gain an `id` string. DOM repeat roots expose `data-repeat-key`; item roots expose `data-item-id`; item fields expose their template-local field key. Array indices are presentation order only.

ProductPage parallel arrays are migrated:

- `components_images[]` plus heading chunks in `components.body` become `components.items[]` objects containing `id`, `name`, `image`, dimensions, and `body`.
- `crane_types_images[]` plus heading chunks in `crane_types.body` become `crane_types.items[]`.

PostPage sections become single-root DOM items and gain stable IDs.

## Field Types

- `text`: string.
- `number`: finite number with optional bounds.
- `inlineHtml`: legacy inline fragment with dangerous tags, event attributes, and JavaScript URLs rejected.
- `richText`: normalized Tiptap document validated by `validateDoc`.
- `image`: `{ src, alt }`, with the contract choosing the storage path and optional sibling alt path.
- `link`: href string with safe URL protocol.
- `stringList`: array of strings.

## Revision and Atomicity

The edit server injects a browser-safe edit context containing the current content revision and contract types. Every Change save must include the revision. A mismatch returns HTTP 409 and writes nothing.

The per-content-file save transaction is serialized. The server writes validated JSON to a sibling temporary file, fsyncs/closes it, and renames it over the target. Astro builds remain globally serialized after the content transaction.

## Compatibility

- Contract-enabled templates use `changes` and revision enforcement.
- During migration only, `patches` are accepted after resolving every patch path against that template's contract allowlist. Unknown paths are rejected.
- Once all templates and the editor acceptance test use Changes, the raw patch branch is removed.

## Verification

- Unit tests cover contract loading, field validation, repeat identity, revision conflicts, blocked paths, inverse operations, and atomic replacement.
- Browser acceptance covers text, rich text, repeat insertion/deletion, rejected unknown targets, and revision conflict.
- Existing i18n and burn acceptance suites remain green.
- Astro build runs under Node 22.23.2 or newer.

