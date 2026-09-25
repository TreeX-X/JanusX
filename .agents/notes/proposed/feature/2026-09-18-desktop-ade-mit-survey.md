---
schema: harness-note/1
id: c32cd9ef-9e87-5fca-a1d8-1c45321e0795
kind: decision
lifecycle: proposed
created: 2026-09-18
class: feature
---
# Agent Note: MIT-only desktop ADE survey and H2 upgrade points

Status: proposed

## Problem

JanusX needs a single MIT-only evidence base for desktop ADE work in H2 2026. The earlier survey in `./2026-09-14-agent-assistant-oss-survey.md` mixes MIT and Apache-2.0 sources, and the desktop ADE market has since converged on fleet orchestration while JanusX still lacks a consolidated upgrade list. Without a license-filtered merge, implementers risk importing Apache-2.0 patterns without attribution discipline, mistaking Elastic-2.0 or GPL-3.0 sources for open source, or copying deployment topology instead of control-plane mechanisms.

## Proposal

Adopt the MIT-only borrow list below as the H2 desktop ADE reference. All repository facts were verified against public GitHub pages on 2026-09-18; star counts are approximate popularity signals only. Borrow means product patterns and protocol shapes reimplemented clean-room against JanusX contracts; no vendor SDK becomes an Electron runtime dependency through this note.

The H2 consensus across MIT desktop ADE projects is fleet-first. The durable upgrade points are parallel worktrees as the isolation unit, daemon-backed multi-surface access, goal-driven sessions with multi-run comparison, in-app preview with element-to-prompt, account and usage visibility, scriptable worktree operations, and native issue-to-PR context. Each point below carries a named JanusX landing so reviewers can trace pattern-learning six months from now.

MIT desktop ADE borrows:

| Repository | License / scale | Borrow | JanusX landing |
|---|---|---|---|
| `anomalyco/opencode` (`https://github.com/anomalyco/opencode`) | MIT, ~160k stars | Terminal plus Desktop Beta plus IDE extension sharing one session model; 75-plus provider federation; LSP auto-load; multi-session parallelism | Provider-neutral catalog in `packages/llm-core`; Desktop Beta parity scope for `src/main/llm` and Janus Chat session handling |
| `stablyai/orca` (`https://github.com/stablyai/orca`) | MIT, ~60k stars | Fleet orchestration of Claude Code, Codex, OpenCode, Pi side by side, each in its own worktree; mobile companion with finish notifications; Chromium element picker sending HTML plus CSS plus screenshot into the prompt; SSH worktrees; account switcher with usage tracking; Orca CLI for `worktree create`, `snapshot`, `click`, `fill` | Task Runtime Board plus Agent Session Snapshot in `src/renderer/src/lib/workspace-pane.ts` and `src/renderer/src/stores/workspace.ts`; notification capsule behavior; `cc-switch` profile handling in `.agents/notes/implemented/feature/2026-09-17-cc-switch-*` |
| `openchamber/openchamber` (`https://github.com/openchamber/openchamber`) | MIT, ~10k stars | OpenCode-API workspace across Desktop, Web and PWA, VS Code, iOS and Android, CLI and server; Session Goals that continue after close; Multi-run up to five models with Fusion; Changes Walkthrough; Preview beside conversation; Private Relay QR pairing with end-to-end encryption | Session Goals map to `../../implemented/architecture/2026-09-18-persistent-task-threads.md`; Multi-run and Fusion map to evaluatorX gate in `../../implemented/architecture/2026-09-18-independent-review-repair.md`; Relay pairing maps to `../../implemented/architecture/2026-09-04-remote-control.md` and `../../implemented/feature/2026-08-20-tob-lan-remote.md` |
| `samhu1/openagent` (`https://github.com/samhu1/openagent`) | MIT, small | Local-first Electron desktop with multi-session chat, Git and file tooling, MCP management, Ollama plus OpenRouter provider flexibility | Offline-first posture for assistant MVP; MCP manager scope without adding a second vector store |
| `patil-shubham-dev/AgenticOS` (`https://github.com/patil-shubham-dev/AgenticOS`) | MIT, small | Electron plus React 19 multi-agent engine with Manager, Coder, Research, Browser, QA, Memory roles; PTY terminal with approval gates; tiered memory scopes | Role scoping input to WorkflowX coderX and evaluatorX separation; approval-gate vocabulary for `src/main/agent/runtime/policy-gate.ts` |
| `macOS26/Agent` (`https://github.com/macOS26/Agent`) | MIT, ~585 stars | 100 percent native Swift desktop agent with minimal dependencies and small bundle; provider-agnostic harness across local and cloud LLMs | Bundle-size and native-shell caution for any Tauri versus Electron discussion; no direct borrow of macOS-only APIs |

MIT assistant, protocol, and memory borrows carried forward from the 2026-09-14 survey:

