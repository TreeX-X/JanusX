# Agent Note: Maintenance harness guard for project graphs

Status: implemented

## Problem

The legacy maintenance loop accepts project graph ids and fails obscurely mid-flow: discussion burns model turns before `applyMaintenanceOperations` throws `HARNESS_MANAGED`, while `apply` and `applyUndo` write pending audit records before that same failure, leaving orphan audits behind. Each wasted turn plus each orphan record erodes trust in the blueprint panel on harness projects.

## Decision

`throwIfHarnessManaged` in `src/main/janus/maintenance/service.ts` rejects `harness:project:` ids at the entry of `start`, `prepareUndo`, and `applyUndo` with `HARNESS_MANAGED`, before any store read, audit write, or model turn. Legacy blueprints pass the guard untouched to the existing gates. `apply` needs no guard: tasks live only in process memory and `start` blocks project tasks from ever existing, so its `blueprintId` never carries the project prefix. The 1008-line discussion loop stays intact; full routing through the harness transaction arrives in the next slice. Scope follows [implementation contract](../../proposed/architecture/2026-09-16-note-harness-implementation-contract.md) C8-S6 and the [chat turn guard](2026-09-17-chat-turn-guard-domain-s6.md).

## Alternatives considered

- Route maintenance writes through the harness transaction now — strongest case is a working panel on project graphs immediately, but blueprint operations (relations, bindings, restore) lack proven harness translations and delete-versus-archive semantics differ; a mistranslation corrupts Notes worse than a clear refusal.
- Allow discussion but block only apply — strongest case is preserved analysis value on project graphs, but proposals can never land and pending audits still orphan; fail-fast keeps the panel honest.
- Do nothing / reuse — keep the mid-flow `HARNESS_MANAGED` throw; rejected because it wastes turns and writes orphan pending audits before failing.

## Consequences

- **Gains**: project graph entries fail fast with an actionable code; legacy maintenance behavior is byte-identical. Verification: `tests/unit/blueprint-maintenance-harness-guard.test.ts` (5 checks: start/prepareUndo/applyUndo refuse project ids without store reads, legacy ids reach existing gates, helper exactness), existing `blueprint-maintenance-service` suite (10 checks) passes with a one-line mock fidelity fix, `npm run typecheck` passes, scoped eslint on the service reports 0 errors.
- **Costs and limits**: the panel offers no maintenance actions on project graphs yet; canvas and `wfx-notes` remain the write paths there. The loop still runs its own agent circuit instead of shared `runChatTurn`, and `prepareUndo` stays read-blocked rather than bridged. Revisit when the harness apply bridge translates blueprint operations with undo equivalence.
