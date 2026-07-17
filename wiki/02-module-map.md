# Module Map

Last analyzed: 2026-07-17

## Main Process Modules

| Module | Primary Files | Responsibility |
|---|---|---|
| App shell | `src/main/index.ts`, `src/main/bootstrap/`, `src/main/windows/`, `src/main/ipc/register.ts` | Electron lifecycle, service graph, window creation, and IPC composition |
| Workspace config | `src/main/config/service.ts`, `src/main/workspace/types.ts` | global config, recent workspaces, CLI registrations |
| Workspace/files IPC | `src/main/ipc/handlers.ts`, `src/main/ipc/file-handlers.ts` | workspace persistence, file tree, file content operations |
| Terminal backend | `src/main/terminal/manager.ts`, `src/main/terminal/presets.ts`, `src/main/terminal/health.ts` | pty lifecycle, default shells, preset metadata, health checks |
| Terminal IPC | `src/main/ipc/terminal-handlers.ts` | create/kill/input/resize terminals, connect terminals to checkpoints and Janus analysis |
| Git | `src/main/git/service.ts`, `src/main/ipc/git-handlers.ts` | status/log/stage/commit/push/pull and commit diffs |
| Agent streaming | `src/main/agent/stream-manager.ts`, `src/main/agent/cli-resolver.ts`, `src/main/agent/parsers/*`, `src/main/ipc/agent-handlers.ts` | spawn Claude/Codex/OpenCode CLIs, parse JSON events, manage concurrency/cancel |
| Checkpoint | `src/main/agent/checkpoint/*`, `src/main/ipc/checkpoint-handlers.ts` | workspace snapshots, blob store, diffs, restore, conflicts |
| Project runtime | `src/main/project/*`, `src/main/ipc/project-handlers.ts` | detect project type, manage `.janusX/janusX.launch.json`, build commands, run/stop processes |
| LLM | `src/main/llm/*`, `src/main/ipc/llm-handlers.ts` | provider config, model creation, connection test, non-stream and stream chat |
| Janus Blueprint | `src/main/janus/*`, `src/main/ipc/janus-handlers.ts` | Blueprint CRUD, node focus/bind, commit-diff analysis, candidate requirements |
| Knowledge | `src/main/knowledge/*`, `src/main/ipc/knowledge-handlers.ts` | observations, search/context, review/truth, feedback, configuration, and explicit maintenance |
| Office | `src/main/office/*`, `src/main/ipc/office-handlers.ts` | guarded Office CLI installation, artifacts, watchers, previews, and exports |
| Subagent runs | `src/main/agent/subagent-run-registry.ts`, `src/main/ipc/subagent-run-handlers.ts` | Subagent run tracking, process lifecycle, and renderer events |
| Runtime telemetry | `src/main/runtime-telemetry/history.ts`, `src/main/ipc/runtime-telemetry-handlers.ts` | terminal model/context telemetry history |
| Notifications | `src/main/notifications/*`, `src/main/ipc/settings-handlers.ts` | Agent hooks, remote/desktop notification delivery, toast windows, and settings |
| Coordinated shutdown | `src/main/shutdown/AppShutdown.ts` | bounded cleanup across chat, analysis, terminals, Agents, projects, Office, watchers, and windows |

## Renderer Modules

| Module | Primary Files | Responsibility |
|---|---|---|
| App shell | `src/renderer/src/App.tsx`, `main.tsx`, `styles/globals.css` | top-level layout, providers, and global styles |
| Workspace state/actions | `stores/workspace.ts`, `features/workspace/*`, `types/index.ts`, `types/project.ts` | active workspace, bootstrap, file-tree actions, terminals, and pane tree |
| App state | `stores/app.ts` | selected panels, load state, Blueprint/Janus runtime flags |
| Terminal UI | `components/TerminalArea.tsx`, `CLITerminal.tsx`, `TerminalSelector.tsx`, `features/terminal/useTerminalLifecycle.ts`, `lib/workspace-pane.ts` | terminal panes, tabs, drag split, xterm component, and lifecycle subscription boundary |
| File/editor UI | `components/FileEditor.tsx`, `components/viewers/*`, `stores/editor.ts` | Monaco/Markdown/HTML/Image/Binary viewers |
| Sidebar/status/titlebar | `components/Sidebar.tsx`, `StatusBar.tsx`, `Titlebar.tsx` | shell navigation and top controls |
| Project launcher | `components/ProjectLauncher.tsx`, `ProjectSettings.tsx`, `ProjectRunningList.tsx`, `ProjectConfigForm/*`, `services/project.ts` | typed detect/configure/run client, lifecycle-safe actions, and guarded polling |
| Knowledge workbench | `components/knowledge/*`, `services/knowledge.ts`, `services/knowledge-settings.ts` | typed workbench/search/context/review/truth/feedback/settings client with isolated read fallbacks |
| LLM config/chat service | `components/LlmConfigModal.tsx`, `services/llm.ts` | provider CRUD, test, chat, streaming chat subscription |
| Blueprint UI | `components/blueprint/*`, `features/blueprint/*`, `stores/blueprint.ts`, `services/blueprint.ts` | React Flow views/store over the fixed typed client, with layout derivation and analysis actions extracted from the canvas |
| Janus island/chat | `components/janus/*` | titlebar island, animated state, chat panel, streaming printer |
| Checkpoint UI | `components/CheckpointPanel.tsx`, `stores/checkpoint.ts` | checkpoint list, diff, restore |
| Git UI | `components/GitPanel.tsx`, `stores/git.ts` | git status/action panel |

## Shared Modules

| File | Purpose |
|---|---|
| `src/shared/ipc/workspace.ts` | Workspace/File/FileTree channel constants, DTOs, result/event types, and preload domain API contract |
| `src/shared/ipc/terminal.ts` | Terminal command/event constants, payload/result types, and preload domain API contract |
| `src/shared/ipc/project.ts` | Project command constants, clone-safe DTOs/results, and the 11-operation preload domain API contract |
| `src/shared/ipc/knowledge.ts` | 25 public Knowledge/Settings command constants, clone-safe request/result types, and preload domain API contract |
| `src/shared/ipc/agent.ts`, `checkpoint.ts`, `git.ts`, `llm.ts`, `settings.ts`, `system.ts` | Remaining fixed domain contracts and preload APIs |
| `src/shared/janus/types.ts`, `src/shared/ipc/janus.ts` | canonical Blueprint/Janus models plus 22 command and two event contracts |
| `src/shared/office.ts` | structured-clone-safe Office request/result and artifact models |
| `src/shared/terminalLaunch.ts` | canonical terminal presets: `shell`, `claude`, `codex`, `opencode`; builds auto commands |
| `src/shared/notifications.ts` | notification settings type/defaults/normalization |
| `src/shared/janus/persona.ts` | Janus system persona exposed through preload as `janusPersona` |

## LLM Core Package

| Path | Purpose |
|---|---|
| `packages/llm-core/src/core/types.ts` | provider/auth/model/config interfaces |
| `packages/llm-core/src/core/ExtensionRegistry.ts` | provider registry singleton |
| `packages/llm-core/src/core/ProviderFactory.ts` | adapter resolution, model creation/cache, validation |
| `packages/llm-core/src/adapters/openai-compatible` | OpenAI-compatible API key provider |
| `packages/llm-core/src/adapters/vertex-ai` | Google Vertex AI provider |
| `packages/llm-core/src/registry/loader.ts` | metadata loader for providers |
| `packages/llm-core/src/utils/*` | validation, proxy, errors, AI SDK stream compatibility |
