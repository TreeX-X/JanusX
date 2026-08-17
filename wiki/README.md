# JanusX Agent Wiki

Last index update: 2026-08-17. Individual subsystem pages retain their own verification dates.

This wiki is written for coding agents that need to understand JanusX quickly after a fresh session. Read this index first, then open only the subsystem pages relevant to the task.

## Fast Read Order

1. `00-start-here.md` - project identity, commands, hard constraints.
2. `01-architecture.md` - Electron layers, package layout, data ownership.
3. `02-module-map.md` - subsystem responsibilities and key files.
4. `03-runtime-flows.md` - boot, IPC, terminal, checkpoint, project run, LLM chat, agent runtime, Blueprint maintenance, browser surface, companion gateway flows.
5. `04-file-index.md` - file-to-function lookup table.
6. `05-maintenance.md` - how to update this wiki without making it stale.
7. `06-architecture-optimization-plan.md` - implemented Phase 1-5 architecture optimization, post-v0.8 evolution, evidence, and pending decisions.

## Architecture Evolution Status

The Phase 1-5 modular-monolith optimization is complete at commit `c6bc283`. Since the v0.5.0 baseline, the project has advanced to **v0.8.0** with significant new subsystems:

| Area | Current State |
|---|---|
| Repository and package hygiene | Dead tracked paths removed; Electron packaging uses fail-closed runtime allowlist. |
| IPC boundary | All renderer-accessible domains use shared contracts and fixed typed preload APIs; 20+ typed domains including new Browser, Agent Runtime, Janus Chat, Language Service surfaces. |
| Main process | `src/main/index.ts` is a lifecycle coordinator delegating session setup, services, windows, and ordered IPC registration. |
| Agent runtime | New `src/main/agent/runtime/` with `WorkspaceAgentRuntime`, policy gate, path guard, file transactions, tool registry, and workspace/git/project/command tool sets. |
| Janus agent loop | New `src/main/agent/loop/` with Vercel AI SDK stream adapter, runtime tool adapter, and structured agent events. |
| Companion gateway | New `src/main/companion/` for Feishu remote control: binding store, action tokens, audit, dedupe, terminal control, session state, workspace registry. |
| Remote notifications | New `src/main/remote-notifications/` with Feishu provider, inbound router, dispatcher, delivery store. |
| Browser surface | New `src/main/browser/` managing embedded browser panes/windows with `BrowserSurfaceManager`. |
| Language service | New `src/main/language-service/` with clangd LSP client/manager for go-to-definition. |
| Blueprint maintenance | New `src/main/janus/maintenance/` with change-set operations, reverse operations, blueprint tools, and `BlueprintMaintenanceService`. |
| Chat orchestration | New `src/main/llm/chat-orchestrator.ts`, `workspace-chat-tools.ts`, `ModelCatalogService.ts`, `development-config-sync.ts`, `ai-runtime.ts`. |
| i18n | New `src/renderer/src/i18n/` with i18next, en/zh-CN locale bundles, type generation, and check. |
| Renderer features | Blueprint graph controller, adaptive edge geometry, canvas navigation, right-tools dock, Quick Note, Workbench switcher, FileExplorer tool, editor tabs/find. |
| Release gate | `npm run verify` covers both type checks and test suites, strict-unused, production build, package-boundary validation, i18n check, lint, and built-Electron desktop smoke. |

## Research Notes

- [`research/pi架构与JanusX-Chat扩展设计借鉴分析.md`](research/pi架构与JanusX-Chat扩展设计借鉴分析.md) - JanusX Chat 设置与扩展能力盘点、Pi 对比、目标架构和分阶段演进建议。
- [`research/BridgeMind产品调研与JanusX Agent Runtime借鉴方案.md`](research/BridgeMind产品调研与JanusX-Agent-Runtime借鉴方案.md) - BridgeMind 产品调研与 Agent Runtime 借鉴方案。

## Current Project Shape

JanusX is an Electron desktop application for managing AI coding workspaces, terminals, project launch configs, checkpoints, LLM providers, knowledge bases, remote companion control, browser surfaces, and Janus Blueprint planning/analysis/maintenance.

Core stack:

| Area | Stack / Library | Evidence |
|---|---|---|
| Desktop shell | Electron 35, electron-vite | `package.json`, `electron.vite.config.ts` |
| Renderer | React 18, TypeScript, Zustand, CSS modules / global CSS | `src/renderer/src` |
| Terminal | `node-pty`, xterm | `src/main/terminal`, `src/renderer/src/components/CLITerminal.tsx` |
| Graph UI | React Flow | `@xyflow/react`, `src/renderer/src/components/blueprint` |
| Editor/viewers | Monaco, React Markdown | `src/renderer/src/components/viewers` |
| LLM core | workspace package `@janusx/llm-core` | `packages/llm-core` |
| AI SDK | Vercel AI SDK (`ai` package) | `src/main/agent/loop/vercel-stream-adapter.ts`, `src/main/llm/ai-runtime.ts` |
| i18n | i18next, react-i18next | `src/renderer/src/i18n/`, `i18next-parser.config.ts` |
| Remote comms | Lark/Feishu SDK | `@larksuiteoapi/node-sdk`, `src/main/remote-notifications/` |
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
| Project detection/run configs | `src/main/project/`, `src/main/ipc/project-handlers.ts` |
| Agent CLI streaming | `src/main/agent/stream-manager.ts`, `src/main/ipc/agent-handlers.ts` |
| Agent runtime (workspace tools) | `src/main/agent/runtime/`, `src/main/ipc/agent-runtime-handlers.ts` |
| Janus agent loop | `src/main/agent/loop/`, `src/main/llm/chat-orchestrator.ts` |
| Companion gateway (Feishu) | `src/main/companion/`, `src/main/remote-notifications/` |
| Browser surface | `src/main/browser/surface-manager.ts`, `src/main/ipc/browser-handlers.ts` |
| Language service (clangd) | `src/main/language-service/`, `src/main/ipc/language-service-handlers.ts` |
| Checkpoints | `src/main/agent/checkpoint/`, `src/main/ipc/checkpoint-handlers.ts` |
| LLM config/chat | `src/main/llm/`, `src/main/ipc/llm-handlers.ts`, `packages/llm-core` |
| Knowledge workbench | `src/main/knowledge/`, `src/main/ipc/knowledge-handlers.ts` |
| Office tooling | `src/main/office/`, `src/main/ipc/office-handlers.ts` |
| Janus Blueprint + maintenance | `src/main/janus/`, `src/main/janus/maintenance/`, `src/renderer/src/components/blueprint/` |
| Janus chat | `src/main/janus/chat-store.ts`, `src/main/ipc/janus-chat-handlers.ts`, `src/renderer/src/components/janus/` |
| i18n | `src/renderer/src/i18n/`, `i18next-parser.config.ts` |
| Release verification | `package.json`, `tests/e2e/desktop-smoke.spec.ts` |
