---
{
  "schema": "harness-note/2",
  "id": "3007aefa-b643-4f1c-9fcb-4a65b3f7894f",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-26",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/77fa3727-6536-47d7-8bfd-613db717e4ac",
  "class": "bug-fix",
  "tags": [
    "blueprint",
    "canvas",
    "chrome",
    "zoom"
  ],
  "updated": "2026-10-21T15:37:53.642Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/17bbe20e-f05c-470c-aee1-3f92a86369ab"
}
---

# Blueprint canvas zoom and controls

## Problem
The React Flow zoom control (+/-) sits at the lower left of the blueprint canvas and duplicates existing zoom paths: mouse wheel, minimap, fit-canvas buttons in both toolbars, and match locate. The floating control adds chrome without adding reach.

### Widen blueprint canvas zoom range
The blueprint canvas stops zooming out at a threshold that leaves large graphs unreadable in one view. `BlueprintCanvas.tsx` passes no zoom bounds to `ReactFlow`, so the framework defaults apply (`minZoom` 0.5, `maxZoom` 2), while the knowledge canvas already allows `minZoom` 0.1.


## Decision
`BlueprintCanvas.tsx` drops the `Controls` element and its import. Pan and zoom stay on wheel and touch gestures; explicit zoom stays on fit-canvas and locate actions.

### Widen blueprint canvas zoom range
The blueprint `ReactFlow` carries `minZoom` 0.05 and `maxZoom` 4. The existing semantic-zoom threshold (minimal cards below 0.5) stays unchanged, so far-out views degrade to status dots plus titles by design. Zoom-to-fit and match-locate keep their explicit zoom levels.



## Alternatives considered
- Do nothing and keep the control: zero diff. Rejected because the requester names it as unwanted chrome.
- Keep the control but hide interactivity: still paints the +/- cluster. Rejected because it preserves the visual cost while removing the function.

### Widen blueprint canvas zoom range
- Do nothing and keep the 0.5 floor: zero diff. Rejected because the reported threshold blocks overview use on large graphs.
- Mirror the knowledge canvas at `minZoom` 0.1 only: smaller step. Rejected because dense matrices still overflow at 0.1 while rendering cost stays bounded by visible-element-only rendering plus the minimap gate above 250 nodes.


## Consequences
One less floating overlay on the canvas at no behavior cost. Users without a wheel find zoom on fit-canvas and locate only. Revisit if keyboard-only zoom becomes a request: a toolbar control can return without the floating overlay.

### Widen blueprint canvas zoom range
Overview zoom reaches twenty times farther out with no extra rendering cost beyond what is already visible. Nodes below 0.5 render minimal, so fine print is unavailable until zooming back in. Revisit if far-out label legibility becomes a request: a deeper semantic tier can follow the same threshold pattern.


## Verification
- `npx tsc --noEmit`: zero errors.
- Import and element removal only; visual result left to manual check.

### Widen blueprint canvas zoom range
- `npx tsc --noEmit`: zero errors.
- `npx vitest run tests/unit/blueprint-canvas-layout.test.ts tests/unit/blueprint-graph-controller.test.ts tests/unit/blueprint-adaptive-edge.test.ts`: 3 files, 39 tests, all pass.
- Prop-level change only; live pan and zoom feel left to manual check.
