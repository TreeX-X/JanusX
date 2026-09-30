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

The README hero mixed a small Janus animation with a separate logo image, and its prompt states changed by opacity only. The header needed to make Janus the first visual signal, keep the Star request visible, and match the smoother staged motion used by the referenced dsh-TUI header.

## Decision

`wiki/assets/readme/janus-header.svg` is the single README hero asset at `760x180`. Janus stays in the upper-left as a compact pixel square. The right side holds the pixel wordmark, descriptor line, prompt bubble, and a linked Star button. The square contains only one pair of eyes: centered, looking left, looking right, blinking, then a small happy expression during the Star/heart phase. Prompt and Star states share a 5.2 second timeline: each state fades in from below, holds long enough to read, then exits upward.

## Alternatives considered

- Keep the existing two-image README header — strongest case is no README change, but the duplicated branding competes with Janus and wraps badly at narrow widths.
- Use opacity-only prompt swaps — strongest case is less CSS, but hard cuts make the messages feel unrelated and leave no visual continuity.
- Do nothing / reuse — avoids asset changes, but does not satisfy the requested dsh-TUI-style prompt and Star interaction.

## Consequences

- **Gains**: one responsive hero asset, a clear left-to-right reading order, readable prompt transitions, and a direct GitHub Star target.
- **Character detail**: the capsule identity is reduced to a clean square frame and one expressive eye pair, so the left/right motion and Star reaction remain legible at README scale.
- **Costs and limits**: GitHub README renderers may pause or reduce SVG CSS animation; the static first frame therefore keeps the Janus and wordmark legible even when motion is unavailable.
- **Revisit signals**: add a mobile-specific SVG only if the 760:180 aspect ratio becomes unreadable below the existing README width.

## Verification

- XML parse: `[xml](Get-Content -Raw -Encoding utf8 wiki/assets/readme/janus-header.svg)`.
- Browser render: Playwright Chromium at `760x180`, with captures during the first prompt and Star phases; no overflow or overlap observed.
