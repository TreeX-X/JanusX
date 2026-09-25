---
schema: harness-note/1
id: ce93b420-be7c-5f68-95f7-12f7d4703d06
kind: decision
lifecycle: implemented
created: 2026-09-21
class: feature
---
# Agent Note: Hover-revealed actions button on the workspace row

Status: implemented

## Problem

An expanded workspace row in `Sidebar.tsx` ends with four controls: the chevron, the folder glyph, the workspace name, and a terminal badge that carries the workspace's terminal count with one status dot per state. The `⋯` button that opens the row's action menu sits after the badge at a permanent 20px width plus the row's 8px gap, so the badge — the element a reader scans down the list to see which workspace needs attention — stops 28px short of the row's right edge and reads as inset from the vertical reference the eye uses while scrolling. Every row also carries a permanent grey glyph at its right edge, which puts a second anchor beside the chevron and the folder icon for a control that matters only at the moment the reader wants an action on that one row. The row therefore looks busy at rest, and the status column is the thing that pays for it.

## Decision

The `⋯` button keeps one DOM node, one accessible name, and one click handler, but takes zero layout width at rest: `w-0`, `opacity-0`, `pointer-events-none`, and `-mr-2`, where the negative margin-right cancels the row's `gap-2` so the badge sits flush against the row's right padding while the button's collapsed box rests outside the content edge and paints nothing. The row carries `group/ws`, and the `group-hover/ws:` variants restore `w-5`, `mr-0`, `opacity-100`, and `pointer-events-auto` across a 200ms `ease-out` transition over `width,margin,opacity,color,background-color`, so the badge slides 28px left as the button grows into the space it vacated. The `focus-visible:` variants apply the same four values, so tabbing to the button reveals it for keyboard users and the ring stays visible, and the `isMenuOpen` branch applies them as static classes so an open menu never loses its trigger when the pointer leaves the row. `overflow-hidden` with `place-items-center` clips the 14px `Ellipsis` symmetrically while the box grows, so the reveal reads as the glyph sliding out of the row's right edge rather than a rectangle fading in. `motion-reduce:transition-none` drops the slide for readers who ask for reduced motion and leaves the state change instant. The menu anchor keeps reading `getBoundingClientRect().right` from the button, which moves at most 8px between rest and hover and lands on the row's right edge either way.

## Alternatives considered

- Keep the button at a permanent 20px and animate opacity only — strongest case is a one-line change with no layout arithmetic and no effect on the menu anchor, which stays exactly where it was. The driver that rules it out is that it answers half the request: the badge keeps its 28px inset, nothing slides, and the row still carries a permanent grey glyph at rest.
- Reveal with opacity alone and no width animation — strongest case is the simplest reveal, since opacity cannot disturb layout and the negative-margin arithmetic disappears. The driver that rules it out is that the 28px dead zone between the badge and the row edge stays at rest, and that dead zone is the inset the change exists to remove.
- Drop the button and return to a right-click-only menu — strongest case is the quietest possible row with no hover state and no negative margin. The driver that rules it out is discoverability: [the row-actions note](./2026-09-19-workspace-row-actions-menu.md) records that the button exists because run configuration and grouping were unreachable for readers who never right-click, and a hover-revealed button still beats a gesture with no on-screen cue.
- Reveal only on the row's right edge rather than anywhere on the row — strongest case is that the control appears exactly where the pointer must travel to reach it, so the slide starts later and disturbs the reading position less. The driver that rules it out is that a hover zone narrower than the row has no visible boundary, so the glyph appears to arrive from nowhere for a pointer crossing the row's middle, and the badge slides under the pointer with no cue for why.
- Do nothing / reuse — staying put keeps the persistent button described in [the row-actions note](./2026-09-19-workspace-row-actions-menu.md). The cost is a permanent control for an occasional action on every row, and a status badge that never reaches the panel edge.

## Consequences

- **Gains**: At rest each workspace row shows the chevron, the folder glyph, the name, and a status badge flush with the row's right padding. The `⋯` exists only while the row is the hover target or holds focus, and its arrival slides the badge left instead of pushing it, so the status column keeps one position per state rather than two.
- **Costs and limits**: The button's hit box is zero until the row is hovered, so any automated click must hover the row first; the desktop smoke spec hovers the row before clicking the accessible name. A touch tap produces no hover event, so on touch the row's actions are reachable only through `Shift+F10` on a focused row until a press-and-hold path exists. The `-mr-2` value assumes the row's `gap-2`, so changing the gap without changing the negative margin leaves an 8px inset at rest. The button's right edge moves 8px between rest and hover, so a menu opened mid-transition anchors 8px right of its settled position. The slide shortens the name's truncation point by 28px, so a workspace whose name just fits at rest gains an ellipsis for as long as the row is hovered. The terminal rows inside the expanded list keep their own `group/terminal` scope and are unaffected, so the list below the row hides the `⋯` while the pointer moves down into it.
