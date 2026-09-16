# Agent Note: Agent assistant OSS survey

Status: proposed

## Problem

Independent knowledge and assistant work starts without an evidence-backed borrow list. Picking references by name recognition alone risks copying deployment topology instead of product mechanisms, importing service dependencies that break Local-first offline use, or freezing a UI shape before the recall and tool contracts exist. Every borrow decision needs a URL, a license, a verified date, and a concrete JanusX file mapping, or reviewers cannot tell pattern-learning apart from code-copying six months from now.

## Proposal

Adopt the borrow decisions below, grouped by execution surface and memory layer. All facts were verified against public repository pages on 2026-09-14; star counts are approximate and carry no quality claim. Licenses observed are all permissive (MIT or Apache-2.0); no copyleft code enters the tree under this note. Borrow means product patterns and protocol shapes only, reimplemented clean-room against JanusX contracts; no vendor SDK becomes an Electron runtime dependency through this note.

Execution surface borrows:

| Repository | License / scale | Borrow | JanusX landing |
|---|---|---|---|
| `CopilotKit/OpenBot` (`https://github.com/CopilotKit/OpenBot`) | MIT, ~5k stars | Agents as configuration (`agents.yaml` trio: General/Knowledge/Risk); gateway that decides before acting and records after; fail-closed CEL-style boundaries; skills as instructions | Assistant tool gating plus audit shape in `src/main/agent/runtime/policy-gate.ts` and `policy-audit-store.ts`; skill invocation model |
| `CopilotKit/CopilotKit` (`https://github.com/CopilotKit/CopilotKit`) | MIT, ~37k stars | `useAgent` over a protocol agent; shared state between agent and UI; human-in-the-loop pause; generative UI as data, not prose | Renderer question gate plus todo strip already aligned in `2026-09-12-janus-agent-chat-alignment.md`; card rendering stays declarative |
| `ag-ui-protocol/ag-ui` (`https://github.com/ag-ui-protocol/ag-ui`) | MIT, ~15k stars | ~16 standard event types over SSE; protocol stack split (MCP gives tools, A2A connects agents, AG-UI connects users); run/step/text/tool/state lifecycle events | `ChatAgentEvent` union in `src/shared/ipc/llm.ts` keeps one-to-one upstream parity; no second display-event channel |
| `OpenHands/OpenHands` (`https://github.com/OpenHands/OpenHands`) | MIT, ~86k stars | Agent Canvas control center; ACP third-party agents (Claude Code, Codex, Gemini); Docker sandbox default with explicit no-sandbox warning; audit logs plus budget controls | Sandbox-first posture plus recovery-budget thinking for Agent Session Snapshot; ACP-style third-party CLI tolerance already present in stream-manager |
| `OpenHands/software-agent-sdk` (`https://github.com/OpenHands/software-agent-sdk`) | MIT, ~1k stars | Canonical layering SDK/Agent Server → OpenAPI contract → typed client → UI; behavior ownership per repository | `chat-orchestrator.ts` stays a shell adapter over `runChatTurn`; `janus-agentX` keeps loop ownership |
| `continuedev/continue` (`https://github.com/continuedev/continue`) | Apache-2.0 | Chat/Edit/Autocomplete/Agent four modes; provider-neutral federation; composable context blocks (codebase, docs, rules, MCP); Hub-distributed assistants | Mode-shaped assistant behavior plus provider-neutral catalog in `packages/llm-core`; Hub-equivalent stays out of scope |
| `Zoo-Code-Org/Zoo-Code` (`https://github.com/Zoo-Code-Org/Zoo-Code`) | Apache-2.0, Roo Code community fork | Architect/Code/Debug modes with custom modes; every change lands as a reviewable diff; BYOK | Mode wording for assistant surface; review-before-apply already enforced by evaluatorX gate |

Memory and knowledge borrows:

