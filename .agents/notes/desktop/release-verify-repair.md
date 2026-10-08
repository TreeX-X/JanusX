---
{
  "schema": "harness-note/2",
  "id": "dda0c41e-4581-4de5-af98-8fbdc2e768f5",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-27",
  "class": "bug-fix",
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e"
}
---

# Repair v0.8.8 verify and release-win pipelines

## Problem

The v0.8.8 tag left both remote pipelines red. `verify` failed at Typecheck with 69 errors: every `@janus-agent/*` API the JanusX code consumes (checkpoint per-file records, session binding, `readMarkdownView`, `deriveMentions`, `resolveNoteReference`, `NoteIndex` coverage/`byUri`/`byPath`, `CheckpointManager.getChangedFileRecords`) was missing from the pinned sibling commit `317a5af`, which predates the seven local janus-agentX commits that introduced them. `release-win` did publish artifacts but failed its final `check:portable-runtime` gate: the new `module-graph` smoke died with `ERR_VM_MODULE_LINK_FAILURE: request for 'crypto' is not in cache`. Behind those two headline failures the rest of the chain had drifted too: 8 unit tests (R7 cache semantics, R3 note-wiki IPC growth, E0-1 checkout-scoped graph ids, R4 binding validation, S1.2 section validation), 2 `strict-unused` dead parameters, 5 archived notes missing validator sections plus 2 further note diagnostics, and 2 desktop e2e specs stale against the read-only V2 workbench, the default-off experimental gates, and the single-session dialog.

## Decision

Push the seven janus-agentX commits to origin and re-pin both workflows (`verify.yml`, `release-win.yml`) to `043552b1dd0932e29e09b95a60bde7c4e2660ee7`, restoring reproducible inputs. Normalize every bare Node builtin import in `src/main`, `src/shared`, `src/preload`, and `packages/llm-core` to the `node:` prefix (120 files; bare `crypto` does not link inside the asar ESM bundle while `node:crypto` does). Restore read-path freshness in `HarnessNoteService`: `singleProjectView` and `readSnapshot` go through a new hash-only `refreshIndex` (probe unchanged bytes ride the cache with a stable rev, changed files patch incrementally, dirty probes fall back to full rescan), while explicit `rescan` always mints a fresh rev as F10 requires. Update the stale test expectations to the intended semantics (knowledge IPC 30 to 34 channels for the four note-wiki additions; F12 twin-checkout ids differ per E0-1 with ambiguity covered by duplicate path spellings; R3 fixture binds two real `other` checkouts). Check out the `WorkFlowX` sibling in CI at the S1.2-final pin (the S1.2 compatibility test and the `../WorkFlowX` note links resolve locally but the runner has no such checkout), install Playwright chromium for the R3 UI unit test, and give the worktree-git fixtures repo-local git identity (runners carry no `user.name`/`user.email`, which failed merges with no conflicts reported). Repair the six note diagnostics with historically faithful sections and `AC-n` ids. Make the desktop specs match the shipped UX: conditional team-gate skip, note-seeded V2 canvas fixture written before reload, Janus panel header, reserved detail-track stability, five-button toolbar, and explicit `knowledge` flag enablement.

## Alternatives considered

- Revert JanusX to the old sibling APIs — strongest case is zero sibling movement, but it discards the S1.2 note-index, wiki reads, and checkpoint features v0.8.8 was built on; rejected because the release scope requires them.
- Exempt archived notes from harness section validation — strongest case is frozen history stays byte-identical, but it weakens the gate that keeps the whole corpus machine-readable; rejected in favor of additive, source-faithful sections.
- Float the CI sibling pin on `origin/main` — strongest case is never going stale again, but verification must be reproducible; rejected, the pin stays an explicit SHA and moves with the code that needs it.
- Do nothing / reuse — leave the tag red and ship the published-but-unsmoked artifacts; rejected because the portable installer then carries an unproven bootstrap graph.

## Consequences

- **Gains**: the full local chain passes — typecheck, llm-core typecheck/build/tests, unit suite, strict-unused, build, package-boundary, exclusions, i18n, notes (207 harness Notes, 0 errors), lint (0 errors), and desktop e2e 9 of 9 — so the remote `verify` and `release-win` gates have a proven-green base to run on.
- **Costs and limits**: the `node:` normalization touches 120 files (mechanical, behavior-preserving); `binding-store.ts` keeps its pre-existing NUL byte and still diffs as binary; the capsule e2e now seeds its canvas note instead of driving the removed create dialog, so dialog-driven creation has no e2e coverage until the V2 conversation flow gains its own spec.
