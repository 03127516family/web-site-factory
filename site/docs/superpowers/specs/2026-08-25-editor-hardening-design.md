# Editor Hardening Design

## Goal

Make every declared edit target usable in real layouts while keeping template structure template-owned and keeping the common writeback protocol independent of product/post paths.

## Design

- Replace repeated inquiry-form wrappers with one `InquiryForm.astro` component. The component receives the JSON title and page-specific class but preserves the existing rendered form fragment and DOM contract markers.
- Treat `stringList` as a native list surface. Each existing `li` is editable without mounting a rich-text document into the outer `ul`.
- On edit entry, expose declared targets hidden by negative stacking or collapsed panels through generic edit-mode CSS. Templates opt into collapsed-content exposure with `data-edit-reveal`; the editor contains no template names.
- Put upload disk root and public URL base in site asset configuration. Image fields declare a namespace and stored-value format in their template contract. The server returns both the public URL and the value to store.
- Remove `inlineHtml`; the only current user is `specs[].text`, whose real content is plain text. Render it escaped and declare it as `text`.

## Acceptance

- All inquiry-form consumers render the JSON title through the shared component.
- Product hero, post title/breadcrumb, and declared collapsed component fields are hit-testable in edit mode.
- Editing `hero.highlights` preserves exactly one outer `ul` and saves a string array.
- Product and legacy post uploads store values in the format declared by their contracts, without editor path constants.
- No contract or writeback code accepts `inlineHtml`.
- Writeback, browser, i18n, burn, and production builds pass.
