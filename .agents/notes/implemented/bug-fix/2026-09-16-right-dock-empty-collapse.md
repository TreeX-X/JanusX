---
schema: harness-note/1
id: 9f855a20-5b26-5bcd-8fd8-225e93c1be62
kind: decision
lifecycle: implemented
created: 2026-09-16
class: bug-fix
---
# Agent Note: Right dock hides panel toggle with no open tools

Status: implemented

## Problem

The right rail shows a collapse control with an empty tool set. The dock width only grows when an active tool exists (`getRightDockLayout` in `src/renderer/src/components/right-tools/layout.ts`), so toggling the collapsed flag with no open tool changes no pixels. The control also exposes `aria-expanded` with `aria-controls="right-tool-panel"` against a panel that renders nothing, which misleads assistive readers about available action.

## Decision

`RightToolRail` in `src/renderer/src/components/right-tools/RightToolRail.tsx` renders the panel toggle only when `openToolIds` is non-empty. Rail-only stays the normal empty state, tool icons on the rail remain the single entry point, and the toggle returns with the first opened tool. The collapsed preference in `src/renderer/src/stores/app.ts` keeps its meaning for open tools and never gates the empty rail.

## Alternatives considered

- Disabled toggle with tooltip — strongest case preserves control placement and teaches the entry path. The driver that rules it out is dead chrome: a permanently disabled button in the default launch state adds noise without action.
- Empty toggle opens the default tool — strongest case gives the button a meaning and speeds discovery. The driver that rules it out is surprise: expand must never invent workspace tool state the user did not request.
- Do nothing / reuse always-visible toggle — staying put avoids all churn. The cost is a control that promises an effect it cannot deliver, plus incorrect expand/collapse announcements.

## Consequences

- **Gains**: The rail exposes no ineffective action; screen readers meet no dangling panel reference in the empty state.
- **Costs and limits**: Discovery of expand relies on opening a tool icon first; a future empty-state hint on the rail remains open when first-run telemetry shows hesitation.
