# File Index

Last analyzed: 2026-06-30

Use this as a lookup table before opening source.

## Root

| File | Function |
|---|---|
| `package.json` | root scripts, dependencies, workspace declaration |
| `electron.vite.config.ts` | main/preload/renderer build entries and renderer alias |
| `tsconfig.json` | strict TS config, renderer alias, `ai` package path aliases |
| `electron-builder.yml` | packaging config |
| `vitest.config.ts` | root unit test config |
| `AGENTS.md`, `CLAUDE.md` | project-specific Agent workflow and file operation rules |

## Main Process

| File / Directory | Function |
|---|---|
| `src/main/index.ts` | main Electron entry; creates window; registers all IPC handlers |
| `src/main/window.ts` | reusable BrowserWindow factory |
| `src/main/config/service.ts` | global config persistence in `userData/janusx/config.json` |
| `src/main/workspace/types.ts` | workspace/global config types |
| `src/main/ipc/handlers.ts` | workspace and file tree handlers |
| `src/main/ipc/file-handlers.ts` | file read/write/detail handlers |
| `src/main/ipc/git-handlers.ts` | git IPC |
| `src/main/ipc/terminal-handlers.ts` | terminal IPC plus checkpoint queue and terminal-close Janus hook |
| `src/main/ipc/project-handlers.ts` | project detection/config/run/list/get/schemas IPC |
| `src/main/ipc/agent-handlers.ts` | Agent process start/cancel/list IPC |
| `src/main/ipc/checkpoint-handlers.ts` | checkpoint create/finalize/restore/list/diff/delete IPC |
| `src/main/ipc/llm-handlers.ts` | LLM provider/chat/stream IPC |
| `src/main/ipc/janus-handlers.ts` | Blueprint and Janus analysis IPC |
| `src/main/ipc/runtime-telemetry-handlers.ts` | runtime telemetry IPC |
| `src/main/ipc/settings-handlers.ts` | notification settings IPC |

## Terminal

| File | Function |
|---|---|
| `src/main/terminal/manager.ts` | node-pty instance lifecycle; Windows ConPTY bundling helper |
| `src/main/terminal/presets.ts` | main-side terminal preset config and default shell helpers |
| `src/main/terminal/health.ts` | simple terminal health checker |
| `src/main/terminal/types.ts` | terminal backend types |
| `src/shared/terminalLaunch.ts` | shared preset metadata and auto-command resolution |
| `src/renderer/src/components/TerminalArea.tsx` | terminal pane UI and drag/split orchestration |
| `src/renderer/src/components/CLITerminal.tsx` | xterm terminal component |
| `src/renderer/src/lib/workspace-pane.ts` | pure pane tree operations |
| `tests/unit/workspace-pane.test.ts` | pane tree behavior tests |
| `tests/unit/terminal*.test.ts` | terminal/prompt transaction tests |

## Project Runner

| File | Function |
|---|---|
| `src/main/project/types.ts` | project/launch/process/config types |
| `src/main/project/config/project-schemas.ts` | project type schemas and feature-file detection |
| `src/main/project/config/project-config.ts` | `.janusX/janusX.launch.json` read/write/validate/merge |
| `src/main/project/detector/detector.ts` | project type detection and recommended config |
| `src/main/project/runner/command-builder.ts` | builds executable command per project type |
| `src/main/project/runner/runner.ts` | child process lifecycle and output/ready events |
| `src/main/project/utils/port-extractor.ts` | extract dev server ports from output |
| `src/renderer/src/components/ProjectLauncher.tsx` | project launcher wrapper UI |
| `src/renderer/src/components/ProjectSettings.tsx` | project detection/config editing UI |
| `src/renderer/src/components/ProjectRunningList.tsx` | run/stop/list output UI |
| `src/renderer/src/services/project.ts` | renderer IPC wrapper |

## Agent And Checkpoint

