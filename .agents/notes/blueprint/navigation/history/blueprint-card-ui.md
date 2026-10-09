---
{
  "schema": "harness-note/2",
  "id": "032db994-4a8b-483a-93df-3f9c0cc025cf",
  "kind": "requirement",
  "lifecycle": "archived",
  "disposition": {
    "reason": "Superseded by the V2 workspace visualization and the R4/R5 workbench; retained frozen as history."
  },
  "created": "2026-09-01",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-01-agent-note-blueprint-independent-card-ui--032db994.md",
      "sourceHash": "37f272f4dea995a5c971d2d49eee3dbc3d202cc8913d3f4d2940f691f0800fa2",
      "originalBodyHash": "2fd5dbf1b14baa473a4abe604cbe8dd28cb49cd314af1b68abbdf54dc2cc10a4",
      "category": "formal",
      "reason": "Retains the source requirement in draft lifecycle; body documents Blueprint independent card UI. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/proposed/feature/2026-09-01-blueprint-card-ui.md",
        "sourceHash": "37f272f4dea995a5c971d2d49eee3dbc3d202cc8913d3f4d2940f691f0800fa2",
        "originalBodyHash": "2fd5dbf1b14baa473a4abe604cbe8dd28cb49cd314af1b68abbdf54dc2cc10a4"
      }
    }
  },
  "updated": "2026-10-08T09:06:56.496Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/17bbe20e-f05c-470c-aee1-3f92a86369ab"
}
---

# Blueprint independent card UI

## Problem

The blueprint workspace wraps all surfaces in one large panel. The canvas fights the detail and maintenance surfaces for space, first entry never maximizes the canvas, and narrow windows overlap regions into dead zones. Editing a node competes with viewing the graph it belongs to.

## Expected behavior

First entry hides the detail card and maximizes usable canvas space. Explicit node selection (click, search focus, keyboard navigation, double-click shortcut) opens the detail card in its own track with accurate canvas coordinates; hover never opens it. Closing restores the layout smoothly with no duplicate loads or early unmounts under rapid toggling. Maintenance analysis, changeset, review, apply, reject, undo, and error states keep their existing behavior. Full-HD, 1024-wide, dual-open, keyboard-navigation, and reduced-motion scenes show no overlap or dead zones.

## Scope

In scope: the workspace three-card composition, CSS grid track reallocation with React Flow resize, entry animation (opacity plus transform, reduced-motion snap), and card sizing rules for desktop and narrow windows. Out of scope: any data-model rewrite — the existing blueprint data, ChangeSet, audit, and undo protocols are reused unchanged.

## Proposal

Compose the workspace from three independent cards: a node-detail card hidden by default, an always-visible canvas card, and a janus maintenance card shown or opened on entry. Separate cards with clear gaps and give each its own background, border, radius, and scroll region. Open the detail card only on explicit selection (click, search focus, keyboard navigation, double-click shortcut); hover never opens it. Reallocate CSS grid tracks on open and drive a React Flow resize; close restores the layout without reload or premature unmount races. Animate entry with opacity plus transform over 180–260ms and snap under reduced motion. Size the detail card at 280–440px and the janus card at 340–520px on desktop with the canvas holding at least half the workspace; drawer-ize side cards with an explicit reopen entry on narrow windows. Reuse the existing blueprint data, ChangeSet, audit, and undo protocols with no data-model rewrite.

## Alternatives considered

- One unified panel — strongest case is a single layout with no track math. The driver that rules it out is canvas starvation: detail and maintenance permanently squeeze the working graph.
- Modal detail dialog — strongest case is zero layout reflow. The driver that rules it out is blocked comparison: editing hides the canvas at the moment the user most needs to see it.
- Do nothing / reuse the current panel — staying put avoids all resize-timing risk. The cost is a cramped first entry and continued hover-accidental opens.

## Acceptance criteria

- [ ] AC-1: First entry hides the detail card and maximizes usable canvas space.
- [ ] AC-2: Explicit node selection opens the detail card in its own track with accurate canvas coordinates, clicks, drags, and zoom.
- [ ] AC-3: Closing restores the layout smoothly with no duplicate loads or early unmounts under rapid toggling.
- [ ] AC-4: Maintenance analysis, changeset, review, apply, reject, undo, and error states keep existing behavior.
- [ ] AC-5: Full-HD, 1024-wide, dual-open, keyboard-navigation, and reduced-motion scenes show no overlap or dead zones.

## Risks

- React Flow resize timing against grid track reallocation needs an explicit measurement after open.
- Rapid open-close toggling races the mount lifecycle; guard with a single ownership flag.
