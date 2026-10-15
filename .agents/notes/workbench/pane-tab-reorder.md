---
{
  "schema": "harness-note/2",
  "id": "233a32a0-da1b-481c-b9dd-d5013db80295",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-10-04",
  "class": "feature",
  "updated": "2026-10-14T17:17:24Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Workspace tabs follow the pointer and preview their destination

## Problem

The middle workspace combines terminal and browser tabs in a tree of leaf panes. Users need to place a tab within its strip, move it into another pane, or create a split without closing its content. A native drag image and an append-only destination leave the final position uncertain. Measuring animated sibling positions also creates a feedback loop: the preview moves the geometry that chooses the next preview, so a stationary pointer can make tabs oscillate.

## Decision

`TerminalArea.tsx` delegates pointer gestures to `lib/pane-tab-drag.ts`. A primary-button movement of six pixels starts dragging; shorter movements retain ordinary tab selection. Close controls do not start a drag. The controller captures the pointer, hides the source label, and moves an inert DOM clone using animation frames. The source content stays mounted during the gesture. Siblings translate into their preview positions with a 160 ms transition, disabled when reduced motion is requested. Tabs retain a 144 px width and overflow horizontally; holding the pointer near a strip edge scrolls it without requiring further pointer events.

Each pane header contains a flexible, horizontally scrolling tab strip and a separate action area that does not shrink. Keeping browser, new-terminal, and end-terminal controls outside the scroll container prevents long tab lists from carrying those controls beyond the pane boundary. The strip retains its drag markers, slot, and spacer, so insertion and edge scrolling measure only the space available to tabs. Browser surfaces are ordinary pane contents: moving them between panes or into an edge split works even when the workspace contains no terminals.

The clone and canvas hint share a fixed overlay attached directly to `document.body`, with inherited custom properties copied from the source tab. Their coordinates use the viewport, matching pointer `clientX`/`clientY` and pane bounding rectangles. The application shell has `perspective` and `rotateX(0deg)` ancestors; attaching fixed visuals inside that shell makes its offset contribute to their position a second time. The body overlay avoids this containing-block mismatch, preserves the original grab point, and is removed as one unit on release or cancellation.

Insertion uses tab midpoints from their untransformed layout, adjusted for strip scrolling. The dragged tab is excluded from the candidate list, so the resulting index addresses the array after removal. A measured-width gap previews that index. The controller updates presentation without writing pointer coordinates into React state or changing the pane tree. A strip drop commits through `reorderPaneTab` or `movePaneTabToIndex`, then selects the dragged tab even when its order is unchanged. Pure reorder preserves the original tree reference for unchanged orders, including nested splits. A content-area drop appends at the center or splits equally at an edge, using the existing terminal and browser store actions. Moving the last tab out of a pane prunes that pane through the existing tree operations.

`tabDragInFlight` hides native browser views while the pointer is dragging, allowing the DOM destination and preview to receive input. Release and cancellation restore that visibility state and remove clones, hints, transforms, capture, and listeners. Escape, pointer cancellation, lost capture, window blur, resize, document hiding, workspace changes, and pane-tree changes cancel the gesture. Dropping outside the workspace does not commit. Cancellation suppresses the click associated with the eventual pointer release; a fresh pointer gesture clears that suppression. Sidebar terminal drags retain their HTML5 transfer path, including indexed strip insertion and canvas merge/split.

### Continuous workspace surface

The middle workspace and leaf panes now fill their available rectangle without outer margins, borders, shadows or rounded corners. `TerminalArea.module.css` owns this presentation. Headers share the content background and have no bottom rule. Each 144 px tab has a 7 px radius, a 4 px gap and a quiet selected fill; the focused split uses a faint theme-accent fill on its active tab instead of outlining the whole pane. Terminal contents retain 4/8/6 px top/horizontal/bottom padding. The embedded browser uses the same surface, rounded inner tabs and borderless toolbar buttons; its address field and content boundary remain visible.

Split boundaries paint one pixel within a nine-pixel strip of the canvas background. Reserving that strip keeps its full pointer target clear of native Electron browser views, which sit above DOM overlays. Ratios divide the remaining space, so equal-size reset produces equal content areas. Hover, focus and capture highlight the line with the theme accent. Pointer capture handles release and cancellation; arrow keys adjust five percentage points, Home/End select the existing 15/85 percent limits, and double-click restores equal sizes. The existing hold-to-confirm collapse action sits in each split header rather than an extra workspace row. A terminal layout refit preserves focus on controls and fields outside the terminal, allowing consecutive resize keys and held toolbar actions.

Drag geometry reads each strip's computed column gap. Preview translations include that gap while insertion still uses actual, untransformed tab midpoints; native sidebar placeholders and pointer slots share the tab radius and a neutral gray fill at 18% opacity with a 32% gray inset outline. Canvas destinations use the same translucent gray and outline instead of the theme accent. Native and pointer paths share CSS classes for the destination and its borderless 7 px rounded label; the floating tab clone retains its readable theme surface. Keeping a small gap instead of abutting pills improves label separation without adding dividing lines. Fixed-width labels still trade full names for horizontal scrolling, and very narrow splits can show fewer labels because the action area remains fixed.

## Alternatives considered

- Reuse native HTML5 tab dragging with a flex placeholder. It shares the sidebar transfer format and delegates capture to Chromium. The native drag image offers less control over pointer following, while measuring flex-shifted siblings couples hit testing to the preview. Sidebar drags retain this path because they originate outside the tab gesture controller.
- Adopt a drag library. It offers reusable sensors and accessibility conventions. This workspace also needs native browser-view hiding and pane split hit testing; the bounded pointer controller reuses those existing operations without adding another dependency.
- Reorder the tree continuously while hovering. React would render the preview directly from the final ordering. Moving content between panes during a gesture would repeatedly change component ownership and complicate cancellation. Presentation-only transforms leave the tree untouched until release.
- Do nothing. It avoids maintaining gesture cleanup and geometry, but leaves users without precise placement or a continuous visual indication of where the tab will land.

## Consequences

The workspace supports continuous pointer feedback, explicit insertion, and previewed merge/split destinations without creating or killing terminal processes. The controller owns transient DOM presentation and therefore depends on the `data-pane-id`, `data-tab-strip`, `data-tab-id`, slot, and spacer markers in `LeafPane`. Layout changes cancel an active gesture rather than reconciling moving targets. Fixed-width tabs trade label compression for horizontal scrolling. Keyboard reordering remains outside this gesture; pointer support does not establish touch-device validation. Revisit the controller when additional input methods or variable tab widths become product requirements.

Verification passes `npx vitest run tests/unit/workspace-pane.test.ts tests/unit/pane-drop-hint.test.ts` for 38 cases and `npx playwright test tests/e2e/pane-tab-drag.spec.ts --project=island --workers=1` for 21 browser scenarios. The browser harness mounts the real `TerminalArea` and workspace store, with Electron IPC replaced by fixtures. It covers both reorder directions, a stationary preview, retained terminal DOM, mixed-content moves, browser bounds hiding/restoration, five canvas destinations, cancellation, overflow scrolling, sidebar insertion, and empty-source pruning. A transformed workspace fixture with nonzero offsets checks both the grab point and canvas hint against viewport geometry with less than 1 px error. Two overflow cases use seven tabs at 1280 px and 800 px viewport widths, check that the 24 px controls stay within the pane before and after scrolling, and open the terminal menu through the visible button. Two browser-only cases create horizontal and vertical splits without creating or killing terminals. Environments with a localhost HTTP proxy need `NO_PROXY=127.0.0.1,localhost` for Playwright's server readiness check.

The original 2026-10-13 integration passed typecheck and component ESLint; that run did not verify a fresh desktop build and reported unrelated strict-unused and Note diagnostics. Those historical limitations do not describe the current verification below.

## Surface verification, 2026-10-14

The neutral-gray drag refinement passes 34 browser cases across `pane-tab-drag.spec.ts` and `workspace-surface.spec.ts`, plus typecheck and scoped ESLint on `pane-tab-drag.ts` and `TerminalArea.tsx`. Browser fixtures cover native sidebar insertion, pointer ordering and canvas destinations with existing layout and cancellation behavior. This color refinement has no separate Electron desktop run; screenshots are retained under `artifacts/neutral-drag-visual`.

`npx playwright test tests/e2e/workspace-surface.spec.ts tests/e2e/pane-tab-drag.spec.ts --project=island --workers=1 --output=artifacts/workspace-surface/final` passes 30 cases. The new cases verify both themes in single/horizontal/vertical layouts, zero outer framing, rounded tab selection and keyboard focus, one-pixel painted separators with nine-pixel hit targets, pointer and consecutive keyboard resizing, equal content sizes after reset, and collapse without closing content. These browser fixtures replace Electron IPC. The separate `terminal-usage.spec.ts` run passes three cases covering live telemetry, exact context values and Chinese labels at 480 px; its obsolete Usage-tab assertions now check the actual runtime region.

The eight unit files for workspace panes, drop hints, front surfaces, planche styling, drawer behavior, terminal geometry, scroll intent and scrollbar sync pass 96 cases. `npm run typecheck`, scoped ESLint on the four changed TypeScript implementation files, `git diff --check` and `npm run build:app` pass. `npm run check:notes` verifies 308 Notes with zero errors and 17 existing explicit link diagnostics.

`npx playwright test tests/e2e/desktop-smoke.spec.ts --project=desktop --workers=1 --output=artifacts/workspace-surface/desktop-final` passes both real Electron cases: workspace/project paths, two live terminals and retained tab contents, plus native browser failure/retry and modal occlusion/release. The desktop launch locator follows the current PowerShell card instead of the obsolete Shell label. Manual screenshot inspection covers planche/dark fixture splits and the actual desktop single workspace. Screenshots and traces live under `artifacts/workspace-surface`; these checks do not establish touch-device behavior or native browser-to-browser split dragging.
