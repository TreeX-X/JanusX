---
{
  "schema": "harness-note/2",
  "id": "2f4d605c-e761-59dd-8a18-8963b56cf8a1",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-06-28",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-06-28-agent-note-terminal-model-telemetry-lifecycle--2f4d605c.md",
      "sourceHash": "e728bdc7b73d8e78a4fdd928f6dc1e2333a0175c7fc8341b66167a91c1aa100b",
      "originalBodyHash": "653546c415ac5dcbd6ed4112dc9c0911fa959108c728d8cc7c90e09f2dff8e42",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Terminal model telemetry lifecycle. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-06-28-terminal-model-lifecycle.md",
        "sourceHash": "e728bdc7b73d8e78a4fdd928f6dc1e2333a0175c7fc8341b66167a91c1aa100b",
        "originalBodyHash": "653546c415ac5dcbd6ed4112dc9c0911fa959108c728d8cc7c90e09f2dff8e42"
      }
    }
  },
  "updated": "2026-10-13T02:25:17.000Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# Terminal model telemetry lifecycle


## Problem

Terminal model state arrives late, stale, or never. Detection debounces stream text while a slow history poll backfills, detected values persist after their terminal ends, fresh terminals show blank detection, and switches leave the previous terminal name behind. Stream and history disagree with no arbiter.

## Decision

Runtime model and numeric telemetry come from native session history through the main-process coordinator. Configuration supplies declared startup models; the model registry supplies context capacity with its confidence. Each terminal has a main-owned exact session binding. Reads are serialized per terminal and recheck the binding after asynchronous work, so a stale read cannot restore a previous session. Hooks request refreshes and a 10-second main-process poll fills gaps; the renderer subscribes and projects snapshots into per-terminal state. Configuration bootstrap clears stale runtime counts instead of declaring zero usage. Status surfaces read the focused terminal model with an explicit fallback. The current numeric and accounting contract is owned by [native-session single source](./requirements/usage-telemetry-single-source.md).

## Alternatives considered

- Keep PTY text and history fusion: preserves quick display and footer-only coverage, but text patterns and source arbitration add failure modes. Native history now owns runtime values, with explicit unknown values for unsupported sources.
- Add separate live model APIs for every engine: could reduce latency, but introduces another adapter surface with uneven native support. Configuration, native history and registry metadata cover the current scope.
- Keep labels after terminal restart: avoids empty display, but can attribute the previous process's model and counters to the new one. Configuration bootstrap and exact rebinding reset that projection.

## Consequences

- Each terminal carries its own native or declared model and confidence. Numeric PTY parsing is removed; DSH turn status remains a separate text signal. Exact history rebinding can replace the prior session projection.
- Context display depends on native persistence and collection latency. Unknown native counts stay unknown. Pi context remains an estimate of the latest active request; Janus/DSH have no imported native usage.
- Consumption is persisted separately from terminal projection and binding metadata. Closing a terminal preserves records and baselines; counter regression or source mutation pauses accounting rather than guessing a reset. Full JSONL scans currently cap each file at 64MB, so larger sources need an incremental adapter.
