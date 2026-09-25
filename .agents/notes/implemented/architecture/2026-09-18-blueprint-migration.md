---
schema: harness-note/1
id: 1915e29e-2d68-5b6d-9fbd-b2f1219dec9c
kind: decision
lifecycle: implemented
created: 2026-09-18
class: architecture
---
# Agent Note: On-demand legacy blueprint migration

Status: implemented

## Problem

Legacy JSON blueprints cannot enter the harness graph, yet their nodes,
relations, and audit history hold real planning value. Manual retyping loses
structure, bulk conversion destroys history, and deleting the old loop
before migration strands unmigrated tasks with no path forward. Migration
must be per-blueprint, reviewable before writing, and archival instead of
deletion.

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
