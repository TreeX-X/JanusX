# Agent Note: Scoped desktop implementation before task verification

Status: implemented

## Problem

An accepted task needs a host that changes the scoped files before testing them. Running checks against untouched files leaves implementation outside the desktop lifecycle, and reopening a failed attempt without another implementation turn cannot repair the failure. The model must not use that write authority to change its contract, evidence, or run state.

## Decision

`executeDesktopTask` invokes a model implementation port for each running internal xdo attempt, then delegates checks and immutable receipts to the [desktop verification host](2026-09-18-desktop-xdo-executor.md). A failed required check can reopen an attempt through the shared repair budget; the next turn receives the pinned task and the repair summary. A verifying retry runs verification directly. Completion requires the shared receipt validator; model text never completes the task.

`desktop-task-turn.ts` creates an isolated agent runtime and chat session for the bound checkout. Explicit task start authorizes automatic file writes only within its literal work scope. The tool gate checks the current run, actual lease, attempt, profile and contract baseline before each call, while the standard workspace runtime also enforces path and sensitive-file policy. Available tools read, list, search, create, edit and delete files, plus local todos. Shell execution, delegation and ledger mutations are absent. The host executes only the task's declared verification commands; those commands are trusted workspace code, not an operating-system sandbox.

Cancellation drains the runtime tools before returning and pauses the run. An IPC reservation prevents duplicate execution during asynchronous model and thread preparation. The selected provider/model serves implementation and self-review; review receives the acceptance prose, check output and tested manifest. Task turns do not inherit personal chat or capture knowledge. Reattachment reconstructs context from fixed Notes and receipts, with model selection and attempt summaries in the existing task thread.

## Alternatives considered

Reuse the verification-only entry without an implementation turn keeps the host small, but it requires another writer and cannot carry automatic repair through to another check. Reuse the CLI task host offers a complete lifecycle but binds the desktop to another host's session ownership. The desktop instead uses the shared runtime and neutral state kernel through injected ports.

Reuse ordinary project chat preserves an interactive transcript and approvals, but its mutable resource attachments and personal context do not define the task's fixed authority. A separate runtime makes the scope and cancellation target explicit. Per-action approval remains appropriate for ordinary chat; the task host uses the already accepted contract and explicit start as the authorization boundary.

## Consequences

`tests/unit/harness-desktop-executor.test.ts` contains nine implementation checks using real temporary checkouts, actual workspace tools and deterministic model streams. They cover edit/failure/repair/success, two protected-write refusals, four live precondition changes, cancellation and repair-budget exhaustion with verification retry. Run `npx vitest run tests/unit/harness-desktop-executor.test.ts tests/unit/harness-run-handlers.test.ts` for the implementation and IPC boundary.

The JanusX Harness, migration, task adoption, artifact bundle and maintenance apply suites contain 116 passing checks; the live provider probe requires an explicitly configured model and remains unexecuted here. The browser fixtures `desktop-xdo-run.spec.ts` and `desktop-review-repair.spec.ts` pass with mocked host ports. Typecheck, production build, package boundaries and bilingual keys pass; touched-source lint reports one existing unused-helper warning. These results validate the local integration, without claiming real-provider Electron or packaged release acceptance.

The host supports one checkout and internal xdo. It stores attempt summaries and policy audit events, without a durable implementation transcript or interactive clarification UI. Tool failures refuse verification; users can correct the blocker and retry. Real provider acceptance, delegated execution, cross-machine orchestration, full transcript recovery and versioned releases remain separate work in [S9 readiness](2026-09-18-harness-s9-readiness.md).
