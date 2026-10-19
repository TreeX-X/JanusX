---
{
  "schema": "harness-note/2",
  "id": "64286344-5e03-5193-8250-854abd64acff",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-18",
  "class": "bug-fix",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-preview-panes-resolve-workspace-local-images--64286344.md",
      "sourceHash": "6ef851eac5900c210c7a411c1d1e28577eec40a759eaa613ea001dccfecddf19",
      "originalBodyHash": "8ca1a763a07bfde4a58ba21cdd139871eb846edb609f318f1f2746b91b739ec3",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Preview panes resolve workspace-local images. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/bug-fix/2026-09-18-markdown-preview-local-assets.md",
        "sourceHash": "6ef851eac5900c210c7a411c1d1e28577eec40a759eaa613ea001dccfecddf19",
        "originalBodyHash": "8ca1a763a07bfde4a58ba21cdd139871eb846edb609f318f1f2746b91b739ec3"
      }
    }
  },
  "updated": "2026-10-19T02:23:35Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---
# Preview panes resolve workspace-local images


## Problem

Markdown documents that reference workspace-local images (`![](./assets/a.png)`, `![](/assets/a.png)`) render broken images in the central editor preview pane and in the product-column preview, and HTML previews drop relative media for the same reason. Directly opening a `png/gif` file works through the `file:readBinary` image chain, so authors cannot visually verify the documents they write while the files they reference open without issue.

## Decision

A pure path resolver maps each local asset `src` to an absolute workspace file path: document-relative segments resolve against the open document directory with `.`/`..` normalization, a leading `/` resolves workspace-root-relative while a workspace is known, Windows absolute paths and `file://` URLs pass through, and URL encoding, angle-bracket destinations, and query/hash suffixes are normalized before filesystem lookup. Remote, `data:`, `blob:`, and anchor URLs never enter resolution and render untouched.

Markdown image rendering loads the resolved path through `file:readBinary` and swaps in a `data:` URL, with in-flight deduplication and a bounded success cache shared by every preview surface. File and product previews parse and sanitize embedded HTML, resolve local candidates in img/source `srcset`, preserve image dimensions, and select picture theme branches from the application theme. Assets above 8MB stay unresolved rather than risking renderer memory pressure. Chat messages and QuickNote cards provide no workspace scope and keep the previous pass-through rendering; chat does not enable raw HTML parsing.

HTML previews now use the workspace-scoped read-only HTTP resource service documented in [file editor experience](./file-editor-experience.md). Native relative stylesheets, module imports, CSS assets and fetch requests resolve against the original document location, including unsaved drafts. Only the unavailable-service fallback rewrites `img/source/video/audio` `src` and `poster` to data URLs, capped at 30 assets; this fallback does not support general CSS or script dependency loading.

## Alternatives considered

- Serve workspace files over a custom protocol or inject `<base href>` into preview documents — strongest case is zero per-image IPC and native browser caching, but a new privileged protocol widened the sandbox review surface beyond a bug fix, so it stays a revisit candidate.
- A main-side static server was initially deferred for media-only previews. HTML stylesheet and module-script requirements now justify the bounded resource server; Markdown images retain the simpler binary pipeline.
- Do nothing / reuse — keeping pass-through rendering was not viable because every workspace-local `png/gif` reference in Markdown and HTML previews stayed broken with no user-side workaround.

## Consequences

- **Gains**: Central editor (`FileViewerContent` through `MarkdownViewer`/`HtmlViewer`) and product-column (`LocalFileStage`) Markdown and HTML previews display workspace-local `png/gif` and sibling image formats; loading states never fire broken requests against the app bundle.
- **Costs and limits**: Markdown images above 8MB remain unresolved; the success cache holds 120 entries with oldest-first eviction; a leading `/` always means workspace-root while a workspace is known, so POSIX absolutes outside the workspace cannot use that spelling (full absolute paths still resolve). The HTML service restricts real paths to the workspace and resources to 32MB and supported file types. Remote images depend on the remote service and network availability.
- Verification (2026-10-19): local-asset resolver unit tests pass 9/9; Markdown HTML and HTML server unit tests pass 6/6. Browser tests verify theme-aware picture selection, local srcset, sanitized markup and external links, using deterministic SVG fixtures for Star History. A real Electron integration verifies native CSS, nested module imports, root-relative fetch, local images, unsaved drafts and release. Typecheck, build and touched-source ESLint pass; the full command set and evidence are recorded in [file editor experience](./file-editor-experience.md).
