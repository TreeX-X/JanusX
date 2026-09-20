# Agent Note: Maintenance to harness operation bridge

Status: implemented

## Problem

The S6-c guard keeps project graphs safe by refusing maintenance writes, but no machine rule says how a maintenance proposal becomes harness operations. Each future writer invents the mapping by hand: prose fields land in the wrong sections, relation direction flips get lost, and same-note edit chains collide on expectedHash inside one changeset. Without a shared translator, the bridge stays a paragraph and every apply risks silent loss.

## Decision

`translateMaintenanceOpsToHarness` in `src/main/harness/maintenance-bridge.ts` owns the mapping as a pure function: maintenance operations in, harness operations plus per-op refusals out. Creates carry full prose in a single op; updates move through `applyNodePatch`; relations resolve through the synthetic projection id with `blocks` flipping direction and `related-to` landing on the smaller URI; deletes downgrade to archive with an explicit flag; restores verify snapshot edges. All touches of one URI fuse into a single op because the transaction pre-checks every hash against disk. Refusals cover kind changes, progress, features, relation prose, workspace bindings, and dependency cycles. `mergeNoteEdit` moves to `artifact-producer` as the single merge implementation with the service delegating. Scope follows [implementation contract](../../proposed/architecture/2026-09-16-note-harness-implementation-contract.md) C2/C5 and the [harness guard](2026-09-17-maintenance-harness-guard-s6.md).

## Alternatives considered

- Wire the service apply path first and translate inline — strongest case is a working panel sooner, but permission, evidence, and audit semantics stay untested inside a filesystem-coupled method; a pure translator pins the table before any wiring.
- Keep the mapping as documentation only — strongest case is zero new code, but prose cannot enforce hash fusion or edge ownership and reviews stay opinion-based.
- Do nothing / reuse — keep the S6-c guard as the permanent answer; rejected because the blueprint panel stays dead on project graphs and canvas remains the only write path.

## Consequences

- **Gains**: the mapping table is executable and reviewed as code. The
  service wiring consumes it through `src/main/harness/maintenance-apply.ts`,
  which also exposes the created node and relation ids the bridge reports
  for audit bookkeeping (see the [harness apply routing](2026-09-17-maintenance-harness-apply-s6.md)).
  Verification: `tests/unit/maintenance-bridge.test.ts` (12 checks: full-prose create with temp resolution, fused update plus move, refusal taxonomy, work preservation, relation direction and ownership, synthetic-id update plus remove, archive downgrade, restore edge check, dependency mapping with cycle refusal), existing harness plus roundtable suites (20 checks) stay green through the `mergeNoteEdit` move, `npm run typecheck` passes, scoped eslint on touched sources reports 0 errors.
- **Costs and limits**: output is single-use (create URIs mint fresh ids). Relation prose has no edge equivalent and fails loudly by design; `update-workspace-binding` and cross-owner type changes need contract decisions, not code. The maintenance loop still runs its own circuit; discussion unification and the service apply wiring arrive next.
