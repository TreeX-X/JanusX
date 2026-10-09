---
{
  "schema": "harness-note/2",
  "id": "2b73dd7d-a2e0-50b4-aa75-31f0ed371ba2",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-17",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-17-agent-note-maintenance-harness-guard-for-project-graphs--2b73dd7d.md",
      "sourceHash": "e48b60be610338df6c4af65ce5f3bd4985cc8718ebd66b1d0734ca27294e5518",
      "originalBodyHash": "4796084bb068c33f74c39f75b8db159ba17e7f96177f0d200a5d347980a4c75b",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Maintenance harness guard for project graphs. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: 2026-09-17-maintenance-discussion-unified-s6.md -> ./2026-09-17-maintenance-discussion-unified-s6--cb026d42.md",
        "Rebased Markdown destination: 2026-09-17-maintenance-harness-apply-s6.md -> ./2026-09-17-maintenance-harness-apply-s6--66bf1be8.md",
        "Rebased Markdown destination: 2026-09-17-maintenance-harness-apply-s6.md -> ./2026-09-17-maintenance-harness-apply-s6--66bf1be8.md",
        "Rebased Markdown destination: 2026-09-17-chat-turn-guard-domain-s6.md -> ./2026-09-17-chat-turn-guard-domain-s6--fd109997.md",
        "Rebased Markdown destination: ../../proposed/architecture/2026-09-16-note-harness-implementation-contract.md -> ./2026-09-16-note-harness-implementation-contract--537de6bf.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-17-maintenance-harness-guard-s6.md",
        "sourceHash": "8bedaecdc92917177c486caf31e24ee92246bee51366c45e2e7b8009c0b4ec7b",
        "originalBodyHash": "c7027870b174ed10169de3f9de0a31a9c20ce453e45667267780af64ae09d253"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Maintenance harness guard for project graphs


## Problem

The legacy maintenance loop accepts project graph ids and fails obscurely mid-flow: discussion burns model turns before `applyMaintenanceOperations` throws `HARNESS_MANAGED`, while `apply` and `applyUndo` write pending audit records before that same failure, leaving orphan audits behind. Each wasted turn plus each orphan record erodes trust in the blueprint panel on harness projects.

## Decision

Fail-fast interval: `throwIfHarnessManaged` in `src/main/janus/maintenance/service.ts` rejected `harness:project:` ids at the entry of `start`, `prepareUndo`, and `applyUndo` with `HARNESS_MANAGED`, before any store read, audit write, or model turn. Legacy blueprints passed the guard untouched to the existing gates. `apply` needed no guard: tasks lived only in process memory and `start` blocked project tasks from ever existing, so its `blueprintId` never carried the project prefix. The 1008-line discussion loop stayed intact; full routing through the harness transaction arrived in the next slice. Scope follows [implementation contract](../blueprint/note-harness-implementation-contract.md) C8-S6 and the [chat turn guard](./chat-turn-guard-domain-s6.md).

Slice 2b retires this refusal: start, discussion, proposal, apply, and
both undo entries now route project graph ids through the harness
transaction instead of throwing, with audit equivalence for undo. The
current behavior lives in the [harness apply routing](./maintenance-harness-apply-s6.md); this note stays as the record of the
fail-fast interval.

## Alternatives considered

- Route maintenance writes through the harness transaction now — strongest case is a working panel on project graphs immediately, but blueprint operations (relations, bindings, restore) lack proven harness translations and delete-versus-archive semantics differ; a mistranslation corrupts Notes worse than a clear refusal.
- Allow discussion but block only apply — strongest case is preserved analysis value on project graphs, but proposals can never land and pending audits still orphan; fail-fast keeps the panel honest.
- Do nothing / reuse — keep the mid-flow `HARNESS_MANAGED` throw; rejected because it wastes turns and writes orphan pending audits before failing.

## Consequences

- **Gains**: project graph entries fail fast with an actionable code; legacy maintenance behavior is byte-identical. Verification: `tests/unit/blueprint-maintenance-harness-guard.test.ts` (5 checks: start/prepareUndo/applyUndo refuse project ids without store reads, legacy ids reach existing gates, helper exactness), existing `blueprint-maintenance-service` suite (10 checks) passes with a one-line mock fidelity fix, `npm run typecheck` passes, scoped eslint on the service reports 0 errors.
- **Costs and limits**: slice 2b retires the refusal above: the panel now
  routes project graph maintenance through the harness transaction with
  audit equivalence, and the guard test file becomes the   routing suite
  (see the [harness apply routing](./maintenance-harness-apply-s6.md)).
  Discussion unification has since landed on the shared turn (see the
  [unified discussion](./maintenance-discussion-unified-s6.md)).
  Revisit when chat unification lands.
