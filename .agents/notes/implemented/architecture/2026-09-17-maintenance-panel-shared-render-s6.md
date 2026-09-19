# Agent Note: Maintenance panel renders shared conversation units

Status: implemented

## Problem

The maintenance panel rendered its own thinking and tool-trace blocks
next to the shared JanusChat units: a bespoke reasoning `<details>` block
and a plain trace `<ul>` duplicated the collapse wording, status labels,
and digest layout that `ThinkingRegion` and `ToolCallGroup` already own.
Every wording, accessibility, or card fix shipped twice, while the panel
never gained the shared status icons, error details, or copy affordances.
The store already shares `ReasoningSnapshot`; only the rendering forked.

## Decision

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
