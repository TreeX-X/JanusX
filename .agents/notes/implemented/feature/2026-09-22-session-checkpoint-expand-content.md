---
schema: harness-note/1
id: 7f0d3ec5-50e4-46df-85b4-f0b75e589df0
kind: decision
lifecycle: implemented
created: 2026-09-22
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/bb3ef36c-f74e-4589-98c7-601f8823d367
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/d216f355-f951-4f60-b209-7bb98b08dcbf
extensions:
  r5Migration:
    sourceHash: 3f3fd7291c6d9ef9f776af171a5dc036689d5ca72ee3f079bfd9330c68f2946e
    repairs:
      - relations[0].reason
      - relations[1].reason
    originalRelations:
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/bb3ef36c-f74e-4589-98c7-601f8823d367
        reason: The migration assigns checkpoint detail, diff preview, and review-gated
          restore to session cards; this slice brings their expanded states to
          HiFi v3
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/d216f355-f951-4f60-b209-7bb98b08dcbf
        reason: The subscription fix makes the expand button render the list; this slice
          makes the rendered list always show content
---

# Agent Note: Session checkpoint expand content per HiFi v3

## Problem

The expanded checkpoint section in `src/renderer/src/components/SessionPanel.tsx` renders nothing while loading, when the list rejects, and when the session owns zero checkpoints, so an expand click presents a blank area with no diagnosis. Against `design/session-mgmt-hifi.html`, the section also misses four designed states: the per-row turn-kind badge, the aggregated file totals on the row header, the no-prune acknowledgement inside the restore review, and the post-restore success line carrying pruned indices.

## Decision

The expanded section always renders a state: the existing `checkpoint.loading` string before first resolve, the IPC error text when the list rejects with an empty cache, and the existing `checkpoint.empty` string for a resolved empty list. Each row header carries the linked turn kind badge (done/failed/interrupted) once session detail has loaded, plus aggregated `+A −D` totals derived from loaded change records beside the file count. The restore review shows the new `checkpoint.pruneOk` acknowledgement when no newer checkpoint exists, and a successful restore posts the new `checkpoint.restoreDone` / `checkpoint.restoreDonePruned` line with pruned indices while failures post nothing. Three locale keys ship in both languages with regenerated types. Binary and oversized checkpoints keep no diff toggle, failed checkpoints with no records keep restore-only rows, and answer sides stay status-only because the turn record model carries no agent prose.

## Alternatives considered

- Fetch session detail on checkpoint expand to guarantee badges — strongest case is full HiFi badge parity on first paint. The driver that rules it out is extra IPC on a path that already loads lists plus records; badges degrade to appearing after the first header expand with zero new calls.
- Reuse `restoreDoneHint` as the success line — strongest case is zero new keys. The driver that rules it out is meaning: the hint describes list refresh, never confirms which checkpoint landed or what was pruned.
- Render failure-silent empty states only — strongest case is the smallest diff. The driver that rules it out is the reported symptom: silent blanks are indistinguishable from broken clicks.
- Do nothing / reuse the bare list — no churn. The cost is the persistent blank expand plus four missing HiFi review states on the restore path.

## Consequences

- **Gains**: every expand click lands on visible content; restore review and post-restore feedback match HiFi v3 with existing IPC and styling, and badge/totals reuse loaded records and detail with no new channels.
- **Costs and limits**: kind badges appear only after detail loads; per-turn agent prose stays unavailable until transcript-content IPC lands, as ruled in the migration note. Verification is machine evidence on touched paths: `tsc --noEmit` is clean, `eslint` on the touched component reports zero errors with one pre-existing Chinese-literal warning on the transcript line, `tests/unit/worktree-store.test.ts` passes 2/2, and `npm run i18n:check` reports both languages in sync.
