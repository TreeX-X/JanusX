---
{
  "schema": "harness-note/2",
  "id": "66bf1be8-fad7-5c9c-8048-4bbe0b665950",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-17",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-17-agent-note-maintenance-writes-land-through-the-harness-transaction--66bf1be8.md",
      "sourceHash": "09ba94dbb9cc037264de5f2ff9e5f7a1b1d757e5e1e71d456d0e188fdcef73ff",
      "originalBodyHash": "eb1e0988f411a459fa243cb276c365fe4888e3f4ac13a6be0cfa45d5db499fa9",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Maintenance writes land through the harness transaction. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: 2026-09-17-maintenance-discussion-unified-s6.md -> ./2026-09-17-maintenance-discussion-unified-s6--cb026d42.md",
        "Rebased Markdown destination: 2026-09-17-maintenance-discussion-unified-s6.md -> ./2026-09-17-maintenance-discussion-unified-s6--cb026d42.md",
        "Rebased Markdown destination: 2026-09-17-maintenance-harness-guard-s6.md -> ./2026-09-17-maintenance-harness-guard-s6--2b73dd7d.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-17-maintenance-harness-apply-s6.md",
        "sourceHash": "dd74932410a70a335d4ab0a831291376b51fdbd1f1af911e5721181dd4b0ba06",
        "originalBodyHash": "1a7db0387cd9d0ce0af3e713072666fe4b7791fd775c09ccbc6c229c1155f366"
      }
    }
  },
  "updated": "2026-10-21T15:37:53.642Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Maintenance harness apply, bridge and guard

## Problem
The blueprint panel stays dead on project graphs: starting a maintenance
task, preparing an undo, and applying one all fail fast at the entry, so
canvas edits and the terminal CLI remain the only write paths there. The
pure maintenance-to-harness translator exists, but no service path consumes
it, and undo has no equivalent on the harness lane: created note ids never
flow back into audit records, reverse operations never reach the
transaction, and a restarted app cannot resolve the checkout an audit
belongs to from the project id alone.

### Maintenance to harness operation bridge
The S6-c guard keeps project graphs safe by refusing maintenance writes, but no machine rule says how a maintenance proposal becomes harness operations. Each future writer invents the mapping by hand: prose fields land in the wrong sections, relation direction flips get lost, and same-note edit chains collide on expectedHash inside one changeset. Without a shared translator, the bridge stays a paragraph and every apply risks silent loss.

### Maintenance harness guard for project graphs
The legacy maintenance loop accepts project graph ids and fails obscurely mid-flow: discussion burns model turns before `applyMaintenanceOperations` throws `HARNESS_MANAGED`, while `apply` and `applyUndo` write pending audit records before that same failure, leaving orphan audits behind. Each wasted turn plus each orphan record erodes trust in the blueprint panel on harness projects.


## Decision
`src/main/harness/maintenance-apply.ts` owns the landing as ordinary
functions over the real `HarnessNoteService`: `resolveProjectCheckout`
finds the checkout serving a project id, `assertHarnessScope` keeps the
legacy node-scope gate, and `applyMaintenanceSelection` translates one
selection and applies it as a single transaction. The task workspace wins
checkout resolution and the registered workspace list is the restart-safe
fallback; a scan that matches zero checkouts fails with binding guidance,
and a scan that matches more than one fails instead of writing the wrong
files. Translation stays all-or-nothing: any refusal fails the task loudly
with zero bytes written, and concurrent external edits surface
`HARNESS_CONFLICT` from the transaction instead of overwriting.

`src/main/janus/maintenance/service.ts` routes every project graph id
through this lane. Start, discussion, proposal, apply, and both undo
entries load the live projection instead of the JSON store; the legacy lane
is byte-identical for old ids. Apply and undo share the evidence recheck,
the delete-confirm gate, and the pending-to-applied audit shape, so undo
keeps working across restarts: audits carry the local checkout root, the
bridge reports created node and relation ids into the audit record, and
reverse operations translate through the same bridge before reaching the
same transaction. Delete intentions still downgrade to archive, and
non-canvas relation prose still refuses loudly, exactly as the translator
defines. This retires the entry refusal recorded in the harness
guard.

