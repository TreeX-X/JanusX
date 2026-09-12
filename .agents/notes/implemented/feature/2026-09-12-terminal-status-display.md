# Agent Note: Terminal status display simplification and tab parity

Status: implemented

## Problem

The left sidebar renders a distinct pill per terminal status, so approval waits and input waits present as two colors, two icons, and two labels for one user decision: open the terminal and answer. The workspace tab strip carries no status at all, and the chips beside it use the legacy `accentColor()` helper with three colors that diverge from the sidebar contract. A reader who switches by tab instead of split panes leaves waits and failures behind inactive tabs with no visible cue.

## Decision

`TerminalStatus` in `src/shared/ipc/terminal.ts` keeps six values for hook routing and sort order. The renderer projects approval and input onto one attention visual in `src/renderer/src/lib/terminal-sidebar-visual.ts`: both map to the `terminal:status.needs-action` label with the orange treatment, and `Sidebar.tsx` renders both with the `Bell` icon and pulse. `TERMINAL_ATTENTION_ORDER` still places approval before input, and `summarizeTerminalActivity` still counts each state separately, so list order and the workspace badge keep their priority while the pill set charges five meanings instead of six.

Each workspace tab in `TerminalArea.tsx` carries a six-pixel status dot before the preset icon. The dot color comes from `getTerminalStatusVisual()`, never from a local helper. Dots on inactive tabs with a non-running, non-idle status pulse through the shared `term-status-pulse` animation; the active tab never pulses and tab order never changes on status transitions. The tab tooltip repeats the sidebar form of provider, status label, and `cwd`. The legacy `accentColor()` helper is removed, and the header chips plus the runtime drawer read the shared visual helper, so sidebar, tabs, chips, and drawer share one color contract.

## Alternatives considered

- Keep six pills and copy full pills into tabs — strongest case is one visual language everywhere with no mapping layer. The driver that rules it out is tab width: a `128px` tab cannot carry icon plus bilingual text without truncation, and six pulsing colors across ten tabs produce animation fatigue.
- Merge the internal union down to fewer states — strongest case is a single source of truth for logic and display with no projection function. The driver that rules it out is information loss at the hook boundary: approval and input arrive through different matchers, and degraded versus error determine whether the modal mask in `TerminalArea.tsx` may lock input.
- Infer waiting-for-input from pty text patterns — strongest case is engine independence without hook coverage for `janus` and `pi`. The driver that rules it out is fragility: prompt echoes, ANSI repaints, and locale variants produce false positives, while hook matchers already give an authoritative signal for the engines that need it.
- Do nothing / reuse — staying put keeps the shipped sidebar and the legacy tab chips untouched. The cost is that tab-driven readers keep missing background waits and failures behind inactive tabs.

## Consequences

- **Gains**: Pending work has one address color across sidebar pill, workspace badge, tab dot, header chips, and runtime drawer, all derived from `getTerminalStatusVisual`. Inactive attention and failure tabs pulse, so multi-tab readers notice background waits without opening each terminal.
- **Costs and limits**: The pill no longer states whether the wait wants a permission grant or an option answer; the kind survives only in sort order and the transcript, and the tooltip states the unified label. `degraded` and `error` keep separate visuals and the `wait` pill remains, so the display-narrowing work is partial — revisit when failure-merge and idle de-emphasis land. `janus:terminal.status.*` still lacks the newer states, so the island label falls back to the raw key outside the sidebar contract. `isHookInputRequest` in `terminal-handlers.ts` classifies any non-`permission_prompt` notification as input, which stays safe while only `permission_prompt|idle_prompt` matchers are subscribed and misreports if Claude adds a notification type.
