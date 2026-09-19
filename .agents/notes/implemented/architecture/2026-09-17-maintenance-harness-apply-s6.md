# Agent Note: Maintenance writes land through the harness transaction

Status: implemented

## Problem

The blueprint panel stays dead on project graphs: starting a maintenance
task, preparing an undo, and applying one all fail fast at the entry, so
canvas edits and the terminal CLI remain the only write paths there. The
pure maintenance-to-harness translator exists, but no service path consumes
it, and undo has no equivalent on the harness lane: created note ids never
flow back into audit records, reverse operations never reach the
transaction, and a restarted app cannot resolve the checkout an audit
belongs to from the project id alone.

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
defines. This retires the entry refusal recorded in the [harness
guard](2026-09-17-maintenance-harness-guard-s6.md).

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
  discussion](2026-09-17-maintenance-discussion-unified-s6.md).
- Do nothing / reuse — keep canvas and the terminal CLI as the only write
  paths; rejected because proposals can never land from the panel and
  pending audits keep orphaning on the refused paths.

## Consequences

- **Gains**: the panel starts, proposes, applies, and undoes on project
  graphs through one transaction with audit equivalence. Verification:
  `tests/unit/maintenance-harness-apply.test.ts` (7 checks: joint
  update plus create with created ids, refusal with zero bytes written,
  relation id recording, delete-to-archive downgrade, checkout resolve
  plus ambiguity refusal, scope gate, created-mapping exposure),
  `tests/unit/blueprint-maintenance-harness-routing.test.ts` (10 checks:
  project start, harness apply with audit root, loud refusal, scope
  refusal, undo roundtrip, evidence-drift stale with zero writes,
  delete-confirm refusal with zero writes, undo revision conflict
  with zero writes, conversation-linked cancel with zero writes,
  legacy steering refusal on shared tasks), neighboring `maintenance-bridge`,
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
  discussion](2026-09-17-maintenance-discussion-unified-s6.md)).
  Revisit when slimmer audits land.