### Maintenance to harness operation bridge
`translateMaintenanceOpsToHarness` in `src/main/harness/maintenance-bridge.ts` owns the mapping as a pure function: maintenance operations in, harness operations plus per-op refusals out. Creates carry full prose in a single op; updates move through `applyNodePatch`; relations resolve through the synthetic projection id with `blocks` flipping direction and `related-to` landing on the smaller URI; deletes downgrade to archive with an explicit flag; restores verify snapshot edges. All touches of one URI fuse into a single op because the transaction pre-checks every hash against disk. Refusals cover kind changes, progress, features, relation prose, workspace bindings, and dependency cycles. `mergeNoteEdit` moves to `artifact-producer` as the single merge implementation with the service delegating. Scope follows [implementation contract](../blueprint/note-harness-implementation-contract.md) C2/C5 and the harness guard.

Note section edits use `update-node.after.sections`: exact Markdown heading names map to complete replacement section bodies. Explicit sections override the legacy canvas field mapping when both address the same heading. The existing merge preserves unrelated sections, frontmatter and Note identity; normal parse validation and preview approval still apply. This lets requirement edits reach `Expected behavior` and `Acceptance criteria` without using the unsupported `features` array. The real-file review and approval regression is recorded in the [review implementation](../blueprint/maintenance/tasks/blueprint-review-implementation.md#verification).


### Maintenance harness guard for project graphs
Fail-fast interval: `throwIfHarnessManaged` in `src/main/janus/maintenance/service.ts` rejected `harness:project:` ids at the entry of `start`, `prepareUndo`, and `applyUndo` with `HARNESS_MANAGED`, before any store read, audit write, or model turn. Legacy blueprints passed the guard untouched to the existing gates. `apply` needed no guard: tasks lived only in process memory and `start` blocked project tasks from ever existing, so its `blueprintId` never carried the project prefix. The 1008-line discussion loop stayed intact; full routing through the harness transaction arrived in the next slice. Scope follows [implementation contract](../blueprint/note-harness-implementation-contract.md) C8-S6 and the [chat turn guard](./chat-turn-guard-domain-s6.md).

Slice 2b retires this refusal: start, discussion, proposal, apply, and
both undo entries now route project graph ids through the harness
transaction instead of throwing, with audit equivalence for undo. The
current behavior lives in the harness apply routing; this note stays as the record of the
fail-fast interval.



## Alternatives considered
- Keep the entry refusal and leave the panel dead on project graphs —
  strongest case is zero new wiring and no audit format change, but every
  maintenance action then needs a second manual pass on canvas and the
  translator stays an untested paragraph.
- Translate inline inside the service apply path — strongest case is a
  working panel with no new module, but scope checks, checkout resolution,
  and created-id bookkeeping stay untested inside a filesystem-coupled
  method; a separately tested module pins them first.
- Unify the discussion loop onto the shared chat turn in the same change —
  strongest case is one conversation stack sooner, but it rewrites model
  context, approval, and steering behavior across both entries and dwarfs
  the wiring; done separately in the [unified
  discussion](./maintenance-discussion-unified-s6.md).
- Do nothing / reuse — keep canvas and the terminal CLI as the only write
  paths; rejected because proposals can never land from the panel and
  pending audits keep orphaning on the refused paths.

### Maintenance to harness operation bridge
- Wire the service apply path first and translate inline — strongest case is a working panel sooner, but permission, evidence, and audit semantics stay untested inside a filesystem-coupled method; a pure translator pins the table before any wiring.
- Keep the mapping as documentation only — strongest case is zero new code, but prose cannot enforce hash fusion or edge ownership and reviews stay opinion-based.
- Do nothing / reuse — keep the S6-c guard as the permanent answer; rejected because the blueprint panel stays dead on project graphs and canvas remains the only write path.

### Maintenance harness guard for project graphs
- Route maintenance writes through the harness transaction now — strongest case is a working panel on project graphs immediately, but blueprint operations (relations, bindings, restore) lack proven harness translations and delete-versus-archive semantics differ; a mistranslation corrupts Notes worse than a clear refusal.
- Allow discussion but block only apply — strongest case is preserved analysis value on project graphs, but proposals can never land and pending audits still orphan; fail-fast keeps the panel honest.
- Do nothing / reuse — keep the mid-flow `HARNESS_MANAGED` throw; rejected because it wastes turns and writes orphan pending audits before failing.


## Consequences
- **Gains**: the panel starts, proposes, applies, and undoes on project
  graphs through one transaction with audit equivalence. Verification:
  `tests/unit/maintenance-harness-apply.test.ts` (7 checks: joint
  update plus create with created ids, refusal with zero bytes written,
  relation id recording, delete-to-archive downgrade, checkout resolve
  plus ambiguity refusal, scope gate, created-mapping exposure),
  `tests/unit/blueprint-maintenance-harness-routing.test.ts` (11 checks:
  project start, harness apply with audit root, loud refusal, scope
  refusal, undo roundtrip, evidence-drift stale with zero writes,
  delete-confirm refusal with zero writes, undo revision conflict
  with zero writes, conversation-linked cancel with zero writes,
  concurrent-start guard, multi-workspace shared start), neighboring `maintenance-bridge`,
  `harness-service`, `harness-store-branch`, `blueprint-maintenance-*`,
  and roundtable suites stay green (50 plus 18 checks),
  `npm run typecheck` passes, and `npm run check:package-boundary`
  passes.
- **Costs and limits**: undoing a create leaves an archived note instead
  of removing the file, per the archive-by-default contract; undoing a
  removed non-canvas edge degrades to `related-to`, since the projection
  only keeps the raw type in prose. Re-applying one selection runs creates
  again, like the legacy lane, so callers never blindly retry a successful
  apply. Audits store full before and after projections, which grows audit
  files on very large graphs; slim snapshots stay a revisit signal. The
  discussion loop has since moved onto the shared turn (see the [unified
  discussion](./maintenance-discussion-unified-s6.md)).
  Revisit when slimmer audits land.

### Maintenance to harness operation bridge
- **Gains**: the mapping table is executable and reviewed as code. The
  service wiring consumes it through `src/main/harness/maintenance-apply.ts`,
  which also exposes the created node and relation ids the bridge reports
  for audit bookkeeping (see the harness apply routing).
  Verification: `tests/unit/maintenance-bridge.test.ts` (12 checks: full-prose create with temp resolution, fused update plus move, refusal taxonomy, work preservation, relation direction and ownership, synthetic-id update plus remove, archive downgrade, restore edge check, dependency mapping with cycle refusal), existing harness plus roundtable suites (20 checks) stay green through the `mergeNoteEdit` move, `npm run typecheck` passes, scoped eslint on touched sources reports 0 errors.
- **Costs and limits**: output is single-use (create URIs mint fresh ids). Relation prose has no edge equivalent and fails loudly by design; `update-workspace-binding` and cross-owner type changes need contract decisions, not code. The maintenance loop still runs its own circuit; discussion unification and the service apply wiring arrive next.

### Maintenance harness guard for project graphs
- **Gains**: project graph entries fail fast with an actionable code; legacy maintenance behavior is byte-identical. Verification: `tests/unit/blueprint-maintenance-harness-guard.test.ts` (5 checks: start/prepareUndo/applyUndo refuse project ids without store reads, legacy ids reach existing gates, helper exactness), existing `blueprint-maintenance-service` suite (10 checks) passes with a one-line mock fidelity fix, `npm run typecheck` passes, scoped eslint on the service reports 0 errors.
- **Costs and limits**: slice 2b retires the refusal above: the panel now
  routes project graph maintenance through the harness transaction with
  audit equivalence, and the guard test file becomes the   routing suite
  (see the harness apply routing).
  Discussion unification has since landed on the shared turn (see the
  [unified discussion](./maintenance-discussion-unified-s6.md)).
  Revisit when chat unification lands.
