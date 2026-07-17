# Runtime Flows

Last analyzed: 2026-07-17

## App Boot

```text
electron-vite main entry
-> src/main/index.ts
-> create BrowserWindow
-> register IPC handlers
-> load renderer URL/file
-> renderer uses preload window.electron bridge
```

Key files: `electron.vite.config.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/main.tsx`.

## IPC Flow

Migrated domains use a typed path:

```text
Renderer component/store/service
-> window.electron.workspace/fileTree/file/terminal/project/knowledge
-> fixed preload adapter
-> shared channel constant + typed payload
-> src/main/ipc/* handler or main event producer
-> result/event back through the typed domain API
```

Other domains temporarily retain the legacy path:

```text
Renderer wrapper -> window.electron.invoke/send/on -> preload allowlist -> main handler
```

When adding IPC:

1. Add or update a pure contract under `src/shared/ipc/`.
2. Register the main handler/listener or producer with shared channel constants.
3. Expose fixed typed methods/events from `src/preload/index.ts`; do not add migrated channels to generic allowlists.
4. Use the typed domain API from renderer components/stores/services.
5. Add contract tests for registration, argument order, generic rejection, and event unsubscribe behavior.

Workspace/File/FileTree, Terminal, Project, and public Knowledge request/response operations follow this design today. Janus/Blueprint, LLM, Office, agent, checkpoint, notification settings, and other domains remain incremental migration work.

## Terminal Creation And Checkpointing

```text
TerminalArea preset click
-> shared resolveTerminalLaunchCommand
-> window.electron.terminal.create
-> TerminalManager.create
-> node-pty spawn
-> typed terminal data / exit events
-> window.electron.terminal.submitLine records user prompt
-> CheckpointManager.finalizeAndCreateCheckpoint
-> checkpoint:event / checkpoint:ready
```

Important details:

- Presets are canonicalized in `src/shared/terminalLaunch.ts`.
- Main-side pty lifecycle is in `src/main/terminal/manager.ts`.
- `src/main/ipc/terminal-handlers.ts` couples terminal lifecycle to checkpoint creation and terminal-close Janus analysis.
- Checkpoints are stored under the workspace `.janusX/checkpoints`.

## Checkpoint Restore

```text
CheckpointPanel
-> checkpoint:restore IPC
-> CheckpointManager.restoreCheckpoint
-> compare current files to stored hashes
-> write restored content or conflict markers
-> delete checkpoints after restored conversation point
```

Core files:

- `checkpoint-manager.ts` stores snapshot indexes and orchestrates restore.
- `blob-store.ts` stores content-addressed file blobs.
- `diff-engine.ts` creates unified diffs and simple three-way merge conflict output.
- `git-adapter.ts` gets branch/tracked file info.

## Project Detection And Run

```text
ProjectLauncher / ProjectSettings
-> projectService
-> window.electron.project typed preload API
-> shared Project channel and result contract
-> ProjectDetector reads feature files/package manifests
-> ProjectConfig creates/validates .janusX/janusX.launch.json
-> ProjectRunningList guarded run/list/get/stop polling
-> ProjectRunner
-> CommandBuilder
-> child process spawn
-> serialized list/output polling back to renderer state
```

`ProjectRunner` started/output/ready/exit/error events remain internal to main. The renderer does not subscribe to a parallel event protocol; polling is immediate, non-overlapping, lifecycle-cancelled, and guarded against stale path/action completions.

Supported project types include Next.js, Vite, Electron Vite, CRA, Remix, Rust, Go, C++ CMake, C++ Make, Django, Flask, FastAPI, Laravel, Unknown, and Custom.

## Agent CLI Streaming

```text
agent:start IPC
-> AgentStreamManager.start
-> resolveCLIPath
-> spawn claude/codex/opencode
-> parse stdout JSON lines through engine parser
-> agent:event sent to renderer
-> agent:listSessions / cancel / cancelAll
```

Concurrency defaults to 3 sessions. Parsers normalize engine-specific JSON into shared `AgentEvent` shapes.

## LLM Chat

```text
Janus chat or service caller
-> services/llm.ts chat/chatStream
-> llm:chat or llm:chat-stream IPC
-> LlmService
-> @janusx/llm-core ProviderFactory
-> adapter language model
-> ai SDK generate/stream calls
-> llm:chat:delta/done/error events for stream mode
```

Provider settings live in `{userData}/janusx/llm-config.json`. Main process supports OpenAI-compatible and Vertex AI adapters through `packages/llm-core`.

## Blueprint And Janus Analysis

```text
BlueprintView / BlueprintCanvas
-> services/blueprint.ts
-> janus/blueprint IPC
-> BlueprintStore JSON persistence
-> JanusAnalyzer for commit-diff analysis
-> LLM structured result
-> analysis history stored on node
-> optional apply patch / accept discovered requirement
```

Key concepts from `src/main/janus/types.ts`:

- `Blueprint`: global planning graph with nodes and canvas layout.
- `BlueprintNode`: epic/feature/task/issue node with status, progress, features, issues, activities, analyses, workspace binding, terminal history.
- `BlueprintAnalysis`: structured LLM analysis result with evidence, unresolved items, feature updates, discovered requirements.
- `BlueprintRequirementCandidate`: AI-discovered requirement that must be accepted/rejected by user.

Analyzer input source is git commit diffs. The source comment states it does not consume terminal output streams or checkpoint events directly.

## Knowledge Workbench And Context

```text
KnowledgeWorkbench / KnowledgeSettingsPanel / Janus context consumers
-> renderer Knowledge service exports
-> window.electron.knowledge fixed typed API
-> shared Knowledge channel and clone-safe DTO contract
-> Knowledge/settings handlers
-> contract, observation, search, context, review, truth, operations, or config service
```

Workbench reads preserve independent fallbacks so one unavailable source does not erase successful parallel results. Direct search, context, review, truth, conflict, feedback, and settings calls propagate failures. Auto-prune, archive, and compact remain main-internal and are not renderer capabilities.
