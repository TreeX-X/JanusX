---
schema: harness-note/1
id: a162efb4-23a7-4468-95e6-7163fe7efdc0
kind: decision
lifecycle: implemented
created: 2026-10-01
class: feature
---
# README Janus header motion

## Problem

The README hero needs a recognizable Janus anchor and readable Star prompts. Coarse stepped rectangles around the head create protruding shoulders that read as horns. Layering alternative head drawings behind CSS visibility rules makes the silhouette harder to maintain, and the avatar's 10x scale amplifies motion beyond the intended display-pixel distance.

## Decision

`wiki/assets/readme/janus-header.svg` is the single README hero asset at `760x180`. Janus stays in the upper-left as a compact pixel square. The right side holds the pixel wordmark, descriptor line, prompt bubble, and a linked Star button. The square contains only one pair of eyes: centered, looking left, looking right, blinking, then a small happy expression during the Star/heart phase. Prompt and Star states share a 5.2 second timeline: each state fades in from below, holds long enough to read, then exits upward.

The `janus-frame` path is the only head outline. Its top is flat, with two 2px steps confined to each corner; its bounding box is `(8,55,160,110)` at native size. The separate eye layer cannot redraw the frame. No hidden alternative head or positional hiding selector is needed. The happy state has no mouth and limits the eye shimmy to ±2px horizontally and ±1px vertically. Eye states and hearts use a 6 second loop. Floating hearts rise by at most 4 display pixels and remain inside the SVG canvas.

## Alternatives considered

- Keep the existing two-image README header — strongest case is no README change, but the duplicated branding competes with Janus and wraps badly at narrow widths.
- Use opacity-only prompt swaps — strongest case is less CSS, but hard cuts make the messages feel unrelated and leave no visual continuity.
- Assemble a rounded head from wide stepped rectangles — simple to draw on a coarse grid, but the stepped shoulders conflict with the requested flat rectangular frame. A single contour makes the top-edge constraint explicit.
- Do nothing / reuse — avoids asset changes, but does not satisfy the requested dsh-TUI-style prompt and Star interaction.

## Consequences

- **Gains**: one responsive hero asset, a clear left-to-right reading order, readable prompt transitions, and a direct GitHub Star target.
- **Character detail**: a flat rectangular frame and one expressive eye pair keep the left/right motion and Star reaction legible at README scale.
- **Costs and limits**: the frame and wordmark remain visible when CSS animation is unavailable; eye frames depend on CSS animation. The avatar scale multiplies local motion, so future offsets must be checked at displayed size.
- **Revisit signals**: add a mobile-specific SVG only if the 760:180 aspect ratio becomes unreadable below the existing README width.

## Verification

- XML parse: `[xml](Get-Content -Raw -Encoding utf8 wiki/assets/readme/janus-header.svg)`.
- Local browser check: `node artifacts/janus-frame-qa.cjs` (generated verification artifact) uses Playwright Chromium at `760x180` in light and dark themes. Each theme has 121 animation samples over 12 seconds: one visible eye pair, a fixed frame bounding box, bounded eye motion, and hearts inside the canvas.
- Raster check: eight timestamps per theme, 16 captures total. The top band at `x=12..163, y=55..74` is continuous frame color, with no frame-colored pixels above `y=55` in the left 180px. Light and dark captures receive visual inspection.