| File | Function |
|---|---|
| `src/main/agent/types.ts` | shared agent event/session/spawn types |
| `src/main/agent/cli-resolver.ts` | resolves CLI commands across PATH/common folders |
| `src/main/agent/stream-manager.ts` | queue/concurrency/spawn/event/cancel manager |
| `src/main/agent/parsers/claude-parser.ts` | Claude JSON event parser |
| `src/main/agent/parsers/codex-parser.ts` | Codex JSON event parser |
| `src/main/agent/parsers/opencode-parser.ts` | OpenCode JSON event parser |
| `src/main/agent/checkpoint/checkpoint-manager.ts` | checkpoint lifecycle, snapshot, restore, diff |
| `src/main/agent/checkpoint/blob-store.ts` | content-addressed blob storage |
| `src/main/agent/checkpoint/git-adapter.ts` | git helpers for checkpoints |
| `src/main/agent/checkpoint/diff-engine.ts` | unified diff and merge conflict helpers |
| `src/renderer/src/stores/agent.ts` | renderer agent sessions/events state |
| `src/renderer/src/stores/checkpoint.ts` | renderer checkpoint state/actions |
| `src/renderer/src/components/CheckpointPanel.tsx` | checkpoint list/diff/restore UI |
| `tests/unit/agent/*` | parser, stream manager, checkpoint, blob, diff tests |

## LLM

| File | Function |
|---|---|
| `src/main/llm/ConfigStore.ts` | provider config persistence |
| `src/main/llm/LlmService.ts` | adapter registration, proxy setup, model creation, provider CRUD |
| `src/renderer/src/services/llm.ts` | renderer provider/chat/stream wrapper |
| `src/renderer/src/components/LlmConfigModal.tsx` | provider config modal |
| `packages/llm-core/src/index.ts` | public exports for package |
| `packages/llm-core/src/core/*` | provider interfaces, registry, factory |
| `packages/llm-core/src/adapters/*` | OpenAI-compatible and Vertex AI adapters |
| `packages/llm-core/src/utils/*` | validation, proxy, stream compatibility, errors |
| `packages/llm-core/src/registry/*` | provider metadata loader/config |

## Janus And Blueprint

| File | Function |
|---|---|
| `src/shared/janus/persona.ts` | Janus system persona |
| `src/main/janus/types.ts` | Blueprint domain model |
| `src/main/janus/blueprint-store.ts` | Blueprint persistence, migration, CRUD, node updates, candidates |
| `src/main/janus/analyzer.ts` | commit-diff segmentation, LLM analysis, result merge/apply |
| `src/renderer/src/services/blueprint.ts` | renderer IPC wrapper for Blueprint/Janus |
| `src/renderer/src/stores/blueprint.ts` | Blueprint Zustand state |
| `src/renderer/src/components/blueprint/BlueprintView.tsx` | Blueprint list, candidates, notices |
| `src/renderer/src/components/blueprint/BlueprintCanvas.tsx` | graph canvas and node work-session orchestration |
| `src/renderer/src/components/blueprint/BlueprintNodeCard.tsx` | React Flow node card |
| `src/renderer/src/components/blueprint/blueprintStatus.ts` | status labels/visuals |
| `src/renderer/src/components/janus/*` | Janus island, eye, expanded UI, chat, hooks |

## Tests

| Area | Files |
|---|---|
| Root workspace/config | `tests/unit/workspace.test.ts` |
| Terminal | `tests/unit/terminal.test.ts`, `tests/unit/terminal-input-transaction.test.ts` |
| Pane tree | `tests/unit/workspace-pane.test.ts` |
| Agent parsers/stream | `tests/unit/agent/*parser.test.ts`, `stream-manager.test.ts` |
| Checkpoint | `tests/unit/agent/checkpoint-manager.test.ts`, `blob-store.test.ts`, `diff-engine.test.ts` |
| Notifications | `tests/unit/agent-notifier.test.ts` |
| LLM core | `packages/llm-core/tests/*.test.ts` |

