---
schema: harness-note/1
id: 106b60b4-5462-4242-b28b-030f6649a78b
kind: decision
lifecycle: implemented
created: 2026-10-06
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c
class: bug-fix
---

# Session card expand animates as mounted grid rows

## Problem

The right-dock session card toggle swaps its body with a conditional render, so the body appears and vanishes in one frame while only the chevron rotates. The rows below the card snap to their new positions mid-read, and nothing in the panel shows a card opening or closing as a process. Without a height transition the affordance animates alone against a body that does not move.

## Decision

`SessionCard` in `src/renderer/src/components/SessionPanel.tsx` keeps the expand region mounted in both states. `.expand` in `SessionPanel.module.css` is a grid whose row runs `0fr → 1fr` over `grid-template-rows` in 240 ms with `cubic-bezier(0.2, 0.8, 0.2, 1)` — the curve the app grid columns and the right-dock panel slide already share — while `.expandInner` clips the body with `overflow: hidden; min-height: 0` and fades opacity with a -4 px translate so content settles with the height. The header chevron rotates on the same curve. The `expanded` flag reaches CSS as `data-open` on `.expand`. While closed the inner is `inert`, keeping clipped controls out of the tab order and the accessibility tree; the L2 preview fetch still gates on `expanded`, so closed cards request nothing and never flash their loading line. `prefers-reduced-motion: reduce` disables both transitions and the toggle becomes instant. The stylesheet owns motion only; surface fills stay the inline constants owned by [Session surfaces derive from the chrome token instead of hand-written literals](2026-09-29-session-card-surface--764d5d26.md).

## Alternatives considered

- Conditional mount with a keyframe entrance — strongest case is the smallest diff and no retained DOM. The driver that rules it out is the exit: collapse still snaps, and fading in over an instantly-tall block is not an expand.
- JS height measurement (scrollHeight, then transition to auto) — strongest case is animating to the natural height even when content reflows mid-open. The driver that rules it out is machinery: resize handling and transition-end bookkeeping where one CSS property covers both directions.
- `max-height` transition on a guessed ceiling — strongest case is zero structural change. The driver that rules it out is easing distortion: a ceiling well above the body spends most of the duration in invisible height, so the motion reads slow then abrupt.
- Do nothing / keep the pop — no code and no motion cost. That is the entire benefit; the chevron keeps rotating against a body that does not move.

## Consequences

- **Gains**: open and close each run as one continuous height, fade, and chevron motion on the shared panel curve, so the cards below glide to their new positions instead of snapping and a toggle mid-scroll keeps the list's place.
- **Costs and limits**: every card body stays in the DOM for the panel's lifetime — clipped to zero height and inert while closed, so visible layout is unchanged, but locators that match by text can still resolve closed bodies and must gate on visibility. `grid-template-rows` transitions carry the same Chromium baseline `color-mix` already requires. Reduced motion turns the toggle instant, chevron included.
- **Verification**: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` and `npx eslint src/renderer/src/components/SessionPanel.tsx` exit clean, and `npx vitest run tests/unit/planche-theme.test.ts` passes 14 of 14 with the expand region mounted in both states.
