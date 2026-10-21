---
{
  "schema": "harness-note/2",
  "id": "27891818-004c-5bf2-a82a-34b838ce4884",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-12",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-12-agent-note-terminal-status-display-simplification-and-tab-parity--27891818.md",
      "sourceHash": "4a6193d2452d788af657f313bcac88b57cd6b6dcbed80f291d1e8f41dedf22c1",
      "originalBodyHash": "0be584b1d032854f381ab4f235ef74b329afceb252e8ca635329be6ecdfcea84",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Terminal status display simplification and tab parity. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ./2026-09-19-terminal-status-ring.md -> ./2026-09-19-terminal-status-ring--fc9a87e5.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-12-terminal-status-display.md",
        "sourceHash": "94ebe6b988df3b1a91f1ea968d1ed8e6f7f352d3c1b01ebf30b5cac57d7e59b4",
        "originalBodyHash": "ca8b10e94f2d417bf3b5bce3a35cd689a8d4e73d324a7e388e0136bc2877156e"
      }
    }
  },
  "updated": "2026-10-21T15:37:53.642Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# Terminal status display, ring and idle prompt

## Problem
The left sidebar renders a distinct pill per terminal status, so approval waits and input waits present as two colors, two icons, and two labels for one user decision: open the terminal and answer. The workspace tab strip carries no status at all, and the chips beside it use the legacy `accentColor()` helper with three colors that diverge from the sidebar contract. A reader who switches by tab instead of split panes leaves waits and failures behind inactive tabs with no visible cue.

### Terminal status ring in the sidebar
Each terminal row inside an expanded workspace in `Sidebar.tsx` ends with a status pill: a ten-pixel icon plus a localized word such as `运行中` or `Action needed`. The pill is the widest element on a row that is already narrow, so terminal names truncate early, and the text repeats on every row of a workspace with many terminals. The workspace row above and the collapsed rail express the same states as six-pixel dots, so the pill is a second visual language for one fact, and the only thing it adds over a dot is a word that a hover can supply.

### Claude idle nudge no longer stains the tab orange
A Claude terminal finishes its turn and settles grey (`wait`), then turns orange (`needs-input`) with no question to answer and stays orange. Per the Claude hook contract, `Notification` with the `idle_prompt` matcher fires about 60 seconds after a finished response while the user has not typed. It signals an idle session awaiting the next prompt, not a blocked turn. The coordinator maps every Claude `Notification` to attention and the status writer maps it to `needs-input`, so each idle nudge presents as pending user work across the tab dot, sidebar pill, and attention toast. Attention has no timeout and no read-back path, so the stain persists until the next hook event, which never arrives for a completed task.


## Decision
`TerminalStatus` in `src/shared/ipc/terminal.ts` keeps six values for hook routing and sort order. The renderer projects approval and input onto one attention visual in `src/renderer/src/lib/terminal-sidebar-visual.ts`: both map to the `terminal:status.needs-action` label with the orange treatment, and `Sidebar.tsx` renders both as one pulsing attention ring (ring form owned by terminal status ring). `TERMINAL_ATTENTION_ORDER` still places approval before input, and `summarizeTerminalActivity` still counts each state separately, so list order and the workspace badge keep their priority while the row indicator carries five visuals instead of six.

Each workspace tab in `TerminalArea.tsx` carries a six-pixel status dot before the preset icon. The dot color comes from `getTerminalStatusVisual()`, never from a local helper. Dots on inactive tabs with a non-running, non-idle status pulse through the shared `term-status-pulse` animation; the active tab never pulses and tab order never changes on status transitions. The tab tooltip repeats the sidebar form of provider, status label, and `cwd`. The legacy `accentColor()` helper is removed, and the header chips plus the runtime drawer read the shared visual helper, so sidebar, tabs, chips, and drawer share one color contract.

### Terminal status ring in the sidebar
`TerminalStatusIndicator` renders a 12px ring inside a 20px hit area and carries no text. The state is encoded three ways so that a reader who cannot tell the colors apart keeps a distinction: color from `getTerminalStatusVisual`, shape from a `term-status-ring--*` modifier class in `globals.css`, and motion from the shared animations. Running is a faint ring at thirty percent of the state color with a bright arc that sweeps through `term-status-orbit`; approval and input waits share one solid orange ring that breathes through `term-status-pulse`; degraded is a dashed ring; error is a filled disc; idle is a solid ring at reduced opacity. The orbit arc reads `--term-ring-width` from the ring, so the arc and the base ring keep one thickness when the width changes in one place. The attention unification and the tab dot are owned by terminal status display; this Note owns only the ring form of the terminal row indicator.

The label survives as hover and assistive text only. The wrapper has `role="img"` and carries the same string in `title` and `aria-label`, built from `common:workspace.terminalStatusTitle` with the label translated through `visual.labelKey`. The hardcoded Chinese `label` field on the visual table is never read by the ring; it exists for the unit test, and any renderer that reads it leaks Chinese into the English locale. No new translation key exists because both locales already carry the title and the six status labels.


### Claude idle nudge no longer stains the tab orange
The Claude `Notification` subscription carries two entries, one per matcher, and each installed hook command bakes the matcher that fired it into argv (`--matcher` on posix, `-Matcher` on the Windows sender). The client forwards the value as a top-level payload field, and the coordinator resolves it before the raw payload. A Claude `idle_prompt` that arrives with no open turn is dropped as `idle-without-active-turn` before status resolution, so the tab keeps its settled `wait`. A mid-turn idle still has its turn open and still raises attention, which preserves the real AskUserQuestion wait. `permission_prompt` stays ungated so a true approval never depends on turn tracking, and janus/pi idle matchers stay ungated because their extensions emit them only for genuine prompt UI.



