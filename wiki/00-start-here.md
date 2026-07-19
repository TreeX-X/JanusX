# Start Here

Last analyzed: 2026-07-17

## Project Identity

JanusX is a desktop workspace manager for AI-assisted development. It combines:

- multi-workspace navigation,
- multiple terminal sessions and panes,
- Claude/Codex/OpenCode/shell terminal presets,
- Agent process streaming,
- checkpoint snapshots and restore,
- project detection and launch management,
- LLM provider configuration,
- Janus chat and Blueprint planning/analysis.

The root `README.md` identifies the application as JanusX and documents development, unified verification, focused E2E, packaging, and architecture entry points. `package.json` identifies the app as `janusx` version `0.5.0`.

## Commands

Use these root commands:

| Command | Purpose |
|---|---|
| `npm run dev` | build `@janusx/llm-core`, then start Electron dev server |
| `npm run build` | build `@janusx/llm-core`, then Electron production build |
| `npm run build:llm-core` | build workspace package |
| `npm run test:unit` | run root Vitest tests |
| `npm run test:llm-core` | run `packages/llm-core` tests |
| `npm run typecheck` | TypeScript check for root `src` |
| `npm run typecheck:llm-core` | TypeScript check for LLM package |
| `npm run typecheck:strict-unused` | no-emit unused-symbol regression check |
| `npm run check:package-boundary` | fail-closed Electron package input/output validation |
| `npm run test:e2e:desktop` | built-Electron Workspace/Terminal/Project smoke |
| `npm run test:e2e:island` | browser-only Janus Island interaction spec |
| `npm run verify` | unified release gate: type checks, tests, strict-unused, build, package boundary, and desktop smoke |
| `npm run package:win/mac/linux` | build distributable packages |

## File Operation Constraints

Use normal file tools by default. If a direct source read fails, is garbled, or the file is known to have encoding/encryption issues, fall back to `rg` and precise replacements. Avoid whole-file rewrites of affected encoded source.

Safe examples:

```bash
rg -n "registerLlmHandlers" src/main
rg -n --passthru ".*" src/main/index.ts
rg -n "export function|export class|ipcMain.handle" src/main/ipc
```

## Repo Layout Snapshot

| Path | Purpose |
|---|---|
| `src/main` | Electron lifecycle, bootstrap services, windows, IPC composition, and domain services |
| `src/preload` | preload bridge exposing fixed typed domain APIs to renderer |
| `src/renderer/src` | React renderer app, stores, services, UI components |
| `src/shared` | pure cross-process models, terminal metadata, notifications, Office DTOs, and typed IPC contracts |
| `packages/llm-core` | separate TypeScript workspace package for Provider abstraction/adapters |
| `tests/unit` | root unit and contract coverage for IPC domains, workspace, terminal, project, Knowledge, Office, Blueprint, checkpoints, and Agent behavior |
| `packages/llm-core/tests` | LLM core tests |
| `design` | HTML prototypes, icon docs, visual assets |
| `.codex` | WorkflowX Codex configuration, subagent definitions, and skills |
| `wiki` | this Agent-facing project map |

## Development Risk Notes

- Packaged JanusX uses its existing application profile, while `npm run dev` uses `%APPDATA%/JanusX-Dev`. They can run concurrently, but their application settings and cached workspace metadata are intentionally isolated.
- `BlueprintCanvas.tsx` and `TerminalArea.tsx` remain large cohesive views, but Blueprint layout/analysis and Terminal lifecycle responsibilities now live under `src/renderer/src/features/`. Split further only when responsibilities actually diverge.
- Canonical Blueprint/Janus models live in `src/shared/janus/types.ts`; `src/main/janus/types.ts` is a compatibility re-export and must not become the renderer contract owner again.
- Terminal checkpoints are coupled to `terminal:submit-line` and terminal lifecycle in `src/main/ipc/terminal-handlers.ts`.
- Runtime data is split between workspace `.janusX` folders and Electron `userData/janusx`.
