---
schema: harness-note/1
id: 854981c7-ab43-521f-a379-020ce1549f12
kind: decision
lifecycle: implemented
created: 2026-09-19
class: architecture
---
# Agent Note: Durable desktop implementation history

Status: implemented

## Problem

An interrupted desktop implementation can leave edited files before verification produces a receipt. Without a durable record, reopening the panel hides those observations and loses the stop control while the host continues working. A retry needs context tied to the accepted task without treating an uncertain tool outcome as permission to replay it.

## Decision

`task-transcript.ts` stores implementation output in `.agents/.local/runs/<runId>/implementation.json`. Records contain at most eight turns, 16,000 text characters and 64 tool entries per turn, with 512 characters per tool summary. Text and summaries pass the existing high-confidence secret redactor. Tool arguments, raw results and reasoning are absent. Atomic writes run in one local queue, start before the model, buffer events for 200 milliseconds, and flush before each model tool and on completion or cancellation. Write failures stop the implementation path; existing formal evidence remains authoritative.

Recovery takes at most three records matching the task URI and the hash of its complete baseline, including inputs. The model receives bounded untrusted observations and must reread files before editing. Recovery never replays calls or grants authority. Abandoned running turns and unfinished tool outcomes display as interrupted. The [implementation host](2026-09-19-desktop-task-implementation.md) continues checking the actual lease, scope, attempt and live baseline before every tool.

The read-only `runTranscript` interface combines local records with the host's active execution reservation. Reservations include the checkout and run identity. The panel polls once a second without overlapping requests, discards responses for inactive views, and restores the stop control after remount. An implementation turn ending does not mean the task passed verification. Explicit thread closure removes local history and briefs while keeping Notes, receipts and run records; a live writer refuses closure. Invalid paths, linked directories and corrupt records refuse instead of overwriting content. Read diagnostics preserve their code in the Electron error message.

## Alternatives considered

Do nothing and reuse attempt summaries keeps storage small, but provides no implementation observations before verification. Persist the entire project chat offers full conversation replay and a familiar display, but mixes mutable attachments with fixed task authority and retains raw tool data. Bounded local records use the existing atomic writer and task boundary. Full protocol restoration remains appropriate only if interrupted tools gain explicit replay semantics.

## Consequences

The history, implementation host, IPC, execution adapter and thread suites contain 66 passing checks: run `npx vitest run tests/unit/harness-task-transcript.test.ts tests/unit/harness-desktop-executor.test.ts tests/unit/harness-run-handlers.test.ts tests/unit/harness-ipc-contract.test.ts tests/unit/harness-execution-adapter.test.ts tests/unit/harness-task-thread.test.ts`. The three browser fixtures pass with `npx playwright test tests/e2e/desktop-xdo-run.spec.ts tests/e2e/desktop-thread-registry.spec.ts tests/e2e/desktop-review-repair.spec.ts`, including remount, live stop, restored output and eventual completion controls.

`npx playwright test --config playwright.desktop.config.ts tests/e2e/desktop-harness-runtime.spec.ts` exercises the built Electron application against a deterministic local HTTP model: real IPC, model transport, file read and edit from 42 to 43, declared command, review claim, immutable receipt, commit closeout and history after application restart. This measures the host integration, not model quality. The opt-in `harness-desktop-xdo-live.test.ts` requires `JANUS_XDO_LIVE_MODEL`, `JANUS_XDO_LIVE_BASE_URL` and `JANUS_XDO_LIVE_API_KEY` for the configured compatible endpoint; it uses the same file-change acceptance without importing Electron settings into Node. Without those explicit credentials the test skips. Typecheck, production build, package boundaries, bilingual keys and touched-source lint pass.

The last unflushed events can be lost on process failure, old turns are pruned, and recognized-secret redaction is not a general content classifier. One desktop process owns the writer; this is not a cross-process transcript lock. Records stay local and do not join share exports or formal receipts. Interactive clarification, full protocol continuation, external real-model Electron acceptance and delegated hosts remain outside this boundary; [S9 readiness](2026-09-18-harness-s9-readiness.md) tracks the remaining integration work.
