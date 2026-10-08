---
{
  "schema": "harness-note/2",
  "id": "8b9c345b-84fb-4fd0-9991-10bd659098fc",
  "kind": "requirement",
  "lifecycle": "draft",
  "created": "2026-09-18",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-terminal-background-image--8b9c345b.md",
      "sourceHash": "2513a3172a53b189c6edbf034894657b07e84bb9a1014e4870285396eee42357",
      "originalBodyHash": "f87ee14ff3a0ad7edda037f512507c8869db9d111fbe7ac6297b58a3738849d8",
      "category": "formal",
      "reason": "Retains the source requirement in draft lifecycle; body documents Terminal background image. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/proposed/feature/2026-09-18-terminal-background-image.md",
        "sourceHash": "2513a3172a53b189c6edbf034894657b07e84bb9a1014e4870285396eee42357",
        "originalBodyHash": "f87ee14ff3a0ad7edda037f512507c8869db9d111fbe7ac6297b58a3738849d8"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---

# Terminal background image

## Expected behavior

The terminal canvas is fixed to a solid color, so users cannot add any personal backdrop. `CLITerminal` constructs xterm with `theme.background` set to `TERMINAL_DEFAULT_COLORS.background` (`#151517`, aligned with `--shell-canvas`), and `TerminalArea` wraps every pane in the same solid. `allowTransparency` is already true and `.xterm-viewport` is transparent, but the opaque theme color hides everything behind it. There is no settings entry, store field, or config key for terminal appearance, and the Codex `OSC 10/11` color probe always answers the fixed dark values. The cost of staying put is small but visible: a fun, low-risk personalization request stays unanswered while the rendering stack already supports most of it.

## Proposal

Add a global, opt-in terminal background image with a readability scrim.

The appearance model will hold `enabled`, `imageId`, `fit` (`cover` by default, `contain` as option), and `dim` (scrim opacity, default around `0.65`). The renderer will keep a `useTerminalAppearance` store slice. `CLITerminal` will render a background layer plus a scrim layer behind the xterm host, and will call `term.setOptions({ theme: { background: 'rgba(21,21,23,<alpha>)' } })` when the setting changes so no PTY restart or replay is needed. The `OSC 11` responder in `terminalColorQuery` will keep answering opaque `#151517`, so Codex TUI contrast logic never sees the picture.

Image intake will go through the Electron open-file dialog. The main process will copy the picked file into `{userData}/janusx/terminal-background/` with a size cap (reject above ~5 MB with a settings-surface error), and expose it to the renderer through the existing IPC/file-asset path rather than an arbitrary `file://` URL. Settings UI will live as one section in `AppSettingsModal` (general tab first, no new top-level tab): pick, preview thumbnail, `dim` slider, `fit` select, and clear. Clearing or an unset image will restore exactly the current solid `#151517` path, so default rendering stays byte-identical.

## Alternatives considered

- Pure color plus opacity only — strongest case is zero file handling, no CSP or persistence questions, and a smaller settings surface. It loses the requested effect: the user asked for a picture backdrop, and a color picker alone does not deliver it. Keep as a later extension of the same `dim`/alpha plumbing.
- Per-terminal backgrounds — strongest case is per-project identity (one picture per agent lane). The driver against it first is scope: tab lifecycle, per-terminal persistence, and per-pane layering multiply the settings and rendering work for an unproven preference. Ship global first; per-terminal overrides only on measured demand.
- OS-level acrylic or transparent window — strongest case is native blur with no image management. The driver against it is blast radius: it changes every surface, complicates the `--shell-canvas` depth ramp, hurts text contrast across panes, and behaves inconsistently across Windows compositors. In-pane image plus scrim stays local to the terminal.
- Do nothing / reuse the solid `#151517` canvas — staying put costs nothing now and preserves the tab-to-canvas seam plus Codex contrast assumptions. The cost is the declined delight: the stack (`allowTransparency`, transparent viewport, solid fallback) already pays most of the price, so refusal saves little.

## Acceptance criteria

- [ ] AC-1: Picking an image applies to all terminal panes without PTY restart or output replay loss.
- [ ] AC-2: Setting persists across app restart; clearing restores the solid `#151517` canvas.
- [ ] AC-3: Codex `OSC 10/11` probe still receives the fixed dark values while a picture is shown.
- [ ] AC-4: Body text at default `dim` keeps WCAG AA contrast against the scrimmed image on a 1080p reference shot.
- [ ] AC-5: Oversize files (>5 MB) are rejected in settings with an explicit error; no arbitrary path is loaded.

## Risks

- Busy or light images wash out text — mitigation is a mandatory scrim with a sane minimum `dim` plus `cover` default; explicit acceptance is that full-bleed zero-scrim mode will never ship.
- Arbitrary file URLs trip Electron CSP/`webSecurity` — mitigation is main-side copy into `userData` plus the existing asset-serving path; direct `file://` loads are out of scope.
- Large/HiDPI images cost paint time — mitigation is the 5 MB cap plus CSS-only scaling with no runtime blur by default; blur waits for measured need.
