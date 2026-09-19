# Agent Note: Preview panes resolve workspace-local images

Status: implemented

## Problem

Markdown documents that reference workspace-local images (`![](./assets/a.png)`, `![](/assets/a.png)`) render broken images in the central editor preview pane and in the product-column preview, and HTML previews drop relative media for the same reason. Directly opening a `png/gif` file works through the `file:readBinary` image chain, so authors cannot visually verify the documents they write while the files they reference open without issue.

## Decision

A pure path resolver maps each local asset `src` to an absolute workspace file path: document-relative segments resolve against the open document directory with `.`/`..` normalization, a leading `/` resolves workspace-root-relative while a workspace is known, Windows absolute paths and `file://` URLs pass through, and URL encoding, angle-bracket destinations, and query/hash suffixes are normalized before filesystem lookup. Remote, `data:`, `blob:`, and anchor URLs never enter resolution and render untouched.

Markdown image rendering loads the resolved path through `file:readBinary` and swaps in a `data:` URL, with in-flight deduplication and a bounded success cache shared by every preview surface. HTML previews rewrite `img/source/video/audio` `src` and `poster` attributes to `data:` URLs before the `srcDoc` reaches the sandboxed iframe, capped at 30 assets per document. Assets above 8MB stay unresolved rather than risking renderer memory pressure. Chat messages and QuickNote cards provide no workspace scope and keep the previous pass-through rendering.

## Alternatives considered

- Serve workspace files over a custom protocol or inject `<base href>` into preview documents — strongest case is zero per-image IPC and native browser caching, but a new privileged protocol widened the sandbox review surface beyond a bug fix, so it stays a revisit candidate.
- Run a main-side static server with preview leases for local files — strongest case is uniform handling of images, stylesheets, and scripts, yet lease lifecycle and port management duplicated machinery the read-only preview does not need.
- Do nothing / reuse — keeping pass-through rendering was not viable because every workspace-local `png/gif` reference in Markdown and HTML previews stayed broken with no user-side workaround.

## Consequences

- **Gains**: Central editor (`FileViewerContent` through `MarkdownViewer`/`HtmlViewer`) and product-column (`LocalFileStage`) Markdown and HTML previews display workspace-local `png/gif` and sibling image formats; loading states never fire broken requests against the app bundle.
- **Costs and limits**: Single images above 8MB remain unresolved; the success cache holds 120 entries with oldest-first eviction; a leading `/` always means workspace-root while a workspace is known, so POSIX absolutes outside the workspace cannot use that spelling (full absolute paths still resolve). The natural revisit signal is a custom read-only asset protocol once HTML previews need stylesheets or scripts as well as media.
- Verification: `npm run test:unit -- --run tests/unit/local-asset-resolver.test.ts` passes 9/9; `tests/unit/file-classification.test.ts` passes 12/12; ESLint on all touched renderer files reports 0 errors; `npm run typecheck` reports only the pre-existing unrelated errors in `src/main/harness/execution-adapter.ts`, none in touched files.
