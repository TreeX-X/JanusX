# JanusX Agent Wiki

Last index update: 2026-07-17. Individual subsystem pages retain their own verification dates.

This wiki is written for coding agents that need to understand JanusX quickly after a fresh session. Read this index first, then open only the subsystem pages relevant to the task.

## Fast Read Order

1. `00-start-here.md` - project identity, commands, hard constraints.
2. `01-architecture.md` - Electron layers, package layout, data ownership.
3. `02-module-map.md` - subsystem responsibilities and key files.
4. `03-runtime-flows.md` - boot, IPC, terminal, checkpoint, project run, LLM, Blueprint flows.
5. `04-file-index.md` - file-to-function lookup table.
6. `05-maintenance.md` - how to update this wiki without making it stale.
7. `06-architecture-optimization-plan.md` - implemented Phase 1-5 architecture optimization, evidence, and pending decisions.

## Architecture Optimization Status

The Phase 1-5 modular-monolith optimization is complete at commit `c6bc283`:

| Area | Implemented Result |
|---|---|
| Repository and package hygiene | Dead tracked paths were removed, historical screenshots were archived outside `out/`, and Electron packaging uses a fail-closed runtime allowlist. |
| IPC boundary | All renderer-accessible domains use shared contracts and fixed typed preload APIs; the generic string bridge and channel allowlists are gone. |
| Main process | `src/main/index.ts` is a lifecycle coordinator delegating session setup, services, windows, and ordered IPC registration. |
| Renderer controllers | Workspace bootstrap/actions, Terminal lifecycle, and Blueprint layout/analysis have explicit feature modules. |
| Release gate | `npm run verify` covers both type checks and test suites, strict-unused, production build, package-boundary validation, and built-Electron desktop smoke. |

The plan has no blocking residual work. Four product/distribution decisions remain tracked under `Pending Confirmation` in `06-architecture-optimization-plan.md`.

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
| Tests | Vitest, Playwright browser and built-Electron smoke suites | `tests/unit`, `tests/e2e`, `packages/llm-core/tests` |

## Critical Rules For Agents

- Use normal file tools by default. Fall back to `rg`-based reads and precise replacements only when a source file is garbled or known to have encoding/encryption issues.
- Preserve existing encoding and unrelated worktree changes; avoid whole-file rewrites of affected encoded source.
- Main Agent orchestration rules live in `AGENTS.md`, `.codex/config.toml`, `.codex/agents`, and `.codex/skills`.
- For code changes, follow the project workflow rules in `AGENTS.md`. This wiki is a map, not an authority override.

## High-Value Entry Points

| Need | Start Here |
|---|---|
| App boot / IPC registration | `src/main/index.ts`, `src/main/bootstrap/`, `src/main/ipc/register.ts` |
| Main/editor windows | `src/main/windows/` |
| Renderer shell | `src/renderer/src/App.tsx`, `src/renderer/src/main.tsx` |
| Workspace bootstrap/actions | `src/renderer/src/features/workspace/`, `src/renderer/src/stores/workspace.ts` |
| Terminal layout/lifecycle | `src/renderer/src/features/terminal/`, `src/renderer/src/lib/workspace-pane.ts` |
| Terminal backend | `src/main/terminal/manager.ts`, `src/main/ipc/terminal-handlers.ts` |
| Project detection/run configs | `src/main/project`, `src/main/ipc/project-handlers.ts` |
| Agent process streaming | `src/main/agent`, `src/main/ipc/agent-handlers.ts` |
| Checkpoints | `src/main/agent/checkpoint`, `src/main/ipc/checkpoint-handlers.ts` |
| LLM config/chat | `src/main/llm`, `src/main/ipc/llm-handlers.ts`, `packages/llm-core` |
| Knowledge workbench | `src/main/knowledge`, `src/main/ipc/knowledge-handlers.ts`, `src/renderer/src/components/knowledge` |
| Office tooling | `src/main/office`, `src/main/ipc/office-handlers.ts`, `src/renderer/src/services/office.ts` |
| Janus Blueprint | `src/main/janus`, `src/renderer/src/components/blueprint`, `src/renderer/src/components/janus` |
| Release verification | `package.json`, `.github/workflows/verify.yml`, `tests/e2e/desktop-smoke.spec.ts` |
