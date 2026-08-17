# Architecture

Last analyzed: 2026-08-17

## Layer Model

JanusX follows a standard Electron split:

| Layer | Key Files | Responsibility |
|---|---|---|
| Main process | `src/main/index.ts`, `src/main/bootstrap/`, `src/main/windows/`, `src/main/ipc/register.ts` | App lifecycle coordination, service composition, window policy, and domain IPC registration |
| Preload bridge | `src/preload/index.ts` | Exposes fixed typed domain APIs; no generic channel bridge |
| Renderer | `src/renderer/src` | React UI, Zustand state, IPC service wrappers, i18n |
| Shared | `src/shared`, `src/shared/ipc/*` | pure cross-process utilities, DTOs, channel constants, typed domain API contracts |
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
| `registerAgentRuntimeHandlers` | workspace agent runtime sessions, tool execution, approval flow (registered before window-scoped domains) |
| `registerWorkspaceHandlers` | workspace CRUD/file tree/window-level workspace operations |
| `registerTerminalHandlers` | node-pty terminals, terminal I/O, checkpoint enqueue/finalize, terminal-close Janus analysis |
| `registerBrowserHandlers` | embedded browser surface lifecycle (panes and standalone windows) |
| `registerGitHandlers` | status/log/stage/unstage/commit/push/pull/diff/fileBaseline support |
| `registerAgentHandlers` | start/cancel/list Agent CLI sessions (Claude/Codex/OpenCode) |
| `registerCheckpointHandlers` | manual checkpoint operations and diff/restore |
| `registerFileHandlers` | file read/write/viewer/sourceFiles support |
| `registerProjectHandlers` | project detection, launch config, process runner |
| `registerLlmHandlers` | provider config, model catalog, test connection, chat, streaming chat |
| `registerJanusHandlers` | Blueprint CRUD, Janus focus/bind/analyze/apply/candidates |
| `registerJanusChatHandlers` | Janus chat conversation load/save persistence |
| `registerRuntimeTelemetryHandlers` | runtime context/model telemetry history |
| `registerSettingsHandlers` | notification settings, Feishu control status |
| `registerLanguageHandlers` | language get/set (i18n) |
| `registerLanguageServiceHandlers` | clangd LSP go-to-definition |
| `registerSubAgentRunHandlers` | Subagent run lifecycle and streamed events |
| `registerKnowledgeHandlers` | Knowledge workbench, context, review, truth, feedback, and maintenance operations |
| `registerOfficeHandlers` | guarded Office artifact, CLI, watcher, and export operations |

IPC registration uses window-scoped getters (not captured values) so macOS activate / second-instance window rebuilds keep event delivery valid. `applicationIpcRegistered` guards against duplicate handler registration.

On app quit, `AppShutdown` coordinates chat-stream abort, Janus analysis cancellation, Janus chat store, terminal/Agent/project shutdown, companion session cleanup, remote notification dispatcher, Office watcher and artifact cleanup, workspace watcher disposal, browser surface disposal, clangd manager shutdown, toast destruction, and editor-window closure.

## IPC Boundary

`src/preload/index.ts` is the completed typed security boundary. It exposes 24 typed domain APIs plus platform/build info and `janusPersona`:

- `workspace`, `fileTree`, `file` - Workspace/File/FileTree (`src/shared/ipc/workspace.ts`)
- `terminal` - Terminal (`src/shared/ipc/terminal.ts`)
- `project` - Project (`src/shared/ipc/project.ts`)
- `browser` - Browser surface (`src/shared/ipc/browser.ts`)
- `knowledge` - Knowledge workbench (`src/shared/ipc/knowledge.ts`)
- `janus` - Blueprint/Janus (`src/shared/ipc/janus.ts`)
- `janusChat` - Janus chat persistence (`src/shared/ipc/janus-chat.ts`)
- `agent` - Agent CLI streaming (`src/shared/ipc/agent.ts`)
- `agentRuntime` - Workspace agent runtime (`src/shared/ipc/agent-runtime.ts`)
- `checkpoint` - Checkpoints (`src/shared/ipc/checkpoint.ts`)
- `git` - Git (`src/shared/ipc/git.ts`)
- `llm` - LLM config/chat/stream (`src/shared/ipc/llm.ts`)
- `office` - Office tooling (`src/shared/office.ts`)
- `notificationSettings` - Notification settings + Feishu control (`src/shared/ipc/settings.ts`)
- `subAgentRun` - Subagent runs (`src/shared/ipc/agent.ts`)
- `dialog`, `window`, `system` - System/Window/Dialog (`src/shared/ipc/system.ts`)
- `desktopToast` - Desktop toast (`src/shared/ipc/system.ts`)
- `languageService` - clangd go-to-definition (`src/shared/ipc/language-service.ts`)

