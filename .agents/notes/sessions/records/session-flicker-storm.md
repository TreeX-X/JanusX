---
{
  "schema": "harness-note/2",
  "id": "3f2c9a41-7e6b-4f2a-b913-5d0c8e71a4f6",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-22",
  "class": "bug-fix",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/cb7e75d4-4db1-4a7d-b321-6ea866df241c"}
  ],
  "extensions": {
    "r5Migration": {
      "sourceHash": "69a7d44797817caa5315fc7e84a2cdc4db95de5858dda8897ef3f746b0629c82",
      "repairs": ["relations[0].reason"],
      "originalRelations": [
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/cb7e75d4-4db1-4a7d-b321-6ea866df241c",
          "reason": "Per-write session:event emission from that slice meets uncoalesced scan imports and an unthrottled panel here, producing the event storm this fix collapses"
        }
      ]
    },
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-22-agent-note-session-card-flicker-from-the-external-scan-event-storm--3f2c9a41.md",
      "sourceHash": "ccef339d98ec67b4ecc5b5746ed96c7be5511ee9e74e969840f874283893d724",
      "originalBodyHash": "b74b37f039b39a796b53df66f91f583064f962193b1207253a6aa70048665e8d",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Session card flicker from the external-scan event storm. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/bug-fix/2026-09-22-session-flicker-storm.md",
        "sourceHash": "4be700076cf45fba41f5a61eec8095d6bcfcb4f9ab75717e4d79cde08f031392",
        "originalBodyHash": "3bc661c57be7d64e4e28a5076504c92445e164c8b12efa3959a7340d0220e034"
      }
    }
  },
  "updated": "2026-10-08T09:06:56.496Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/0cb931e1-e33c-4e38-a9d9-9d652796d935"
}
---

# Session card flicker from the external-scan event storm

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