## Alternatives considered
- Keep six pills and copy full pills into tabs — strongest case is one visual language everywhere with no mapping layer. The driver that rules it out is tab width: a `128px` tab cannot carry icon plus bilingual text without truncation, and six pulsing colors across ten tabs produce animation fatigue.
- Merge the internal union down to fewer states — strongest case is a single source of truth for logic and display with no projection function. The driver that rules it out is information loss at the hook boundary: approval and input arrive through different matchers, and degraded versus error determine whether the modal mask in `TerminalArea.tsx` may lock input.
- Infer waiting-for-input from pty text patterns — strongest case is engine independence without hook coverage for `janus` and `pi`. The driver that rules it out is fragility: prompt echoes, ANSI repaints, and locale variants produce false positives, while hook matchers already give an authoritative signal for the engines that need it.
- Do nothing / reuse — staying put keeps the shipped sidebar and the legacy tab chips untouched. The cost is that tab-driven readers keep missing background waits and failures behind inactive tabs.

### Terminal status ring in the sidebar
- Custom portal tooltip through the project's popover positioner — strongest case is instant show on hover and a look that matches the runtime drawer instead of the OS tooltip with its own delay. The driver that rules it out is cost against benefit: the terminal list sits inside an `overflow-hidden` grid that drives the expand animation, so a styled tooltip needs `createPortal` plus a hover state per row, while the native `title` answers the same question with zero new state. A portal tooltip remains the upgrade path if the OS delay proves annoying.
- Keep the pill and drop only the text — strongest case is no CSS work, since the icon set already distinguishes five states. The driver that rules it out is legibility: a lone ten-pixel Lucide glyph inside a tinted box reads worse than a shape of the same size, and the box keeps the visual language split between terminal rows and the dots used everywhere else.
- Plain colored dot matching the tab dot — strongest case is one shape across sidebar, tabs, and rail. The driver that rules it out is that a dot carries state by color alone, and running, idle, and error collapse into one shape for a color-blind reader once the text is gone; the ring keeps room for shape and an animated arc.
- Do nothing / reuse — staying put keeps the pill documented in terminal status display. The cost is the width it takes from terminal names and the mixed visual language between the terminal row and the dots above it.

### Claude idle nudge no longer stains the tab orange
- Drop `idle_prompt` from the Claude subscription entirely — strongest case is zero new protocol and zero false positives. The driver that rules it out is the loss of the mid-turn question signal: a Claude wait on `AskUserQuestion` arrives through this matcher, and ungated removal blinds that path.
- Map every Claude idle to `wait` without turn gating — strongest case is a smaller diff with no matcher plumbing. The driver that rules it out is the same missed-question regression for in-turn waits; turn state already distinguishes the two cases, so the coarser mapping throws away available information.
- Clear attention on tab focus or user input — strongest case is a self-healing UI regardless of hook coverage. The driver that rules it out is masking: focus does not answer a permission, and input-clearing risks hiding a true approval behind ordinary typing. It remains a possible follow-up scoped to `needs-input` only.
- Do nothing / reuse — staying put keeps one matcher entry and no payload change. The cost is a false pending indicator plus a false attention toast on every idle Claude session, which trains readers to ignore the orange that real approvals rely on.


## Consequences
- **Gains**: Pending work has one address color across sidebar ring, workspace badge, tab dot, header chips, and runtime drawer, all derived from `getTerminalStatusVisual`. Inactive attention and failure tabs pulse, so multi-tab readers notice background waits without opening each terminal.
- **Costs and limits**: The sidebar ring does not state whether the wait wants a permission grant or an option answer; the kind survives only in sort order and the transcript, and the tooltip states the unified label. `degraded` and `error` keep separate visuals and the `wait` ring remains, so the display-narrowing work is partial — revisit when failure-merge and idle de-emphasis land. `janus:terminal.status.*` still lacks the newer states, so the island label falls back to the raw key outside the sidebar contract. `isHookInputRequest` in `terminal-handlers.ts` classifies any non-`permission_prompt` notification as input, which stays safe while only `permission_prompt|idle_prompt` matchers are subscribed and misreports if Claude adds a notification type.

### Terminal status ring in the sidebar
- **Gains**: The status column is 20px wide, so terminal names keep the width a text pill takes. Terminal rows, the workspace badge, the collapsed rail, and the tab strip read as one dot-and-ring language driven by a single color table. Every state is distinguishable without color through shape or motion.
- **Costs and limits**: The state name is visible only on hover, and the OS tooltip arrives after its own delay with no styling control. Under `prefers-reduced-motion` the running arc freezes at half opacity and the attention pulse stops, so running and attention then depend on color and the arc's presence alone. The dashed ring relies on Chromium's dash fitting on a 12px circle; a change in ring size needs the dash pattern rechecked. Nothing in the unit or e2e suites renders the ring, so verification is `tsc`, `eslint`, and a visual check in the running app.

### Claude idle nudge no longer stains the tab orange
- **Gains**: Post-completion Claude sessions hold grey across tab dot, sidebar pill, and notification center; mid-turn questions still light orange and still clear on `Stop`. Coverage: `tests/unit/agent-hook-coordinator.test.ts` (drop, mid-turn, permission-without-turn, legacy matcher-less, janus passthrough) and `tests/unit/agent-hook-config.test.ts` (split entries plus posix/Windows argv baking) pass with the surrounding hook suite, 39 tests total.
- **Costs and limits**: The hook command format changes, so existing installs reinstall once on the next terminal creation via the `isInstalled` exact-match check. Matcher-less payloads from pre-migration installs keep the old always-attention behavior until that reinstall. Turn tracking is load-bearing for the gate: a missed `UserPromptSubmit` followed by a real question degrades to the pre-fix behavior (orange that clears on `Stop`) rather than silence, which bounds the failure toward visibility.