| Repository | License / scale | Borrow | JanusX landing |
|---|---|---|---|
| `mem0ai/mem0` (`https://github.com/mem0ai/mem0`) | Apache-2.0, ~60k stars | User/Session/Agent three tiers; ADD-only accumulation with entity linking; single-pass budgeted retrieval | L2/L3 scope split plus independent recall budget; no second vector store while embedding resolves null |
| `topoteretes/cognee` (`https://github.com/topoteretes/cognee`) | Apache-2.0, ~30k stars | `remember/recall/improve/forget` operation shape; session distillation into durable graph; ontology-grounded ingestion | Queue-owned pipeline operation vocabulary in `src/main/knowledge/*`; forget-as-archived-facts semantics |
| `getzep/graphiti` (`https://github.com/getzep/graphiti`) | Apache-2.0, ~30k stars | Temporal context graphs with bi-temporal model; episodes ingest as raw units, facts carry valid/invalid windows, provenance is mandatory; hybrid semantic plus BM25 plus graph retrieval with no LLM rerank | Episode partitions plus habit succession labeling plus TTL harvest; BM25-first hybrid seam reserved for later embeddings |
| `letta-ai/letta` (`https://github.com/letta-ai/letta`, active code in `letta-code`) | Apache-2.0, ~24k stars | Memory blocks (`human`/`persona` labels); MemFS git-backed markdown memory filesystem with version history; sleep-time offline consolidation; skills plus subagents | `UserProfile` snapshot appended after persona; daily maintenance loop as sleep-time equivalent; `.bridgememory`-style auditability without committing private traits |
| `khoj-ai/khoj` (`https://github.com/khoj-ai/khoj`) | OSS, ~31k stars | Personal second brain usable with no project open; multi-source ingest; desktop plus editor surfaces | No-workspace assistant enablement plus Profile/Recent cards |
| `janhq/jan` (`https://github.com/janhq/jan`) | Apache-2.0, ~44k stars | Electron offline desktop; Custom Assistants; MCP integration; OpenAI-compatible local server | Desktop assistant shape closest to JanusX; local-model option stays a later phase |
| `Zleap-AI/SAG` (`https://github.com/Zleap-AI/SAG`) | MIT, ~2k stars | Local-first single-user base; every retrieval result traceable to its source chunk; cited agent answers | Citation-back-to-source on every used memory claim |
| `zhayujie/CowAgent` (`https://github.com/zhayujie/CowAgent`) | MIT, ~46k stars | Skill hub with one-click install; conversational skill authoring; Markdown wiki plus knowledge-graph curation; self-evolution loop | Skill invocation audit trail; Inbox review as the evolution gate |

Three deliberate non-borrows hold. Per-Bot containers plus Postgres topology from OpenBot never enter the desktop; JanusX stays single-Janus with `userData` plus workspace partitions. In-process third-party extension execution never enters the shell; the plugin red lines stand. Service-backed memory clouds never enter the MVP; offline BM25 ships first with the hybrid seam reserved.

This survey serves [the independent knowledge and assistant MVP](2026-09-14-independent-knowledge-assistant.md) and adopts the scope semantics of [the personal memory persona](2026-09-10-personal-memory-persona.md), the settling guarantees of [the queue-owned pipeline](../../implemented/architecture/2026-09-03-knowledge-pipeline.md), and the contract parity of [the chat alignment](../../implemented/feature/2026-09-12-janus-agent-chat-alignment.md).

## Alternatives considered

- Heavy-dependency adoption (npm-install a memory framework or run a graph service beside Electron) — strongest case is immediate semantic recall with zero algorithm work. The driver that rules it out is Local-first plus offline plus bundle cost: a service dependency breaks the desktop when the network or the sidecar is absent, and the embedding provider resolves null today anyway.
- UI-shape-only borrowing (copy layouts, cards, and chat chrome) — strongest case is visible progress within days. The driver that rules it out is the BridgeMind lesson already recorded in the wiki research: the control plane (task, event, identity, ownership) is the advantage, not the layout; styling without contracts produces a second documentation system that drifts.
- Single-vendor stack lock-in (one agent framework end to end) — strongest case is fewer seams and faster wiring. The driver that rules it out is Provider-neutral plus the ACP/AG-UI evidence: the ecosystem converges on protocols between replaceable backends, and JanusX already shells multiple CLIs.
- Do nothing / reuse project memory only — staying put keeps every current path green with zero survey cost. The cost is repeated preference questions, unanswerable recent-history queries, and silent guidance from superseded habits.

## Acceptance criteria

- [ ] Every repository entry carries a URL, an observed license, and the 2026-09-14 verification date; no entry claims a fact the search excerpts did not show.
- [ ] Every borrow maps to a named JanusX file or an explicitly named non-goal; no borrow floats without a landing point.
- [ ] No vendor SDK or service becomes a runtime dependency through this note; the tree gains documentation only.
- [ ] The three non-borrows (per-Bot topology, in-process third-party execution, memory cloud) hold against the MVP scope.
- [ ] Stale-risk entries (Continue post-acquisition final release, Letta repo migration to `letta-code`) are labeled so implementers re-verify before depending on them.

## Risks

- Star counts decay and repositories migrate (Letta already moved active code to `letta-code`; Continue shipped a final 2.0.0 post-acquisition); re-verify any entry before building on it, and treat counts as popularity signal only.
- Graph-backed ambition outgrows the BM25 baseline mid-MVP; hold the hybrid seam and open no second store until the embedding provider resolves non-null.
- Protocol envy pulls AG-UI or ACP conformance into the MVP; the MVP needs only event-union parity, with protocol adapters scheduled after the user scope ships.
- License drift on re-verification; all entries observed permissive today, and any copyleft arrival must trigger a new decision before code lands.
