---
schema: harness-note/1
id: 16ff77a0-0017-47cf-8e05-6b754d12aa5e
kind: decision
lifecycle: implemented
created: 2026-09-29
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c
class: bug-fix
---

# Settings footer scrim reads the canvas token in both themes

## Problem

Every settings panel that owns a save bar renders it as a `position: sticky` footer inside the scrolling `.body` of the settings shell, full-bleed past the body's padding so the bar sits flush with the scrollport bottom. The bar's scrim is the literal `rgba(21, 21, 23, 0.9)`, which is the value of `--shell-canvas` under the `dark` theme and of no theme at all under the default one. `DEFAULT_APP_THEME` is `planche`, where `--shell-canvas` is the paper value `#EFE4C5`.

The consequence is a near-black band across the bottom of the 通知, 知识库, Agent, and 托管 panels, plus the LLM tab through `LlmConfigModal`'s `.embeddedPanel .configFooter`. Because the footer is sticky and carries `backdrop-filter: blur(16px)`, that band holds its place over the tail of the content at every scroll offset instead of scrolling away with it, and on the paper surface it reads as a mask laid over the page rather than as chrome. Without the literal the same bar is invisible, because `rgba(21, 21, 23, 0.9)` laid over `#151517` stays within a rounding error of the canvas — which is why the defect never appears under `dark`.

The settings surface states its own rule in the header of `AppSettingsModal.module.css`: surfaces draw only from the `--shell-*` ramp and introduce no new near-black value. The scrim is the one declaration that breaks that rule, and the planche additive layer of both files carries no `.footer` rule at all.

## Decision

The scrim reads the token. `NotificationSettingsPanel.module.css` `.footer` and `LlmConfigModal.module.css` `.embeddedPanel .configFooter` both declare `background: color-mix(in srgb, var(--shell-canvas) 90%, transparent)`, so one declaration serves both themes and neither file carries a theme-specific color. The paper theme flattens the bar through the existing additive layer: `[data-theme='planche'] .footer` and `[data-theme='planche'] .embeddedPanel .configFooter` set `background: var(--paper, #EFE4C5)` with `backdrop-filter: none`, because the paper surface language is flat fills and hairlines, and a 16px blur over scrolled paper smears into a dirty shadow that mimics the mask this decision removes. The existing 1px `--so-rule` top border keeps the seam in both themes.

The bleed geometry is correct and stays. Measured against the shipped module CSS in Chromium, the matched pair of a negative `bottom` and a negative `margin-bottom` holds the footer flush with the scrollport bottom — 0px deviation — at scroll start, mid, and end, for both long-content and short-content panels. Without the negative `bottom`, a 22px strip opens under the bar and scrolled content runs through it unoccluded. Both numbers stay derived from `--so-body-pad-y` so the bar tracks the body's padding.

`tests/unit/planche-theme.test.ts` strips CSS comments from the five settings surface modules and fails on `#151517` or `rgba(21, 21, 23,`, so the literal cannot return in a declaration while comments stay free to cite it. The same test pins the `color-mix` declaration and the presence of the planche `.footer` rule.

## Alternatives considered

- Keep one glass bar in both themes and only re-tint it per theme — strongest case is that the frosted read survives on paper and the file needs no additive rule. The driver that rules it out is the paper surface language: flat fills and hairlines, no glass, and a per-theme selector is required either way, so the additive rule costs nothing extra to add.
- Move the footer out of the scroll container into a fixed row on `.content` — strongest case is that the save bar stops overlapping scrolled content at all, which is the only way to remove occlusion instead of dressing it. The driver that rules it out is reach: each panel renders its own footer, so the change reaches five components, the LLM embedded variant, and the standalone `LlmConfigModal` window, while the sticky bleed already keeps the whole bar visible and flush at every offset.
- Do nothing / reuse — staying put writes no code and looks correct under `dark`, where the literal matches the canvas. That is the whole cost, because the default theme is the paper one and every user meets the band on first open.

## Consequences

- **Gains**: the 通知, 知识库, Agent, 托管, and LLM footers follow `--shell-canvas`; the default paper theme renders the bar as solid `#EFE4C5` above the existing hairline, and the near-black band is gone. `dark` is unchanged in computed terms — `color-mix(in srgb, #151517 90%, transparent)` with `blur(16px)` yields the same `color(srgb 0.0823529 0.0823529 0.0901961 / 0.9)`.
- **Costs and limits**: the scrim depends on `color-mix`, so the settings footer inherits that browser baseline; Electron 35 and the shipped engines provide it. The `dark` bar keeps its 16px blur, so on that theme it still tints whatever scrolls beneath it. The declaration is duplicated in two modules; revisit when the settings surface consolidates on a single shared footer, at which point it moves to `AppSettingsModal.module.css` and the copy disappears.
- **Verification**: measured in Chromium against the shipped module CSS — under `planche` the footer computes to `rgb(239, 228, 197)` with `backdrop-filter: none`, under `dark` to `color(srgb 0.0823529 0.0823529 0.0901961 / 0.9)` with `blur(16px)`, and the footer's bottom edge sits 0px from the scrollport bottom at scroll start, mid, and end in both themes with a 47px visible bar height. `npx vitest run tests/unit/planche-theme.test.ts` passes the settings-surface assertions; the file's two `janus island` assertion groups fail on a pre-existing mismatch in `13-janus-planche.css` that this change does not touch.
