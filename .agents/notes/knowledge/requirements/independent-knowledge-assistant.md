---
{
  "schema": "harness-note/2",
  "id": "6e34d77d-edb9-4181-8ff1-dd18e6804539",
  "kind": "requirement",
  "lifecycle": "draft",
  "created": "2026-09-14",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c0a75c6a-5d06-4088-b7ed-9ecdd835b3d3",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-14-agent-note-independent-knowledge-and-assistant-mvp--6e34d77d.md",
      "sourceHash": "2dfabb21950180abdf1a51204902f9e094dae2a800b11100416c53c287431991",
      "originalBodyHash": "c2e2b9a9e7e6b7f3c115afb5af320a7236539d2150fd23c203a10bd19c8bb420",
      "category": "formal",
      "reason": "Retains the source requirement in draft lifecycle; body documents Independent knowledge and assistant MVP. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ../architecture/2026-09-09-plugin-architecture-forms.md -> ./2026-09-09-plugin-architecture-forms--96a2f5cd.md",
        "Rebased Markdown destination: ../architecture/2026-09-09-island-rightdock-slots.md -> ./2026-09-09-island-rightdock-slots--eaa097ff.md",
        "Rebased Markdown destination: 2026-09-10-personal-memory-persona.md -> ./2026-09-10-personal-memory-persona--f2b9e5d6.md",
        "Rebased Markdown destination: ../../implemented/feature/2026-09-12-janus-agent-chat-alignment.md -> ./2026-09-12-janus-agent-chat-alignment--6813a52b.md",
        "Rebased Markdown destination: ../../implemented/architecture/2026-08-08-agent-loop-refactor.md -> ./2026-08-08-agent-loop-refactor--33f0f481.md",
        "Rebased Markdown destination: ../../implemented/architecture/2026-09-03-knowledge-pipeline.md -> ./2026-09-03-knowledge-pipeline--dcc5e8a0.md",
        "Removed redundant Agent Note title prefix"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/proposed/feature/2026-09-14-independent-knowledge-assistant.md",
        "sourceHash": "367974cfcbd9dcb1a605566b046aab7d4131d4964d14096e38bd7820f3bc03fd",
        "originalBodyHash": "5cd2c6d3a9a98a96abc3f5a7fdf4acdfc01ba687be09f89489d92c8679c62a80"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c1c04881-a2fb-430f-bc26-528027d0e5cf"
}
---

# Independent knowledge and assistant MVP

## Expected behavior

JanusX knowledge answers only inside a workspace. `KnowledgeAssist` disables itself without `workspaceId`, `KnowledgeContextService` enforces `requireWorkspace`, and every recall path filters strictly by workspace identity, so habits, phrasing preferences, and recent events have no partition of their own. The chat turn carries no user-dimension injection point, stable preferences get re-asked every session, and recent-activity questions have no timeline to answer from. The queue-owned pipeline keeps settling project evidence correctly, but the person behind the projects stays invisible to recall.

## Proposal

Ship one durable user scope beside project memory and serve it through a standalone assistant that works with zero workspace attached.

Storage lands as two new partitions under the existing knowledge root: `profile/` holds identity, format and tool preferences plus habit versions, and `episodes/` holds auto-written dated events. A new `habit-aggregator` promotes a repeated observation into a habit at frequency three or higher with Ebbinghaus decay plus retrieval reheat and evidence merging, and every promotion passes the existing Inbox review. Events carry a 30–90 day TTL with a rolling working set plus TTL harvest. The contract gains only `scope`, `habitStrength`, `lastSeenAt`, `ttl`, a `UserProfile` snapshot view, and the two partitions; capture, debounce, cursors, the deterministic stage, and the budgeted LLM stage stay on the current queue with no fork.

Recall fuses two budgeted paths. Project recall keeps its workspace filter and BM25 ranking untouched. User recall runs with `scope=user` plus `allowGlobal`, owns an independent character budget, and renders as its own prompt section after `JANUS_PERSONA` with a citation back to the source fact or observation on every used claim. Changed habits archive the predecessor with a version bump, and recall labels the succession instead of guiding twice.

The assistant exposes exactly three tools through the existing `ToolRegistry`: search, candidate-only save, and forget. Forget archives facts, harvests TTL, writes audit, and deletes index entries so recall stays silent afterwards. The surface ships as RightDock slot cards (Profile, Habits, Recent) plus an Island badge over the slot registry, enabled with no workspace mounted. Privacy holds by default: nothing personal reaches team, roundtable, remote, notification, or external MCP surfaces without an explicit publish action, secrets get redacted before storage, and `allowGlobal=false` stays mandatory on every shared-surface path.

The `janus-agentX` split stays port-shaped. The generic loop, turn, recall-trace, tool, and policy primitives never gain persona, habit, or episode types; at most a generic optional recall filter crosses the boundary. `chat-orchestrator.ts` forwards `scope=user`, `runChatTurn` injects the user section independently of `workspaceId`, and all personal storage, fusion, UI, and deletion logic lives in JanusX behind `ChatTurnPorts`.

