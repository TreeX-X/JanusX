---
schema: harness-note/1
id: 54b1046a-2c23-4bd0-acc5-7ddcd7f3a343
kind: decision
lifecycle: implemented
created: 2026-09-26
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10
class: feature
tags: [janus-chat, agentX-parity, streaming-feedback, thinking]
relations:
  - type: follows
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/6813a52b-249b-556e-a0eb-55acc6930922
---

# Janus chat streams agentX-grade feedback

## Problem

Janus chat and the janus-agentX TUI share the `runChatTurn` event contract, but the renderer surfaces differ. The TUI keeps a live status row (`thinking…` / `writing…` / `preparing tool…` / `running <tool>…` / `awaiting your pick…`) with a 250ms elapsed timer, an interleaved thinking block with collapsed gist plus live tail, and a done caption with turn duration. Janus chat shows a bare three-dot loader until the first `text_delta` or tool card: no elapsed time, no phase, and the thinking block stays a collapsed `思考中…N字` count that requires a click. A user staring at a reasoning-heavy turn sees motion without information.

## Decision

The renderer derives the same status row from the same `ChatAgentEvent` union and times the turn from request start. `chatStatusForEvent` in `janusRuntimeState.ts` maps `agent_start` / `reasoning_delta` to thinking, `text_delta` to writing, `tool_call_start` / `tool_call_ready` to preparing, `tool_execution_start` / `update` to running with the tool name, `model_finish(tool_calls)` to running and other finishes to finishing, and `question_requested` to awaiting; all other events preserve the prior status. `useJanusChat.ts` holds `turnStartedAt` plus `turnStatus` per conversation, sets both on `startRequest`, advances status on every agent event, and clears the start on done, error, stop, and session failure. The done path settles `durationMs` into the stored reasoning snapshot.

`JanusChat.tsx` renders a `TurnStatusRow` (spinner plus translated phase plus `· Xs` elapsed, ticking at 250ms) above the thinking block for every streaming turn, so the pre-first-token phase carries the same signal as agentX `Activity`. `ThinkingRegion.tsx` keeps its collapsed default but the header now reads `思考中…N字 · Xs · gist` live and `已思考N字 · Xs · gist` when done, with a collapsed live-tail line plus cursor during streaming and the full text only on expand. Duration formatting (`X.Xs` under a minute, `Xm Ys` above) plus gist and live-tail extraction live as pure helpers in `janusReasoning.ts`. The three-dot loader remains as a secondary motion cue under the status row, with an accessible label.

## Alternatives considered

- Mirror the full TUI timeline (interleaved thinking/tool/assistant blocks with expand/collapse-all): strongest case is pixel parity with agentX. The driver that rules it out is scope: Janus chat already owns message history, tool cards, todo strip, and question gate; re-laying the stream order risks scroll and persistence regressions for no new signal.
- Auto-expand thinking during streaming: strongest case is zero-click visibility of the full process. The driver that rules it out is noise: long reasoning pushes the answer and tool cards off-screen; the collapsed gist plus live tail carries the signal without the layout cost.
- Derive elapsed from main-process timestamps or IPC heartbeats: strongest case is one clock for every surface. The driver that rules it out is plumbing: the renderer already owns turn boundaries, and a renderer clock matches the existing flush and abort ownership with no contract change.
- Do nothing / reuse: staying put keeps the shipped loader untouched. The cost is the reported behavior: silent waits on reasoning-heavy turns with feedback appearing only at tool calls.

## Consequences

- **Gains**: every streaming turn shows phase plus elapsed from the first frame; reasoning turns show gist plus live tail without a click; completed turns retain `N字 · Xs` for later review. Status mapping and duration helpers carry unit tests.
- **Costs and limits**: two 250ms interval timers run during streaming (status row plus thinking region); both unmount with the turn, and neither participates in scroll signatures. Legacy reasoning snapshots without `durationMs` render headers without duration. Expanded-panel and controller-less hosts fall back to a thinking status without elapsed until they forward the controller fields. `check:notes` stays environment-broken here (missing `yaml` package), so Note validation is structural review only.
- **Verification**: `npx vitest run tests/unit/janus-reasoning.test.ts tests/unit/janus-chat-status.test.ts tests/unit/agent/chat-agent-events.test.ts tests/unit/janus-runtime-state.test.ts` reports 13 passed; `npx tsc --noEmit` reports no output; `npm run i18n:check` reports 12 namespaces in sync; `npx eslint` on the six touched source files reports 0 errors (4 pre-existing Chinese-literal warnings on the roundtable block, untouched).

Related contract alignment lives in [the chat contract alignment](./2026-09-12-janus-agent-chat-alignment--6813a52b.md): that note owns event parity and the question gate, this note owns the streaming feedback surface.
