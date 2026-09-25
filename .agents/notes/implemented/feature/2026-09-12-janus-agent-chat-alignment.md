---
schema: harness-note/1
id: 6813a52b-249b-556e-a0eb-55acc6930922
kind: decision
lifecycle: implemented
created: 2026-09-12
class: feature
---
# Agent Note: Janus chat aligns to janus-agent event contract

Status: implemented

## Problem

The chat contract in `src/shared/ipc/llm.ts` drifts from chat-core in both directions. The local union lacks `todo_update`, `question_requested`, and `question_resolved`, so `chat-orchestrator.ts` fails typecheck when the loop forwards upstream events and the renderer can neither show agent todos nor answer mid-turn questions. The local union also carries `tool_display`, which upstream deleted, and JanusX feeds it by forwarding raw stream events into IPC — the exact path upstream documents as in-process only. Without a `QuestionPort`, every `ask_user` call takes the non-interactive deny branch and the user never sees the question. Meanwhile the chat UI embeds workspace panes and workspace attach controls, while workspace agent work belongs to janus-agentX.

## Decision

The local `ChatAgentEvent` tracks chat-core's union one-to-one: todo and question variants plus their payload types live in `src/shared/ipc/llm.ts`, and `tool_display` is gone with its producer `chat-stream-display.ts`. The orchestrator passes no `onStreamEvent` adapter to `runChatTurn`, so tool display follows the upstream raw `tool_call_*` and `tool_execution_*` events the reducer already handles. A shell-owned `llm:chat:answer-question` channel carries renderer answers; `chat-orchestrator.ts` holds pending resolvers keyed by call id, settles them on answer, abort, and request-finally, and exposes the bridge through a pure `question` passthrough in `janus-agent-ports.ts`. The renderer keeps the latest todo snapshot and open questions in `JanusRuntimeState`, renders a todo strip and an option/custom question gate above the composer, and answers through `services/llm.ts`. The `janus-chat` pane type, its factory, the store open/remove actions, the `JanusChatPane` wrapper, the `workspace` prop, the resource scope UI, and the embed entry points in Titlebar and Island are removed; `retainWorkspacePaneContent` drops legacy chat tabs from persisted snapshots, and roundtable resources plus approval cards keep working untouched.

## Alternatives considered

- Add only the missing variants and keep `tool_display` — strongest case is the smallest diff with no display regression. The driver that rules it out is the upstream contract: raw stream events must not cross IPC, and keeping a parallel display event preserves the dual-source drift that caused this note.
- Remove the chat backend too and route everything through janus-agent — strongest case is one agent implementation with no shell duplication. The driver that rules it out is scope: recall, capture, steering, and approval plumbing stay shell-owned, and the request asks for display alignment plus UI removal only.
- Vendor janus-agentX instead of `file:` linking — strongest case is hermetic builds and an end to dist-freshness doubt. The driver that rules it out is release impact: packaging, dist sync, and the sibling-repo workflow need their own decision.
- Do nothing / reuse — staying put keeps the shipped chat untouched. The cost is a red typecheck, invisible mid-turn questions that always auto-deny, and two competing workspace-embedding surfaces.

## Consequences

- **Gains**: `ChatAgentEvent` compiles against the loop output again; mid-turn questions block on a real gate with per-question single/multi pick, custom answers, and cancel; abort and request end always settle pending questions as cancelled. Persisted `janus-chat` tabs migrate out silently on snapshot retain.
- **Costs and limits**: Redacted arg/result digests from `tool_display` no longer render; tool cards show upstream names, keys, and status only. Previously attached workspaces still apply but gain no UI to change; the orphaned `resource`/`closeChat` i18n keys stay until a catalog pass. Full-repo verification stays partial in this environment: `node_modules` misses packages (`@ai-sdk/*`, `@electron-toolkit/utils`, `@babel/core`, `.bin`), so typecheck reports only those plus untouched strict-unused findings, eslint cannot load, and 24 unrelated test files fail on missing modules or in-flight drift; the island e2e specs were updated consistently but not executed here.
