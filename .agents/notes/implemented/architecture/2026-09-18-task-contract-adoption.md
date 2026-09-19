# Agent Note: Explicit adoption of roundtable task contracts

Status: implemented

## Problem

Roundtable action artifacts are valid task drafts, but their open scope, acceptance criteria and checks are not executable contracts. A run panel without an adoption step either refuses these drafts without a repair path or risks treating discussion as execution authorization.

## Decision

The task run panel reads the current task and offers a contract editor for draft or proposed tasks without execution. The user supplies scope, allowed repository paths, concrete acceptance criteria, requirement references and verification steps, then explicitly adopts the task. The host checks the lifecycle transition, validates and round-trips the resulting Note, and uses expected-hash replacement through the existing recoverable asset transaction. A stale submission fails with a conflict and can be reloaded. Adoption does not prepare a run or execute a command.

The editor currently targets the selected primary repository. Scope and verification must remain in that repository. External acceptance references must resolve to accepted requirements or initiatives in the same repository; task-local criteria are included automatically. Requirement references determine implements relations, avoiding another independently edited coverage list. Required verification must include at least one concrete step. Placeholder scope or criteria, unknown criteria, escaping paths and malformed inputs are refused before writing. Execution readiness remains subject to the shared baseline validator.

Entry points are the [adoption service](../../../../src/main/harness/task-adoption.ts), [IPC handlers](../../../../src/main/ipc/harness-handlers.ts), [contract editor](../../../../src/renderer/src/components/janus/TaskContractEditor.tsx) and [run panel](../../../../src/renderer/src/components/janus/HarnessRunPanel.tsx). Formal validity and closeout continue to use [portable task results](2026-09-18-harness-portable-results.md), not the adoption lifecycle or UI checkboxes.

## Alternatives considered

- Adopt action artifacts automatically: removes a step but turns an unfinished discussion into an executable agreement.
- Require raw Markdown edits for every missing field: already possible, but does not complete the roundtable-to-task workflow in the desktop surface.
- Add a separate execution plan: offers a specialized form but duplicates task scope, criteria and identity already owned by the Note.

## Consequences

Accepted tasks unlock run preparation; execution and closeout remain separate. The editor can preserve and edit existing manual verification steps, but adding manual steps, supplying manual evidence and editing cross-repository contracts are not implemented in this UI. Repeating adoption with an old hash returns a conflict; adoption is not advertised as an idempotent command.

The integration test builds a real roundtable action bundle, persists its draft, adopts it, prepares and starts through the desktop adapter, and invokes the shared execution kernel with a real Node verification command and a stubbed reviewer. After Git commits, a clone without local runs reconstructs a valid completed result, satisfied closeout and 100 percent requirement coverage. Changing code makes the receipt stale and coverage zero. This proves the shared-kernel boundary, not a full CLI process or desktop model-driven executor.

The focused regression group passes 25 suites and 139 tests; the browser fixture passes two cases, including contract adoption at a 390-pixel viewport. Typecheck, production build, package boundaries and bilingual key checks pass. Existing maintenance tests emit knowledge-processing warnings. Real-model Electron execution, packaged runtime validation and cross-platform release acceptance remain outstanding; the unified standard stays a candidate.
