---
schema: harness-note/1
id: e29da5b4-dc65-40a9-883d-9026e3b280b1
kind: decision
lifecycle: implemented
created: 2026-09-22
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7
    reason: The content slice defines turn prompt and excerpt fields; this slice supplies excerpts for every engine with a readable transcript store
---

# Agent Note: Per-engine hook capabilities plus transcript resolvers

## Problem

Turn classification in `agent-hook-coordinator.ts` and `agent-turn-recorder.ts` repeats per-engine branches (`source === 'opencode'` in every predicate, duplicated event sets and status helpers), so each engine addition touches N sites and drift already exists between the two copies. Answer excerpts resolve only for claude while codex, janus, opencode, and pi turns stay status-only, even though codex rollouts and janus histories sit on disk in parseable shapes.

## Decision

`src/main/notifications/agent-engine-capabilities.ts` holds one table keyed by hook source: start, complete, fail, and approval/attention rules plus the transcript contract and sentinel flag per engine. The coordinator, the recorder, the terminal approval check, and the sentinel gate consume it; the opencode raw-status nuance and event-name normalization move into the module once. Coordinator combinators that were never per-engine (engine-agnostic approval literal, opencode-blind Notification matcher) keep their exact shape on top. Excerpt resolution dispatches on the same table: claude reads the hook transcript tail as before, codex resolves `~/.codex/sessions` rollouts by exact thread-id filename suffix with a freshest cwd-matching fallback over session_meta heads, janus reads `~/.janus/history/<sessionId>.jsonl` by exact provider session id, and opencode and pi stay status-only because their stores are unreachable (sqlite without a driver, no transcript store and no provider session id respectively). All resolvers share the 64KB tail and 500-character excerpt caps and never throw. One deliberate alignment ships inside: recorder failure classification now treats synthetic aborts as failed for every source like the coordinator always did, instead of skipping opencode pty-death observations and leaking the recorder turn.

## Alternatives considered

- Per-engine resolver modules with separate call sites — strongest case is isolated evolution per format. The driver that rules it out is dispatch duplication: one table row per engine already selects the parser, and the turn-end path stays a single call.
- Exact thread matching only for codex, no cwd fallback — strongest case is zero misattribution risk. The driver that rules it out is coverage: hook raws carry thread keys best-effort, and the freshest cwd-matching rollout is the same fallback orca uses where identity is absent.
- Reading opencode sqlite with a new driver — strongest case is full five-engine excerpts now. The driver that rules it out is dependency and version risk: a native sqlite driver plus an unpinned schema turns every opencode upgrade into a JanusX incident; the revisit signal is a stable export or driver-free reader.
- Shell sessions in the ledger — strongest case is literally every terminal covered. The driver that rules it out is meaning: shells have no turn boundaries, so there is nothing to record.
- Do nothing / keep claude-only excerpts with branched predicates — no churn. The cost is permanent status-only timelines for four engines plus the next engine copy-pasting the branches again.

## Consequences

- **Gains**: engine vocabulary changes land in one row; codex and janus turns gain answer prose through verified store shapes; opencode and pi keep prior behavior with a named revisit instead of a silent gap.
- **Costs and limits**: codex cwd fallback can misattribute when two live sessions share a cwd and neither reports a thread id; janus histories above 2MB skip rather than paginate; transcript formats pin current CLI behavior and need re-verification when vendors change schemas. Verification is machine evidence on touched paths: `tsc --noEmit` plus `typecheck:strict-unused` are clean, `eslint` on touched files reports zero problems, the pre-existing hook suites pass unchanged (coordinator 20/20, recorder 3/3, config 12/12, bridge 1/1, pi-extension 4/4), and new suites pass on capabilities 4/4, excerpts 6/6, and registry 13/13.
