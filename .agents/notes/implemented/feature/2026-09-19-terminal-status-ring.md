# Agent Note: Terminal status ring in the sidebar

Status: implemented

## Problem

Each terminal row inside an expanded workspace in `Sidebar.tsx` ends with a status pill: a ten-pixel icon plus a localized word such as `运行中` or `Action needed`. The pill is the widest element on a row that is already narrow, so terminal names truncate early, and the text repeats on every row of a workspace with many terminals. The workspace row above and the collapsed rail express the same states as six-pixel dots, so the pill is a second visual language for one fact, and the only thing it adds over a dot is a word that a hover can supply.

## Decision

`TerminalStatusIndicator` renders a 12px ring inside a 20px hit area and carries no text. The state is encoded three ways so that a reader who cannot tell the colors apart keeps a distinction: color from `getTerminalStatusVisual`, shape from a `term-status-ring--*` modifier class in `globals.css`, and motion from the shared animations. Running is a faint ring at thirty percent of the state color with a bright arc that sweeps through `term-status-orbit`; approval and input waits share one solid orange ring that breathes through `term-status-pulse`; degraded is a dashed ring; error is a filled disc; idle is a solid ring at reduced opacity. The orbit arc reads `--term-ring-width` from the ring, so the arc and the base ring keep one thickness when the width changes in one place. The attention unification and the tab dot are owned by [terminal status display](./2026-09-12-terminal-status-display.md); this Note owns only the ring form of the terminal row indicator.

The label survives as hover and assistive text only. The wrapper has `role="img"` and carries the same string in `title` and `aria-label`, built from `common:workspace.terminalStatusTitle` with the label translated through `visual.labelKey`. The hardcoded Chinese `label` field on the visual table is never read by the ring; it exists for the unit test, and any renderer that reads it leaks Chinese into the English locale. No new translation key exists because both locales already carry the title and the six status labels.

## Alternatives considered

- Custom portal tooltip through the project's popover positioner — strongest case is instant show on hover and a look that matches the runtime drawer instead of the OS tooltip with its own delay. The driver that rules it out is cost against benefit: the terminal list sits inside an `overflow-hidden` grid that drives the expand animation, so a styled tooltip needs `createPortal` plus a hover state per row, while the native `title` answers the same question with zero new state. A portal tooltip remains the upgrade path if the OS delay proves annoying.
- Keep the pill and drop only the text — strongest case is no CSS work, since the icon set already distinguishes five states. The driver that rules it out is legibility: a lone ten-pixel Lucide glyph inside a tinted box reads worse than a shape of the same size, and the box keeps the visual language split between terminal rows and the dots used everywhere else.
- Plain colored dot matching the tab dot — strongest case is one shape across sidebar, tabs, and rail. The driver that rules it out is that a dot carries state by color alone, and running, idle, and error collapse into one shape for a color-blind reader once the text is gone; the ring keeps room for shape and an animated arc.
- Do nothing / reuse — staying put keeps the pill documented in [terminal status display](./2026-09-12-terminal-status-display.md). The cost is the width it takes from terminal names and the mixed visual language between the terminal row and the dots above it.

## Consequences

- **Gains**: The status column is 20px wide, so terminal names keep the width a text pill takes. Terminal rows, the workspace badge, the collapsed rail, and the tab strip read as one dot-and-ring language driven by a single color table. Every state is distinguishable without color through shape or motion.
- **Costs and limits**: The state name is visible only on hover, and the OS tooltip arrives after its own delay with no styling control. Under `prefers-reduced-motion` the running arc freezes at half opacity and the attention pulse stops, so running and attention then depend on color and the arc's presence alone. The dashed ring relies on Chromium's dash fitting on a 12px circle; a change in ring size needs the dash pattern rechecked. Nothing in the unit or e2e suites renders the ring, so verification is `tsc`, `eslint`, and a visual check in the running app.
