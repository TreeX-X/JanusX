---
{
  "schema": "harness-note/2",
  "id": "1915e29e-2d68-5b6d-9fbd-b2f1219dec9c",
  "kind": "decision",
  "lifecycle": "archived",
  "disposition": {
    "reason": "Superseded by the R2 migration inventory and the R5 full migration; retained frozen as history."
  },
  "created": "2026-09-18",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-on-demand-legacy-blueprint-migration--1915e29e.md",
      "sourceHash": "7e4be5cd884216092f2b31f572a2cc9f303ce57b2b2e10d3a48f5e2e52e67409",
      "originalBodyHash": "50badb0ea0af15a88b3d618bbb4f083ba57aa228a4dd7713bac6639fd029324c",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents On-demand legacy blueprint migration. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-18-blueprint-migration.md",
        "sourceHash": "7e4be5cd884216092f2b31f572a2cc9f303ce57b2b2e10d3a48f5e2e52e67409",
        "originalBodyHash": "50badb0ea0af15a88b3d618bbb4f083ba57aa228a4dd7713bac6639fd029324c"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd"
}
---
# On-demand legacy blueprint migration


## Problem

Legacy JSON blueprints cannot enter the harness graph, yet their nodes,
relations, and audit history hold real planning value. Manual retyping loses
structure, bulk conversion destroys history, and deleting the old loop
before migration strands unmigrated tasks with no path forward. Migration
must be per-blueprint, reviewable before writing, and archival instead of
deletion.

## Proposal

Convert one legacy blueprint at a time into draft Notes in the bound project: epics and features become requirements, tasks and open issues become task drafts, technical choices become governed-by decisions, pending candidates become ideas, and multiple roots aggregate under a fresh initiative. Re-anchor relations to the new identities, fold resolved issues into evidence, and keep a migration report with legacy statuses, audit history, and skipped content. Preview never writes; apply validates every note fail-closed, writes once through the managed transaction, then archives the JSON source. Expose `migratePreview`/`migrateApply` over IPC with checkout resolution and offer preview plus confirm in the legacy panel branch.

## Decision

`src/main/janus/blueprint-migrate.ts` converts one legacy blueprint into
draft Notes in the bound project: epics and features become requirements,
tasks and open issues become task drafts, technical choices become decisions
linked by governed-by, pending candidates become ideas, and multiple roots
aggregate under a fresh initiative. Relations re-anchor to the new
identities with depends-on, implements, and smaller-end related-to rules;
blocks travels as reversed depends-on. Resolved issues fold into evidence
because archived tasks would need fabricated execution contracts, which the
schema refuses. A migration report keeps legacy statuses, audit history,
and skipped content readable. Preview never writes; apply validates every
note fail-closed, writes once through the managed transaction, then archives
the JSON source, whose absence marks the migration done. Everything created
starts as a draft: machine migration asserts no acceptance. New channels
`migratePreview` and `migrateApply` cross IPC with checkout resolution, and
the legacy panel branch offers preview plus confirm.

## Alternatives considered

- Bulk-migrate all blueprints at once: one operation, but rewrites history
  nobody reviewed and strands in-flight legacy tasks mid-loop.
- Delete the JSON source after migration: tidiest disk, but destroys the
  only pre-image the report references; archive preserves it.
- Migrate statuses as verified states: done nodes look finished, but
  completion without evidence never verifies; drafts plus re-acceptance
  stay honest.
- Invent execution contracts for migrated tasks: passes validation, but
  fabricated scope and checks poison future baselines.
- Do nothing / reuse: keep retyping or keep the loop forever; rejected
  because the loop exit is authorized and waiting on exactly this entry.

## Risks

- Archived tasks cannot carry fabricated execution contracts, so resolved-issue evidence may read thinner than the original loop showed.
- A failed apply mid-transaction must leave no half-written notes; the fail-closed validation plus single managed write is the only guard.
- Deleting the old loop before migration strands unmigrated tasks; removal must wait for the migration report to confirm completion.

## Consequences

- **Gains**: one blueprint converts with previewed mapping, validated
  notes, anchored relations, readable audits, and an archived source in a
  single transacted write that the new undo can reverse. Mapping, relation
  anchoring, archival, idempotence-by-absence, and the panel confirm path
  carry unit, mapping, contract, and panel coverage. Typecheck, production
  build, package boundaries, and bilingual key checks pass.
- **Costs and limits**: create paths run relative to the notes directory
  while journal rows stay checkout-relative; the reverse path translates,
  and forward callers must keep the convention. Migration needs a bound
  project checkout with an identity; unbound workspaces get a refusal, not
  a guess. The legacy loop stays until its consumers migrate; the removal
  plan tracks the cut.
