---
{
  "schema": "harness-note/2",
  "id": "fbac0251-beff-50d7-9363-18fa7e812781",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-19",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-19-agent-note-desktop-delegated-task-modes--fbac0251.md",
      "sourceHash": "1a44dc1759b100e3b8ae1bde31354a93774a301e505edb88cc45f5059c3460bf",
      "originalBodyHash": "ed3a17fa0953115cab1745f3f459597696f52fd21287b0d00c7be81d5ea3c229",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Desktop delegated task modes. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: 2026-09-18-harness-s9-readiness.md -> ./2026-09-18-harness-s9-readiness--28ce4fe4.md",
        "Rebased Markdown destination: 2026-09-19-desktop-task-implementation.md -> ./2026-09-19-desktop-task-implementation--958007ff.md",
        "Rebased Markdown destination: ../note://62b44166-82f0-41ff-838d-e2b02388ed06/2287ec26-2412-4138-a252-e9d6d4041232 -> ../../../janus-agentX/.agents/notes/implemented/architecture/2026-09-19-delegated-task-hosts.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-19-desktop-delegated-modes.md",
        "sourceHash": "d911fa7bdffbdcea7c91725edcd2f7219e47a5e0ac0b7b0cbedbcd96decbdc9a",
        "originalBodyHash": "5205264b76f4748b222b2670ebf324fed006dcf607417715d2c15042ebe184a9"
      }
    }
  },
  "updated": "2026-10-21T15:37:53.642Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Desktop delegated task modes and xdo host execution

## Problem
Desktop mode selection needs corresponding executable behavior. Delegated tasks require isolated implementor context, xflow requires independent evidence, and a receipt that identifies its evaluator as its implementor cannot validate completion. Persisted task state also needs enough endpoint information to recover both roles after restart.

### Desktop xdo host executes checks and self-review
Desktop task runs stop at prepare and start. Verification, receipts, finish,
and recovery stay executor-side, so the run panel cannot complete an xdo run
and no run completes without a formal receipt on the desktop path. The CLI task-execution host
cannot fill the gap: it drives the terminal ChatTurn runtime, and the two
hosts are peers sharing only the contract and the receipt validator.


## Decision
`executeDesktopTask` uses the [shared role and mode policy](note://62b44166-82f0-41ff-838d-e2b02388ed06/2287ec26-2412-4138-a252-e9d6d4041232), the [scoped implementation runtime](./desktop-task-implementation.md), and the neutral run kernel. xdel executes one implementation, declared checks and self-review. xflow adds an independent evaluator and consumes the existing repair budget for required-check failures or needs-fix verdicts. A verifying retry only repeats verification. The desktop executor remains a peer of the CLI host; it never calls the CLI task-execution adapter.

Both self-review and independent evaluation have fresh runtimes and chat sessions with no implementation transcript. The independent evaluator receives pinned task evidence with no prior verdicts, reads files through the shared restricted tool policy, and cannot write or read task histories. Final receipt identity separates the implementor from the evaluator. Every command boundary and receipt submission rechecks the live task; changed scoped files produce blocked evidence. Cancellation drains model tools and command processes before returning. Blocked, malformed or stale evidence does not spend repair budget. Optional receipt review summaries carry repair findings.

The execute action supports all internal modes and explains xdel/xflow behavior beside the selector. Execution IPC uses the implementation endpoint for self-review and a separately selectable reviewer endpoint for xflow, defaulting to the implementation endpoint in a separate context. Task threads persist reviewer identity and model independently. Re-selecting a local run restores both endpoints; IPC also supports recovery without re-supplying them. Standalone independent review preserves the original receipt author and checks live files before recording its verdict. Finalization uses that implementor identity and current file hashes.

### Desktop xdo host executes checks and self-review
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
Keep the modes disabled: avoids new execution paths, but leaves the user-facing mode selection incomplete. Call the CLI execution host: reuses lifecycle code, but couples desktop execution to CLI model and runtime policy. Supply only hashes to the evaluator: uses fewer tokens, but prevents code inspection and weakens review.

### Desktop xdo host executes checks and self-review
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
The host executes one task at a time per run within a checkout. Independent review may use the same model in a separate context; it does not prove diversity of model judgment. Direct reads keep the evaluator capability small but require it to use manifest paths for discovery. Parallel task graph scheduling, cross-checkout execution, raw model protocol recovery and external real-model acceptance remain separate work in [S9 readiness](./harness-s9-readiness.md).

`npx vitest run tests/unit/harness-desktop-executor.test.ts tests/unit/harness-independent-review.test.ts tests/unit/harness-run-handlers.test.ts tests/unit/harness-task-thread.test.ts tests/unit/harness-ipc-contract.test.ts tests/unit/harness-task-transcript.test.ts` covers 73 tests. They cover both modes, identity rejection before implementation, independent source reads, history exclusion, findings-driven repair, exhaustion, drift and cancellation, endpoint persistence, IPC recovery, and xflow standalone re-review with retained implementor identity. `npx playwright test tests/e2e/desktop-xdo-run.spec.ts tests/e2e/desktop-review-repair.spec.ts` passes four browser fixtures. After `npm run build`, `npx playwright test --config playwright.desktop.config.ts tests/e2e/desktop-harness-runtime.spec.ts` passes three built Electron cases using a local deterministic HTTP model, actual read/edit tools, declared verification commands, receipts, Git closeout and application restart. These fixtures validate host behavior without claiming external model quality or a packaged release. Typecheck, package boundaries, translation checks and changed-file lint pass; repository-wide lint reports an unrelated `no-useless-escape` error in `src/main/web-test-gateway/page.ts:745`.

### Desktop xdo host executes checks and self-review
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