The generic `invoke/send/on` surface and allowlists have been removed. Every renderer-accessible domain has shared channel constants/types and a fixed API. Typed event adapters hide Electron event objects and remove the exact registered listener on unsubscribe.

Add or change the shared contract first, then update the main handler/producer, fixed preload method, renderer caller, and contract tests together. Never reintroduce a generic string bridge.

Project running state and output synchronize by guarded polling. `ProjectRunner` lifecycle events remain main-internal until a product decision defines a renderer event contract.

## Renderer State Pattern

Renderer code follows:

```text
Component -> Zustand store or service wrapper -> typed window.electron domain API -> main handler -> main service
```

| Renderer Area | Store/Service | Main Counterpart |
|---|---|---|
| Workspaces/terminal layout | `stores/workspace.ts` | `ipc/handlers.ts`, `ipc/terminal-handlers.ts` |
| Browser surface | `stores/browser.ts`, `services/browser.ts` | `ipc/browser-handlers.ts`, `browser/surface-manager.ts` |
| Checkpoints | `stores/checkpoint.ts` | `ipc/checkpoint-handlers.ts`, `agent/checkpoint/*` |
| Blueprint + maintenance | `stores/blueprint.ts`, `stores/blueprint-maintenance.ts`, `services/blueprint.ts` | `ipc/janus-handlers.ts`, `janus/*`, `janus/maintenance/*` |
| Janus chat | `components/janus/JanusChatProvider.tsx`, `janusChatConversations.ts` | `ipc/janus-chat-handlers.ts`, `janus/chat-store.ts` |
| Project launcher | `services/project.ts` | `ipc/project-handlers.ts`, `project/*` |
| LLM config/chat | `services/llm.ts` | `ipc/llm-handlers.ts`, `llm/*`, `packages/llm-core` |
| Agent runtime | `stores/subagent-run.ts` | `ipc/agent-runtime-handlers.ts`, `agent/runtime/*` |
| Agent CLI streaming | `stores/app.ts` (agent events) | `ipc/agent-handlers.ts`, `agent/stream-manager.ts` |
| Knowledge | `services/knowledge.ts`, `services/knowledge-settings.ts` | `ipc/knowledge-handlers.ts`, `knowledge/*` |
| Office | `stores/office.ts`, `services/office.ts` | `ipc/office-handlers.ts`, `office/*` |
| Notes | `stores/note.ts` | (renderer-internal) |
| Right tools dock | `stores/right-tools.ts`, `right-tools/registry.ts` | (renderer-internal) |
| Editor | `stores/editor.ts` | `ipc/file-handlers.ts`, `language-service/*` |
| Git | `stores/git.ts` | `ipc/git-handlers.ts`, `git/service.ts` |

## Data Persistence

| Data | Location | Owner |
|---|---|---|
| Global app config | `{userData}/janusx/config.json` | `src/main/config/service.ts` |
| LLM providers | `{userData}/janusx/llm-config.json` | `src/main/llm/ConfigStore.ts` |
| Workspaces metadata | `{userData}/janusx/workspaces` | `src/main/ipc/handlers.ts` |
| Blueprint JSON | `{userData}/janusx/blueprints/{id}.json` and `index.json` | `src/main/janus/blueprint-store.ts` |
| Legacy Blueprint JSON | `{workspace}/.janusX/blueprints` | migrated/read by `blueprint-store.ts` |
| Janus chat conversations | `{userData}/janusx/janus-chat/` | `src/main/janus/chat-store.ts` |
| Project launch config | `{workspace}/.janusX/janusX.launch.json` | `src/main/project/config/project-config.ts` |
| Checkpoints | `{workspace}/.janusX/checkpoints` | `src/main/agent/checkpoint/checkpoint-manager.ts` |
| Policy audit records | `{userData}/janusx/policy-audit/` | `src/main/agent/runtime/policy-audit-store.ts` (FilePolicyAuditStore) |
| Companion audit | `{userData}/janusx/companion/` | `src/main/companion/audit-store.ts` |
| Companion bindings | in-memory | `src/main/companion/binding-store.ts` |
| Remote delivery store | `{userData}/janusx/remote-notifications/` | `src/main/remote-notifications/delivery-store.ts` |
| Knowledge data | `{userData}/janusx/knowledge/` | `src/main/knowledge/*` |
| Office artifacts | workspace `.janusX/office/` | `src/main/office/office-artifact-index.ts` |
| i18n locale bundles | `src/renderer/src/i18n/locales/{en,zh-CN}/` | bundled at build time |

