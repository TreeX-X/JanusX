---
schema: harness-note/1
id: 3f2c9a41-7e6b-4f2a-b913-5d0c8e71a4f6
kind: decision
lifecycle: implemented
created: 2026-09-22
class: bug-fix
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/cb7e75d4-4db1-4a7d-b321-6ea866df241c
extensions:
  r5Migration:
    sourceHash: 69a7d44797817caa5315fc7e84a2cdc4db95de5858dda8897ef3f746b0629c82
    repairs:
      - relations[0].reason
    originalRelations:
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/cb7e75d4-4db1-4a7d-b321-6ea866df241c
        reason: Per-write session:event emission from that slice meets uncoalesced scan
          imports and an unthrottled panel here, producing the event storm this
          fix collapses
---

# Agent Note: Session card flicker from the external-scan event storm

## Problem

Session cards flicker constantly and always flash on scope-tab switches. A temporary JSONL repro log (9010 lines over ~2 minutes of dev use, since removed) shows the chain: 6 overlapping `scanExternal` passes (466 files each, 52s growing to 91s) import 150 rows and update 217 rows per pass, and every `importExternalSession` emits its own `session:event`, totalling 1235 notifies and broadcasts. The renderer has no coalescing on the list path, so 1057 `store.onEvent` arrivals trigger 1057 full `fetchSessions` plus 1078 `ipc.session:list` calls, and every one of them sets `loading:true` with a banner above the list (1168 loading flips), shifting all cards per event. Cross-scope tab switches additionally clear `sessions` to `[]` (list counts swing 142 to 0 to 200 and back), while same-scope switches (workspace to project share one cwd filter) still flash loading with no content change. Expanded cards refetch detail per debounced tick and flash their loading line even when a preview is already shown.

## Decision

Main collapses the storm at the source: `AgentSessionRegistry` gains `beginBatch`/`endBatch`, which suppress per-row notifies inside one bulk pass and emit a single event on close; `scanExternalSessions` wraps the whole pass in that batch; `registerSessionHandlers` serializes concurrent scans through one shared in-flight promise so boot plus panel-open plus tab-switch scans converge instead of overlapping. The renderer stops strobing: `subscribeToEvents` coalesces bursts with a 500ms trailing timer and refreshes silently (same scope key keeps the list with no loading flag), foreground fetches no longer clear the list on scope change (stale-while-revalidate), the loading banner renders only over a truly empty list, and expanded cards show the loading line only before the first detail load.

## Alternatives considered

- Throttle scans by time (skip panel-open scans within N seconds of boot) — strongest case is zero registry change. The driver that rules it out is correctness under real change: a fixed window still overlaps on slow machines and still emits per-row bursts when it does run.
- Virtualize or paginate the card list instead — strongest case is cheaper renders at 200 rows. The driver that rules it out is evidence: renders are not the flicker source; the log shows loading-banner layout shifts plus list clears, both fixed without virtualization.
- Do nothing / keep per-row events for maximal freshness — no staleness window. The cost is the reported symptom: ~9 refetches per second during scans with cards shifting on each.

## Consequences

- **Gains**: one scan emits one list refresh instead of ~367; overlapping scans share one pass; background events refresh cards silently with a single reorder per burst; scope-tab switches keep stale cards with no empty flash; expanded previews no longer flash their loading line on refresh.
- **Costs and limits**: background refreshes apply silently, so a reordered list arrives without a loading indicator (ordering still follows `updatedAt`); scans that start while one is in flight share its result rather than rescanning; per-mutation live events (submit, checkpoint, turn end) still emit immediately and are covered by the 500ms coalescing window. Verification is machine evidence on touched paths: `tsc --noEmit` is clean, `eslint` on all touched files reports zero problems, and `tests/unit/agent-session-registry.test.ts` passes 15/15 including the new batch-collapse test plus `worktree-store` 2/2 and `external-session-scanner` 7/7.
