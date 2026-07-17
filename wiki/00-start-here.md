# Start Here

Last analyzed: 2026-06-30

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

The root `README.md` currently only says `# SwitchX`, while `package.json` identifies the app as `janusx` version `0.5.0` with description `CLI 工作区管理器 - 统一管理多个 AI 编程助手`.

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
| `npm run package:win/mac/linux` | build distributable packages |

## File Operation Constraints

This repo has a project-specific rule: source files may use encrypted encoding. Agents should inspect source with `rg` and avoid direct ordinary reads. For edits, use precise replacements and avoid whole-file overwrites of source files.

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
| `src/shared` | code shared across Electron sides, currently terminal launch metadata and Janus persona/notifications |
| `packages/llm-core` | separate TypeScript workspace package for Provider abstraction/adapters |
| `tests/unit` | root unit tests for workspace, terminal, panes, checkpoints, parsers, stream manager |
| `packages/llm-core/tests` | LLM core tests |
| `design` | HTML prototypes, icon docs, visual assets |
| `.claude` | WorkflowX agent definitions, skills, command docs |
| `wiki` | this Agent-facing project map |

## Development Risk Notes

- `src/renderer/src/components/blueprint/BlueprintCanvas.tsx` is a large orchestration component. Treat changes there as high blast radius.
- `src/main/janus/types.ts` is imported by renderer services as a type-only bridge. If it gains runtime Electron/Node imports, move shared Blueprint types to `src/shared`.
- Terminal checkpoints are coupled to `terminal:submit-line` and terminal lifecycle in `src/main/ipc/terminal-handlers.ts`.
- Runtime data is split between workspace `.janusX` folders and Electron `userData/janusx`.
