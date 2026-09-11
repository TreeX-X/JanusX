# Agent Note: Blueprint independent card UI

Status: proposed

## Problem

The blueprint workspace wraps all surfaces in one large panel. The canvas fights the detail and maintenance surfaces for space, first entry never maximizes the canvas, and narrow windows overlap regions into dead zones. Editing a node competes with viewing the graph it belongs to.

## Proposal

Compose the workspace from three independent cards: a node-detail card hidden by default, an always-visible canvas card, and a janus maintenance card shown or opened on entry. Separate cards with clear gaps and give each its own background, border, radius, and scroll region. Open the detail card only on explicit selection (click, search focus, keyboard navigation, double-click shortcut); hover never opens it. Reallocate CSS grid tracks on open and drive a React Flow resize; close restores the layout without reload or premature unmount races. Animate entry with opacity plus transform over 180–260ms and snap under reduced motion. Size the detail card at 280–440px and the janus card at 340–520px on desktop with the canvas holding at least half the workspace; drawer-ize side cards with an explicit reopen entry on narrow windows. Reuse the existing blueprint data, ChangeSet, audit, and undo protocols with no data-model rewrite.

## Alternatives considered

- One unified panel — strongest case is a single layout with no track math. The driver that rules it out is canvas starvation: detail and maintenance permanently squeeze the working graph.
- Modal detail dialog — strongest case is zero layout reflow. The driver that rules it out is blocked comparison: editing hides the canvas at the moment the user most needs to see it.
- Do nothing / reuse the current panel — staying put avoids all resize-timing risk. The cost is a cramped first entry and continued hover-accidental opens.

## Acceptance criteria

- [ ] First entry hides the detail card and maximizes usable canvas space.
- [ ] Explicit node selection opens the detail card in its own track with accurate canvas coordinates, clicks, drags, and zoom.
- [ ] Closing restores the layout smoothly with no duplicate loads or early unmounts under rapid toggling.
- [ ] Maintenance analysis, changeset, review, apply, reject, undo, and error states keep existing behavior.
- [ ] Full-HD, 1024-wide, dual-open, keyboard-navigation, and reduced-motion scenes show no overlap or dead zones.

## Risks

- React Flow resize timing against grid track reallocation needs an explicit measurement after open.
- Rapid open-close toggling races the mount lifecycle; guard with a single ownership flag.
