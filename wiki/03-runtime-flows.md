# Runtime Flows

Last analyzed: 2026-06-30

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

```text
Renderer component/store/service
-> window.electron.invoke/send/on
-> preload channel allowlist
-> src/main/ipc/* handler
-> main-side service
-> result/event back to renderer
```

When adding IPC:

1. Add or update `src/main/ipc/<subsystem>-handlers.ts`.
2. Register it in `src/main/index.ts` if it is a new handler module.
3. Add channel to `src/preload/index.ts` allowlist.
4. Add renderer service/store wrapper.
5. Add tests if logic is pure or high risk.

## Terminal Creation And Checkpointing

```text
TerminalArea preset click
-> shared resolveTerminalLaunchCommand
-> terminal:create IPC
-> TerminalManager.create
-> node-pty spawn
-> terminal:data / terminal:exit events
-> terminal:submit-line records user prompt
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
-> project:detect-with-details
-> ProjectDetector reads feature files/package manifests
-> ProjectConfig creates/validates .janusX/janusX.launch.json
-> ProjectRunningList project:run
-> ProjectRunner
-> CommandBuilder
-> child process spawn
-> project started/output/ready/exit events
```

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

