---
{
  "schema": "harness-note/2",
  "id": "d216f355-f951-4f60-b209-7bb98b08dcbf",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-22",
  "class": "bug-fix",
  "relations": [
    {
      "type": "related-to",
      "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bb3ef36c-f74e-4589-98c7-601f8823d367"
    }
  ],
  "extensions": {
    "r5Migration": {
      "sourceHash": "1f9e3686df77c5c38cd4019be5533842e8201bc8e1a244bcfe6091388feb842f",
      "repairs": [
        "relations[0].reason"
      ],
      "originalRelations": [
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bb3ef36c-f74e-4589-98c7-601f8823d367",
          "reason": "The migration assigns checkpoint-list ownership to the session card expand button this fix repairs"
        }
      ]
    },
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-22-agent-note-session-checkpoint-expand-subscribes-to-worktree-ui-state--d216f355.md",
      "sourceHash": "7b724026ebfbe24cbb086bc3074f21246f943cadb2e1afb698cf6b33d904fb75",
      "originalBodyHash": "74340697c24e88b32dfda12e6a4379a5a3b8473740b48bdcc0596e9c69774507",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Session checkpoint expand subscribes to worktree UI state. No age-based archival.",
      "edits": [
        "Removed redundant Agent Note title prefix"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/bug-fix/2026-09-22-session-checkpoint-expand.md",
        "sourceHash": "7b724026ebfbe24cbb086bc3074f21246f943cadb2e1afb698cf6b33d904fb75",
        "originalBodyHash": "74340697c24e88b32dfda12e6a4379a5a3b8473740b48bdcc0596e9c69774507"
      }
    }
  },
  "updated": "2026-10-21T15:37:53.642Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/984f67da-38f0-455e-8903-2b0083c5b533"
}
---

# Session checkpoint expand panel

## Problem
The session card `还原点 N ▾` button writes `expandedSessionId` into worktree UI state while the panel reads it through a stable store function reference. Zustand re-renders only on subscribed state slices, so the write lands without a render and the checkpoint list never mounts. The per-checkpoint fetch effect gates on the same flag, so change records and diffs never load either, which presents as a dead click with no content.

### Session checkpoint expand content per HiFi v3
The expanded checkpoint section in `src/renderer/src/components/SessionPanel.tsx` renders nothing while loading, when the list rejects, and when the session owns zero checkpoints, so an expand click presents a blank area with no diagnosis. Against `design/session-mgmt-hifi.html`, the section also misses four designed states: the per-row turn-kind badge, the aggregated file totals on the row header, the no-prune acknowledgement inside the restore review, and the post-restore success line carrying pruned indices.


## Decision
`SessionPanel` in `src/renderer/src/components/SessionPanel.tsx` subscribes to the state slice directly (`s.uiByPath[scopePath]?.expandedSessionId`) and the toggle reads the current value from `useWorktreeStore.getState()` before writing. The checkpoint header row forwards clicks to the existing `toggleDiff` when records allow a diff, the records-pending state renders a disabled `diffLoading` button instead of hiding the affordance, and a detail expand that resolves to no record renders the existing empty locale string instead of blank space. Binary and oversized checkpoints keep no diff toggle because `diffAll` stringifies snapshot bytes.

### Session checkpoint expand content per HiFi v3
The expanded section always renders a state: the existing `checkpoint.loading` string before first resolve, the IPC error text when the list rejects with an empty cache, and the existing `checkpoint.empty` string for a resolved empty list. Each row header carries the linked turn kind badge (done/failed/interrupted) once session detail has loaded, plus aggregated `+A −D` totals derived from loaded change records beside the file count. The restore review shows the new `checkpoint.pruneOk` acknowledgement when no newer checkpoint exists, and a successful restore posts the new `checkpoint.restoreDone` / `checkpoint.restoreDonePruned` line with pruned indices while failures post nothing. Three locale keys ship in both languages with regenerated types. Binary and oversized checkpoints keep no diff toggle, failed checkpoints with no records keep restore-only rows, and answer sides stay status-only because the turn record model carries no agent prose.



## Alternatives considered
- Local `useState` for expanded id per panel — strongest case is zero store coupling and the simplest render path. The driver that rules it out is scope loss: expansion must stay keyed per worktree path across workspace switches, which the existing `uiByPath` map already owns.
- Subscribe to the whole `uiByPath` map — strongest case is one obvious subscription covering future UI flags. The driver that rules it out is over-rendering: every unrelated path patch would re-render the full session list.
- Row click always toggles diff including binary files — strongest case is a uniform click target. The driver that rules it out is a dead end: binary diffs have no text form, so the click would open an empty or failed preview.
- Do nothing / reuse the function-reference read — no churn. The cost is the reported symptom: the restore entry point stays unreachable.

### Session checkpoint expand content per HiFi v3
- Fetch session detail on checkpoint expand to guarantee badges — strongest case is full HiFi badge parity on first paint. The driver that rules it out is extra IPC on a path that already loads lists plus records; badges degrade to appearing after the first header expand with zero new calls.
- Reuse `restoreDoneHint` as the success line — strongest case is zero new keys. The driver that rules it out is meaning: the hint describes list refresh, never confirms which checkpoint landed or what was pruned.
- Render failure-silent empty states only — strongest case is the smallest diff. The driver that rules it out is the reported symptom: silent blanks are indistinguishable from broken clicks.
- Do nothing / reuse the bare list — no churn. The cost is the persistent blank expand plus four missing HiFi review states on the restore path.


## Consequences
- **Gains**: the checkpoint button expands on click with records loading under it; diff affordance stays visible during fetch and the header row offers the same action with no new IPC, state, or locale keys.
- **Costs and limits**: one selector closes over `scopePath` and resubscribes per path change, matching the existing worktree selectors in the same file; full Electron click-through acceptance was not exercised here. Verification is machine evidence on touched paths: `tsc --noEmit` is clean, `eslint` on the touched file reports zero errors with one pre-existing Chinese-literal warning on the transcript line, and `tests/unit/worktree-store.test.ts` passes 2/2.

### Session checkpoint expand content per HiFi v3
- **Gains**: every expand click lands on visible content; restore review and post-restore feedback match HiFi v3 with existing IPC and styling, and badge/totals reuse loaded records and detail with no new channels.
- **Costs and limits**: kind badges appear only after detail loads; per-turn agent prose stays unavailable until transcript-content IPC lands, as ruled in the migration note. Verification is machine evidence on touched paths: `tsc --noEmit` is clean, `eslint` on the touched component reports zero errors with one pre-existing Chinese-literal warning on the transcript line, `tests/unit/worktree-store.test.ts` passes 2/2, and `npm run i18n:check` reports both languages in sync.
