---
{
  "schema": "harness-note/2",
  "id": "764d5d26-8d0d-4307-9b77-af3e22e2ac11",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-29",
  "class": "bug-fix",
  "updated": "2026-10-14T16:11:03.053Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Session surfaces derive from the chrome token instead of hand-written literals

## Problem

`SessionPanel.tsx` carries the whole right-dock session UI in inline style objects, so it has no stylesheet and no `:global([data-theme=…])` override layer. Every surface is a hand-written literal, and the literals were copied from the `dark` palette, which hides the damage on `dark` and exposes it on the default `planche` theme.

Three failure modes share one cause. Fills written as `rgba(0, 0, 0, 0.18–0.35)` — the expanded list card's turn panel, the detail turn card and orphan checkpoint card, the detail nav rail, the diff side panel and its body — resolve to a cold gray-olive on `#EFE4C5` paper, so the session UI reads as smudges on a warm surface. Fills written as `rgba(255, 255, 255, 0.02–0.03)` — the search input, the first-prompt block, the checkpoint strip and its review panel, the continue-modal blocks — are white on cream and therefore invisible. Borders written as `rgba(255, 255, 255, 0.05–0.14)` are invisible for the same reason, so the panes that should be separated by hairlines have no edges at all. Accent colors copied from the dark ramp — `#8ab4ff` on the external badge, the nav selected rows, the checkpoint links; `rgba(244, 125, 67, …)` on the resume buttons; `rgba(224, 108, 117, …)` on the conflict box — sit against a vermilion paper accent and do not belong to it.

`var(--shell-card)` cannot substitute, because `planche` assigns `#EFE4C5` to `--shell-void`, `--shell-canvas`, `--shell-pane`, `--shell-chrome`, and `--shell-card` alike. That theme declares flat fills and hairlines rather than a tonal ramp, so any fill drawn from those tokens is the same value as the surface behind it.

## Decision

Two surfaces derived from the ramp carry the detail and in-flow fills, defined once at the module top and used by every fill:

- `SURFACE_CARD` — `color-mix(in srgb, var(--shell-chrome) 94%, var(--shell-text))` on the detail turn card.
- `SURFACE_INSET` — 90% on the in-flow blocks: search input, continue-modal blocks, detail nav rail, and footer buttons.
The checkpoint strips, restore reviews, orphan cards and diff side panel have been removed from session management; their deep code surface constant is gone.

The session panel carries a three-step ladder in `SessionPanel.module.css`: ground `var(--shell-canvas)`, list card `#E2D9BD` (`#1c1c1f` in dark), and expanded first-prompt / recent-turn sheets derived from the parent card through `--session-card-surface`. Sheets mix 84% card with white in light themes and 96% card with white in dark, approximately `#E7DFC8` and `#252528`. This small lift keeps the same material and avoids the previous near-white blocks; the existing `1px solid var(--shell-border)` hairlines retain separation. The ground and outer cards retain their existing colors.

Mixing toward the text token is what makes plankhe work at all. That theme has no darker surface step, so mixing toward `--shell-void` collapses to the chrome value, because void and chrome are the same paper, and a sunken card is unrepresentable there. A small step toward ink produces a warm, quiet card in plankhe and a raised card in dark from one declaration.

`CARD_BORDER` and `CARD_BORDER_SOFT` carry `--shell-border` and `--shell-border-soft`, replacing every white-alpha border, which is the delineation mechanism plankhe actually has. Accent and diff colors move to `--shell-accent`, `--shell-accent-soft`, `--shell-accent-border`, and `--shell-diff-del`; where a wash needs to stay a wash, `color-mix(in srgb, var(--shell-diff-del) 8%, transparent)` carries the tint rather than a solid token. The two modal scrims, the two drop shadows, and the three traffic-light colors keep their literals, because they are overlays and physical lights rather than themed surfaces.

`tests/unit/planche-theme.test.ts` pins the two declarations and their current use sites, and rejects white-alpha or low-alpha black fills, white-alpha borders, the fixed blue accent and direct shell-card fills.

## Alternatives considered

- Give plankhe a real card token in `definition.ts` and regenerate the theme CSS. Strongest case is that the ramp would stop collapsing five surfaces onto one value, and a named slot is more discoverable than a `color-mix` expression. The driver that rules it out is blast radius: the collapse is a property of the plankhe ramp that every surface in the app already inherits, so fixing it there reshapes the whole shell to correct one component.
- Branch per theme in JS, the shape `TrafficBar` already uses in this file. Strongest case is that each theme gets a hand-picked tone rather than a computed one. The driver that rules it out is that it needs a store read in every component and forks the palette, where the mix keeps one declaration and one answer for both.
- Do nothing / reuse. Staying put writes no code and stays plausible under `dark`, where fixed black overlays match the palette. That is the entire benefit, because the default theme is `planche` and it is the one showing the defect.

## Consequences

- **Gains**: every session surface resolves in both themes, the list and the detail read as one material, and the hairlines that separate the panes are finally drawn. Measured in Chromium against the shipped tokens — `planche` resolves `SURFACE_CARD`, `SURFACE_INSET`, and `SURFACE_DEEP` to `rgb(226, 217, 189)`, `rgb(218, 210, 183)`, and `rgb(209, 203, 178)` on a `rgb(239, 228, 197)` chrome, and `dark` to `rgb(43, 43, 45)`, `rgb(52, 52, 54)`, and `rgb(61, 61, 63)` on a `rgb(30, 30, 32)` chrome. Accent, selected rows, and the active-turn ring follow the theme accent instead of a fixed blue.
- **Costs and limits**: `color-mix` is required, so the session surface inherits that browser baseline, which Electron 35 provides. The scale only runs toward the text token, so in `dark` every surface is now raised off the chrome where turn cards used to be sunk, and the theme's own note that "panes read sunk, not punched" no longer describes them. The scale lives as two module constants serving the detail window; `SessionPanel.module.css` owns expand motion and the panel ladder (ground, list card, content sheets), and the constants retire as remaining fills move into that stylesheet. The two modal scrims still use `rgba(0, 0, 0, 0.64)` rather than the shared `rgba(8, 8, 10, 0.62)`.
- **Verification**: The inner-sheet refinement passes `npx vitest run tests/unit/planche-theme.test.ts` (14/14), `git diff --check`, and `npm run check:notes` (0 errors; 17 existing external-link diagnostics). A standalone Chromium preview using the production stylesheet confirms the light/dark surface ladder; the full app was not launched for this CSS adjustment. Previous validation: `npm run typecheck` and component eslint pass; `tests/unit/planche-theme.test.ts` passes 14/14 with the remaining two surface declarations and current use sites. Desktop reading and continuation checks plus the unrelated strict-unused failures are recorded in [windowed session reading](../sessions/records/session-windowed-reading.md).
