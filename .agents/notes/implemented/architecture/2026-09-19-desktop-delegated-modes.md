---
schema: harness-note/1
id: fbac0251-beff-50d7-9363-18fa7e812781
kind: decision
lifecycle: implemented
created: 2026-09-19
class: architecture
---
# Agent Note: Desktop delegated task modes

Status: implemented

## Problem

Desktop mode selection needs corresponding executable behavior. Delegated tasks require isolated implementor context, xflow requires independent evidence, and a receipt that identifies its evaluator as its implementor cannot validate completion. Persisted task state also needs enough endpoint information to recover both roles after restart.

## Decision

`executeDesktopTask` uses the [shared role and mode policy](../../../../../janus-agentX/.agents/notes/implemented/architecture/2026-09-19-delegated-task-hosts.md), the [scoped implementation runtime](2026-09-19-desktop-task-implementation.md), and the neutral run kernel. xdel executes one implementation, declared checks and self-review. xflow adds an independent evaluator and consumes the existing repair budget for required-check failures or needs-fix verdicts. A verifying retry only repeats verification. The desktop executor remains a peer of the CLI host; it never calls the CLI task-execution adapter.

Both self-review and independent evaluation have fresh runtimes and chat sessions with no implementation transcript. The independent evaluator receives pinned task evidence with no prior verdicts, reads files through the shared restricted tool policy, and cannot write or read task histories. Final receipt identity separates the implementor from the evaluator. Every command boundary and receipt submission rechecks the live task; changed scoped files produce blocked evidence. Cancellation drains model tools and command processes before returning. Blocked, malformed or stale evidence does not spend repair budget. Optional receipt review summaries carry repair findings.

The execute action supports all internal modes and explains xdel/xflow behavior beside the selector. Execution IPC uses the implementation endpoint for self-review and a separately selectable reviewer endpoint for xflow, defaulting to the implementation endpoint in a separate context. Task threads persist reviewer identity and model independently. Re-selecting a local run restores both endpoints; IPC also supports recovery without re-supplying them. Standalone independent review preserves the original receipt author and checks live files before recording its verdict. Finalization uses that implementor identity and current file hashes.

## Alternatives considered

Keep the modes disabled: avoids new execution paths, but leaves the user-facing mode selection incomplete. Call the CLI execution host: reuses lifecycle code, but couples desktop execution to CLI model and runtime policy. Supply only hashes to the evaluator: uses fewer tokens, but prevents code inspection and weakens review.

## Consequences

The host executes one task at a time per run within a checkout. Independent review may use the same model in a separate context; it does not prove diversity of model judgment. Direct reads keep the evaluator capability small but require it to use manifest paths for discovery. Parallel task graph scheduling, cross-checkout execution, raw model protocol recovery and external real-model acceptance remain separate work in [S9 readiness](2026-09-18-harness-s9-readiness.md).

`npx vitest run tests/unit/harness-desktop-executor.test.ts tests/unit/harness-independent-review.test.ts tests/unit/harness-run-handlers.test.ts tests/unit/harness-task-thread.test.ts tests/unit/harness-ipc-contract.test.ts tests/unit/harness-task-transcript.test.ts` covers 73 tests. They cover both modes, identity rejection before implementation, independent source reads, history exclusion, findings-driven repair, exhaustion, drift and cancellation, endpoint persistence, IPC recovery, and xflow standalone re-review with retained implementor identity. `npx playwright test tests/e2e/desktop-xdo-run.spec.ts tests/e2e/desktop-review-repair.spec.ts` passes four browser fixtures. After `npm run build`, `npx playwright test --config playwright.desktop.config.ts tests/e2e/desktop-harness-runtime.spec.ts` passes three built Electron cases using a local deterministic HTTP model, actual read/edit tools, declared verification commands, receipts, Git closeout and application restart. These fixtures validate host behavior without claiming external model quality or a packaged release. Typecheck, package boundaries, translation checks and changed-file lint pass; repository-wide lint reports an unrelated `no-useless-escape` error in `src/main/web-test-gateway/page.ts:745`.
