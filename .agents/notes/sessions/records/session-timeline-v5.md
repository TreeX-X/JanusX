---
{
  "schema": "harness-note/2",
  "id": "e782007f-d07b-4f60-be32-63d1b22ec1f8",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-22",
  "class": "feature",
  "relations": [
    {
      "type": "related-to",
      "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/d216f355-f951-4f60-b209-7bb98b08dcbf"
    },
    {
      "type": "related-to",
      "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bb3ef36c-f74e-4589-98c7-601f8823d367"
    },
    {
      "type": "related-to",
      "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/cb7e75d4-4db1-4a7d-b321-6ea866df241c"
    },
    {
      "type": "related-to",
      "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7"
    }
  ],
  "extensions": {
    "r5Migration": {
      "sourceHash": "88deb4f3f228b1fc32b093850ecb7bd1360192bc4cb666513fa2d554f22a5eda",
      "repairs": [
        "relations[0].reason",
        "relations[1].reason"
      ],
      "originalRelations": [
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/7f0d3ec5-50e4-46df-85b4-f0b75e589df0",
          "reason": "The v3 slice fills the split checkpoint section with content; this slice removes the split and binds strips to turns per HiFi v5"
        },
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bb3ef36c-f74e-4589-98c7-601f8823d367",
          "reason": "The migration assigns checkpoint detail and review-gated restore to session cards; this slice keeps that ownership while changing the presentation"
        }
      ]
    },
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-22-agent-note-session-unified-timeline-with-modal-diff-per-hifi-v5--e782007f.md",
      "sourceHash": "6493fcde61173bb010af9bf73a491318a332bee1afb01467544c372526600942",
      "originalBodyHash": "560c69e6046c66042af101df775b585739bd623e0fc62c6dbaaa2af46e667e21",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Session unified timeline with modal diff per HiFi v5. No age-based archival.",
      "edits": [
        "Removed redundant Agent Note title prefix"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-22-session-timeline-v5.md",
        "sourceHash": "6493fcde61173bb010af9bf73a491318a332bee1afb01467544c372526600942",
        "originalBodyHash": "560c69e6046c66042af101df775b585739bd623e0fc62c6dbaaa2af46e667e21"
      }
    }
  },
  "updated": "2026-10-21T15:37:53.642Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/0cb931e1-e33c-4e38-a9d9-9d652796d935"
}
---

# Session unified timeline with live refresh and modal diff

## Problem
`src/renderer/src/components/SessionPanel.tsx` splits one conversation across two expands: the card header opens turns while a separate checkpoint button opens the checkpoint list, so restoring means matching a turn against rows in a second list. Diff expands inline inside the narrow right column, where long diffs fight the timeline for scroll space. Full file lists render open on every row, so large changes dominate the card.

### Session timeline live refresh on session events
`SessionPanel` in `src/renderer/src/components/SessionPanel.tsx` refetches the summary list on every `session:event`, but an expanded card loads its detail, checkpoint list, and change records exactly once per expand. Conversation steps that land while the timeline stays open never appear until collapse and re-expand, which defeats the change events the registry now emits per submit, checkpoint, and turn.


## Decision
The card header owns the whole timeline: each turn renders its prompt plus status row with the bound checkpoint strip directly beneath. Each strip shows a one-line summary (index, file count, aggregated `+A −D`, turn-kind badge, timestamp) with the file list collapsed behind a click, capped at five rows plus a remaining-files line and internal scroll past 132px. Diff opens in an in-panel modal under the shared traffic-bar title: a left file list plus a diff pane showing the full diff by default and a per-file diff on row click, with binary and oversized rows disabled and labelled. Restore from the modal closes it and opens the strip inline review, so the two-step confirm lives in exactly one place. Checkpoints no turn references append after the turns with their recorded prompt, keeping restorable state visible. Turns without a checkpoint render a dashed no-checkpoint strip once the list resolves. Five locale keys ship in both languages with regenerated types.

