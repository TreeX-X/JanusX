---
{
  "schema": "harness-note/2",
  "id": "b057b3f0-463e-544c-b6ea-f0d81106b1fa",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-18",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-desktop-xdo-host-executes-checks-and-self-review--b057b3f0.md",
      "sourceHash": "d615c0dcdb15c5cadae3ccf09551fce0089cfe92d01844509373c0553da37b3b",
      "originalBodyHash": "102e0ae173dc1650cab522f319312290ce0e0095c297e5b215aadc9190ddf9b3",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Desktop xdo host executes checks and self-review. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: 2026-09-19-desktop-task-implementation.md -> ./2026-09-19-desktop-task-implementation--958007ff.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-18-desktop-xdo-executor.md",
        "sourceHash": "2f11d80b5fc0dc593bacde777d7c247e686ce756642fe5616d3a6ca6217aafdd",
        "originalBodyHash": "360b9ac3b36e00edb1926c0da0f128017b2bb5135bac5edf5e3dd7b07ecfdc25"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Desktop xdo host executes checks and self-review


## Problem

Desktop task runs stop at prepare and start. Verification, receipts, finish,
and recovery stay executor-side, so the run panel cannot complete an xdo run
and no run completes without a formal receipt on the desktop path. The CLI task-execution host
cannot fill the gap: it drives the terminal ChatTurn runtime, and the two
hosts are peers sharing only the contract and the receipt validator.

## Decision

The [desktop implementation host](./desktop-task-implementation.md) owns model file changes and repeats them after an automatic repair. This module owns verification, receipts and the completion gate.

`src/main/harness/desktop-executor.ts` owns desktop xdo execution. It gates
mode `xdo` with an `internal` executor, re-pins the C3 baseline through the
neutral kernel, collects the scope manifest, verifies, runs every declared
step, obtains a self-review claim through an injected port, and records the
immutable receipt before finishing. Command steps run in a validated child
process without a shell: program plus args travel as an array and the cwd
must resolve inside the checkout. Manual steps need operator evidence with an
observer and an actual observation; missing evidence refuses instead of
passing. Coverage claims bind exact criterion hashes to passed check ids;
unknown, moved, or unpassed citations refuse. A manifest drift between review
and finish lands a blocked receipt as history and never completes.

`src/main/harness/desktop-review.ts` builds the read-only review prompt and
parses the strict coverage JSON. Malformed model output refuses; it never
approves. `createModelReviewPort` binds task identity to one model turn while
keeping model text injectable for tests. Production review runs one
project-scoped model turn through `llmService` plus `generateText` with a
single step and no tools, wired in `src/main/ipc/harness-handlers.ts`. New channels `runExecute`, `runPause`,
`runResume`, `runRebaseline`, and `runAbort` cross IPC as data or coded
failure. Lease tokens stay in the main process; an in-flight map owns abort,
and an aborted execution pauses the run. The panel gains execute, abort,
pause, resume, rebaseline, review-model inputs, manual evidence fields, and
receipt plus check display. `execution-adapter.ts` drops the CLI host
re-exports and keeps only the neutral kernel entry.

## Alternatives considered

- Reuse the CLI `verifyTaskExecution` from the desktop: no new host code,
  but the desktop inherits the terminal ChatTurn runtime and the hosts stop
  being peers; a CLI change silently moves desktop behavior.
- Fork the dispatcher and run store into JanusX: removes the package edge
  today, but duplicates the kernel and turns F10 equivalence into
  self-agreement; the kernel stays shared and its package relocation to
  `harness-node` is recorded follow-up with zero behavior change.
- Do nothing / reuse: keep execution terminal-only and the panel on
  prepare/start; rejected because desktop xdo stays impossible and every
  desktop completion claim stays unverified.
- Auto-pass manual steps or malformed reviews: removes operator friction,
  but fabricates evidence the kernel cannot distinguish from real checks.

## Consequences

- **Gains**: xdo runs complete on the desktop with real processes, operator
  evidence, model self-review, immutable receipts, and closeout through the
  existing check. Duplicate execute refuses `BUSY`; aborts pause; stale
  contracts refuse before running; drift records blocked receipts.
  `tests/unit/harness-desktop-executor.test.ts` pins success, failure
  receipts, review refusal, coverage forgery, manual evidence, mode and
  baseline gates, drift, and the review-port factory. Handler mapping pins
  token custody and stray aborts. `tests/e2e/desktop-xdo-run.spec.ts` drives
  the panel through adopt, prepare, start, pause, resume, rebaseline,
  mid-flight abort, and receipt display against the island fixture.
  `tests/unit/harness-desktop-xdo-live.test.ts` stays skipped without
  `JANUS_XDO_LIVE_PROVIDER` and `JANUS_XDO_LIVE_MODEL`; with credentials it
  completes a real task against live review plus a real commit closeout.
  The run panel binds the chat model catalog instead of free text: execute
  and review endpoints render provider and model selects from the same
  janus provider source and chat default, with free-text fallback when
  nothing is configured and no IPC or kernel change. The desktop run and
  review-repair specs drive the selects against the island fixture.
  Typecheck, production build, package boundaries, and bilingual key
  checks pass.
- **Costs and limits**: the desktop host spends the automatic repair
  budget through the shared kernel when a finished attempt fails checks:
  one automatic reopen with the failure context, then it parks for manual
  repair like before. There is no granular record/finish IPC: xdo retries
  re-execute on the same manifest, and explicit repair stays available
  beside the automatic path. Declared commands are trusted
  workspace code under runtime policy, not an operating-system sandbox.
  Single-checkout tasks only; multi-repository work splits per repo. Five
  desktop fixture specs pass in-browser on the dev machine (xdo run,
  review-repair, undo, thread registry, external backflow); the
  real-Electron smoke fails on an unrelated right-dock collapse assertion
  against a fresh build, pointing outside this work.
