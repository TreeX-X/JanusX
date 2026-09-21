# Agent Note: Workspace row actions menu

Status: implemented

## Problem

An expanded workspace row in `Sidebar.tsx` exposes its actions through two channels that hide from a first-time reader. The only visible control is a `×` that appears on hover and jumps straight to the delete confirmation, so the most destructive action is the only one with a button. Run configuration, group rename, and remove-from-group live in a right-click menu that nothing on screen announces except a tooltip sentence, and users who never right-click a sidebar row never find them. The row also starts with a chevron and a bare name, so a workspace reads as a text line rather than a folder on disk.

## Decision

Each expanded workspace row carries a persistent `⋯` button at its right edge, drawn with the Lucide `Ellipsis` glyph, and a `Folder` glyph between the chevron and the name. Clicking `⋯` opens the same `WorkspaceContextMenu` that right-click opens elsewhere, anchored under the button with its right edge aligned to the button's right edge; a second click on the same button closes it. The button carries `aria-expanded` and the `common:workspace.moreActions` label, and the hover `×` shortcut to delete is gone, so delete is reachable only through the menu's red item and its confirmation dialog. The `onContextMenu` handler is removed from expanded rows, so right-click on an expanded row falls through to the default and opens nothing. Right-click stays on the collapsed rail, where no button fits in a 36px square, and on group headers, which have no button of their own. `Shift+F10` on a focused row still opens the menu near the row's top-left corner so keyboard users keep a path that does not depend on the pointer. The row tooltip and aria description drop the "right-click for run configuration" clause in both locales because the sentence would be false.

## Alternatives considered

- Keep right-click on expanded rows alongside the button — strongest case is that no existing habit breaks and the e2e path stays untouched. The driver that rules it out is the user's request to have one visible entry per row; two entries for one menu keep the discoverability gap for people who never right-click while adding nothing the button lacks.
- Show the `⋯` only on hover like the old `×` — strongest case is a quieter row with no permanent glyph beside every workspace. The driver that rules it out is that a hover-only control is invisible to the reader who does not know it exists, which is the same failure the hover `×` had; a persistent button also gives touch and keyboard users a target.
- Keep the hover `×` next to the new button — strongest case is one-click delete for people who prune workspaces often. The driver that rules it out is that a bare one-step delete beside a menu that also contains delete is a duplicate whose only distinction is being easier to hit by accident.
- Do nothing / reuse — staying put keeps right-click plus hover `×`. The cost is that run configuration and grouping actions stay hidden behind a gesture with no on-screen cue, and the visible affordance is the destructive one.

## Consequences

- **Gains**: Every action on a workspace row is reachable from one visible button, and delete sits behind the menu plus its confirmation rather than a hover target. The folder glyph gives rows the same visual anchor the empty-workspace screen uses. The `desktop-smoke` e2e drives the menu through the button's accessible name instead of a right-click, so the spec documents the discoverable path.
- **Costs and limits**: Right-click on an expanded row does nothing, which surprises users who learned the old gesture; the collapsed rail and group headers keep right-click, so the sidebar has two menu-opening conventions. The `⋯` button anchors the menu by subtracting `MENU_WIDTH` from the button's right edge and lets the menu's own clamp keep it on screen, so a change to the menu width must update the constant, never the inline style. The button takes layout width only while the row is hovered or focused, so the terminal badge holds the row's right edge at rest; the reveal timing is owned by [workspace row hover reveal](./2026-09-21-workspace-row-hover-reveal.md). The folder glyph is decorative and carries no state; workspaces whose path is missing on disk look the same as live ones.
