---
schema: harness-note/1
id: 7fb01326-4bc0-47b2-9814-eba3df99032d
kind: decision
lifecycle: implemented
created: 2026-10-07
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c
class: process
---

# Dated preview portable packages carry the delivery date in the artifact name

## Problem

The 0.9.0 portable line needs a shareable no-install build that identifies when it was cut, without changing the base version. The 2026-10-06 knowledge preview established the delivery shape (dated folder under `release/`, dated executable name, README, SHA256SUMS, preview manifest) but that delivery was recorded only inside the knowledge task's Results prose; a second delivery on 2026-10-07 covering the session panel ground/fold fixes and knowledge follow-ups has no owning task of its own. Without a standing convention note, each re-delivery re-derives the naming, the manifest fields, and the verification sequence from the previous folder's contents.

## Decision

A dated preview portable is delivered as `release/preview-<date>/JanusX-<version>-preview-<date>-x64-portable.exe` with three companions in the same folder: `README-preview.txt` stating what the preview contains, `SHA256SUMS.txt` over the delivered executable, and `preview-manifest.json` recording `date`, `version`, `sourceCommit`, per-file sha256 of the packaged `out` tree, `scratchRoots`, `preservedWorktree` (sha256 of each dirty worktree file present at build time), the portable's own path/bytes/sha256, and a `verification` block naming the logs. The builder config lives at `artifacts/preview-<date>-builder.cjs` and only redirects `directories.output` and drops `playwright.desktop.config.ts`; the shipped `electron-builder.yml` exclusions apply as-is. The cut runs: build → `check:package-boundary` → `exclusions:sync` → `electron-builder --config … --win portable --x64 --publish never` → `check-packaged-runtime.mjs --release-dir … --portable` → packaged `knowledge-pipeline.spec.ts` under `JANUSX_DESKTOP_EXECUTABLE` → copy, rename, hash, manifest. The 2026-10-07 delivery follows this shape exactly: source commit `d86de88ff5692d437e3d17cc26d9d0f306d9230a`, executable 112122226 bytes, sha256 `536a2949feefaf2b7b045caec6ac42ed8d5f3bcaf1e7126c21dfc467a527bea0`, 210 build files hashed, runtime gate exit 0, 2 packaged e2e tests passed. The date marker identifies the artifact only; the program base version stays 0.9.0.

## Alternatives considered

- Record each delivery only in the task note whose work it ships — strongest case is provenance next to the work itself. The driver that rules it out is that deliveries span unrelated tasks (this one ships session panel and knowledge fixes together), and the packaging mechanics would be re-derived per task.
- Bump a preview suffix into `package.json` version for each cut — strongest case is tools read the version directly. The driver that rules it out is the base version must stay 0.9.0 so in-app update checks and the release line remain stable.
- Keep the previous name and overwrite the 2026-10-06 folder — strongest case is one canonical folder per version. The driver that rules it out is the date is the identity of a preview cut; overwriting destroys the SHA-pinned record recipients verify against.
- Do nothing / reuse — no note and copy the last folder's shape from its manifest. That is the entire benefit.

## Consequences

- **Gains**: a re-delivery is mechanical — name, folder, manifest fields and the verification sequence are fixed; recipients verify the dated executable against `SHA256SUMS.txt` and read `preview-manifest.json` for the exact source commit and worktree state the cut was made from.
- **Costs and limits**: the manifest's `preservedWorktree` records dirty files but does not repair them — the cut still ships whatever the worktree had (this delivery carried four such files, same list as 2026-10-06). The generator (`artifacts/preview-<date>-gen-manifest.mjs`) is per-date scratch, not a maintained script. Signing stays skipped (`no signing info identified`), so Windows SmartScreen warnings on the portable are expected. The 2026-10-07 cut built against the existing `node_modules` copy of the `@janus-agent` packages because the sibling checkout's `packages/` trees are deleted in its worktree and `npm install --install-links` (the `prepackage` step) fails with ENOENT; the packaged-runtime gate covering the production closure passed, but a future cut should restore the sibling worktree first.
- **Revisit signal**: if preview deliveries become frequent or multi-platform, lift the generator into `scripts/` and drive it from `package:preview`.
