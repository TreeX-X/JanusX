---
{
  "schema": "harness-note/2",
  "id": "cb026d42-c260-5e79-a66f-e455228d6eaf",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-17",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-17-agent-note-maintenance-discussions-run-on-the-shared-turn--cb026d42.md",
      "sourceHash": "17eee7829db8346d4fb72f4c6b0749182e1c55d78d532b3d4a7f6ca6a618bcb7",
      "originalBodyHash": "2ec62bc107eedbd8d4a80fa3179c8ee8e4fc4ac12e74455c973fd364bfd389ee",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Maintenance discussions run on the shared turn. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ../note://62b44166-82f0-41ff-838d-e2b02388ed06/8ed75baa-4671-48ef-bc3d-ac907558d49c -> ../../../janus-agentX/.agents/notes/implemented/architecture/2026-09-17-chat-turn-maintenance-hosting.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-17-maintenance-discussion-unified-s6.md",
        "sourceHash": "17eee7829db8346d4fb72f4c6b0749182e1c55d78d532b3d4a7f6ca6a618bcb7",
        "originalBodyHash": "2ec62bc107eedbd8d4a80fa3179c8ee8e4fc4ac12e74455c973fd364bfd389ee"
      }
    }
  },
  "updated": "2026-10-21T15:37:53.642Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Maintenance discussions and panel rendering on the shared turn

## Problem
Maintenance discussions ran their own agent loop next to the shared chat
turn: bespoke tool assembly, bespoke retry, bespoke follow-up and overflow
handling, and a parallel trace compressor. Every turn-lock, steering,
retry, and recovery fix shipped twice and diverged, while the maintenance
panel never benefited from shared hardening. Wrapping the panel UI over
the old loop would hide the fork instead of removing it.

### Maintenance panel renders shared conversation units
The maintenance panel rendered its own thinking and tool-trace blocks
next to the shared JanusChat units: a bespoke reasoning `<details>` block
and a plain trace `<ul>` duplicated the collapse wording, status labels,
and digest layout that `ThinkingRegion` and `ToolCallGroup` already own.
Every wording, accessibility, or card fix shipped twice, while the panel
never gained the shared status icons, error details, or copy affordances.
The store already shares `ReasoningSnapshot`; only the rendering forked.


## Decision
Panel discussion runs through janus-chat on the shared turn: the project
conversation owns messages, model choice, steering, questions, and stop,
while `proposeForConversation` in
`src/main/janus/maintenance/service.ts` generates the proposal inside that
turn with the maintenance hosting contract from [chat-turn maintenance
hosting](note://62b44166-82f0-41ff-838d-e2b02388ed06/8ed75baa-4671-48ef-bc3d-ac907558d49c):
caller identity travels as `systemPromptPrefix`, the offering is the
read-only model tool set, and `sourceTag: 'maintenance'` resolves the
task workspaces without personal recall or capture. The service-owned
discussion loop has exited with `respond`, `message`, `propose`, and the
steering ports; recall stays blueprint-scoped and injected as messages,
observation stays on the engineering path, and the shared turn owns the
abort controller. The blueprint scope snapshot is pre-read into context,
the same read the proposal path performs, since caller tools cannot
travel through the turn.

Turn events project onto the task channel through
`toMaintenanceChatEvent`; todo, question, and progress variants never
arrive because the allowlist excludes those tools. Traces map both ways:
panel traces replay into the shared turn, and runner traces land back as
panel entries with runner-only display assets left behind. Proposal
generation stays a single-shot structured path and never enters the turn.
`buildJanusChatTurnPorts` accepts absent knowledge and question ports, so
the same builder serves chat turns and memory-isolated discussions.

### Maintenance panel renders shared conversation units
The panel thinking block keeps its working indicator and phase line, and
renders reasoning through `ThinkingRegion` with the task snapshot in
streaming mode. The trace list keeps its title count and renders the last
five entries through `ToolCallGroup`, mapping panel traces onto the chat
trace shape with runner-only display assets left behind. Workspace names
resolve from the panel workspace list. Message bubbles, proposal and undo
selection, compose, steering, history, and task actions stay panel-owned:
their approval and audit semantics have no shared counterpart, and the
chat controller stays bound to chat IPC. No JanusChat code changes; the
shared styles already load globally.



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

### Maintenance panel renders shared conversation units
- Unify the panel onto the shared chat component and controller now —
  strongest case is one conversation stack end to end, but the controller
  is a 1500-line state machine bound to chat IPC with approvals, todos,
  questions, and resources; rewiring it under task semantics needs a
  controller abstraction plus interactive verification, which dwarfs a
  rendering slice and risks the main chat.
- Keep the bespoke blocks — strongest case is zero behavior delta, but
  wording and card fixes keep shipping twice and the panel never converges
  with the chat it discusses the same assets in.
- Share only styles and keep both markups — strongest case is visual
  convergence without imports, but parallel markups still drift in
  structure and accessibility while pretending to be one design.
- Do nothing / reuse — leave the duplicated blocks; rejected because the
  fork already costs double fixes with no behavioral reason.


## Consequences
- **Gains**: one turn runner serves assistant chat and maintenance
  discussions with shared retry, recovery, compaction, and overflow
  semantics; cancellation surfaces an explicit cancelled end event instead
  of going silent. Verification:
  `tests/unit/blueprint-maintenance-discussion.test.ts` (2 checks: full
  event projection, trace roundtrip),
  `tests/unit/blueprint-maintenance-service.test.ts` (6 checks: legacy
  settlement with concurrent-start guard, evidence and authorization
  staleness, audit persistence, delete confirmation, audit-sourced undo),
  `tests/unit/blueprint-maintenance-harness-routing.test.ts` (12 checks:
  shared conversation binding, project start, harness apply with audit
  root, loud and scope refusals, undo roundtrip and revision conflict,
  evidence and delete gates, conversation-linked cancel, concurrent
  start, multi-workspace start),
  neighboring maintenance/harness/chat/roundtable suites stay green, `npm run typecheck` passes, scoped eslint reports 0 errors.
- **Costs and limits**: trace replay into the turn follows the shared
  12-entry cap instead of the former 24; blueprint reads are a pre-read
  snapshot, so mid-turn drill-down beyond the scope needs a new turn;
  todo and ask_user stay unavailable in discussions. A non-retryable stage
  failure now fails fast where the old loop retried once blindly, while
  retryable provider errors still retry inside the runner. Discussion
  turns stay task-scoped; a shared single turn across assistant chat and
  maintenance entries is not attempted. Revisit when the full engineering
  tool group or a shared conversation entry lands.

### Maintenance panel renders shared conversation units
- **Gains**: one thinking unit and one tool-trace unit serve assistant
  chat and maintenance discussions; summaries move behind the shared
  toggle while names and statuses stay visible. Verification:
  `tests/unit/blueprint-maintenance-progress-ui.test.ts` (shared unit
  adoption assertions), neighboring panel suites stay green (8 checks),
  `npm run typecheck` passes, `npm run i18n:check` passes, scoped eslint
  reports 0 errors.
- **Costs and limits**: trace summaries need one click where they were
  inline; reasoning wording follows the shared unit instead of the panel
  strings. Message stream, composer, steering, and task actions stay
  panel-owned until a shared conversation controller abstraction lands;
  cross-entry steering between chat and maintenance tasks is not
  attempted. Revisit when that abstraction or the full engineering tool
  group arrives.
