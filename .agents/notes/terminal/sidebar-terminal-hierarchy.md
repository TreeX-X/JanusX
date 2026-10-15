---
{
  "schema": "harness-note/2",
  "id": "d87e7a46-1d85-45e5-a635-63a6838d441c",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-21",
  "class": "feature",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/bda5aa81-dc65-4408-9544-60fdfdf8c836"}
  ],
  "extensions": {
    "r5Migration": {
      "sourceHash": "f98046041c0d47a3ed8ff4eed1f964183a9ba17e82f129c9e44483efc7cbfcdc",
      "repairs": ["relations[0].reason"],
      "originalRelations": [
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bda5aa81-dc65-4408-9544-60fdfdf8c836",
          "reason": "Worktree sub-rows own the sidebar section that terminals now follow per worktree"
        }
      ]
    },
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-21-agent-note-terminals-as-level-3-items-grouped-under-their-worktree--d87e7a46.md",
      "sourceHash": "87ba147bf905f6a6c98520fc83fff2efbd866f3488270f76ee3a932fc483d1c3",
      "originalBodyHash": "8d6811d185e9541e5c5ecbf5b1561a366bc6158f8a39eef9998c2d4db158c7df",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Terminals as level-3 items grouped under their worktree. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ./2026-09-19-terminal-status-ring.md -> ./2026-09-19-terminal-status-ring--fc9a87e5.md",
        "Removed redundant Agent Note title prefix"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-21-sidebar-terminal-hierarchy.md",
        "sourceHash": "a4ee1e99fee173c54fbd71ceb78141b5c093d9127d0db580486603967b352dc1",
        "originalBodyHash": "2c0afdcba0fcf415f61e5d48b04a01ad8848ef3adc0af3242e28182c851dad46"
      }
    }
  },
  "updated": "2026-10-15T06:47:54.000Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---

# Terminals as level-3 items grouped under their worktree

## Problem

The expanded workspace listed worktree rows and every terminal in one flat column, so a terminal gave no signal about which checkout it runs in and the eye had to match full cwd strings across rows. The design reference (`design/session-mgmt-hifi.html`) structures the section in three levels: workspace group, one row per worktree with its terminal count, and a right-offset terms block per worktree carrying a branch line plus that worktree's terminals. Terminal rows also showed only the preset name as a subtitle, dropping the workdir hint the reference renders as `preset · …/<basename>`.

## Decision

`Sidebar.tsx` groups terminals by worktree before rendering. `groupTerminalsByWorktree` matches `terminal.cwd` against each worktree path across separators and Windows case, and terminals with no match fall back to the main worktree, so worktrees created outside JanusX and non-git checkouts keep every terminal visible instead of losing rows. Each worktree keeps a branch-first row and a shallowly indented terminal group sorted by attention order. Worktrees without terminals render the row alone; the empty hint stays for terminal-less sections.

The 2026-10-15 sidebar revision uses single-line interface-font labels: workspace names are 13px, terminals 12px, worktrees 11px. Paths, preset labels and the branch start point remain in tooltips; repeated path subtitles and branch explanation rows are removed. Worktree counts are plain numbers, with at most one compact shared status ring for approval/input, errors or degraded operation in that priority order. Running and idle states remain visible on individual terminals. Active workspace and terminal rows use neutral theme surfaces without a colored selection stripe; worktree scope uses text contrast. `Sidebar.module.css` owns these styles, fixed-slot hover actions and the dark-theme Codex icon correction.

Terminal rows are draggable keyboard-accessible navigation targets. Click, Enter or Space activates the existing pane tab through `setActiveTerminal`; background entries first restore their owning workspace snapshot. The file-tree scope follows the same worktree grouping as the displayed terminal, including terminals launched from checkout subdirectories. Switching workspace invalidates the editor file cache and uses guarded file-tree loading. Navigation does not launch or kill PTYs. Full paths require hover or keyboard focus; terminal names can still truncate at the sidebar width.

## Alternatives considered

- Per-worktree expand/collapse state — strongest case is fidelity to the reference chevron interaction. The driver that rules it out is scope: worktree rows never had collapse state, and adding one changes the always-visible contract the single-main fix just landed; groups stay always expanded under the workspace toggle.
- Keep the flat terminal list and only add the badge — strongest case is a smaller diff. The driver that rules it out is the request itself: the flat list is the reported problem, and a badge without grouping leaves cwd matching to the reader.
- Match terminals by exact cwd equality only — strongest case is zero normalization code. The driver that rules it out is Windows reality: git prints forward slashes, the shell keys native separators, and renderer keys arrive lowercased, so exact match silently orphan terminals into the fallback on every Windows checkout.
- Do nothing / reuse — keep one flat column with preset-only subtitles. The cost is checkout attribution left to full-path scanning and permanent drift from the ratified reference.

## Consequences

- **Gains**: terminal ownership, attention sorting and drag identity remain intact while the list becomes more compact and directly navigable. Repeated technical details move out of the scan path.
- **Costs and limits**: grouping runs per render over small arrays; cwd matching is heuristic and unmatched terminals fall back to main. Hover/focus is required to read paths. The revision uses browser fixtures with real Sidebar and stores; built-app Electron navigation was not exercised. Related ring semantics stay owned by [the status-ring note](./terminal-status-ring.md).

## Verification

2026-10-15 machine checks: `npx playwright test tests/e2e/sidebar-design.spec.ts --project=island --workers=2` passes 6 cases for pane focus, cross-workspace restoration, keyboard operation, stable hover layout, native drag identity and both themes. `tests/e2e/pane-tab-drag.spec.ts` passes all 21 cases in the combined run; the new sidebar drag case initially raced its expand animation, then passed after the fixture waited for finite transitions. `npx vitest run tests/unit/workspace-sidebar.test.ts tests/unit/worktree-store.test.ts tests/unit/terminal-sidebar-visual.test.ts tests/unit/side-panel-collapse-ui.test.ts tests/unit/planche-theme.test.ts` passes 28 cases. `npm run typecheck` and touched-file ESLint pass. The preview uses fixture data; screenshots are at `artifacts/sidebar-design/comparison.png`.
