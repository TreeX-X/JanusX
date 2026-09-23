# Agent Note: Terminal right-island turn file history

Status: implemented

## Problem

Turn file changes reach the renderer as one transient bottom pill per terminal pane. The pill shows only the latest turn, collapses after six seconds, and its file rows are not interactive, so reviewing earlier turns or opening a changed file forces a detour through the session panel.

## Decision

Each terminal pane carries a persistent island on its right edge once its first turn lands. Single click expands the latest turn's file list; double click expands per-turn history grouped by turn with kind and red/green counts. File rows open the embedded editor preview resolved from terminal cwd plus relative path; deleted files stay disabled with a reason. Unfocused and narrow panes keep the pill with the fresh count instead of auto-expanding. Terminal kill and zero-exit clear that terminal's history; the session panel remains the audit record. History is memory-only and bounded at twenty turns per terminal.

## Alternatives considered

- Do nothing and keep the transient pill: rejected, because anything beyond the latest turn stays invisible and files stay non-interactive.
- Dock a persistent sidebar that squeezes the terminal: rejected, because xterm reflow and split-pane layout cost outweigh the density gain; an overlay preserves existing geometry.
- Open files in a separate editor window over IPC: rejected, because the embedded `openFile` path already handles text, image, and binary view types with dynamic loading, so a second window manager adds ownership without new capability.
- Persist turn history to disk: rejected, because the lifecycle is explicitly tied to the terminal and no cross-restart requirement exists.

## Consequences

Reviewing the latest turn and its predecessors happens without leaving the terminal, and every changed file opens in place. The overlay covers the pane's right edge while expanded, history beyond twenty turns drops with the oldest first, and double-click discovery rests on the pill hint. Verification runs through `npx vitest --run tests/unit/turn-changes-store.test.ts`, `npx tsc --noEmit`, `npm run i18n:check`, and eslint over the touched renderer files.
