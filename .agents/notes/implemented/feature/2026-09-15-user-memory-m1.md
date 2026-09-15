# Agent Note: User memory M1 storage with TTL harvest and aggregator skeleton

Status: implemented

## Problem

Project knowledge answers only inside a workspace. Stable preferences get re-asked every session and recent-activity questions have no timeline, because habits and dated events own no partition beside workspace-filtered facts.

## Decision

Two partitions live under the existing knowledge root beside project memory. `profile/` holds the durable user snapshot with identity, format and tool preferences plus habit versions through `src/main/knowledge/user-profile-service.ts`. `episodes/` holds auto-written dated events as monthly JSONL through `src/main/knowledge/user-episode-service.ts`, with 30–90 day TTL, a 200-entry rolling working set, secret redaction before storage, and harvest wired into the daily maintenance handler in `src/main/ipc/register.ts`. The habit math lives in `src/main/knowledge/habit-aggregator.ts` as pure functions with no new queue or cursors: promotion at frequency three or higher, Ebbinghaus decay with a 30-day half-life plus retrieval reheat, evidence merging, and a candidate-only fact builder with `scope=user` for the existing Inbox review. The shared contract gains `UserMemoryScope`, `UserProfile`, `UserEpisode`, and `scope/habitStrength/lastSeenAt/ttl` on `MemoryFact` in `src/shared/knowledge.ts`, with the storage layout and bootstrap extended in `contracts.ts` plus `contract-service.ts`. User records stay private by default and never enter shared recall, MCP, or commit paths.

## Alternatives considered

- Single mixed scope for project and person — strongest case is one recall path with no fusion logic. The driver that rules it out is boundary collapse: workspace filtering either leaks personal traits into shared views or dilutes habits past retrieval.
- Vector store first — strongest case is semantic recall quality from day one. The driver that rules it out is present capability: the embedding provider resolves null today, while BM25 plus deterministic aggregation ships a working model-less baseline.
- Full UI plus tools in the same slice — strongest case is a demonstrable assistant immediately. The driver that rules it out is review capacity: storage semantics must settle before recall budgets, tool gates, and cards build on them.
- Do nothing / reuse project memory only — staying put protects the frozen pipeline semantics with zero new surface. The cost is repeated preference questions, unanswerable recent-history queries, and silent guidance from superseded habits.

## Consequences

- **Gains**: User scope persists without forking capture, debounce, cursors, or the deterministic and budgeted LLM stages; TTL expiry stays provable through `user_episode_harvested` audit; promotion noise stays gated behind Inbox review.
- **Costs and limits**: Recall, tools, and cards remain unbuilt, so stored habits have no user-visible effect yet; the next slice must add user-scope recall with its independent budget and succession labeling before this storage pays off. Aggregation thresholds are heuristic and need per-derivation proposal metrics before widening sources.

Related proposals shape the later slices: [the independent knowledge and assistant MVP](../../proposed/feature/2026-09-14-independent-knowledge-assistant.md) defines M2–M4, [the assistant chat landing](../../proposed/feature/2026-09-14-assistant-chat-landing.md) fixes Janus Chat as the primary surface, and the queue ownership in [the queue-owned pipeline](../architecture/2026-09-03-knowledge-pipeline.md) stays authoritative.
