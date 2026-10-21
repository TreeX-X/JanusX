---
{
  "schema": "harness-note/2",
  "id": "22f762b8-1b14-522d-a971-b11e2dfc9af6",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-11",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-11-agent-note-terminal-sidebar-six-state-expression--22f762b8.md",
      "sourceHash": "8781826eb69b46177ea4ee25cbfd6d9174c0abc47bc010e4d8d0db1301b36e9e",
      "originalBodyHash": "815783edbcc08fb43cf528dab95c84a010b81ab5a6fa8672ae513f1d1274764e",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Terminal sidebar six-state expression. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ./2026-09-19-terminal-status-ring.md -> ./2026-09-19-terminal-status-ring--fc9a87e5.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-11-terminal-sidebar-states.md",
        "sourceHash": "3e69c3a142ef6b5ff98df80659843bbaea006e2fad504771b444f42c10e7a933",
        "originalBodyHash": "fa1ccf7927c30eff871d0b24a9daaf7ed6abfb9fd53e3c7d1bd10152ad3b5ec4"
      }
    }
  },
  "updated": "2026-10-21T15:37:53.642Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570",
  "relations": [
    {
      "type": "related-to",
      "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bda5aa81-dc65-4408-9544-60fdfdf8c836"
    }
  ]
}
---
# Terminal sidebar hierarchy and six-state display

## Problem
The left workspace sidebar expresses terminal quantity and a three-state badge. `TerminalStatus` in `src/shared/ipc/terminal.ts` holds `wait`, `running`, and `error`, and every hook-derived attention signal collapses into `wait` inside `src/main/ipc/terminal-handlers.ts`. A terminal waiting for a permission grant, a terminal waiting for an option answer, a terminal degraded by a rate limit, and a genuinely idle terminal all render the same yellow pill. Users must open each terminal to find the one that needs action, and stalled approvals sit unnoticed behind the sidebar.

### Terminals as level-3 items grouped under their worktree
The expanded workspace listed worktree rows and every terminal in one flat column, so a terminal gave no signal about which checkout it runs in and the eye had to match full cwd strings across rows. The design reference (`design/session-mgmt-hifi.html`) structures the section in three levels: workspace group, one row per worktree with its terminal count, and a right-offset terms block per worktree carrying a branch line plus that worktree's terminals. Terminal rows also showed only the preset name as a subtitle, dropping the workdir hint the reference renders as `preset · …/<basename>`.


## Decision
`TerminalStatus` carries six values: `wait` means idle at prompt, `running` means a turn is open, `needs-input` means the CLI waits for an option or question answer, `needs-approval` means the CLI waits for a permission grant, `degraded` means the turn failed while the pty stays alive, and `error` means the pty exited non-zero. The main process maps hook payloads to these values in `onResolvedPayload`: `UserPromptSubmit` and opencode busy status set `running`; Claude `PermissionRequest`, opencode `permission.asked`, and Claude notifications with a `permission_prompt` matcher set `needs-approval`; Claude notifications with any other matcher set `needs-input`; `session.error`, `StopFailure`, and synthetic API errors set `degraded`; `orphaned` and non-zero exits set `error`; completions and interrupts settle back to `wait`. The matcher split lives in `getHookRawMatcher`, `isHookApprovalRequest`, and `isHookInputRequest`, so the coordinator approval-versus-attention distinction reaches the sidebar instead of stopping at notifications.

The renderer projects each value with its own color and label in `src/renderer/src/lib/terminal-sidebar-visual.ts`; the terminal row indicator in `Sidebar.tsx` `TerminalStatusIndicator` is a ring whose shape and motion per state are owned by [terminal status ring](./terminal-status-display.md), with the running orbit sweep and the attention pulse kept. The workspace badge aggregates with priority `error`, then attention, then running, then idle, and renders one dot per live group plus a `total · running · attention · errors` tooltip. Terminals inside an expanded workspace sort by `TERMINAL_ATTENTION_ORDER` with approval first. The collapsed rail carries the same priority as a single corner dot. The `wait` label changes from waiting to idle in both locales so idle never reads as pending work.

### Terminals as level-3 items grouped under their worktree
`Sidebar.tsx` groups terminals by worktree before rendering. `groupTerminalsByWorktree` matches `terminal.cwd` against each worktree path across separators and Windows case, and terminals with no match fall back to the main worktree, so worktrees created outside JanusX and non-git checkouts keep every terminal visible instead of losing rows. Each worktree keeps a branch-first row and a shallowly indented terminal group sorted by attention order. Worktrees without terminals render the row alone; the empty hint stays for terminal-less sections.

