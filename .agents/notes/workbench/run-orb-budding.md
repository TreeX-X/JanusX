---
{
  "schema": "harness-note/2",
  "id": "80e64e6f-91eb-50a2-94b4-fbc40b112e10",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-09",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-09-agent-note-run-orb-budding-for-multi-workspace-running-state--80e64e6f.md",
      "sourceHash": "e9f4389e04e8d9718e007a38cdf67aa53dbfee275ff4664be261ede5083f4b48",
      "originalBodyHash": "d5c5bf0a24d592b05394defaeb1470ff70fbad2a38d9c92b0d5ee91fb51ef37f",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Run-orb budding for multi-workspace running state. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-09-run-orb-budding.md",
        "sourceHash": "e9f4389e04e8d9718e007a38cdf67aa53dbfee275ff4664be261ede5083f4b48",
        "originalBodyHash": "d5c5bf0a24d592b05394defaeb1470ff70fbad2a38d9c92b0d5ee91fb51ef37f"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---
# Run-orb budding for multi-workspace running state


## Problem

Janus Island expresses running state through the island body alone. Long-press toggles start and stop on the active workspace, the running snapshot holds a single global copy that each workspace switch overwrites, and the `running` mode branch overrides `order` and `analytics`. A user who switches away from a running workspace sees an idle island, and a user who long-presses to inspect state stops the wrong workspace. Without workspace attribution in the island, background runs stay untraceable.

## Decision

Running state lives outside the island body as satellite orbs. `stores/running.ts` groups the full `projectService.list()` result by workspace path with longest-prefix match and exposes `runningByWorkspace` plus `groupByWorkspace`. `useGlobalRunning` polls the full list every 3s (10s when the document is hidden) and never filters by active workspace. `Titlebar.tsx` mounts a `janus-island-cluster` holding `JanusIsland` and `JanusRunOrbs`. Each workspace with running processes gets one 24px orb showing the workspace initial and process count; more than three orbs collapse into a `+N` overflow. Long-press on the island body only starts the active workspace once; an already-running workspace triggers an orb nudge and a hint instead of a stop. Stopping requires an explicit hold-to-confirm on the orb or in its popover. Closing a popover, pressing `Esc`, or clicking outside closes the view only and never stops a process. A vanished orb plays a 200ms shrink before unmount.

## Alternatives considered

- Keep single-body color for running — strongest case is zero new components and an already learned green-means-running signal. The driver that rules it out is attribution loss: the snapshot overwrite on workspace switch hides background runs, and toggle-on-inspect stops the wrong workspace.
- Hide-but-keep-running with a hidden-workspace blocklist — strongest case is a quieter titlebar under many parallel runs. The driver that rules it out is truth conflict: the next poll tick rebuilds the orb, so hiding reads as an unclosable bug and the blocklist lies about poll truth.
- Modal confirm for stop via `PromptDialog` — strongest case is a familiar strong friction for an irreversible `SIGTERM` path. The driver that rules it out is interruption cost at a 24px titlebar target; hold-to-confirm gives equivalent friction without a modal mask over the titlebar.
- Do nothing / reuse `ProjectSettings` running list only — staying put keeps one data source and no titlebar change. The cost is that background runs remain invisible from the island and the view-then-stop hazard on long-press remains.

## Consequences

- **Gains**: Each running workspace has a stable projection (`JanusRunOrbs.tsx`, `MAX_VISIBLE_ORBS = 3`, `LEAVE_MS = 200`); grouping by workspace path keeps background state visible across workspace switches. Long-press carries no stop path (`JanusIsland.tsx` `handleLongPress` calls `startActiveOnce` only), so inspection never kills a process.
- **Costs and limits**: The titlebar cluster widens with orb count; at narrow widths orbs shrink and overflow collapses to `3 +N` (`11-janus-run-orb.css`). Crash attribution without a `project:getExited` snapshot stays deferred; natural exits auto-dismiss while non-zero exits await that channel — revisit when the exit-code snapshot lands. `stores/app.ts` `janusRunning` stays as a derived compat until `ProjectSettings` migrates to `runningByWorkspace`.
