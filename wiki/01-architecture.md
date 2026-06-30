# Architecture

Last analyzed: 2026-06-30

## Layer Model

JanusX follows a standard Electron split:

| Layer | Key Files | Responsibility |
|---|---|---|
| Main process | `src/main/index.ts`, `src/main/window.ts` | App lifecycle, BrowserWindow, IPC registration, Node-side services |
| Preload bridge | `src/preload/index.ts` | Exposes `window.electron` with channel allowlists for invoke/send/on |
| Renderer | `src/renderer/src` | React UI, Zustand state, IPC service wrappers |
| Shared | `src/shared` | small pure utilities/types reused by main and renderer |
| Package workspace | `packages/llm-core` | provider abstraction and LLM adapters consumed by main process |

`electron.vite.config.ts` declares three build inputs:

- main: `src/main/index.ts`
- preload: `src/preload/index.ts`
- renderer: `src/renderer/index.html`

Renderer alias `@` maps to `src/renderer/src`.

## Main Process Composition

`src/main/index.ts` creates the main window and registers these IPC modules:

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

On app quit, `terminalManager.killAll()` is called.

## IPC Boundary

`src/preload/index.ts` is the security boundary. It contains:

- `ALLOWED_INVOKE_CHANNELS` for request/response calls,
- `ALLOWED_SEND_CHANNELS` for fire-and-forget events,
- `ALLOWED_ON_CHANNELS` for renderer subscriptions,
- `contextBridge.exposeInMainWorld('electron', ...)`.

Any new renderer-to-main IPC must be added both to a main handler and to the relevant preload allowlist.

## Renderer State Pattern

Renderer code generally follows:

```text
Component -> Zustand store or service wrapper -> window.electron IPC -> main handler -> main service
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

