---
schema: harness-note/1
id: e373dd26-5e92-47b5-a0fa-f2eb7b83b3ec
kind: decision
lifecycle: implemented
created: 2026-09-26
class: bug-fix
tags: [janus-chat, blueprint-dialog, provider-compat, system-prompt]
---

# Demote mid-conversation system messages at the stream seam

## Problem

A blueprint dialog question such as reading workspace notes fails on strict models with `system messages are only supported at the beginning of the conversation`. Renderer history carries user and assistant roles only (`shared/ipc/janus-chat.ts` pins that union), and the turn prefix (project context, chat system prompt, trace and todo sections, recall injection) places every system message before the first user message. The violation enters later: the agent loop appends recovery, todo, and repair follow-ups as `system` after tool results, and the stream adapter forwards roles verbatim, so the second provider call of any tool-using turn carries mid-conversation `system` entries.

## Decision

`src/main/llm/loop-message-sanitize.ts` exports `sanitizeLoopMessages`, which relabels every `system` message after the first non-`system` message to `user`, preserving order, content, and object shape. Leading `system` messages pass through untouched, and nothing is dropped or merged, so assistant tool-call and tool-result pairing stays intact. `src/main/llm/chat-orchestrator.ts` wraps the injected `streamTextFn` with this pass, covering every `runChatTurn` caller (island chat, blueprint panel, desktop task turns) without touching the sibling loop source.

## Alternatives considered

- Do nothing and document strict models as unsupported: zero diff. Rejected because the blueprint dialog is a primary entry and the failure strikes ordinary tool-using questions.
- Patch the sibling loop to emit follow-ups as `user`: strongest home for the fix. Rejected for this pass because the sibling checkout is a read-only dependency; the seam wrapper achieves identical wire behavior inside this repository.
- Merge leading systems into one or drop mid systems: smaller wire surface. Rejected because merging perturbs prompt caching and dropping loses repair guidance the loop depends on.
- Map demoted messages to the `developer` role: closer privilege semantics on newest OpenAI models. Rejected because generic OpenAI-compatible providers reject unknown roles while `user` is universally accepted.

## Consequences

Strict providers accept multi-step turns while lenient providers see follow-up nudges as user instructions rather than system instructions, a uniform and slightly weaker privilege. The wrapper adds one array pass per provider call, negligible against network cost. Revisit when the loop emits native `developer` roles or segregated system channels: the wrapper then becomes redundant and leaves through the same seam.

## Verification

- `npx vitest run tests/unit/llm/loop-message-sanitize.test.ts tests/unit/llm/chat-turn-guard.test.ts tests/unit/llm/janus-agent-ports.test.ts`: 3 files, 25 tests, all pass.
- `npx tsc --noEmit`: zero errors.
- Live Electron repro against a strict model not run in this session; the wire shape is pinned by unit tests instead.
