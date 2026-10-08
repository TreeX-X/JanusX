---
{
  "schema": "harness-note/2",
  "id": "939f0bcf-10ec-555f-bd6c-7fdf041c8047",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-15",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/dec987d8-570e-57f0-9694-3e2475a5a532",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-15-agent-note-user-memory-tools-over-the-shell-registry--939f0bcf.md",
      "sourceHash": "5985793f4ec2e4784f9f9d7f4f08769fe18a87d3850fd7acabccecefeac7fb49",
      "originalBodyHash": "e2305d1f50f76e16ae312f6ef3a37064bbd99705e76a4852f027b842dd63ba1a",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents User memory tools over the shell registry. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ../../proposed/feature/2026-09-14-assistant-chat-landing.md -> ./2026-09-14-assistant-chat-landing--10bb564c.md",
        "Rebased Markdown destination: ../../proposed/feature/2026-09-14-independent-knowledge-assistant.md -> ./2026-09-14-independent-knowledge-assistant--6e34d77d.md",
        "Rebased Markdown destination: ./2026-09-15-user-memory-m1.md -> ./2026-09-15-user-memory-m1--fd02d3bc.md",
        "Rebased Markdown destination: ./2026-09-15-user-recall-m2.md -> ./2026-09-15-user-recall-m2--dec987d8.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-15-user-memory-tools-m3.md",
        "sourceHash": "f407fb17d9e4c42f96b8d35706fb7faf97fb293e424b97f7d27def5e2ff416c7",
        "originalBodyHash": "32a196feee537bf2553cae9611454e602862154edb2f0387a860ca753dd6ea37"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c1c04881-a2fb-430f-bc26-528027d0e5cf"
}
---
# User memory tools over the shell registry


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

Recall groundwork lives in [the M2 user recall](./user-recall-m2.md) over [the M1 user store](./user-memory-m1.md). Slicing follows [the independent knowledge and assistant MVP](./requirements/independent-knowledge-assistant.md) with Janus Chat as the primary surface per [the assistant chat landing](./requirements/assistant-chat-landing.md).