### Session timeline live refresh on session events
The panel holds a debounced timeline tick beside the list subscription: each session:event restarts a 600ms trailing timer. One tick reloads expanded-card previews through session.get and refreshes both session.get and session.getTranscript in the open detail window. Transcript pairs replace prose even when an answer is still pending, so cached answers cannot migrate onto new questions. These reads update questions and excerpts; checkpoint lists, file records, review and restore state have been removed from session management. Collapsed cards skip detail reads. Visible-panel provider polling and bounded transcript previews are maintained in [external session sync](external-session-backfill.md).



## Alternatives considered
- Keep the split expands and add deep links between turns and rows — strongest case is the smallest diff. The driver that rules it out is the reported symptom: two expands remain two sources of truth for one conversation, and every restore still crosses lists.
- Cap the inline diff height instead of a modal — strongest case is zero new components. The driver that rules it out is geometry: a capped inline block still competes with the timeline scroll, and file switching stays linear.
- Open diff in a separate Electron window — strongest case is a true editor-grade surface. The driver that rules it out is plumbing: a new window needs registration, navigation, and focus handling, while the in-panel modal reuses the existing overlay pattern both session modals already share.
- Auto-expand file lists for small changes — strongest case is fewer clicks on trivial turns. The driver that rules it out is consistency: mixed open states make card heights unpredictable, and the large-change case the issue targets stays jumpy.
- Do nothing / reuse the v3 layout — no churn. The cost is the persistent turn-to-checkpoint matching step plus card-dominated large changes.

### Session timeline live refresh on session events
- Reload the open card on every event without debounce — strongest case is zero added state and minimum latency. The driver that rules it out is storm cost: submit, checkpoint, provider-change, and turn-end events burst per turn, and each reload costs a detail fetch plus a list plus per-checkpoint record fetches.
- Reuse the list subscription tick for the card — strongest case is one listener. The driver that rules it out is coupling: the list must refresh immediately for counts and titles, while the heavier timeline wants trailing coalescing.
- Poll the open card on an interval — strongest case is independence from event delivery. The driver that rules it out is waste plus staleness: polling fires with no conversation and still lags event-driven updates.
- Do nothing / keep expand-once loading — no churn. The cost is the reported symptom: an open timeline goes stale mid-conversation while the list beside it moves.


## Consequences
- **Gains**: one expand shows the full story per turn; large changes cost one line until opened; long diffs scroll in a dedicated pane with per-file focus; restore keeps prune warning, confirm, success, and conflict disclosure with existing IPC and styling.
- **Costs and limits**: per-file diff costs one IPC per file click, cached per modal open; the single expand shares the worktree `expandedSessionId`, so one card per path stays open at a time, as before; answer sides stay status-only because the turn record model carries no agent prose. Verification is machine evidence on touched paths: `tsc --noEmit` and `typecheck:strict-unused` are clean, `eslint` on the component reports zero errors with one pre-existing Chinese-literal warning on the transcript line, `npm run i18n:check` reports both languages in sync, and unit runs pass on `worktree-store` 2/2, `agent-session-registry` 11/11, and `companion-session-state` 1/1. Desktop e2e is not run: the change touches no IPC contract and needs a packaged build.

### Session timeline live refresh on session events
- **Gains**: questions and excerpts arrive in an open timeline within one debounce window of the ledger write, with card expansion preserved across reloads.
- **Costs and limits**: rapid multi-terminal bursts still reload once per 600ms quiet window per panel; a reload in flight loses to the newer one through the existing alive guard, so the last writer wins without tearing. Codex excerpts use the shared streaming reader; provider polling updates prose independently of hook status. Verification is machine evidence on touched paths: `tsc --noEmit` plus `typecheck:strict-unused` are clean, `eslint` on the component reports zero errors with one pre-existing Chinese-literal warning on the transcript line, and unit runs pass on `worktree-store` 2/2, `agent-session-registry` 13/13, and `transcript-excerpt` 4/4.
