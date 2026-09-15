# Agent Note: User memory tools over the shell registry

Status: implemented

## Problem

User memory has storage and recall but no recorded action surface. Without one, the assistant can neither answer from memory on demand nor compound it: preferences stay read-only, and unwanted memory has no audited removal path.

## Decision

Exactly three tools live on the existing shell `ToolRegistry` in `src/main/agent/runtime/tools/user-memory-tools.ts`, wired beside the workspace tool sets in `agent-runtime-handlers.ts`. `user-memory.search` runs read-only user recall with cited matches and needs no approval. `user-memory.save` redacts secrets before storage and appends a `scope=user` preference fact to the candidate queue only; truth stays untouched until a human approves in the Inbox, and the write risk rides the per-action approval gate as confirm-before-save. `user-memory.forget` archives matched user facts through the shared revoke path, expires matched episodes, and audits every record, so later recall stays silent; its delete risk rides the approval gate plus an explicit `confirm:true`, a forgettable-query breadth guard, and a substantive-overlap bar shared with episode expiry in `matchesForgettingQuery`, so a lone particle never destroys the timeline. All three tools stay person-scoped and ignore workspace identity, which keeps project knowledge out of both output and mutation reach. Index removal needs no separate step: archival plus expiry drop records out of the rebuilt recall indexes.

## Alternatives considered

- Direct truth writes from save — strongest case is one-step memory without review friction. The driver that rules it out is trust cost: unreviewed model output becomes durable guidance, so every save passes the Inbox as a candidate.
- One combined memory tool with an operation flag — strongest case is a smaller registry surface. The driver that rules it out is gate precision: search, save, and forget need read, write, and delete risks respectively, and a flag would blur the approval boundary the registry enforces per tool.
- Forget by fact id only — strongest case is surgical precision with no matching ambiguity. The driver that rules it out is usability: natural-language forget names topics, not ids, so BM25 pre-filtering plus the substantive bar resolves topics while refusing the overly broad ones.
- Do nothing / reuse chat recall only — staying put keeps every current path green with zero new surface. The cost is read-only memory with no compounding and no audited removal.

## Consequences

- **Gains**: Memory actions trigger through natural language on the existing loop with citations on every result; save can never silently rewrite truth; forget proves silence with per-record audit.
- **Costs and limits**: Save candidates queue for human review, so stored memory lags behind the conversation until the Inbox gains its user-versus-project scope view; the breadth guards deliberately refuse vague forget requests, which users must rephrase; glance surfaces stay unbuilt.

Recall groundwork lives in [the M2 user recall](./2026-09-15-user-recall-m2.md) over [the M1 user store](./2026-09-15-user-memory-m1.md). Slicing follows [the independent knowledge and assistant MVP](../../proposed/feature/2026-09-14-independent-knowledge-assistant.md) with Janus Chat as the primary surface per [the assistant chat landing](../../proposed/feature/2026-09-14-assistant-chat-landing.md).
