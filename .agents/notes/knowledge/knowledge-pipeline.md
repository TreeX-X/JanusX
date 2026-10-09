---
{
  "schema": "harness-note/2",
  "id": "dcc5e8a0-7733-52a4-83c8-695c14ed8dd7",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-03",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c0a75c6a-5d06-4088-b7ed-9ecdd835b3d3",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-03-agent-note-queue-owned-dual-path-knowledge-pipeline--dcc5e8a0.md",
      "sourceHash": "09816c2aa45f2cdb1de5f3efcf8a7b1105fd5778bd1ab85a3014ccf427bfa680",
      "originalBodyHash": "389a695ce631ed1eb89090f499a0de269f056498166ba991cbd1137d92dae786",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Queue-owned dual-path knowledge pipeline. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-03-knowledge-pipeline.md",
        "sourceHash": "09816c2aa45f2cdb1de5f3efcf8a7b1105fd5778bd1ab85a3014ccf427bfa680",
        "originalBodyHash": "389a695ce631ed1eb89090f499a0de269f056498166ba991cbd1137d92dae786"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c1c04881-a2fb-430f-bc26-528027d0e5cf"
}
---
# Queue-owned dual-path knowledge pipeline


## Problem

Observation collection runs everywhere while settling runs nowhere. Chat, agent hooks, agent runs, version control, checkpoints, and manual calls all append evidence, yet extraction holds no caller, no trigger, and no budget. Workspace identity mismatches hide version-control and checkpoint evidence from recall, supersede and version fields carry no logic, and the model-only extractor stalls the moment no model configures. Unprocessed evidence piles up behind an entry point nobody calls.

## Decision

A processing queue owns the observation-to-candidate bookkeeping. Per-workspace cursors plus a serial queue plus a failure ledger live beside the ledger; capture-time debounce, session-end immediate scheduling, startup resume, and a manual IPC trigger all feed the same queue. The deterministic stage always runs: normalization with secret redaction, exact plus near-duplicate merging, derived index products per observation, and a small set of high-precision candidates carrying derivation, evidence, kind, and conflict marks. The model stage runs only after the deterministic stage with a model configured and a permissive mode, in bounded batches with timeouts and retries; overlapping candidates merge in place with provenance kept. Review applies or rejects with supersede archiving the predecessor at version plus one under audit. Truth stores hold facts, graph edges, and wiki pages; recall serves BM25 over derived summaries and entities with per-workspace paging, a cached index, confidence plus freshness weighting, and agent plus session plus time filters. Workspace identity resolves paths to workspace records with basename fallback explicitly flagged. Strict schemas record violations to audit instead of filtering silently. The removed direct-extract channel leaves queue-driven model runs as the sole model entry. Processing stats and diagnostics expose pending counts, per-derivation proposal pressure, model health, index build time, and maintenance stamps. The personal-memory continuation lives in `../proposed/feature/2026-09-10-personal-memory-persona.md`.

## Alternatives considered

- A separate proposal entity beside candidates — strongest case is a clean type boundary for derived content. The driver that rules it out is branch cost: extending candidates reuses review, recall, and UI paths with no new forks.
- Processing state written back into observation shards — strongest case is a single source of truth. The driver that rules it out is write contention: append-only shards would rewrite under racing captures, so the queue holds cursors independently.
- Vector-first retrieval — strongest case is semantic recall quality. The driver that rules it out is present capability: the embedding provider resolves null, so BM25 serves as the keyless baseline with the hybrid seam reserved.
- Do nothing / reuse collection without settling — staying put keeps every current path green. The cost is a dead extractor and permanently invisible evidence.

## Consequences

- **Gains**:Settling runs model-less by default with triggers, cursors, and failure ledgers observable through dedicated IPC; version-control and checkpoint evidence resolves to real workspace records and surfaces in recall; Inbox pressure stays measurable per derivation with high-precision gating.
- **Costs and limits**: Embedding resolution stays null behind its provider seam, so a separate specification must cover model config, vector persistence, and hybrid ranking before semantic recall lands. Graph layout persists in renderer storage per workspace rather than beside processing state, keeping drag interactions out of the recall fingerprint. IPC surface grows with each observability addition and needs contract tests on every channel change.
