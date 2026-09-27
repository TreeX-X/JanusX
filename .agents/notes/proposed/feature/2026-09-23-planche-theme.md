---
schema: harness-note/1
id: b6df1d4e-3a6c-47f3-a062-48e6867f9d0f
kind: requirement
lifecycle: draft
created: 2026-09-23
class: feature
---

# Agent Note: Planche litho theme + TUI background adaptation

## Problem

JanusX has no real theme system. `GlobalConfig.theme: 'dark' | 'light'` (`src/main/workspace/types.ts:52`, default in `src/main/config/service.ts:44`) is stored but never read by the renderer. All surfaces are hardcoded dark: shell ramp `--shell-*` in `src/renderer/src/styles/globals.css:24-54`, xterm `theme.background #151517` in `src/renderer/src/components/CLITerminal.tsx:167-190`, the Codex `OSC 10/11` probe answers in `src/shared/terminalColorQuery.ts:8-21`, Monaco `janusx-dark` in `src/renderer/src/lib/monaco-theme.ts:13-54`, and the web gateway xterm in `src/main/web-test-gateway/page.ts:720`.

The requested style (`design/pelican-lithograph-style.md`, source `https://01a0c211-d4a3-7951-aadf-ac976597b895.arena.site/`) is a light print style: paper `#EFE4C5`, ink `#1C343B`, single vermilion accent `#D43D2A`, flat fills, no gradients/shadows/large radii. There is no token mapping, no `[data-theme]` switch, and no light ANSI palette. Shipping light CSS alone would leave the middle-workspace TUI dark (seam) or, worse, turn xterm light while the `OSC 11` responder still reports dark so Codex/Claude TUI contrast logic renders wrong colors.

## Proposal

Add a global `planche` theme, phased so the middle-workspace TUI background adapts safely.

Phase 0 — tokens (no behavior change): add `design/pelican-lithograph-style.md` UI tokens as CSS variables under `[data-theme='planche']` in `globals.css` (paper/paper-deep/ink/line/red/ochre/green-deep/green-pale/misprint), mapping shell ramp to light: canvas->paper, text->ink, accent->vermilion, borders->1px ink, radii<=6px, kill large blur/gradient.

Phase 1 — shell switch: wire `GlobalConfig.theme` through main config service + IPC + renderer store (`useAppStore` or new `useThemeStore`), set `document.documentElement.dataset.theme`, persist across restart, add one section in `AppSettingsModal` (no new top-level tab). Default stays dark; `planche` is opt-in.

Phase 2 — TUI background (the hard part): define a light xterm palette (bg `#EFE4C5`, fg `#1C343B`, cursor `#D43D2A`, selection `rgba(212,61,42,.18)`, 16-color ANSI rebuilt from ink/red/ochre/green-deep — no neon `#00ff88/#79b8ff` which smears on paper). `CLITerminal` applies it live via `term.setOption('theme', ...)` with no PTY restart. `TERMINAL_DEFAULT_COLORS` becomes theme-dependent and the `OSC 10/11` responder returns the active theme values so Codex probes see light. Ship in two steps: (a) light shell + dark TUI island first (safe), (b) full light TUI after readability passes on claude/codex/opencode. Document that already-running TUI apps cache startup colors and need pane redraw/restart after a theme switch. Mirror the same palette in `web-test-gateway/page.ts` xterm.

Phase 3 — editors + polish: add `planche` Monaco theme (editor.background paper, cursor vermilion), paper-grain overlay at 3-5% multiply (off in form areas), 120-200ms linear/steps motion, hard offset shadows only.

## Alternatives considered

- CSS-only light shell, TUI stays dark — strongest case is zero TUI risk and a deliberate "dark island" look. The driver against it as end-state is the visible seam in the middle workspace plus unfulfilled request; keep as Phase 2a stepping stone, not the final state.
- Pure per-pane TUI background without a theme system — strongest case is local change. The driver against it is inconsistency: shell, Monaco, and gateway would drift apart with no single `theme` source of truth; the existing dead `GlobalConfig.theme` already signals the system-level need.
- Full light TUI in one jump — strongest case is fastest delivery of the request. The driver against it is readability: third-party TUIs hardcode bright colors tuned for dark backgrounds; a light xterm palette needs per-preset verification, otherwise text washes out.
- Do nothing / keep solid `#151517` — costs nothing and preserves current contrast assumptions and test pins (`tests/unit/monaco-theme.test.ts`). The cost is declining a planned personalization track while the style tokens already exist in `design/`.

## Acceptance criteria

- [ ] `planche` opt-in applies to shell via `[data-theme]` with no change to default dark rendering.
- [ ] Setting persists across restart; clearing restores byte-identical dark path.
- [ ] Middle-workspace xterm background follows the theme live without PTY restart or replay loss.
- [ ] Codex `OSC 10/11` probe returns the active theme values (dark stays dark, planche returns paper/ink).
- [ ] Light ANSI palette passes readability check on claude/codex/opencode reference shots (body text WCAG AA at default font).
- [ ] Monaco has a matching light theme; no dark-only color leaks in find widget/selection.
- [ ] Docs updated: `design/` token table is the single source; note records the 2-step TUI rollout.

## Risks

- Third-party TUI apps assume dark: bright hardcoded colors wash out on paper — mitigation is Phase 2a dark-island first, per-preset reference shots before 2b.
- Theme switch mid-session leaves stale TUI colors until redraw — mitigation is explicit redraw/restart guidance, no silent half-themed panes.
- Light-theme contrast regressions across panes — mitigation is mandatory scrim/min-contrast rule from the style doc; full-bleed zero-chrome modes never ship.
- Test pins on dark colors (monaco-theme, desktop snapshots) — mitigation is keeping dark as default and updating pins only for the new theme path.

## Branch sync gate (2026-09-25)

- Do not start Phase 0 until local `main` (76 ahead of `origin/main`, 609 files as of 2026-09-25) is pushed to `origin/main`.
- After push, sync `feature/planche-theme` worktree once (`fetch` + `merge`/`rebase` `origin/main`) and verify zero diff vs `main` before starting.
- Reason: `feature/planche-theme == main` with no theme commits yet; the merge risk is the inherited unpushed divergence, not the additive `[data-theme]` tokens.
- `develop == origin/main` at gate time; decide separately whether to merge pushed `main` into `develop`.
