# Agent Note: Maintenance discussions run on the shared turn

Status: implemented

## Problem

Maintenance discussions ran their own agent loop next to the shared chat
turn: bespoke tool assembly, bespoke retry, bespoke follow-up and overflow
handling, and a parallel trace compressor. Every turn-lock, steering,
retry, and recovery fix shipped twice and diverged, while the maintenance
panel never benefited from shared hardening. Wrapping the panel UI over
the old loop would hide the fork instead of removing it.

## Decision

`respond()` in `src/main/janus/maintenance/service.ts` runs the
discussion through `runChatTurn` with the maintenance hosting contract
from [chat-turn maintenance hosting](../../../../../janus-agentX/.agents/notes/implemented/architecture/2026-09-17-chat-turn-maintenance-hosting.md):
caller identity travels as `systemPromptPrefix`, the offering is the
read-only model tool set, and `sourceTag: 'maintenance'` resolves the
task workspaces without personal recall or capture. Recall stays
blueprint-scoped and injected as messages, observation stays on the
engineering path, and the task keeps its own session, steering port, and
abort controller, all passed into the shared turn. The blueprint scope
snapshot is pre-read into context, the same read the proposal path
performs, since caller tools cannot travel through the turn.

Turn events project onto the task channel through
`toMaintenanceChatEvent`; todo, question, and progress variants never
arrive because the allowlist excludes those tools. Traces map both ways:
panel traces replay into the shared turn, and runner traces land back as
panel entries with runner-only display assets left behind. Proposal
generation stays a single-shot structured path and never enters the turn.
`buildJanusChatTurnPorts` accepts absent knowledge and question ports, so
the same builder serves chat turns and memory-isolated discussions.

## Alternatives considered

- Keep the bespoke discussion loop — strongest case is zero behavior
  delta and no cross-repo dependency, but turn, retry, and recovery fixes
  keep shipping twice with no shared verdict on either side.
- Route discussion through the janus-chat IPC adapter — strongest case is
  maximal reuse with no new ports, but the IPC reply channels, personal
  recall, and capture wiring belong to assistant chat; borrowing them
  smuggles chat semantics into task discussions.
- Inject caller-owned model and loop tools through the turn — strongest
  case is interactive blueprint reads mid-turn, but custom tool execution
  plumbing doubles the ports surface for one caller while the pre-read
  snapshot already covers the scoped discussion.
- Offer todo and ask_user to maintenance discussions — strongest case is a
  uniform offering, but the panel has no question or todo UI, so the model
  would spend rounds discovering tools that always deny.
- Do nothing / reuse — keep canvas and the terminal CLI for complex
  discussion; rejected because proposals still need a working discussion
  lane from the panel.

## Consequences

- **Gains**: one turn runner serves assistant chat and maintenance
  discussions with shared retry, recovery, compaction, and overflow
  semantics; cancellation surfaces an explicit cancelled end event instead
  of going silent. Verification:
  `tests/unit/blueprint-maintenance-discussion.test.ts` (5 checks:
  read-only hosting contract, trace replay without display-asset leakage,
  cancelled turns land nothing, full event projection, trace roundtrip),
  twin-updated `tests/unit/blueprint-maintenance-service.test.ts`
  (provider settings mock, session shape, retryable-error retry),
  neighboring maintenance/harness/chat/roundtable suites stay green (113
  checks), `npm run typecheck` passes, scoped eslint reports 0 errors.
- **Costs and limits**: trace replay into the turn follows the shared
  12-entry cap instead of the former 24; blueprint reads are a pre-read
  snapshot, so mid-turn drill-down beyond the scope needs a new turn;
  todo and ask_user stay unavailable in discussions. A non-retryable stage
  failure now fails fast where the old loop retried once blindly, while
  retryable provider errors still retry inside the runner. Discussion
  turns stay task-scoped; a shared single turn across assistant chat and
  maintenance entries is not attempted. Revisit when the full engineering
  tool group or a shared conversation entry lands.
