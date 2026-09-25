---
schema: harness-note/1
id: 5a07c410-1f0c-5a72-bec0-1e48fc4acdfc
kind: decision
lifecycle: implemented
created: 2026-09-18
class: feature
---
# Agent Note: Settings open and close on the blueprint workbench beat

Status: implemented

## Problem

The settings modal appears and disappears without transition while the blueprint and knowledge workbenches animate on the shared card-frame beat, so opening settings reads as a hard cut against the rest of the shell. Close entries also diverge: only the header button dismisses settings, with no Esc or backdrop path and no focus return to the element that opened it. The cost of staying put is that every future settings polish lands on an inconsistent base and re-litigates timing from scratch.

## Decision

`AppSettingsModal` runs the shared `useWorkbenchPhase` hidden/open/closing lifecycle with animation awaited and a 320 ms exit budget covering a 260 ms card move plus a 60 ms buffer. The panel enters with `settings-card-rise` and exits with `settings-card-descend`, both using the blueprint rise geometry and the shared cubic-bezier pair for enter and exit, and the backdrop fades in over 300 ms and out on `--workbench-exit-duration`. A `requestAnimationFrame` reveal gate holds the first frame so lazy opens start from the keyframe, and the close button, Esc, and backdrop press share one `requestClose` path. The element focused at open time regains focus once the modal reaches hidden, and `prefers-reduced-motion` disables the animation set.

## Alternatives considered

- Reuse the knowledge workbench translate-and-fade variant for the settings panel — strongest case is a softer modal feel with less perspective motion. The driver that rules it out is the explicit ask: settings must match the blueprint summon and dismiss, not a third timing.
- Keep the hard cut and only add Esc plus backdrop dismissal — strongest case is minimal diff with the functional gap closed. The driver that rules it out is the visual half of the request: the open and close transitions stay inconsistent with the workbenches.
- Do nothing / reuse the instant toggle — staying put costs nothing now. The cost is the gap above: the hard cut, divergent close entries, and missing focus return persist, and later settings work inherits them.

## Consequences

- **Gains**: Settings opens and closes on the same beat as the blueprint workbench with a single close path and focus return. `npx tsc --noEmit` reports no `AppSettingsModal` errors, `npx eslint src/renderer/src/components/AppSettingsModal.tsx` is clean, and `npx vitest run tests/unit/knowledge/card-frame-phase.test.ts` reports 9 passed.
- **Costs and limits**: The settings exit is a single card with no stagger, so its budget stays at 320 ms while multi-card workbenches scale with card count. Blueprint ignores backdrop presses as a full-screen workbench while settings closes on them, which reflects modal versus workbench semantics rather than a shared rule. A reopen pressed mid-exit waits for hidden per the shared machine. Revisit when settings gains a second staggered card or when backdrop semantics need one rule across surfaces.
