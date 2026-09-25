---
schema: harness-note/1
id: 5c873080-4f76-597f-9fbd-0bdcc59a02a3
kind: decision
lifecycle: implemented
created: 2026-09-19
class: bug-fix
---
# Agent Note: Monaco diff single line number

Status: implemented

## Problem
The right-side preview editor enters diff mode against the git baseline, and the gutter shows old and new line numbers side by side in one column. Unchanged lines repeat the same number, shifted lines show mismatched pairs, and both numbers share one color. Readers parse this as duplicated chrome rather than an old-to-new mapping, and the wide gutter steals space from the narrow preview window.

## Decision
The diff viewer renders one line-number column per visible pane. Wide containers use side-by-side panes, each with its own single column, matching the opencode split view. Narrow containers fall back to the true inline view with a single column, matching the opencode unified view. The fallback breakpoint, the true inline flag, and the slim gutter live in `MonacoViewer`, and the inserted and removed tints live in the shared `janusx-dark` theme so code, markdown, and html previews stay consistent.

## Alternatives considered
- Keep forced inline with dual numbers and add a legend — strongest case is zero code churn, but the legend explains clutter instead of removing it, and the gutter stays wide in the 560px embedded window.
- Turn line numbers off in diff mode — strongest case is maximum space saving, but reviewers lose the anchor they need to discuss a change, and opencode keeps numbers visible for this reason.
- Render a read-only patch view beside the editor — strongest case is pixel parity with opencode, but the preview must stay editable, so a second view doubles state and edit routing.
- Do nothing / reuse — staying with forced `renderSideBySide: false` keeps current behavior, but the double-number complaint persists and every future preview inherits it.

## Consequences
- **Gains**: `src/renderer/src/components/viewers/MonacoViewer.tsx` shows one number per pane, and narrow windows degrade to a single-column inline view instead of a dual-number gutter.
- **Costs and limits**: side-by-side needs horizontal room and falls back below the breakpoint; true inline is an experimental Monaco flag and its rendering must be rechecked on Monaco upgrades. Without a width observer the breakpoint decision follows the initial layout.
