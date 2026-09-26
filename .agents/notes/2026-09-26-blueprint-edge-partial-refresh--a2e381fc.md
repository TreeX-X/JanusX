---
schema: harness-note/1
id: a2e381fc-328e-4ea9-a64a-258076439418
kind: decision
lifecycle: implemented
created: 2026-09-26
class: architecture
tags: [blueprint, canvas, edge-routing, partial-refresh]
---

# Blueprint edge routing split and canvas partial refresh

## Problem

Parent links share the center-ray adaptive router with relation links, so hierarchy edges exit the Left and Right sides, float without matching handles, and cross as diagonal beziers. The topology key folds full layout coordinates and full relation objects into its identity, so each layout-save echo rebuilds every node and edge. Entry stagger writes an uncapped delay variable, so the tail of a 200-node graph waits seconds behind the workbench reveal. Search rebuilds every node text on each keystroke, and the minimap renders the full graph a second time at any size.

## Decision

Parent edges use the `blueprintHierarchy` type with fixed Bottom to Top ports and a smoothstep path with 12px radius. Relation and interface edges keep the `blueprintAdaptive` type with center-ray bezier routing. Cards expose invisible Left and Right handles alongside Top and Bottom so side exits have anchors. Hierarchy edges carry `interactionWidth` 24, relation and interface edges carry 16. Edge kind class names (`bp-flow-edge--hierarchy`, `--relation`, `--interface`) survive the entry pass, and hierarchy paths use round caps with relation paths at reduced opacity.

Topology identity covers structure plus visibility only: node ids with parent ids, layout key set, collapsed and hidden sets, and a compact relation plus interface signature. Coordinates never enter the key, so layout-save echoes reuse the pinned flow. Entry delay variables cap at 8 for nodes and edges. Search text builds once per blueprint object into a map and filters against a deferred query. The minimap mounts only at 250 nodes or fewer.

## Alternatives considered

- Do nothing and keep one adaptive type for all edges: zero diff and no new component. Rejected because side exits mismatch the only Top and Bottom handles and parent crossings stay unreadable.
- Force every edge to smoothstep: single path function and uniform look. Rejected because relation diagonals across distant clusters read worse as orthogonal elbows than as faint beziers.
- Virtualize the canvas on WebGL or a custom SVG layer: highest ceiling for thousand-node graphs. Rejected for this pass because React Flow already clips to visible elements and the measured cost sits in full re-derives plus uncapped stagger, not in per-frame draw.
- Paginate the graph or cap visible nodes hard: bounds every render. Rejected because collapse plus isolated-root folding already bounds visibility without hiding reachable structure by fiat.

## Consequences

Hierarchy scans as vertical S-curves while relations stay visually subordinate, at the cost of one extra edge component and kind class names that must survive future entry refactors. Layout-save echoes skip full re-derives; explicit resets still flow through the direct layout patch path. Typing stays responsive on large graphs while results lag one deferred frame by design. Graphs above 250 nodes lose the minimap until a lighter overview lands. Revisit when relation hairballs dominate inside a single cluster: selected-only relation edges remain the next step.

## Verification

- `npx vitest run tests/unit/blueprint-adaptive-edge.test.ts tests/unit/blueprint-graph-controller.test.ts tests/unit/blueprint-canvas-layout.test.ts tests/unit/blueprint-canvas-navigation.test.ts`: 4 files, 51 tests, all pass.
- `npx tsc --noEmit`: zero errors.
- `npx vitest run tests/unit/blueprint-composition.test.ts`: 1 failure in `refreshes explicitly bound checkout revisions` reproduces on the clean tree, pre-existing and unrelated to renderer changes.
