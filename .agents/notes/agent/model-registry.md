---
{
  "schema": "harness-note/2",
  "id": "31cda2d8-3b47-5cce-affd-3978b2189c19",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-07-09",
  "class": "process",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-07-09-agent-note-unified-model-registry-with-openrouter-sync--31cda2d8.md",
      "sourceHash": "34efed6b3d6b33c411b3680cc1966c2d8e2a6731e3abd70dc06e4d6c39d60a60",
      "originalBodyHash": "094b38c90421f67d8d5a6af388f5d136df17089324d6a0c16032fe2b7c4a0588",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Unified model registry with OpenRouter sync. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/process/2026-07-09-model-registry.md",
        "sourceHash": "34efed6b3d6b33c411b3680cc1966c2d8e2a6731e3abd70dc06e4d6c39d60a60",
        "originalBodyHash": "094b38c90421f67d8d5a6af388f5d136df17089324d6a0c16032fe2b7c4a0588"
      }
    }
  },
  "updated": "2026-10-08T03:43:42.442Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Unified model registry with OpenRouter sync


## Problem

Model capacity changes independently of application releases. If chat budgeting reads only bundled metadata, new model IDs receive a 16,384-token estimate and trigger premature history compaction. Adapter lists also contain bundled limits, so treating every listed capacity as a provider override prevents updated metadata from taking effect.

## Decision

OpenRouter supplies the bundled model registry and the runtime catalog cache. Janus chat and the blueprint conversation share the model port in `janus-agent-ports.ts`. Each model resolution without a valid manual context override consults `ModelCatalogService`, even when the adapter supplies a capacity. Context limits resolve in this order: manual per-model configuration, runtime catalog metadata, adapter metadata, bundled registry, then the visibly estimated 16,384-token fallback. Runtime output caps also precede adapter output caps; the generation budget remains bounded by 20% of the selected context window.

The service reads `userData/janusx/model-catalog.json` and uses the bundled document when the cache is unavailable or invalid. Catalogs older than 24 hours trigger a background refresh. A known model can use its cached capacity immediately; subsequent resolutions consume the completed refresh. A missing model waits for the shared refresh before inference. Automatic requests have a 60-second retry interval and a 20-second network timeout. Refresh failure preserves the last valid document, and a missing runtime entry can still resolve from the bundled registry. Only exact or high-confidence model matches supply context capacity.

## Alternatives considered

- Per-provider live fetching — strongest case is always-fresh data. The driver that rules it out is multiplicative fragility: every provider outage becomes a capability outage.
- Manual curation only — strongest case is full editorial control. The driver that rules it out is staleness velocity: model releases outrun editors within weeks.
- Do nothing / reuse hardcoded limits — staying put needs no pipeline. The cost is permanently disagreeing context displays.
- Refresh only when the adapter has no capacity — avoids catalog lookups for known models, but bundled adapter values can indefinitely hide updated context and output limits.

## Consequences

Chat budgeting consumes the same cached catalog exposed by settings, and explicit user context overrides remain authoritative. Cache reuse and shared refreshes avoid one network request per conversation turn.

A missing model may delay the first turn by the network timeout. OpenRouter coverage and matching confidence bound automatic detection; unknown aliases and refresh failures can still require a manual context override. A known stale model keeps its previous capacity for the current resolution while refresh runs. Provider-specific restrictions require manual configuration because adapter metadata has no authoritative live-provider provenance. Revisit this priority if adapters acquire actual provider-reported limits.

## Verification

`npx vitest run tests/unit/model-catalog-service.test.ts tests/unit/llm/janus-agent-ports.test.ts tests/unit/managed-chat-session.test.ts tests/unit/llm/chat-turn-guard.test.ts` checks cache persistence, first-use refresh, stale known-model updates, offline fallback, manual overrides, and both conversation domains. The model-port regression uses a 1,048,576-token runtime entry against a 16,384-token adapter entry and verifies that 31 messages reach inference without premature compaction. Network responses are simulated.