MVP ships in four slices. M1 stores `profile/` plus `episodes/` with TTL harvest and the aggregator skeleton on the existing queue. M2 unlocks user-scope recall with the independent budget and fusion order. M3 adds the three tools with citations, redaction, and audit. M4 adds the slot cards plus badge with no-workspace enablement and contract tests for promotion, decay, succession, TTL, and post-forget silence.

Reference libraries shape only product patterns, never code or topology. `CopilotKit/openbot` (`https://github.com/CopilotKit/OpenBot`) contributes the agents-as-configuration model, the decide-before-act plus record-after gateway, fail-closed CEL-style boundaries, and skills-as-instructions. `mem0ai/mem0` (`https://github.com/mem0ai/mem0`) contributes the User/Session/Agent three-tier split, ADD-only accumulation with entity linking, and single-pass budgeted retrieval. `topoteretes/cognee` (`https://github.com/topoteretes/cognee`) contributes the `remember/recall/improve/forget` operation shape and session-distillation wording. `khoj-ai/khoj` (`https://github.com/khoj-ai/khoj`) contributes the no-workspace personal assistant UX. `janhq/jan` (`https://github.com/janhq/jan`) contributes the Electron desktop shape with Custom Assistants plus MCP. `Zleap-AI/SAG` (`https://github.com/Zleap-AI/SAG`) contributes source-tracing with citations over local-first storage. `zhayujie/CowAgent` (`https://github.com/zhayujie/CowAgent`) contributes the skill-hub plus Markdown-wiki curation loop. Enterprise RAG systems (RAGFlow, FastGPT, MaxKB) serve as recall-quality对照 only and never as desktop dependencies.

Governing decisions live in [the queue-owned pipeline](../knowledge-pipeline.md) (queue ownership plus deterministic-first settling), [the agent loop refactor](../../agent/agent-loop-refactor.md) (shell-only orchestrator duties), [the chat contract alignment](../../agent/janus-agent-chat-alignment.md) (upstream event parity plus renderer question gate), [the personal memory persona](./personal-memory-persona.md) (L2/L3 scope semantics adopted here), [the slot registry](../../workbench/requirements/island-rightdock-slots.md) (L1 in-code contributions for the cards), and [the plugin forms](../../workbench/requirements/plugin-architecture-forms.md) (red lines on process isolation).

## Alternatives considered

- Single mixed scope for project and person — strongest case is one recall path with no fusion logic and the smallest diff. The driver that rules it out is boundary collapse: workspace filtering either leaks personal traits into shared views or dilutes habits past retrieval.
- External memory service first (hosted memory API or full graph service) — strongest case is immediate semantic recall plus managed embeddings. The driver that rules it out is Local-first plus Provider-neutral plus present capability: the embedding provider resolves null today, BM25 ships a working model-less baseline, and a service dependency breaks offline desktop use.
- Full plugin platform first — strongest case is third-party assistants from day one. The driver that rules it out is premature trust cost: sandboxing, signing, and version skew before any internal consumer proves the slot shape.
- Do nothing / reuse project memory only — staying put protects the frozen pipeline semantics with zero new surface. The cost is repeated preference questions, unanswerable recent-history queries, and conflicting old-versus-new habits guiding behavior silently.

## Acceptance criteria

- [ ] AC-1: A fresh session with no workspace mounted answers stable user preferences with every claim clickable back to its fact or observation source.
- [ ] AC-2: Recent-activity questions answer from the event timeline with expired events absent and the working set rolling.
- [ ] AC-3: A changed habit archives its predecessor with a version bump plus audit, and recall labels the succession without dual guidance.
- [ ] AC-4: Frequency aggregation, timelines, and BM25 retrieval work model-less while the Inbox stays unflooded under observable derivation metrics.
- [ ] AC-5: Nothing personal surfaces to team, roundtable, remote, notification, or external MCP channels before explicit publish, and forget leaves no recall residue with audit to prove it.
- [ ] AC-6: `janus-agentX` stays product-neutral with no persona, habit, or episode types in generic packages, covered by seam contract tests.
- [ ] AC-7: Typecheck passes and tests cover promotion, decay, succession, TTL harvest, and post-forget silence.

## Risks

- L2 promotion noise floods the Inbox; hold the high-precision bar and watch per-derivation proposal metrics before widening sources.
- Superseded habits resurface as current guidance; label possibly-outdated relations explicitly instead of swapping silently.
- Embedding arrival later forks storage; reserve the hybrid path and open no second vector store for personal memory.
- Cross-repo drift with `janus-agentX` renames assumed ports; keep the personal layer behind `ChatTurnPorts` plus generic filters with seam contract tests.
- Personal leakage through roundtable workspace tools, Feishu remote, desktop toast, and external MCP; mitigate with default-private recall plus explicit publish and `allowGlobal=false` on every shared path.
