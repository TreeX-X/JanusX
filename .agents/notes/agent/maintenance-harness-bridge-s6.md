---
{
  "schema": "harness-note/2",
  "id": "1f21d390-171c-57ba-9b8b-cca02d74c39a",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-17",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-17-agent-note-maintenance-to-harness-operation-bridge--1f21d390.md",
      "sourceHash": "6a0c13fff34d149ddbf022bffe5d3133159a7c0307a5560c9293706453afe8dd",
      "originalBodyHash": "a188034597384f846a7296ecc19076b4c69db0d33aac85206c48fcb0e42faef5",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Maintenance to harness operation bridge. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: 2026-09-17-maintenance-harness-apply-s6.md -> ./2026-09-17-maintenance-harness-apply-s6--66bf1be8.md",
        "Rebased Markdown destination: 2026-09-17-maintenance-harness-guard-s6.md -> ./2026-09-17-maintenance-harness-guard-s6--2b73dd7d.md",
        "Rebased Markdown destination: ../../proposed/architecture/2026-09-16-note-harness-implementation-contract.md -> ./2026-09-16-note-harness-implementation-contract--537de6bf.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-17-maintenance-harness-bridge-s6.md",
        "sourceHash": "fd8ead8ef16b1f67c0709c5b17417e9952ecd5884a2e4e2ec1c08381ed7b14f7",
        "originalBodyHash": "0d39e7a7b179bff8119315c16979bcee5daf4cf1f053cc4875c1640d96347e25"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Maintenance to harness operation bridge


## Problem

The S6-c guard keeps project graphs safe by refusing maintenance writes, but no machine rule says how a maintenance proposal becomes harness operations. Each future writer invents the mapping by hand: prose fields land in the wrong sections, relation direction flips get lost, and same-note edit chains collide on expectedHash inside one changeset. Without a shared translator, the bridge stays a paragraph and every apply risks silent loss.

## Decision

`translateMaintenanceOpsToHarness` in `src/main/harness/maintenance-bridge.ts` owns the mapping as a pure function: maintenance operations in, harness operations plus per-op refusals out. Creates carry full prose in a single op; updates move through `applyNodePatch`; relations resolve through the synthetic projection id with `blocks` flipping direction and `related-to` landing on the smaller URI; deletes downgrade to archive with an explicit flag; restores verify snapshot edges. All touches of one URI fuse into a single op because the transaction pre-checks every hash against disk. Refusals cover kind changes, progress, features, relation prose, workspace bindings, and dependency cycles. `mergeNoteEdit` moves to `artifact-producer` as the single merge implementation with the service delegating. Scope follows [implementation contract](../blueprint/note-harness-implementation-contract.md) C2/C5 and the [harness guard](./maintenance-harness-guard-s6.md).

Note section edits use `update-node.after.sections`: exact Markdown heading names map to complete replacement section bodies. Explicit sections override the legacy canvas field mapping when both address the same heading. The existing merge preserves unrelated sections, frontmatter and Note identity; normal parse validation and preview approval still apply. This lets requirement edits reach `Expected behavior` and `Acceptance criteria` without using the unsupported `features` array. The real-file review and approval regression is recorded in the [review implementation](../blueprint/tasks/blueprint-review-implementation.md#verification).

## Alternatives considered

- Wire the service apply path first and translate inline — strongest case is a working panel sooner, but permission, evidence, and audit semantics stay untested inside a filesystem-coupled method; a pure translator pins the table before any wiring.
- Keep the mapping as documentation only — strongest case is zero new code, but prose cannot enforce hash fusion or edge ownership and reviews stay opinion-based.
- Do nothing / reuse — keep the S6-c guard as the permanent answer; rejected because the blueprint panel stays dead on project graphs and canvas remains the only write path.

## Consequences

- **Gains**: the mapping table is executable and reviewed as code. The
  service wiring consumes it through `src/main/harness/maintenance-apply.ts`,
  which also exposes the created node and relation ids the bridge reports
  for audit bookkeeping (see the [harness apply routing](./maintenance-harness-apply-s6.md)).
  Verification: `tests/unit/maintenance-bridge.test.ts` (12 checks: full-prose create with temp resolution, fused update plus move, refusal taxonomy, work preservation, relation direction and ownership, synthetic-id update plus remove, archive downgrade, restore edge check, dependency mapping with cycle refusal), existing harness plus roundtable suites (20 checks) stay green through the `mergeNoteEdit` move, `npm run typecheck` passes, scoped eslint on touched sources reports 0 errors.
- **Costs and limits**: output is single-use (create URIs mint fresh ids). Relation prose has no edge equivalent and fails loudly by design; `update-workspace-binding` and cross-owner type changes need contract decisions, not code. The maintenance loop still runs its own circuit; discussion unification and the service apply wiring arrive next.
