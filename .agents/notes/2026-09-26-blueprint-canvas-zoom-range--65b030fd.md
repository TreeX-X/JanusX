---
schema: harness-note/1
id: 65b030fd-2a29-4ad8-8def-4a13982ee33a
kind: decision
lifecycle: implemented
created: 2026-09-26
class: bug-fix
tags: [blueprint, canvas, zoom]
---

# Widen blueprint canvas zoom range

## Problem

The blueprint canvas stops zooming out at a threshold that leaves large graphs unreadable in one view. `BlueprintCanvas.tsx` passes no zoom bounds to `ReactFlow`, so the framework defaults apply (`minZoom` 0.5, `maxZoom` 2), while the knowledge canvas already allows `minZoom` 0.1.

## Decision

The blueprint `ReactFlow` carries `minZoom` 0.05 and `maxZoom` 4. The existing semantic-zoom threshold (minimal cards below 0.5) stays unchanged, so far-out views degrade to status dots plus titles by design. Zoom-to-fit and match-locate keep their explicit zoom levels.

## Alternatives considered

- Do nothing and keep the 0.5 floor: zero diff. Rejected because the reported threshold blocks overview use on large graphs.
- Mirror the knowledge canvas at `minZoom` 0.1 only: smaller step. Rejected because dense matrices still overflow at 0.1 while rendering cost stays bounded by visible-element-only rendering plus the minimap gate above 250 nodes.

## Consequences

Overview zoom reaches twenty times farther out with no extra rendering cost beyond what is already visible. Nodes below 0.5 render minimal, so fine print is unavailable until zooming back in. Revisit if far-out label legibility becomes a request: a deeper semantic tier can follow the same threshold pattern.

## Verification

- `npx tsc --noEmit`: zero errors.
- `npx vitest run tests/unit/blueprint-canvas-layout.test.ts tests/unit/blueprint-graph-controller.test.ts tests/unit/blueprint-adaptive-edge.test.ts`: 3 files, 39 tests, all pass.
- Prop-level change only; live pan and zoom feel left to manual check.
