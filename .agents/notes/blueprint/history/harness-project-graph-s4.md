---
{
  "schema": "harness-note/2",
  "id": "bcadcdc9-1fc3-566c-90a9-e9d9f59b5b9d",
  "kind": "decision",
  "lifecycle": "archived",
  "disposition": {"reason":"Superseded by the read-only NoteGraph direction; retained frozen as history."},
  "created": "2026-09-16",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-16-agent-note-harness-project-graph-lane--bcadcdc9.md",
      "sourceHash": "1467e3b120b62a7de693708e8399695568c20528697792430806dbc38923a729",
      "originalBodyHash": "3b5ae3f4d0dcf331411e90b0660d3ffaa29da1b928ef61a6fe9e2fc6aa4dd85c",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Harness project graph lane. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-16-harness-project-graph-s4.md",
        "sourceHash": "1467e3b120b62a7de693708e8399695568c20528697792430806dbc38923a729",
        "originalBodyHash": "3b5ae3f4d0dcf331411e90b0660d3ffaa29da1b928ef61a6fe9e2fc6aa4dd85c"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd"
}
---
# Harness project graph lane


## Problem

Canvas edits, terminal edits, and future execution hosts reach the same project notes through separate write paths. Each path invents its own locking and conflict story, so concurrent saves lose bytes and crashed writes leave half-applied graphs. The canvas model also has no notion of file identity, expected hashes, or share-safe exports.

## Proposal

Establish HarnessNoteService (`src/main/harness/service.ts`) as the single managed gateway for project notes: checkout resolution, cached index with rescan, file watcher with change broadcast, transacted apply with idempotent operation records, local-only checkout bindings, and a whitelist share export that refuses machine paths, local state, and credentials. Project notes onto the Blueprint view model (`source: 'harness'`, per-node file identity plus last-seen digest) so canvas, detail, and list UI render unchanged; branch content operations by graph id in BlueprintStore; keep full read and write behavior for legacy JSON blueprints.

## Decision

HarnessNoteService (`src/main/harness/service.ts`) is the single managed gateway: checkout resolve, cached index with rescan, file watcher with change broadcast, transacted apply with idempotent operation records, local-only checkout bindings, and whitelist share export that refuses machine paths, local state, and credentials. Notes project onto the Blueprint view model (`source: 'harness'`, per-node file identity plus last-seen digest) so the existing canvas, detail, and list UI render them unchanged. BlueprintStore branches content operations by graph id: project creates/updates/archive flow through the service transaction with optimistic file hashes, canvas layout persists to local-only UI state, and acceptance/feature arrays plus maintenance operations report HARNESS_MANAGED for their owning flows. Legacy JSON blueprints keep full read and write behavior for old data. The workbench gains a scope strip (repo identity, binding count, share export, conflict notice with reload); stale canvas saves surface HARNESS_CONFLICT instead of overwriting.

## Alternatives considered

- Rewrite the store around notes in one pass — strongest case is zero legacy lanes, but analyzer sessions, maintenance loops, candidate flows, and team policies all ride the current model mid-flight, and a flag-day rewrite strands them.
- Keep a second JSON index beside the notes — strongest case is fast canvas reads with no model mapping, but two writable truths reintroduce the exact dual-edit drift this lane removes.
- Do nothing / reuse — keep ad-hoc writes per surface; rejected because half-applied graphs already block unified acceptance.

## Risks

- Analyzer, maintenance, candidate, and team write paths stay on the legacy lane until their owning segments unify; two lanes coexist in the interim.
- Checkouts without `harness.json` read fine but cannot mint note URIs, limiting cross-checkout references.
- Canvas deletes archive instead of removing; project metadata stays read-only until the owning segments land.

## Consequences

- **Gains**: 12 new checks pass (terminal→UI→terminal roundtrip, stale-save conflict with bytes preserved, share whitelist, bindings, 1000-note scan inside budget, store branching, IPC wiring). Full unit run reports 1517 passed with 9 failures proven pre-existing on clean HEAD (7 deterministic plus flaky knowledge-queue and janus-ipc cases, each verified via stash comparison). Project typecheck, scoped lint, and i18n check pass.
- **Costs and limits**: analyzer, maintenance, candidates, and team write paths stay on the legacy lane until their owning segments unify; project metadata is read-only and canvas deletes archive instead of removing; checkouts without `harness.json` read fine but cannot mint note URIs; task completion evidence arrives with the execution segment.
