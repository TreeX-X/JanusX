# Agent Note: Desktop xdo host executes checks and self-review

Status: implemented

## Problem

Desktop task runs stop at prepare and start. Verification, receipts, finish,
and recovery stay executor-side, so the run panel cannot complete an xdo run
and no run completes without a formal receipt on the desktop path. The CLI task-execution host
cannot fill the gap: it drives the terminal ChatTurn runtime, and the two
hosts are peers sharing only the contract and the receipt validator.

## Decision

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
- **Costs and limits**: there is no granular record/finish IPC and
  no repair channel: xdo retries re-execute on the same manifest, and repair
  stays reserved for delegated hosts. Declared commands are trusted
  workspace code under runtime policy, not an operating-system sandbox.
  Single-checkout tasks only; multi-repository work splits per repo. Five
  desktop fixture specs pass in-browser on the dev machine (xdo run,
  review-repair, undo, thread registry, external backflow); the
  real-Electron smoke fails on an unrelated right-dock collapse assertion
  against a fresh build, pointing outside this work.
