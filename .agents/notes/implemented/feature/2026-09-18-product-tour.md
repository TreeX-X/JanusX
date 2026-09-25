---
schema: harness-note/1
id: 609e58ef-9930-59ef-80b7-80cc5890cb26
kind: decision
lifecycle: implemented
created: 2026-09-18
class: feature
---
# Agent Note: Product recordings and onboarding

Status: implemented

## Problem

Visitors need to see the desktop workflow before downloading JanusX. A command-only README does not explain package selection or the local sibling packages needed for source development.

## Decision

The README and download page show six recordings from the built desktop application and standalone CLI: terminal splitting, right sidebar and embedded editing, Janus CLI, roundtable preparation, blueprint browsing, and knowledge review. The recordings use a local clone of the actual repository. The split recording launches the real Janus and Claude terminal presets, places Janus-agentX on the left and Claude Code on the right, and shows tab dragging and divider resizing. The sidebar recording keeps Janus-agentX visible while opening file and Git tools and embedding the file editor. Blueprints and knowledge notes are manually authored from product structure and source files; the copy identifies their origin and distinguishes local preparation from model execution. Janus CLI, roundtable, blueprint and knowledge are explicitly experimental.

The recorder isolates the Electron profile, home, application-data directories and `JANUSX_KNOWLEDGE_ROOT`; userData alone does not isolate the knowledge store, which resolves its own root. Claude Code uses a temporary `CLAUDE_CONFIG_DIR` and local onboarding preferences, with no personal authentication data. Its bare mode skips OAuth and keychain reads. The recorder makes no model requests. Automation can inherit `NO_COLOR` and `TERM=dumb`, which suppress CLI colors; the recorder removes `NO_COLOR` and sets `TERM=xterm-256color`, `COLORTERM=truecolor` and `FORCE_COLOR=3` so captures retain the real terminal interface colors.

Images live in `wiki/assets` on the application branch and `assets` on gh-pages, so both surfaces render without depending on the other branch's deployment. The download choices remain above the product tour. README embeds animated GIFs with static-image links; the site uses posters and explicit play/stop controls, including a static default for reduced-motion users and a no-JavaScript image link fallback.

## Alternatives considered

Reusing text or static screenshots alone avoids animation maintenance but cannot demonstrate dragging, resizing and switching tools. Video offers better compression but cannot play inline in ordinary README image markup. GIF works in both surfaces, and a shared palette with unchanged pixels marked transparent limits transfer size. Hosting images only on Pages avoids duplication but ties README rendering to site publication.

## Consequences

Recordings require refreshing after visible interface changes. On Windows with Node.js 24, build the desktop application and install Janus-agentX and Claude Code so `janus` and `claude` resolve on PATH, then run `node scripts/capture-product.mjs` and `node scripts/capture-product.mjs --cli` sequentially. `--basic` and `--experiments` allow focused updates. The recorder retains raw frames under `.cache/product-recordings` and closes its Electron application; the encoder owns the GIF and poster output.

Install optional encoding tools using `npm install --prefix .cache/product-media --no-save --package-lock=false gifenc sharp`, then run `node scripts/encode-product-gifs.mjs`. The encoder produces six 1280 × 864 GIFs at four frames per second and six PNG posters, with an explanatory strip above the unmodified application capture. The six GIFs total approximately 1.84 MB and contain 21–39 frames each. Assets are written to temporary files before replacement to avoid partially written output when Windows refuses to overwrite an existing image. Copy these twelve assets to gh-pages with related copy changes. These media tools are not application runtime dependencies.

The README distinguishes packaged installation from source development and documents the sibling janus-agentX dependency. The desktop Janus terminal entry requires a separately installed `janus` executable. Its recording opens local `/help` before the command palette so that the fixed-height palette does not clip the empty-state banner. The site retains its existing release resolution and fallback links. Run the gh-pages `tests/download.test.cjs` with `JANUSX_PLAYWRIGHT` pointing to this repository's Playwright installation to verify release states, media failure and retry, and five viewport widths.