| Repository | License / scale | Borrow | JanusX landing |
|---|---|---|---|
| `CopilotKit/OpenBot` (`https://github.com/CopilotKit/OpenBot`) | MIT, ~5k stars | Agents as configuration trio; gateway that decides before acting and records after; fail-closed boundaries; skills as instructions | Assistant tool gating plus audit shape in `src/main/agent/runtime/policy-gate.ts` and `policy-audit-store.ts`; skill invocation model |
| `CopilotKit/CopilotKit` (`https://github.com/CopilotKit/CopilotKit`) | MIT, ~37k stars | `useAgent` over a protocol agent; shared agent and UI state; human-in-the-loop pause; generative UI as data | Renderer question gate plus todo strip in `../../implemented/feature/2026-09-12-janus-agent-chat-alignment.md`; card rendering stays declarative |
| `ag-ui-protocol/ag-ui` (`https://github.com/ag-ui-protocol/ag-ui`) | MIT, ~15k stars | Standard event types over SSE; run, step, text, tool, state lifecycle | `ChatAgentEvent` union in `src/shared/ipc/llm.ts` keeps upstream parity; no second display-event channel |
| `OpenHands/OpenHands` (`https://github.com/OpenHands/OpenHands`) | MIT, ~86k stars | Agent Canvas control center; third-party CLI tolerance; Docker sandbox default with explicit no-sandbox warning; audit logs plus budget controls | Sandbox-first posture plus recovery-budget thinking for Agent Session Snapshot |
| `OpenHands/software-agent-sdk` (`https://github.com/OpenHands/software-agent-sdk`) | MIT, ~1k stars | Layering of agent server, OpenAPI contract, typed client, UI; behavior ownership per repository | `chat-orchestrator.ts` stays a shell adapter over `runChatTurn`; `janus-agentX` keeps loop ownership |
| `Zleap-AI/SAG` (`https://github.com/Zleap-AI/SAG`) | MIT, ~2k stars | Local-first single-user base; every retrieval result traceable to its source chunk | Citation-back-to-source on every used memory claim |
| `zhayujie/CowAgent` (`https://github.com/zhayujie/CowAgent`) | MIT, ~46k stars | Skill hub with one-click install; conversational skill authoring; Markdown wiki plus knowledge-graph curation | Skill invocation audit trail; Inbox review as the evolution gate |

Three deliberate non-borrows hold. Per-Bot containers plus Postgres topology from OpenBot never enter the desktop; JanusX stays single-Janus with `userData` plus workspace partitions. In-process third-party extension execution never enters the shell; the plugin red lines stand. Service-backed memory clouds never enter the MVP; offline BM25 ships first with the hybrid seam reserved.

Apache-2.0 entries from the earlier survey (`continuedev/continue`, `Zoo-Code-Org/Zoo-Code`, `mem0ai/mem0`, `topoteretes/cognee`, `getzep/graphiti`, `letta-ai/letta`, `khoj-ai/khoj`, `janhq/jan`) remain valid research but leave this MIT-only scope. They stay readable in `./2026-09-14-agent-assistant-oss-survey.md` and re-enter only through a separate license decision.

This note consolidates `./2026-09-14-agent-assistant-oss-survey.md` for MIT scope and adopts the control-plane priority from `../../../../wiki/research/BridgeMind产品调研与JanusX Agent Runtime借鉴方案.md`: task, event, identity, and ownership come before layout. It also preserves the extension-host safety boundary from `../../../../wiki/research/pi架构与JanusX-Chat扩展设计借鉴分析.md`.

## Alternatives considered

- Widen scope to Apache-2.0, Elastic-2.0, and GPL-3.0 desktop ADE projects (`getpaseo/paseo`, `iOfficeAI/AionUi`, `superset-sh/superset`, `ctxrs/ade`) — strongest case is a larger pattern pool covering daemon design, Office assistants, and 100-agent orchestration. The driver that rules it out for this note is license hygiene: Elastic-2.0 is source-available rather than OSI open source, GPL-3.0 imposes copyleft obligations on the desktop tree, and Apache-2.0 needs its own attribution pass before code lands.
- UI-shape-only borrowing (copy worktree grids, diff chrome, and mobile cards) — strongest case is visible progress within days. The driver that rules it out is the BridgeMind lesson already recorded in the wiki research: the advantage sits in the task and event control plane, and styling without contracts produces a second documentation system that drifts.
- Single-vendor stack lock-in (one agent framework end to end) — strongest case is fewer seams and faster wiring. The driver that rules it out is Provider-neutral plus the Orca and OpenChamber evidence: the ecosystem converges on protocols between replaceable CLIs, and JanusX already shells multiple CLIs.
- Do nothing / reuse project memory only — staying put keeps every current path green with zero survey cost. The cost is repeated preference questions, unanswerable recent-history queries, silent guidance from superseded habits, and fleet work that keeps spreading across terminal tabs without worktree isolation or review gates.

## Acceptance criteria

- [ ] Every repository entry carries a URL, an observed MIT license, and the 2026-09-18 verification date.
- [ ] Every borrow maps to a named JanusX file or an explicitly named non-goal; no borrow floats without a landing point.
- [ ] Apache-2.0, Elastic-2.0, and GPL-3.0 candidates appear only in Alternatives or the earlier survey, never as adopted borrows.
- [ ] No vendor SDK or service becomes a runtime dependency through this note; the tree gains documentation only.
- [ ] The three non-borrows (per-Bot topology, in-process third-party execution, memory cloud) hold against the MVP scope.

## Risks

- Star counts decay and repositories migrate or fork; re-verify any entry before building on it, and treat counts as popularity signal only.
- Fleet ambition outgrows the 3-to-6 high-quality concurrent agent target mid-MVP; hold file ownership, Ready Queue, and Reviewer Gate before expanding concurrency.
- Protocol envy pulls full AG-UI or ACP conformance into the MVP; the MVP needs only event-union parity, with adapters scheduled after the user scope ships.
- License drift on re-verification; all entries observed MIT today, and any copyleft arrival must trigger a new decision before code lands.
