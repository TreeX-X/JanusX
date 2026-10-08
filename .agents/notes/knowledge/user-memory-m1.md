---
{
  "schema": "harness-note/2",
  "id": "fd02d3bc-6c00-5225-a0e2-c82b4cda740f",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-15",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/6e34d77d-edb9-4181-8ff1-dd18e6804539",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-15-agent-note-user-memory-m1-storage-with-ttl-harvest-and-aggregator-skelet--fd02d3bc.md",
      "sourceHash": "8200578c10c9129f381f341745d42e46f987bb3bd8fdfc457438e1c986e0750d",
      "originalBodyHash": "aef9890841187fc582f8a2dc849e5d1a6810656a7257fd2d5a56ce3572a545ff",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents User memory M1 storage with TTL harvest and aggregator skeleton. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ../architecture/2026-09-03-knowledge-pipeline.md -> ./2026-09-03-knowledge-pipeline--dcc5e8a0.md",
        "Rebased Markdown destination: ../../proposed/feature/2026-09-14-assistant-chat-landing.md -> ./2026-09-14-assistant-chat-landing--10bb564c.md",
        "Rebased Markdown destination: ../../proposed/feature/2026-09-14-independent-knowledge-assistant.md -> ./2026-09-14-independent-knowledge-assistant--6e34d77d.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-15-user-memory-m1.md",
        "sourceHash": "673e95452cc3c9e21578d04e710b6b0cd566187c97a69fea18e0aad1c1f3590c",
        "originalBodyHash": "e0c398c9cfd0ccca24251a46e532d45f9df188b4f6d4051dda688bd906f467e9"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c1c04881-a2fb-430f-bc26-528027d0e5cf"
}
---
# User memory M1 storage with TTL harvest and aggregator skeleton


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

Related proposals shape the later slices: [the independent knowledge and assistant MVP](./requirements/independent-knowledge-assistant.md) defines M2–M4, [the assistant chat landing](./requirements/assistant-chat-landing.md) fixes Janus Chat as the primary surface, and the queue ownership in [the queue-owned pipeline](./knowledge-pipeline.md) stays authoritative.
