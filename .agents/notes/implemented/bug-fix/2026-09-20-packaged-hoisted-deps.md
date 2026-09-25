---
schema: harness-note/1
id: 39f58575-dba9-584f-a285-a33a2c73cdc4
kind: decision
lifecycle: implemented
created: 2026-09-20
class: bug-fix
---
# Agent Note: Packaged node_modules is copied verbatim, not re-derived

Status: implemented

## Problem

The 0.8.7 portable and setup builds start and immediately exit: no window, no error dialog, no log. The packaged main process rejects during `bootstrapApp` with `ERR_MODULE_NOT_FOUND` for `micromark-util-subtokenize` (imported by `micromark-core-commonmark`) and `unist-util-visit-parents` (imported by `mdast-util-find-and-replace`), and `src/main/index.ts` turns that rejection into `process.exit(1)` before Electron is ready. Nothing is written anywhere because `electron-log` is itself reached through the broken chain (`src/main/updater/service.ts` is one of the bootstrap dynamic imports), so the failure is invisible from the user's side.

The packages are not missing from the install: `package-lock.json` hoists both to the project root and they exist there on disk. They are missing from `app.asar`'s `node_modules` root. electron-builder does not copy `node_modules` verbatim; it re-derives the tree with `node-dep-tree --flatten` (`app-builder-lib`'s `computeNodeModuleFileSets`) and writes anything that tool calls a conflict one level down, under whichever parent it picked. Measured on the shipped 0.8.7 archive, 35 packages end up nested-only. Two of them sit on the startup path, so startup dies; the rest (`semver`, `fs-extra`, `chalk`, `negotiator`, `iconv-lite`, `lru-cache`, `ajv`, `side-channel-list/map/weakmap`, `socks-proxy-agent`, `http-proxy-agent`, `node-addon-api`, `mdast-util-gfm-*`, `micromark-extension-gfm-*`) would have failed later at runtime, and the same missing set breaks the renderer's `react-markdown` chain, which is also resolved from inside the archive.

Local verification never saw this. `scripts/check-packaged-runtime.mjs` launched `win-unpacked/JanusX.exe` from inside the repository, where Node's ESM resolver walks out of the archive and finds the missing packages in the repo's own `node_modules`; and its `--smoke-test=llm-runtime` mode only imports `./llm/ai-runtime` and `./llm/LlmService`, so it never touched the markdown chain either. Both were confirmed by running the same binary from a neutral directory.

## Decision

`node_modules` is now copied exactly as npm installed it. `electron-builder.yml` sets `beforeBuild: ./scripts/electron-before-pack.cjs`, whose `false` return tells electron-builder that dependencies are prepared outside of it, which switches off `computeNodeModuleFileSets` entirely; `includeSubNodeModules: true` plus a `**/*` `files` pattern then copy the installed tree through the normal file walk. Nothing is re-derived, so no hoisted package can be nested away from the archive root, and the fix covers main, preload and renderer in one move.

`files` excludes only what provably cannot reach a packaged runtime: repository sources, caches and build outputs, and `packages` plus `node_modules/monaco-editor`, both of which are bundled into `out` (`electron.vite.config.ts` lists `@janusx/llm-core` under `externalizeDepsPlugin({ exclude })`, and Monaco ships as per-language renderer assets).

Detection replaced false-pass checking. `scripts/check-packaged-runtime.mjs` copies `win-unpacked` into a temp directory outside the repository before launching, so no path above the archive can stand in for a missing package, asserts that every declared runtime dependency is present at the archive root, and runs two smoke modes: `llm-runtime` for the AI runtime and the new `--smoke-test=module-graph`, which imports exactly what `bootstrapApp` imports plus the three lazy `createWindow` imports and then exits. `src/main/index.ts` exposes that graph through a shared `importBootstrapModules` so the smoke cannot drift from real startup. `release-win.yml` gained the packaged-runtime step after publishing.

## Alternatives considered

- Repair the archive after packaging by hoisting nested-only packages — closest to the original layout and the smallest diff, but `@electron/asar` cannot reproduce electron-builder's asar writer: electron-builder marks unpacked paths through its own smartUnpack detection, so a re-pack from `asarUnpack` globs alone silently repacked `node_modules/node-pty/LICENSE` into the archive and would have broken the native module.
- Overlay only the affected packages through `files` object-form entries — keeps the archive within a few megabytes of the old one, but the affected set cannot be predicted: a lockfile rule of "required by more than one declared dependency" missed 29 of the 35 nested-only packages, and the only exact source is the archive electron-builder already wrote, which forces a two-pass build.
- Ship a flat `node_modules` beside the archive under `resources/` — resolution does reach it, but the overlay must be self-contained, so it costs the whole tree again instead of the 1.5 MB that verbatim selection adds.
- Keep the dep tree and add the missing packages to `dependencies` — two lines today, but the affected set moves with every dependency change and the failure stays silent until something is added.

## Consequences

- **Gains**: the packaged app launches from a directory outside the repository; 35 nested-only packages, including runtime-required `semver`, `fs-extra` and the markdown chain, resolve from the archive root; `check:packaged-runtime` fails loudly instead of passing on a build whose artifacts are broken. Verification: `npm run typecheck`, `npm run build`, `npm run check:notes`, `npm run package:win` (which ends in `check:portable-runtime`) and a neutral-directory launch of both the unpacked and portable builds.
- **Costs and limits**: `app.asar` grows because npm's hoisted tree is larger than electron-builder's pruned selection, so both installers grow with it; `package:win` and the release workflow now spend a launch on verification; the smoke covers the main-process module graph, so a renderer-only unresolvable import still needs the archive-root assertion or a renderer check to catch. Revisit the size by excluding build-toolchain packages once a resolution audit can prove each exclusion is safe.
