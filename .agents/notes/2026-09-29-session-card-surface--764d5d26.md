---
schema: harness-note/1
id: 764d5d26-8d0d-4307-9b77-af3e22e2ac11
kind: decision
lifecycle: implemented
created: 2026-09-29
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c
class: bug-fix
---

# Session surfaces derive from the chrome token instead of hand-written literals

## Problem

`SessionPanel.tsx` carries the whole right-dock session UI in inline style objects, so it has no stylesheet and no `:global([data-theme=…])` override layer. Every surface is a hand-written literal, and the literals were copied from the `dark` palette, which hides the damage on `dark` and exposes it on the default `planche` theme.

Three failure modes share one cause. Fills written as `rgba(0, 0, 0, 0.18–0.35)` — the expanded list card's turn panel, the detail turn card and orphan checkpoint card, the detail nav rail, the diff side panel and its body — resolve to a cold gray-olive on `#EFE4C5` paper, so the session UI reads as smudges on a warm surface. Fills written as `rgba(255, 255, 255, 0.02–0.03)` — the search input, the first-prompt block, the checkpoint strip and its review panel, the continue-modal blocks — are white on cream and therefore invisible. Borders written as `rgba(255, 255, 255, 0.05–0.14)` are invisible for the same reason, so the panes that should be separated by hairlines have no edges at all. Accent colors copied from the dark ramp — `#8ab4ff` on the external badge, the nav selected rows, the checkpoint links; `rgba(244, 125, 67, …)` on the resume buttons; `rgba(224, 108, 117, …)` on the conflict box — sit against a vermilion paper accent and do not belong to it.

`var(--shell-card)` cannot substitute, because `planche` assigns `#EFE4C5` to `--shell-void`, `--shell-canvas`, `--shell-pane`, `--shell-chrome`, and `--shell-card` alike. That theme declares flat fills and hairlines rather than a tonal ramp, so any fill drawn from those tokens is the same value as the surface behind it.

## Decision

Three surfaces derived from the ramp carry the whole file, defined once at the module top and used by every fill:

- `SURFACE_CARD` — `color-mix(in srgb, var(--shell-chrome) 94%, var(--shell-text))` on the detail turn card and the detail orphan card.
- `SURFACE_INSET` — 90% on the in-flow blocks: checkpoint strip and review panel, search input, continue-modal blocks, detail nav rail, diff side panel, footer buttons.
- `SURFACE_DEEP` — 86% on the two code surfaces: the diff body and its sticky active-path header.

The session panel itself carries a three-step ladder as literal theme-aware rules in `SessionPanel.module.css`, outside the chrome-to-text scale: ground `#E8E6E2` in planche (`#151517` in dark, the v6 HiFi canvas), list card `#E2D9BD` (`#1c1c1f` in dark), and the expanded card's content cards — the first-prompt block and the recent-turn panel — `#F8F2E0` pale sheets (`color-mix(in srgb, var(--shell-chrome) 88%, white)` raised in dark), each framed with a `1px solid var(--shell-border)` hairline. Without a ground distinct from the paper chrome the list card melts into its surround and the ladder reads flat; an ink-mixed step under nested cards reads as a slab on the light paper, while the pale sheet reads as a lighter stock on the card.

Mixing toward the text token is what makes plankhe work at all. That theme has no darker surface step, so mixing toward `--shell-void` collapses to the chrome value, because void and chrome are the same paper, and a sunken card is unrepresentable there. A small step toward ink produces a warm, quiet card in plankhe and a raised card in dark from one declaration.

`CARD_BORDER` and `CARD_BORDER_SOFT` carry `--shell-border` and `--shell-border-soft`, replacing every white-alpha border, which is the delineation mechanism plankhe actually has. Accent and diff colors move to `--shell-accent`, `--shell-accent-soft`, `--shell-accent-border`, and `--shell-diff-del`; where a wash needs to stay a wash, `color-mix(in srgb, var(--shell-diff-del) 8%, transparent)` carries the tint rather than a solid token. The two modal scrims, the two drop shadows, and the three traffic-light colors keep their literals, because they are overlays and physical lights rather than themed surfaces.

`tests/unit/planche-theme.test.ts` pins the three declarations, counts the fifteen sites that use them and the three that use `CARD_BORDER`, and fails on any reintroduction of a white-alpha or low-alpha black fill, a white-alpha border, the `rgba(138, 180, 255)` blue, `#8ab4ff`, or `background: 'var(--shell-card)'`.

## Alternatives considered

- Give plankhe a real card token in `definition.ts` and regenerate the theme CSS. Strongest case is that the ramp would stop collapsing five surfaces onto one value, and a named slot is more discoverable than a `color-mix` expression. The driver that rules it out is blast radius: the collapse is a property of the plankhe ramp that every surface in the app already inherits, so fixing it there reshapes the whole shell to correct one component.
- Branch per theme in JS, the shape `TrafficBar` already uses in this file. Strongest case is that each theme gets a hand-picked tone rather than a computed one. The driver that rules it out is that it needs a store read in every component and forks the palette, where the mix keeps one declaration and one answer for both.
- Do nothing / reuse. Staying put writes no code and stays plausible under `dark`, where fixed black overlays match the palette. That is the entire benefit, because the default theme is `planche` and it is the one showing the defect.

## Consequences

- **Gains**: every session surface resolves in both themes, the list and the detail read as one material, and the hairlines that separate the panes are finally drawn. Measured in Chromium against the shipped tokens — `planche` resolves `SURFACE_CARD`, `SURFACE_INSET`, and `SURFACE_DEEP` to `rgb(226, 217, 189)`, `rgb(218, 210, 183)`, and `rgb(209, 203, 178)` on a `rgb(239, 228, 197)` chrome, and `dark` to `rgb(43, 43, 45)`, `rgb(52, 52, 54)`, and `rgb(61, 61, 63)` on a `rgb(30, 30, 32)` chrome. Accent, selected rows, and the active-turn ring follow the theme accent instead of a fixed blue.
- **Costs and limits**: `color-mix` is required, so the session surface inherits that browser baseline, which Electron 35 provides. The scale only runs toward the text token, so in `dark` every surface is now raised off the chrome where the diff body and turn cards used to be sunk, and the theme's own note that "panes read sunk, not punched" no longer describes them. The scale lives as three module constants serving the detail window; `SessionPanel.module.css` owns expand motion and the panel ladder (ground, list card, content sheets), and the constants retire as remaining fills move into that stylesheet. The two modal scrims still use `rgba(0, 0, 0, 0.64)` rather than the shared `rgba(8, 8, 10, 0.62)`, and the diff pane's `13-janus-planche.css`-style island theming is untouched.
- **Verification**: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` and `npx eslint src/renderer/src/components/SessionPanel.tsx` both exit clean, and `npx vitest run tests/unit/planche-theme.test.ts` passes 14 of 14 with the three declarations pinned by literal, the 2/8/2 use-site counts intact, and the panel ladder literals pinned in `SessionPanel.module.css`.
