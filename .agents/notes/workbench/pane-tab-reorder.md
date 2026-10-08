---
{
  "schema": "harness-note/2",
  "id": "233a32a0-da1b-481c-b9dd-d5013db80295",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-10-04",
  "class": "feature",
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Workspace tabs follow the pointer and preview their destination

## Problem

The middle workspace combines terminal and browser tabs in a tree of leaf panes. Users need to place a tab within its strip, move it into another pane, or create a split without closing its content. A native drag image and an append-only destination leave the final position uncertain. Measuring animated sibling positions also creates a feedback loop: the preview moves the geometry that chooses the next preview, so a stationary pointer can make tabs oscillate.

## Decision

`TerminalArea.tsx` delegates pointer gestures to `lib/pane-tab-drag.ts`. A primary-button movement of six pixels starts dragging; shorter movements retain ordinary tab selection. Close controls do not start a drag. The controller captures the pointer, hides the source label, and moves an inert DOM clone using animation frames. The source content stays mounted during the gesture. Siblings translate into their preview positions with a 160 ms transition, disabled when reduced motion is requested. Tabs retain a 144 px width and overflow horizontally; holding the pointer near a strip edge scrolls it without requiring further pointer events.

The clone and canvas hint share a fixed overlay attached directly to `document.body`, with inherited custom properties copied from the source tab. Their coordinates use the viewport, matching pointer `clientX`/`clientY` and pane bounding rectangles. The application shell has `perspective` and `rotateX(0deg)` ancestors; attaching fixed visuals inside that shell makes its offset contribute to their position a second time. The body overlay avoids this containing-block mismatch, preserves the original grab point, and is removed as one unit on release or cancellation.

Insertion uses tab midpoints from their untransformed layout, adjusted for strip scrolling. The dragged tab is excluded from the candidate list, so the resulting index addresses the array after removal. A measured-width gap previews that index. The controller updates presentation without writing pointer coordinates into React state or changing the pane tree. A strip drop commits through `reorderPaneTab` or `movePaneTabToIndex`, then selects the dragged tab even when its order is unchanged. Pure reorder preserves the original tree reference for unchanged orders, including nested splits. A content-area drop appends at the center or splits equally at an edge, using the existing terminal and browser store actions. Moving the last tab out of a pane prunes that pane through the existing tree operations.

`tabDragInFlight` hides native browser views while the pointer is dragging, allowing the DOM destination and preview to receive input. Release and cancellation restore that visibility state and remove clones, hints, transforms, capture, and listeners. Escape, pointer cancellation, lost capture, window blur, resize, document hiding, workspace changes, and pane-tree changes cancel the gesture. Dropping outside the workspace does not commit. Cancellation suppresses the click associated with the eventual pointer release; a fresh pointer gesture clears that suppression. Sidebar terminal drags retain their HTML5 transfer path, including indexed strip insertion and canvas merge/split.

## Alternatives considered

- Reuse native HTML5 tab dragging with a flex placeholder. It shares the sidebar transfer format and delegates capture to Chromium. The native drag image offers less control over pointer following, while measuring flex-shifted siblings couples hit testing to the preview. Sidebar drags retain this path because they originate outside the tab gesture controller.
- Adopt a drag library. It offers reusable sensors and accessibility conventions. This workspace also needs native browser-view hiding and pane split hit testing; the bounded pointer controller reuses those existing operations without adding another dependency.
- Reorder the tree continuously while hovering. React would render the preview directly from the final ordering. Moving content between panes during a gesture would repeatedly change component ownership and complicate cancellation. Presentation-only transforms leave the tree untouched until release.
- Do nothing. It avoids maintaining gesture cleanup and geometry, but leaves users without precise placement or a continuous visual indication of where the tab will land.

## Consequences

The workspace supports continuous pointer feedback, explicit insertion, and previewed merge/split destinations without creating or killing terminal processes. The controller owns transient DOM presentation and therefore depends on the `data-pane-id`, `data-tab-strip`, `data-tab-id`, slot, and spacer markers in `LeafPane`. Layout changes cancel an active gesture rather than reconciling moving targets. Fixed-width tabs trade label compression for horizontal scrolling. Keyboard reordering remains outside this gesture; pointer support does not establish touch-device validation. Revisit the controller when additional input methods or variable tab widths become product requirements.

Verification uses `npx vitest run tests/unit/workspace-pane.test.ts tests/unit/pane-drop-hint.test.ts` for 38 cases and `npx playwright test tests/e2e/pane-tab-drag.spec.ts --workers=1` for 17 browser scenarios. The browser harness mounts the real `TerminalArea` and workspace store, with Electron IPC replaced by fixtures. It covers both reorder directions, a stationary preview, retained terminal DOM, mixed-content moves, browser bounds hiding/restoration, five canvas destinations, cancellation, overflow scrolling, sidebar insertion, and empty-source pruning. A transformed workspace fixture with nonzero offsets checks both the grab point and canvas hint against viewport geometry with less than 1 px error. Native Electron event delivery is outside that harness. `npm run typecheck:strict-unused` and lint of the affected renderer files check the integration contracts. `npm run build` and `npx playwright test --config playwright.desktop.config.ts tests/e2e/desktop-smoke.spec.ts` validate the production bundle and one desktop smoke scenario; that smoke scenario does not exercise native browser-view dragging. Environments with a localhost HTTP proxy need `NO_PROXY=127.0.0.1,localhost` for Playwright's server readiness check.
