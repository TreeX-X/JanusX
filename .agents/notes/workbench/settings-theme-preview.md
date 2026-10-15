---
{
  "schema": "harness-note/2",
  "id": "1e5964e7-2935-4985-8dc6-97156c26da0d",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-10-14",
  "class": "feature",
  "updated": "2026-10-15T11:06:25Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Theme selection previews the workspace

## Problem

The general settings theme dropdown names the two built-in themes without showing their appearance. Users must switch to compare the light slate and classic dark palettes.

## Decision

`GeneralSettingsPanel` uses `ThemePreviewPicker` instead of a theme dropdown. Each registered theme receives a selectable card with a CSS miniature of the titlebar, sidebar, rounded workspace tabs, terminal lines and quiet usage footer. Preview custom properties come from that theme's complete token table and stay scoped to the miniature; changing the surrounding application theme does not recolor the other preview. Labels use existing translations with the registry label as fallback. The selected card has a faint accent fill, weak accent border and check mark. Native radio inputs provide names, checked state and keyboard selection; visible keyboard focus outlines the whole card.

The theme row places the description above a preview grid with a maximum width of 520px, following the [settings layout](./settings-layout.md). The card grid wraps to one column when two 140px cards cannot fit. Loading or saving disables the picker; a failed save keeps the previous theme selected and reports the existing localized error through an alert. Unknown saved IDs select the registry default. Theme persistence continues through the existing store and IPC service.

## Alternatives considered

Static screenshots show real details but become stale as workspace chrome changes and require an asset for each registered theme. Token-based miniatures keep the palette current, avoid unreadable tiny labels and support new registry entries without new images. Rendering live workspaces inside cards would load terminal/browser behavior for a decorative preview; the miniature carries no live content.

## Consequences

Users can compare both palettes before changing appearance. The preview is a schematic, not an exact screenshot; its structural shapes need maintenance when the workspace layout changes. Selection waits for the existing save service to succeed, avoiding optimistic selection that must be rolled back on failure. There is no separate apply button.

## Verification

`npx playwright test tests/e2e/theme-settings.spec.ts --project=island --workers=1 --output=artifacts/theme-cards-final` passes six browser cases using the real general settings panel and theme store with Electron IPC fixtures. Checks cover 1100/480/320px layouts, preview token isolation, click and arrow-key selection, pending save, rejected save, registered custom themes and unknown saved IDs. Screenshots of both surrounding themes and the narrow layout were manually inspected. Typecheck, scoped ESLint and `npm run build:app` pass. These browser checks do not establish persistence across a real Electron restart.