The 2026-10-15 sidebar revision uses single-line interface-font labels: workspace names are 13px, terminals 12px, worktrees 11px. Paths, preset labels and the branch start point remain in tooltips; repeated path subtitles and branch explanation rows are removed. Worktree counts are plain numbers, with at most one compact shared status ring for approval/input, errors or degraded operation in that priority order. Running and idle states remain visible on individual terminals. Active workspace and terminal rows use neutral theme surfaces without a colored selection stripe; worktree scope uses text contrast. `Sidebar.module.css` owns these styles, fixed-slot hover actions and the dark-theme Codex icon correction.

Terminal rows are draggable keyboard-accessible navigation targets. Click, Enter or Space activates the existing pane tab through `setActiveTerminal`; background entries first restore their owning workspace snapshot. The file-tree scope follows the same worktree grouping as the displayed terminal, including terminals launched from checkout subdirectories. Switching workspace invalidates the editor file cache and uses guarded file-tree loading. Navigation does not launch or kill PTYs. Full paths require hover or keyboard focus; terminal names can still truncate at the sidebar width.



## Alternatives considered
- Keep the three-state contract and surface attention through notifications only — strongest case is zero IPC churn and an already shipped toast path. The driver that rules it out is glanceability: toasts fade and the sidebar, the only persistent per-workspace surface, keeps lying about pending work.
- Infer waiting-for-input from pty text patterns — strongest case is engine independence without hook coverage for `janus` and `pi`. The driver that rules it out is fragility: prompt echoes, ANSI repaints, and locale variants produce false positives, while hook matchers already give an authoritative signal for the engines that need it.
- Add a separate attention flag beside the base status — strongest case is backward compatibility for every `TerminalStatus` consumer. The driver that rules it out is dual-source truth: badge, sort, tooltip, and collapsed dot must then agree on a precedence matrix across two fields, and every future state doubles the matrix.
- Do nothing / reuse the yellow waiting pill — staying put keeps one visual and no migration. The cost is that permission waits, input waits, transient failures, and idle remain indistinguishable, and the reported stall behind the sidebar remains.

### Terminals as level-3 items grouped under their worktree
- Per-worktree expand/collapse state — strongest case is fidelity to the reference chevron interaction. The driver that rules it out is scope: worktree rows never had collapse state, and adding one changes the always-visible contract the single-main fix just landed; groups stay always expanded under the workspace toggle.
- Keep the flat terminal list and only add the badge — strongest case is a smaller diff. The driver that rules it out is the request itself: the flat list is the reported problem, and a badge without grouping leaves cwd matching to the reader.
- Match terminals by exact cwd equality only — strongest case is zero normalization code. The driver that rules it out is Windows reality: git prints forward slashes, the shell keys native separators, and renderer keys arrive lowercased, so exact match silently orphan terminals into the fallback on every Windows checkout.
- Do nothing / reuse — keep one flat column with preset-only subtitles. The cost is checkout attribution left to full-path scanning and permanent drift from the ratified reference.


## Consequences
- **Gains**: Pending work has a stable address in `Sidebar.tsx` badge, list order, and collapsed dot, all derived from `summarizeTerminalActivity` and `TERMINAL_ATTENTION_ORDER`. `degraded` terminals stay usable because the `TerminalArea.tsx` modal mask still gates on `error` with `errorMessage` or `exitCode` only.
- **Costs and limits**: The `TerminalStatus` union is a breaking IPC change; stale `terminalSnapshots` entries with unknown values fall back to `wait` in `getTerminalStatusVisual`. `shell`, `janus`, and `pi` presets emit no hook events and always render idle; input detection covers Claude notifications only. `degraded` never carries the underlying failure text, which stays in notifications and transcripts — revisit when a bounded failure-reason channel lands.

### Terminals as level-3 items grouped under their worktree（前言）
- **Gains**: terminal ownership, attention sorting and drag identity remain intact while the list becomes more compact and directly navigable. Repeated technical details move out of the scan path.
- **Costs and limits**: grouping runs per render over small arrays; cwd matching is heuristic and unmatched terminals fall back to main. Hover/focus is required to read paths. The revision uses browser fixtures with real Sidebar and stores; built-app Electron navigation was not exercised. Related ring semantics stay owned by [the status-ring note](./terminal-status-display.md).

### Terminals as level-3 items grouped under their worktree
2026-10-15 machine checks: `npx playwright test tests/e2e/sidebar-design.spec.ts --project=island --workers=2` passes 6 cases for pane focus, cross-workspace restoration, keyboard operation, stable hover layout, native drag identity and both themes. `tests/e2e/pane-tab-drag.spec.ts` passes all 21 cases in the combined run; the new sidebar drag case initially raced its expand animation, then passed after the fixture waited for finite transitions. `npx vitest run tests/unit/workspace-sidebar.test.ts tests/unit/worktree-store.test.ts tests/unit/terminal-sidebar-visual.test.ts tests/unit/side-panel-collapse-ui.test.ts tests/unit/planche-theme.test.ts` passes 28 cases. `npm run typecheck` and touched-file ESLint pass. The preview uses fixture data; screenshots are at `artifacts/sidebar-design/comparison.png`.
