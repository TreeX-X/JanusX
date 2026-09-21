---
schema: harness-note/1
id: d87e7a46-1d85-45e5-a635-63a6838d441c
kind: decision
lifecycle: implemented
created: 2026-09-21
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/bda5aa81-dc65-4408-9544-60fdfdf8c836
    reason: Worktree sub-rows own the sidebar section that terminals now follow per worktree
---

# Agent Note: Terminals as level-3 items grouped under their worktree

## Problem

The expanded workspace listed worktree rows and every terminal in one flat column, so a terminal gave no signal about which checkout it runs in and the eye had to match full cwd strings across rows. The design reference (`design/session-mgmt-hifi.html`) structures the section in three levels: workspace group, one row per worktree with its terminal count, and a right-offset terms block per worktree carrying a branch line plus that worktree's terminals. Terminal rows also showed only the preset name as a subtitle, dropping the workdir hint the reference renders as `preset · …/<basename>`.

## Decision

`Sidebar.tsx` groups terminals by worktree before rendering. `groupTerminalsByWorktree` matches `terminal.cwd` against each worktree path across separators and Windows case, and terminals with no match fall back to the main worktree, so worktrees created outside JanusX and non-git checkouts keep every terminal visible instead of losing rows. Each worktree row renders its group beneath it in a right-offset block (`margin 0 4px 2px 26px` with the reference's hairline border) holding a branch line (`分支 <branch> → <base>`, `origin/` stripped for display) and that worktree's terminals sorted by attention order. Worktrees without terminals render the row alone; the empty hint stays for terminal-less sections.

Each worktree row carries a neutral terminal-count badge (minimal terminal glyph, count, one status dot per present state), so the count follows the worktree item it belongs to. The badge glyph is the lucide `Terminal` outline matching the reference badge icon, never the shell asset image. The workspace row carries no terminal badge; the collapsed-rail dot keeps its existing summary behavior and stays untouched. Terminal rows keep their existing grid, drag handling, focus style, and the ring indicator: the status ring system already matches the reference verbatim (orbit arc for running, pulse for needs-action, dashed for degraded, filled for error, dimmed for idle), so no indicator change ships here. Subtitles always read `preset · …/<basename>` per the reference, falling back to the preset name when cwd is empty. No new translation key exists; the branch line reuses `terminal:worktree.branchLabel` and the badge reuses the workspace count title keys.

## Alternatives considered

- Per-worktree expand/collapse state — strongest case is fidelity to the reference chevron interaction. The driver that rules it out is scope: worktree rows never had collapse state, and adding one changes the always-visible contract the single-main fix just landed; groups stay always expanded under the workspace toggle.
- Keep the flat terminal list and only add the badge — strongest case is a smaller diff. The driver that rules it out is the request itself: the flat list is the reported problem, and a badge without grouping leaves cwd matching to the reader.
- Match terminals by exact cwd equality only — strongest case is zero normalization code. The driver that rules it out is Windows reality: git prints forward slashes, the shell keys native separators, and renderer keys arrive lowercased, so exact match silently orphan terminals into the fallback on every Windows checkout.
- Do nothing / reuse — keep one flat column with preset-only subtitles. The cost is checkout attribution left to full-path scanning and permanent drift from the ratified reference.

## Consequences

- **Gains**: every terminal renders under its checkout with branch context and directory hint; attention sort, drag-to-reference, focus highlight, and session archiving paths are unchanged because rows only move, never change identity.
- **Costs and limits**: grouping runs per render over small arrays with no memoization; cwd matching is heuristic and a terminal whose cwd escapes every worktree lands on main, which misattributes only in exotic layouts. Verification is machine evidence on touched paths: `tsc --noEmit` shows no new error (six pre-existing missing-module errors in `llm-core` and `renderer-loader` remain), `tsc --noEmit --noUnusedLocals --noUnusedParameters` is clean for the touched files, and `tests/unit/worktree-store.test.ts` passes 2/2; built-app Electron acceptance was not exercised here. Related ring semantics stay owned by [the status-ring note](./2026-09-19-terminal-status-ring.md).
