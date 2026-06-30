# JanusX Agent Wiki

Last analyzed: 2026-06-30

This wiki is written for coding agents that need to understand JanusX quickly after a fresh session. Read this index first, then open only the subsystem pages relevant to the task.

## Fast Read Order

1. `00-start-here.md` - project identity, commands, hard constraints.
2. `01-architecture.md` - Electron layers, package layout, data ownership.
3. `02-module-map.md` - subsystem responsibilities and key files.
4. `03-runtime-flows.md` - boot, IPC, terminal, checkpoint, project run, LLM, Blueprint flows.
5. `04-file-index.md` - file-to-function lookup table.
6. `05-maintenance.md` - how to update this wiki without making it stale.

## Current Project Shape

JanusX is an Electron desktop application for managing AI coding workspaces, terminals, project launch configs, checkpoints, LLM providers, and Janus Blueprint planning/analysis.

Core stack:

| Area | Stack / Library | Evidence |
|---|---|---|
| Desktop shell | Electron 35, electron-vite | `package.json`, `electron.vite.config.ts` |
| Renderer | React 18, TypeScript, Zustand, CSS modules / global CSS | `src/renderer/src` |
| Terminal | `node-pty`, xterm | `src/main/terminal`, `src/renderer/src/components/CLITerminal.tsx` |
| Graph UI | React Flow | `@xyflow/react`, `src/renderer/src/components/blueprint` |
| Editor/viewers | Monaco, React Markdown | `src/renderer/src/components/viewers` |
| LLM core | workspace package `@janusx/llm-core` | `packages/llm-core` |
| Tests | Vitest, Playwright script present | `tests/unit`, `packages/llm-core/tests` |

## Critical Rules For Agents

- Do not directly read source files with ordinary file readers in this project. Use `rg` to inspect source content.
- Do not overwrite source files wholesale. Use precise edits.
- Main Agent orchestration rules live in `AGENTS.md`, `CLAUDE.md`, `.claude/agents`, and `.claude/skills`.
- For code changes, follow the project workflow rules in `AGENTS.md`. This wiki is a map, not an authority override.

## High-Value Entry Points

| Need | Start Here |
|---|---|
| App boot / IPC registration | `src/main/index.ts`, `src/preload/index.ts` |
| Main window | `src/main/window.ts`, `src/main/index.ts` |
| Renderer shell | `src/renderer/src/App.tsx`, `src/renderer/src/main.tsx` |
| Workspaces and terminal layout | `src/renderer/src/stores/workspace.ts`, `src/renderer/src/lib/workspace-pane.ts` |
| Terminal backend | `src/main/terminal/manager.ts`, `src/main/ipc/terminal-handlers.ts` |
| Project detection/run configs | `src/main/project`, `src/main/ipc/project-handlers.ts` |
| Agent process streaming | `src/main/agent`, `src/main/ipc/agent-handlers.ts` |
| Checkpoints | `src/main/agent/checkpoint`, `src/main/ipc/checkpoint-handlers.ts` |
| LLM config/chat | `src/main/llm`, `src/main/ipc/llm-handlers.ts`, `packages/llm-core` |
| Janus Blueprint | `src/main/janus`, `src/renderer/src/components/blueprint`, `src/renderer/src/components/janus` |

