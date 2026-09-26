---
schema: harness-note/1
id: 3007aefa-b643-4f1c-9fcb-4a65b3f7894f
kind: decision
lifecycle: implemented
created: 2026-09-26
class: bug-fix
tags: [blueprint, canvas, chrome]
---

# Remove blueprint canvas zoom controls

## Problem

The React Flow zoom control (+/-) sits at the lower left of the blueprint canvas and duplicates existing zoom paths: mouse wheel, minimap, fit-canvas buttons in both toolbars, and match locate. The floating control adds chrome without adding reach.

## Decision

`BlueprintCanvas.tsx` drops the `Controls` element and its import. Pan and zoom stay on wheel and touch gestures; explicit zoom stays on fit-canvas and locate actions.

## Alternatives considered

- Do nothing and keep the control: zero diff. Rejected because the requester names it as unwanted chrome.
- Keep the control but hide interactivity: still paints the +/- cluster. Rejected because it preserves the visual cost while removing the function.

## Consequences

One less floating overlay on the canvas at no behavior cost. Users without a wheel find zoom on fit-canvas and locate only. Revisit if keyboard-only zoom becomes a request: a toolbar control can return without the floating overlay.

## Verification

- `npx tsc --noEmit`: zero errors.
- Import and element removal only; visual result left to manual check.