## LLM Core Package

`packages/llm-core` is a workspace package exported as `@janusx/llm-core`. It provides:

- `ProviderSettings`, `ProviderExtension`, `ModelInfo`, `AuthType`,
- `ExtensionRegistry` singleton,
- `ProviderFactory` singleton and model cache,
- OpenAI Compatible and Vertex AI adapters,
- provider metadata loader from `registry/providers.json`,
- model registry with OpenRouter generated data, legacy overrides, and custom overrides,
- model normalization,
- validation, proxy, stream compatibility, and error utilities.

Main process code uses it through `src/main/llm/LlmService.ts` and `ModelCatalogService.ts`.

## Agent Runtime Architecture

The agent runtime (`src/main/agent/runtime/`) provides a workspace-scoped tool execution layer:

| Component | File | Responsibility |
|---|---|---|
| Runtime | `runtime.ts` | `WorkspaceAgentRuntime` - session lifecycle, tool execution, event emission |
| Tool registry | `registry.ts` | `ToolRegistry` - tool registration, input validation |
| Path guard | `path-guard.ts` | workspace-scoped path validation, trusted targets, read authorization |
| Policy gate | `policy-gate.ts` | sensitive-path detection, secret redaction, action policy evaluation, approval decisions |
| Policy audit | `policy-audit-store.ts` | `FilePolicyAuditStore` - persistent audit trail |
| File transaction | `file-transaction.ts` | workspace edit preparation, conflict detection, sha256 hashing |
| Renderer authorization | `renderer-authorization.ts` | authorize renderer-initiated actions |
| Tool result | `tool-result.ts` | convert tool results to model-compatible values |

Tool sets registered in `src/main/agent/runtime/tools/`:

- `workspace-tools.ts` - read, edit, create, list, search
- `git-tools.ts` - status, log, diff, stage, unstage, commit, pull, push
- `project-tools.ts` - detect, generateConfig, applyConfig, listProcesses, startProcess, processOutput, stopProcess
- `command-tools.ts` - command execution

## Companion Gateway Architecture

The companion gateway (`src/main/companion/`) enables Feishu (Lark) remote terminal control:

| Component | File | Responsibility |
|---|---|---|
| Gateway | `gateway.ts` | `CompanionGateway` - request routing, command dispatch |
| Binding store | `binding-store.ts` | `CompanionBindingStore` - maps Feishu sessions to terminals |
| Session state | `session-state.ts` | `CompanionSessionState` - engine type, terminal metadata |
| Action tokens | `action-token.ts` | `CompanionActionTokens` - token verification for card actions |
| Audit store | `audit-store.ts` | `CompanionAuditStore` - audit records |
| Dedupe | `dedupe.ts` | `CompanionDedupe` - event deduplication |
| Terminal control | `terminal-control.ts` | `MainProcessTerminalControl` - terminal I/O abstraction |
| Terminal creation rollback | `terminal-creation-rollback.ts` | cleanup on failed terminal creation |
| Workspace registry | `workspace-registry.ts` | registered workspace metadata |
| Contracts | `contracts.ts` | provider type, request context, commands, results, policies |

Remote notifications (`src/main/remote-notifications/`) handle outbound delivery and inbound Feishu message routing:

- `dispatcher.ts` - `RemoteNotificationDispatcher` - provider dispatch
- `providers/feishu-provider.ts` - Feishu card builder, action token issuer
- `feishu-inbound/` - inbound router, runtime, SDK channel, message normalization
- `delivery-store.ts` - `RemoteDeliveryStore` - delivery record persistence
- `secret-redaction.ts` - error text redaction
