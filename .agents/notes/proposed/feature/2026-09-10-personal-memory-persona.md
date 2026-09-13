# Agent Note: Personal memory and habit persona

Status: proposed

## Problem

The knowledge pipeline remembers projects but not the person. Retrieval filters strictly by workspace id, so operating habits, instruction phrasing preferences, and recent events have no partition. Freshness weighting cannot answer what happened lately, the chat turn carries no user-dimension injection point, and the team-sync exclusion for personal traits stays unwritten. Stable preferences get re-asked every session.

Boundary: the generic loop, turn, recall-trace, tool, and policy primitives live in `../janus-agentX` (`agent-core`, `chat-core`, `janus-agent`) and are consumed by JanusX through `ChatTurnPorts` (`knowledgeSearch`, `captureObservation`, `scheduleSettled` in `src/main/llm/chat-orchestrator.ts` / `janus-agent-ports.ts`). Personal-Bot behavior must not fork those primitives; it lands as a JanusX product layer over the existing queue-owned pipeline (`2026-09-03-knowledge-pipeline.md`).

## Proposal

Single-Janus reading of Grok-Bot: one durable `Janus` (`src/shared/janus/persona.ts` + `src/main/janus/chat-store.ts` journal) owns the person; workspaces stay project-scoped. Keep project memory and add two user scopes. L2 persona holds identity, format and tool preferences, and habits: promotion at frequency three or higher through a new `habit-aggregator` with Ebbinghaus decay plus retrieval reheat and evidence merging, gated through the existing Inbox review. L3 recency holds auto-written events with a 30–90 day TTL and a rolling working set that never disturbs the user. Extend the contract minimally (`scope`, `habitStrength`, `lastSeenAt`, `ttl`, a `UserProfile` snapshot view, `profile/` plus `episodes/` partitions) and reuse the processing queue, the budgeted LLM stage, and the daily maintenance loop. Fuse three recall paths into an independent user-memory prompt section with its own budget, and expose search, candidate-only save, and forget tools with source citations on every used memory. Add Profile, Habits, and Recent cards plus an Island badge. Enforce hard boundaries: private by default, no team, roundtable, remote, or notification surfacing without an explicit publish action, secret redaction before storage, and forget as archived facts plus TTL harvest plus audit with index-aware deletion.

Responsibility split with `janus-agentX`:

- `janus-agentX` owns generic capability only: agent loop, `ChatSessionRuntime`, steering ports, `ChatTurnPorts` shapes, recall-trace types, tool adapters, path/policy gates. Personal concepts (`persona`, `habit`, `episodes`, `UserProfile`) never enter `agent-core` / `chat-core` types; at most a generic optional recall filter (`scope`, `allowGlobal`) passes through.
- JanusX owns the personal-Bot product: `profile/` + `episodes/` partitions, `habit-aggregator`, TTL harvest, project-vs-user recall fusion with separate budgets, `UserProfile` snapshot appended after `JANUS_PERSONA`, `janus-chat` turn capture (`source=janus-chat`) via the existing `captureObservation` port plus `scheduleImmediate` on turn end, workbench cards and Island badge, search/save/forget tools, publish-gated surfacing, redaction, and audit plus index-aware deletion.
- Integration stays port-shaped: `chat-orchestrator.ts` `knowledgeSearch` forwards `scope=user` with `allowGlobal`, `runChatTurn` injects the user-memory section independently of `workspaceId`, and no direct `janus-agentX` file writes bypass the JanusX queue.

Reference for follow-up: `https://github.com/CopilotKit/openbot` (open-source AI coworkers, one computer per Bot, AG-UI bring-your-own-agent). Borrow product patterns only: per-Bot computer/workspace isolation, gateway that decides policy before acting and records audit after, CEL-style fail-closed boundaries, readable audit trail, skills-as-instructions plus routines, secrets never entering the transcript. Do not borrow deploy topology: JanusX stays single-Janus desktop with `userData` + workspace partitions, not per-Bot containers/Postgres.

## Alternatives considered

- One mixed scope for project and person — strongest case is a single recall path with no fusion logic. The driver that rules it out is boundary collapse: workspace filtering either leaks personal traits to shared views or dilutes habits beyond retrieval.
- Implement personal memory inside `janus-agentX` — strongest case is one generic memory for every host app. The driver that rules it out is product coupling: persona wording, workbench Inbox, Island UI, publish-gated roundtable/remote/MCP surfacing, and JanusX audit shapes are JanusX product decisions; `janus-agentX` must stay host-neutral and port-shaped.
- Vector store first — strongest case is semantic recall quality from day one. The driver that rules it out is present capability: the embedding provider returns null today, while BM25 plus weighting ships a working model-less baseline.
- Do nothing / reuse project memory only — staying put protects the frozen pipeline semantics. The cost is repeated preference questions, unanswerable recent-history queries, and conflicting old-versus-new habits guiding behavior silently.

## Acceptance criteria

- [ ] A fresh session states stable user preferences with every claim clickable back to its fact or observation source.
- [ ] Recent-activity questions answer from the event timeline with expired events absent and the working set rolling.
- [ ] A changed habit archives its predecessor with a version bump plus audit, and recall labels the succession without dual guidance.
- [ ] Frequency aggregation, timelines, and BM25 retrieval work model-less while Inbox stays unflooded under observable derivation metrics.
- [ ] Nothing personal surfaces to team, remote, or notification channels before explicit publish, and forget leaves no recall residue with audit to prove it.
- [ ] `janus-agentX` stays product-neutral: no persona/habit/episode types in `agent-core` / `chat-core`, only a generic optional recall filter; all personal storage, fusion, UI, and privacy logic lives in JanusX.
- [ ] Cards hold layout, reduced motion stays clean, typecheck passes, and tests cover promotion, decay, succession, TTL harvest, and post-forget silence.

## Risks

- L2 promotion noise floods the Inbox; hold the high-precision bar and watch the per-derivation proposal metrics.
- Superseded habits resurfacing as current guidance; label possibly-outdated relations explicitly instead of swapping silently.
- Embedding arrival later must not fork storage; reserve the hybrid path and open no second vector store for personal memory.
- Cross-repo drift with `janus-agentX`: JanusX assumes ports that upstream renames; mitigate by keeping the personal layer behind `ChatTurnPorts` plus `recallFilterKey`-style generic filters and covering the seam with `tests/unit/llm/janus-agent-ports.test.ts`-level contract tests.
- Personal leakage through roundtable workspace tools, Feishu remote, desktop toast, and `janusx-knowledge` external MCP; mitigate with default-private recall plus explicit publish and `allowGlobal=false` on every shared-surface path.
