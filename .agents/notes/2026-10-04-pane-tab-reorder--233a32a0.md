---
schema: harness-note/1
id: 233a32a0-da1b-481c-b9dd-d5013db80295
kind: decision
lifecycle: implemented
created: 2026-10-04
class: feature
---

# Pane tab strip supports drag reorder with a gap preview

## Problem

The middle workspace renders each leaf pane with a horizontal tab strip (`LeafPane` in `TerminalArea.tsx`, state in `stores/workspace.ts`, pure tree ops in `lib/workspace-pane.ts`). Tab dragging only moves a tab across panes or splits the pane: a center drop appends the tab at the end of the target pane through `addTerminalToPaneTree` / `addPaneContentToTree`, and an edge drop opens a split. Tabs inside one pane have no reorder path, and the drag shows no insertion preview, so the drop position stays a guess until release.

## Decision

The tab strip owns its own drag layer above the existing pane-level merge/split layer. A dragover on the strip resolves the dragged tab id from the transfer or the active drag refs, then maps the pointer X to an insertion index by scanning tab midpoints. The index counts positions in the array after the dragged tab is removed, which is exactly the semantics `reorderPaneTab` and `insertPaneContentAtIndex` implement in `lib/workspace-pane.ts`, so the rendered gap and the committed order never disagree. A same-pane drag removes the source tab from the visual order and renders a same-width placeholder (`basis-[144px]`, accent inset ring) at the index; flex layout pushes the siblings aside, which is the give-way effect. A foreign-pane or sidebar drag keeps all tabs and inserts the placeholder among them. Dropping on the strip commits through the store actions `reorderPaneTab` / `movePaneTabToIndex`, both of which activate the dragged tab; a reorder that changes nothing returns the same tree reference and produces no update. Drops on the canvas keep the previous behavior untouched: center merges by append, edges split evenly.

## Alternatives considered

- Animate siblings with FLIP transitions on every dragover — strongest case is smoother motion. The driver that rules it out is that live rect measurement already converges on the flex-shifted layout, and per-frame transforms around xterm canvases risk jank for an unproven gain.
- Adopt an external drag library — strongest case is touch support and canned sensors. The driver that rules it out is a new dependency plus a second drag model beside the existing HTML5 transfer types that pane split, sidebar drag, and browser-view hiding already share.
- Keyboard-only reorder (Alt+Arrow on focused tabs) — strongest case is accessibility without pointer geometry. The driver that rules it out is that it answers a different input path and leaves the requested drag preview unsolved; it stays a follow-up, not a substitute.
- Do nothing / reuse — stays with append-on-merge and no preview. The cost is tabs landing at the end on every intra-pane drag, which is the reported friction.

## Consequences

- **Gains**: Tabs reorder freely inside a pane and insert at an explicit position across panes, with the gap visible before release. `tests/unit/workspace-pane.test.ts` covers reorder, no-op identity, clamping, cross-pane indexed insert, and content lookup (28 cases green with the suite).
- **Costs and limits**: There is no keyboard reorder path yet; pointer drag is the only reorder gesture, and overflow strips rely on native Chromium auto-scroll during drag. The placeholder uses the fixed tab basis, so heavily shrunk strips show an approximate rather than exact slot. Sidebar terminals without a pane view are created on strip drop, matching canvas-drop behavior. Revisit when keyboard reorder or touch dragging earns its own gesture design.
