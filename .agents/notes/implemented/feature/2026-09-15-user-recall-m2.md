# Agent Note: User-scope recall with independent budget and fusion order

Status: implemented

## Problem

Chat recall answers only inside a workspace. A session with no workspace mounted degrades to empty context, so stable preferences get re-asked and recent-activity questions stay unanswerable even though the M1 partitions already persist them.

## Decision

Person-scoped recall runs beside project recall under its own budget. `src/main/knowledge/user-recall-service.ts` indexes user facts with `scope=user`, the `UserProfile` snapshot, and active episodes through per-call BM25 plus habit-strength and recency boosts, capped at five items and two thousand characters without touching the project allowance. Superseded habits never guide; the surviving fact renders a succession label naming its predecessor, and every line cites its fact, observation, or episode source inside a `<janus-user-memory>` section. `KnowledgeContextService.searchWithUser` fuses both sides with project content first, serves `scope=user` alone with no workspace, and keeps `search` project-only so MCP and maintenance callers never observe user memory. The chat orchestrator appends the user section transparently: the `knowledgeSearch` port fuses through `searchWithUser` with its generic input shape unchanged, and `prepareJanusChatRecall` injects after project knowledge while failing open when user recall throws. Project recall keeps its workspace filter and BM25 ranking, and `janus-agentX` ports gain no persona, habit, or episode types. Scope isolation holds at the filter layer: `recall-service` drops `scope=user` documents from every non-user request, including `allowGlobal` searches, with the scope carried in the recall filter key.

## Alternatives considered

- Single mixed scope for project and person — strongest case is one recall path with no fusion logic. The driver that rules it out is boundary collapse: workspace filtering either leaks personal traits into shared views or dilutes habits past retrieval.
- Vector store first — strongest case is semantic recall quality from day one. The driver that rules it out is present capability: the embedding provider resolves null today, while BM25 plus deterministic boosts ship a working model-less baseline.
- Extending `janus-agentX` ports with persona types — strongest case is first-class upstream recall. The driver that rules it out is product coupling: persona wording, budgets, and succession labels are JanusX product decisions, so the seam keeps its generic shape with fusion behind `ChatTurnPorts`.
- Do nothing / reuse project recall only — staying put protects the frozen pipeline semantics with zero new surface. The cost is repeated preference questions and unanswerable recent-history queries despite stored user memory.

## Consequences

- **Gains**: No-workspace sessions answer personal questions with cited claims; fused turns keep project filtering with zero cross-scope leakage; user failures degrade to project-only recall instead of erroring the turn.
- **Costs and limits**: Boost weights and the five-item budget are heuristic and need per-derivation proposal metrics before widening sources; episode auto-writing from chat turns stays unwired, so the timeline holds explicitly captured events only; natural-language save, forget, and the glance surfaces remain absent.

Storage groundwork lives in [the M1 user memory store](./2026-09-15-user-memory-m1.md). Slicing follows [the independent knowledge and assistant MVP](../../proposed/feature/2026-09-14-independent-knowledge-assistant.md) with Janus Chat as the primary surface per [the assistant chat landing](../../proposed/feature/2026-09-14-assistant-chat-landing.md), over the queue ownership in [the queue-owned pipeline](../architecture/2026-09-03-knowledge-pipeline.md) and the event parity in [the chat contract alignment](./2026-09-12-janus-agent-chat-alignment.md).
