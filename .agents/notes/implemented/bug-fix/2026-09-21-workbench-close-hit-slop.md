---
schema: harness-note/1
id: 8688b5ab-1f7f-5ff9-ba1b-ef75b7fd5917
kind: decision
lifecycle: implemented
created: 2026-09-21
class: bug-fix
---
# Agent Note: Workbench close controls keep a 30px hit area on a 14px visual

Status: implemented

## Problem

The blueprint and knowledge workbench topbars render the close control as a 14px red circle where the hit box equals the visual box. The `:active` rule contracts the box with `scale(0.9)` during the press, so an edge mousedown loses the mouseup outside the contracted box and the click cancels. The outer `0 0 0 1px` box-shadow ring paints outside the border box without extending hit-testing, so the outermost visual ring never closes. The reliable target collapses to the center of the red circle, matching the reported ~40% effective area. The knowledge stylesheet also holds two competing `.closeButton` definitions, with the 14px rule overriding a dead 30px rule.

## Decision

`src/renderer/src/components/blueprint/blueprint.css` defines `.blueprint-workbench-close` as a 14px visual with `position: relative` and a `::before` layer at `inset: -8px`, so the hit area spans ~30px without shifting layout. `src/renderer/src/components/knowledge/KnowledgeWorkbench.module.css` defines a single 14px `.closeButton` with the same `::before` geometry. Both controls keep `filter: brightness` for hover and active feedback and never use `transform` on `:active`, so the box holds its size through the full press. Both controls reveal the `×` mark through `::after` on hover in parity with `.modal-close-light`, and both expose a `:focus-visible` outline for keyboard operation.

## Alternatives considered

- Do nothing and keep hit equal to the 14px visual: zero churn, but edge presses keep cancelling under the active contraction and the control stays below the 24px minimum target.
- Expand the hit area with a wrapper button carrying transparent padding: strongest case keeps the stylesheet free of pseudo-element geometry, but the wrapper changes flex sizing and gap rhythm in both topbars and risks overlap with the adjacent capsule and refresh controls in narrow headers.
- Drop the active scale without adding hit slop: strongest case removes the press-time contraction with a one-line change, but the target remains 14px and edge misses persist for pointer users.

## Consequences

- **Gains**: Edge presses on the red circle close the workbench; hover shows the `×` affordance and keyboard focus shows a visible ring on both workbenches.
- **Costs and limits**: The `::before` expansion relies on 8px of clearance around the 14px circle. Both headers provide it through 12px end padding and a 14px action gap, so reviewers keep that spacing when touching the topbar layout. The visual stays 14px and remains below the 24px WCAG target by design; the 30px hit area is the compensating mechanism.
- **Verification**: `npx tsc --noEmit -p tsconfig.json` passes with no output; the `::before`/`::after`/`focus-visible` rules read back in both stylesheets with no `scale(0.9)` remaining.
