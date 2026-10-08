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
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# Terminal model telemetry lifecycle


## Problem

Terminal model state arrives late, stale, or never. Detection debounces stream text while a slow history poll backfills, detected values persist after their terminal ends, fresh terminals show blank detection, and switches leave the previous terminal name behind. Stream and history disagree with no arbiter.

## Decision

Detection fuses stream text with structured payloads through normalization and confidence-gated merges into per-terminal state. The main side coordinates snapshots per request while the renderer merges patches without clobbering higher-confidence values. Status surfaces read the focused terminal value with a detecting fallback instead of a global singleton. Model naming normalizes at the boundary so engine-specific labels collapse to canonical names.

## Alternatives considered

- Keep debounce plus history polling — strongest case needs no new infrastructure. The driver that rules it out is latency plus staleness: first-packet detection lags and switches strand old values.
- Per-engine native model APIs — strongest case reports exact values. The driver that rules it out is surface instability: three engines with shifting, uneven introspection.
- Do nothing / reuse best-effort labels — staying put keeps the telemetry layer thin. The cost is permanently blind model attribution.

## Consequences

- **Gains**: Each terminal carries its own detected model with normalized naming; the display degrades to an explicit detecting state instead of a wrong name.
- **Costs and limits**: Text-pattern detection stays heuristic and leans on confidence gating; prefill defaults and switch-reset semantics remain open follow-ups.
