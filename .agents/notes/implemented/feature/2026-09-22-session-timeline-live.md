---
schema: harness-note/1
id: 2b60cc2c-4d6f-4676-b6be-582e36b7edbb
kind: decision
lifecycle: implemented
created: 2026-09-22
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/cb7e75d4-4db1-4a7d-b321-6ea866df241c
    reason: Change events reach the summary list; this slice carries the same events into open timelines
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7
    reason: Durable per-turn prose needs a live timeline to surface in; this slice provides the refresh
---

# Agent Note: Session timeline live refresh on session events

## Problem

`SessionPanel` in `src/renderer/src/components/SessionPanel.tsx` refetches the summary list on every `session:event`, but an expanded card loads its detail, checkpoint list, and change records exactly once per expand. Conversation steps that land while the timeline stays open never appear until collapse and re-expand, which defeats the change events the registry now emits per submit, checkpoint, and turn.

## Decision

The panel holds a debounced timeline tick beside the existing list subscription: each `session:event` restarts a 600ms trailing timer, and one tick reloads every expanded card. The card load effect reruns on the tick while expanded, refetching detail plus the session-scoped checkpoint list and lazily filling change records for new checkpoints. Review, file-expand, and restore states stay keyed by checkpoint id, so an open restore review survives the reload with recomputed prune counts. Records of pruned checkpoints drop from the local cache on each reload. Collapsed cards and archived sessions skip the work exactly as before.

## Alternatives considered

- Reload the open card on every event without debounce — strongest case is zero added state and minimum latency. The driver that rules it out is storm cost: submit, checkpoint, provider-change, and turn-end events burst per turn, and each reload costs a detail fetch plus a list plus per-checkpoint record fetches.
- Reuse the list subscription tick for the card — strongest case is one listener. The driver that rules it out is coupling: the list must refresh immediately for counts and titles, while the heavier timeline wants trailing coalescing.
- Poll the open card on an interval — strongest case is independence from event delivery. The driver that rules it out is waste plus staleness: polling fires with no conversation and still lags event-driven updates.
- Do nothing / keep expand-once loading — no churn. The cost is the reported symptom: an open timeline goes stale mid-conversation while the list beside it moves.

## Consequences

- **Gains**: questions, excerpts, and checkpoint strips arrive in an open timeline within one debounce window of the ledger write, with review and expand states preserved across reloads.
- **Costs and limits**: rapid multi-terminal bursts still reload once per 600ms quiet window per panel; a reload in flight loses to the newer one through the existing alive guard, so the last writer wins without tearing. Per-engine excerpt coverage is untouched: non-claude turns stay status-only pending the parser slice. Verification is machine evidence on touched paths: `tsc --noEmit` plus `typecheck:strict-unused` are clean, `eslint` on the component reports zero errors with one pre-existing Chinese-literal warning on the transcript line, and unit runs pass on `worktree-store` 2/2, `agent-session-registry` 13/13, and `transcript-excerpt` 4/4.
