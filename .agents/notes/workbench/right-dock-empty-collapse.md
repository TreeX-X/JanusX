---
{
  "schema": "harness-note/2",
  "id": "9f855a20-5b26-5bcd-8fd8-225e93c1be62",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-16",
  "class": "bug-fix",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-16-agent-note-right-dock-hides-panel-toggle-with-no-open-tools--9f855a20.md",
      "sourceHash": "71e7eab1926d577094077ed1189b713cf9dfa9db2f038021a65ad7e13a9b8bc0",
      "originalBodyHash": "25367c0c6f7e082012a43e745d5fd77debe2aae22465220a64e1637e7a46d986",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Right dock hides panel toggle with no open tools. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/bug-fix/2026-09-16-right-dock-empty-collapse.md",
        "sourceHash": "71e7eab1926d577094077ed1189b713cf9dfa9db2f038021a65ad7e13a9b8bc0",
        "originalBodyHash": "25367c0c6f7e082012a43e745d5fd77debe2aae22465220a64e1637e7a46d986"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---
# Right dock hides panel toggle with no open tools


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
