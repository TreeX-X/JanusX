---
{
  "schema": "harness-note/2",
  "id": "a162efb4-23a7-4468-95e6-7163fe7efdc0",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-10-01",
  "class": "feature",
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e"
}
---
# README Janus header motion

## Problem

The README hero needs a recognizable Janus anchor and readable Star prompts. Coarse stepped rectangles around the head create protruding shoulders that read as horns. Layering alternative head drawings behind CSS visibility rules makes the silhouette harder to maintain, and the avatar's 10x scale amplifies motion beyond the intended display-pixel distance.

## Decision

`wiki/assets/readme/janus-header.svg` is the single README hero asset at `760x180`. Janus occupies the left side as a rectangular pixel face. The right side holds the pixel wordmark, descriptor line, prompt bubble, and a linked Star button. The face shows one pair of eyes: centered, looking left, looking right, blinking, then a small happy expression during the Star/heart phase. Prompt and Star states share a 5.2 second timeline: each state fades in from below, holds long enough to read, then exits upward.

The `janus-mascot` group draws the entire character in native display pixels. Its shell uses one `janus-frame` rectangle at `(8,55,160,110)` with a continuous 8px top border and inset highlights. Separate eye layers cannot redraw the frame. The happy state has no mouth: two curved eyes move by at most 1px on each axis, with a 100ms offset between eyes. Eye states and celebration visibility share the 5.2 second prompt timeline. Hearts use 2px contour details and highlights, float upward by at most 4px on a 1.4 second loop, and sit alongside small gold sparkles. Reduced-motion mode presents the character with stationary normal eyes.

## Alternatives considered

- Keep the existing two-image README header — strongest case is no README change, but the duplicated branding competes with Janus and wraps badly at narrow widths.
- Use opacity-only prompt swaps — strongest case is less CSS, but hard cuts make the messages feel unrelated and leave no visual continuity.
- Assemble a rounded head from wide stepped rectangles — simple to draw on a coarse grid, but the stepped shoulders conflict with the requested flat rectangular frame. A single contour makes the top-edge constraint explicit.
- Do nothing / reuse — avoids asset changes, but does not satisfy the requested dsh-TUI-style prompt and Star interaction.

## Consequences

- **Gains**: one responsive hero asset, a clear left-to-right reading order, readable prompt transitions, and a direct GitHub Star target.
- **Character detail**: a flat rectangular frame and one expressive eye pair keep the left/right motion and Star reaction legible at README scale.
- **Costs and limits**: the frame, normal eyes, and wordmark remain visible when CSS animation is unavailable; changing expressions requires CSS animation. Fine pixel details become less distinct when the entire SVG is reduced below native size.
- **Revisit signals**: add a mobile-specific SVG only if the 760:180 aspect ratio becomes unreadable below the existing README width.

## Verification

- XML parse: `[xml](Get-Content -Raw -Encoding utf8 wiki/assets/readme/janus-header.svg)`.
- Local browser check: `node artifacts/janus-frame-qa.cjs` (generated verification artifact) uses Playwright Chromium at `760x180` in light and dark themes. Each theme has 121 animation samples over 12 seconds: one visible eye pair, a fixed frame bounding box, bounded eye motion, and hearts inside the canvas.
- Raster check: eight timestamps per theme, 16 captures total. The top band at `x=8..167, y=55..62` is continuous frame color, with no frame-colored pixels above `y=55` in the left 180px. Light happy and dark idle captures receive visual inspection.
