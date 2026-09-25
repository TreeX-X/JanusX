---
schema: harness-note/1
id: fd109997-ae5c-588b-a0aa-02c197562a68
kind: decision
lifecycle: implemented
created: 2026-09-17
class: architecture
---
# Agent Note: Chat single-turn lock with project domain isolation

Status: implemented

## Problem

Two Janus entries share a conversationId while the main process accepts a second turn during an active stream. Steering slots overwrite, mid-turn questions resolve against the wrong request, and retries duplicate runs. Personal memory also absorbs project turns: workspace-free project discussions fall back to person capture, and user history fuses into engineering recall without an explicit user snippet. The failure costs a corrupted turn plus private history inside shared assets.

## Decision

`handleChatStream` in `src/main/llm/chat-orchestrator.ts` owns one active turn per conversationId. The steering slot doubles as the turn owner. A second request with the same conversationId receives BUSY on `llm:chat:error`. A duplicate requestId returns silently; the renderer waits on the first run. Mid-turn `ask_user` keys combine requestId with callId. Answers validate the owning request plus a live controller, and stale answers fail with no pending question.

Persisted conversations carry `engineeringContext`, `artifactRefs`, `activeRunRefs`, and `pendingActions` through message truncation. New chats start as personal assist. Project domain turns use project recall only and skip personal capture plus episode closeout. Missing domain keeps legacy personal behavior. The renderer sends domain and noteRefs as selection requests. The host resolves URIs from its own Note repository and workspace registry and never trusts renderer paths or grants. Scope: S6-a lock plus S6-b persistence and isolation, under [implementation contract](../../proposed/architecture/2026-09-16-note-harness-implementation-contract.md) C6/C8-S6 and [roundtable chat loop](../../proposed/architecture/2026-09-16-roundtable-chat-harness-loop.md).

## Alternatives considered

- Allow concurrent turns per conversation with per-request steering slots — strongest case is zero coordination with both entries responsive, but steering keys collide, question resolvers cross requests, and two model loops write one history.
- Infer project domain from workspace attachment — strongest case is no schema change with automatic detection, but empty-checkout project discussions look workspace-free and fall back to personal capture; an explicit domain keeps the boundary checkable.
- Do nothing / reuse — keep duplicate-request abort with sourceTag-only gating; rejected because abort on retry discards the first run and sourceTag cannot separate personal intent from project intent.

## Consequences

- **Gains**: same-conversation dual entries share one turn; steering and questions stay bound to the owning request; project turns stay out of personal memory; engineering refs survive the 200-message and 48-trace caps. Verification: `tests/unit/llm/chat-turn-guard.test.ts` (5 checks: BUSY lock, concurrent conversations, stale answers, project no-capture, project no-injection), `tests/unit/janus-chat-engineering.test.ts` (3 checks: truncation preserves refs, invalid drops, legacy readable), plus existing `janus-chat-store`, `janus-chat-conversations`, `janus-chat-recall`, `janus-chat-user-recall`, `janus-chat-trace`, `janus-agent-ports`, `janus-steering`, `chat-stream-card` suites; `npm run typecheck` passes.
- **Costs and limits**: blueprint maintenance keeps its own loop in `src/main/janus/maintenance/service.ts`; maintenance apply for harness project graphs still hits the legacy lane and needs the S6-c bridge. `noteRefs` travel as selection requests; host-side URI resolution plus task execution gating arrive with S6-c/S8. Revisit when blueprint entries create project conversations or maintenance routes through `runChatTurn`.
