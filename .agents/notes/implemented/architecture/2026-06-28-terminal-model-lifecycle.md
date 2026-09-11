# Agent Note: Terminal model telemetry lifecycle

Status: implemented

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
