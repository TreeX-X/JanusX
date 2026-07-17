# Architecture

Last analyzed: 2026-07-17

## Layer Model

JanusX follows a standard Electron split:

| Layer | Key Files | Responsibility |
|---|---|---|
| Main process | `src/main/index.ts`, `src/main/bootstrap/`, `src/main/windows/`, `src/main/ipc/register.ts` | App lifecycle coordination, service composition, window policy, and domain IPC registration |
| Preload bridge | `src/preload/index.ts` | Exposes fixed typed domain APIs; no generic channel bridge |
| Renderer | `src/renderer/src` | React UI, Zustand state, IPC service wrappers |
| Shared | `src/shared`, `src/shared/ipc/*` | pure cross-process utilities, DTOs, channel constants, and typed domain API contracts |
| Package workspace | `packages/llm-core` | provider abstraction and LLM adapters consumed by main process |

`electron.vite.config.ts` declares three build inputs:

- main: `src/main/index.ts`
- preload: `src/preload/index.ts`
- renderer: `src/renderer/index.html`

Renderer alias `@` maps to `src/renderer/src`.

## Main Process Composition

`src/main/index.ts` coordinates lifecycle; window construction and ordered IPC registration are delegated to `src/main/windows/` and `src/main/ipc/register.ts`:

| Registrar | Subsystem |
|---|---|
| `registerWorkspaceHandlers` | workspace CRUD/file tree/window-level workspace operations |
| `registerTerminalHandlers` | node-pty terminals, terminal I/O, checkpoint enqueue/finalize, terminal-close Janus analysis |
| `registerGitHandlers` | status/log/stage/unstage/commit/push/pull/diff support |
| `registerAgentHandlers` | start/cancel/list Agent CLI sessions |
| `registerCheckpointHandlers` | manual checkpoint operations and diff/restore |
| `registerFileHandlers` | file read/write/viewer support |
| `registerProjectHandlers` | project detection, launch config, process runner |
| `registerLlmHandlers` | provider config, test connection, chat, streaming chat |
| `registerJanusHandlers` | Blueprint CRUD, Janus focus/bind/analyze/apply/candidates |
| `registerRuntimeTelemetryHandlers` | runtime context/model telemetry |
| `registerSettingsHandlers` | notification settings |
| `registerSubAgentRunHandlers` | Subagent run lifecycle and streamed events |
| `registerKnowledgeHandlers` | Knowledge workbench, context, review, truth, feedback, and maintenance operations |
| `registerOfficeHandlers` | guarded Office artifact, CLI, watcher, and export operations |

On app quit, `AppShutdown` coordinates chat-stream abort, Janus analysis cancellation, terminal/Agent/project shutdown, Office watcher and artifact cleanup, workspace watcher disposal, toast destruction, and editor-window closure.

## IPC Boundary

`src/preload/index.ts` is the completed typed security boundary:

- Workspace/File/FileTree contracts live in `src/shared/ipc/workspace.ts` and are exposed as `window.electron.workspace`, `fileTree`, and `file`.
- Terminal contracts live in `src/shared/ipc/terminal.ts` and are exposed as `window.electron.terminal`.
- Project request/response contracts live in `src/shared/ipc/project.ts` and are exposed as `window.electron.project`; `services/project.ts` is the sole renderer client.
- Knowledge and Knowledge Settings contracts live in `src/shared/ipc/knowledge.ts` and are exposed as `window.electron.knowledge`; existing renderer service exports delegate only to that API.
- Blueprint/Janus models live in `src/shared/janus/types.ts`; 22 commands and two Island events are declared in `src/shared/ipc/janus.ts` and exposed as `window.electron.janus`.
- The generic `invoke/send/on` surface and allowlists have been removed.
- Every renderer-accessible domain has shared channel constants/types and a fixed API.
- Typed event adapters hide Electron event objects and remove the exact registered listener on unsubscribe.

Add or change the shared contract first, then update the main handler/producer, fixed preload method, renderer caller, and contract tests together. Never reintroduce a generic string bridge.

Project running state and output currently synchronize by guarded polling. `ProjectRunner` lifecycle events remain main-internal until a product decision defines a renderer event contract.

Knowledge auto-prune is retained as an explicit typed maintenance API. Archive and compact remain main-internal maintenance capabilities.

`services/blueprint.ts` remains the renderer facade for Blueprint/Janus. Canonical models are shared, while `features/blueprint/canvas-layout.ts` and `useBlueprintAnalysisActions.ts` own layout derivation and analysis orchestration outside `BlueprintCanvas`.

## Verification Boundary

`npm run verify` is the release gate enforced by `.github/workflows/verify.yml` on Windows. Root typecheck resolves LLM Core from source so it works before generated output exists; after both type checks, the gate materializes the LLM Core package required by root runtime tests. It then runs both test suites, strict unused-symbol validation, one production build, package-boundary validation, and the already-built Electron desktop smoke.

`playwright.desktop.config.ts` launches `out/main/index.js` without a web server and exercises the fixed Workspace, Terminal, and Project preload APIs using isolated temporary state. The existing `playwright.config.ts` remains the browser-only Island harness; each configuration explicitly collects only its own test surface.

## Renderer State Pattern

Renderer code generally follows:

```text
Component -> Zustand store or service wrapper -> typed window.electron domain API -> main handler -> main service
```

Examples:

| Renderer Area | Store/Service | Main Counterpart |
|---|---|---|
| Workspaces/terminal layout | `stores/workspace.ts` | `ipc/handlers.ts`, `ipc/terminal-handlers.ts` |
| Checkpoints | `stores/checkpoint.ts` | `ipc/checkpoint-handlers.ts`, `agent/checkpoint/*` |
| Blueprint | `stores/blueprint.ts`, `services/blueprint.ts` | `ipc/janus-handlers.ts`, `janus/*` |
| Project launcher | `services/project.ts` | `ipc/project-handlers.ts`, `project/*` |
| LLM chat/config | `services/llm.ts` | `ipc/llm-handlers.ts`, `llm/*`, `packages/llm-core` |

## Data Persistence

| Data | Location | Owner |
|---|---|---|
| Global app config | `{userData}/janusx/config.json` | `src/main/config/service.ts` |
| LLM providers | `{userData}/janusx/llm-config.json` | `src/main/llm/ConfigStore.ts` |
| Workspaces metadata | `{userData}/janusx/workspaces` | `src/main/ipc/handlers.ts`, Janus store workspace records |
| Blueprint JSON | `{userData}/janusx/blueprints/{id}.json` and `index.json` | `src/main/janus/blueprint-store.ts` |
| Legacy Blueprint JSON | `{workspace}/.janusX/blueprints` | migrated/read by `blueprint-store.ts` |
| Project launch config | `{workspace}/.janusX/janusX.launch.json` | `src/main/project/config/project-config.ts` |
| Checkpoints | `{workspace}/.janusX/checkpoints` | `src/main/agent/checkpoint/checkpoint-manager.ts` |

## LLM Core Package

`packages/llm-core` is a workspace package exported as `@janusx/llm-core`. It provides:

- `ProviderSettings`, `ProviderExtension`, `ModelInfo`, `AuthType`,
- `ExtensionRegistry` singleton,
- `ProviderFactory` singleton and model cache,
- OpenAI Compatible and Vertex AI adapters,
- provider metadata loader from `registry/providers.json`,
- validation, proxy, stream compatibility, and error utilities.

Main process code uses it through `src/main/llm/LlmService.ts`.
