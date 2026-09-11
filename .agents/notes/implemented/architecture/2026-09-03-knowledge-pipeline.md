# Agent Note: Queue-owned dual-path knowledge pipeline

Status: implemented

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
