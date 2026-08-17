# Runtime Flows

Last analyzed: 2026-08-17

## App Boot

```text
electron-vite main entry
-> src/main/index.ts
-> use the isolated JanusX-Dev profile for non-packaged development runs
-> configure session paths and dynamically compose application services
-> configure coordinated application shutdown
-> create main window through src/main/windows/main-window.ts
-> register IPC domains through src/main/ipc/register.ts
-> load renderer URL/file
-> renderer uses preload window.electron bridge
```

Key files: `electron.vite.config.ts`, `src/main/index.ts`, `src/main/bootstrap/{session,services}.ts`, `src/main/windows/*`, `src/main/ipc/register.ts`, `src/preload/index.ts`, and `src/renderer/src/main.tsx`.

Packaged JanusX keeps the existing production profile. Development runs use `%APPDATA%/JanusX-Dev` before Chromium session setup and `requestSingleInstanceLock()`, so one packaged instance and one development instance can coexist while each profile remains single-instance.

## IPC Flow

All renderer-accessible domains use the typed path:

```text
Renderer component/store/service
-> fixed window.electron domain API
-> fixed preload adapter
-> shared channel constant + typed payload
-> src/main/ipc/* handler or main event producer
-> result/event back through the typed domain API
```

When adding IPC:

1. Add or update a pure contract under `src/shared/ipc/`.
2. Register the main handler/listener or producer with shared channel constants.
3. Expose fixed typed methods/events from `src/preload/index.ts`; generic bridges are forbidden.
4. Use the typed domain API from renderer components/stores/services.
5. Add contract tests for registration, argument order, absence of generic bridges, and event unsubscribe behavior.

All 20+ renderer-accessible domains follow this design. No generic renderer bridge or preload channel allowlist remains.

## Terminal Creation And Checkpointing

```text
TerminalArea preset click
-> shared resolveTerminalLaunchCommand
-> window.electron.terminal.create (or warmup)
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
- `handleTerminalHostWindowClosed` disposes terminal resources when the host window closes.
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
ProjectLauncher / ProjectSettings / ProjectLaunchAssistant
-> projectService
-> window.electron.project typed preload API
-> shared Project channel and result contract
-> ProjectDetector reads feature files/package manifests
-> ProjectConfig creates/validates .janusX/janusX.launch.json
-> ProjectRunningList guarded run/list/get/stop polling
-> ProjectRunner -> CommandBuilder -> child process spawn
-> PortExtractor parses output for dev server URLs
-> serialized list/output polling back to renderer state
```

`ProjectRunner` started/output/ready/exit/error events remain internal to main. `TaskRunner` handles individual task lifecycle. The renderer does not subscribe to a parallel event protocol; polling is immediate, non-overlapping, lifecycle-cancelled, and guarded against stale path/action completions.

Supported project types include Next.js, Vite, Electron Vite, CRA, Remix, Rust, Go, C++ CMake, C++ Make, Django, Flask, FastAPI, Laravel, Unknown, and Custom.

## Agent CLI Streaming

```text
window.electron.agent.start
-> AgentStreamManager.start
-> resolveCLIPath (cli-resolver.ts)
-> spawn claude/codex/opencode
-> parse stdout JSON lines through engine-specific parsers
-> typed Agent event sent to renderer
-> window.electron.agent list/cancel operations
```

Concurrency defaults to 3 sessions. Parsers normalize engine-specific JSON into shared `AgentEvent` shapes. Agent hooks (`src/main/notifications/agent-hook-*`) coordinate terminal status and notifications via the hook lifecycle.

## Agent Runtime (Workspace Tools)

```text
window.electron.agentRuntime.createSession
-> WorkspaceAgentRuntime.createSession
-> tool execution via ToolRegistry
-> PolicyGate evaluates action risk (allow/deny/approval-required)
-> PathGuard validates workspace-scoped paths
-> WorkspaceEditConflictError on content mismatch
-> typed runtime events: session status, tool status, policy decisions, approvals
-> window.electron.agentRuntime.approve/deny for approval-required actions
```

Tool sets:

- Workspace tools: read, edit (with sha256 conflict detection), create, list, search (`rg`-based)
- Git tools: status, log, diff, stage, unstage, commit, pull, push
- Project tools: detect, generateConfig, applyConfig, listProcesses, startProcess, processOutput, stopProcess
- Command tools: execute shell commands

Policy audit records are persisted by `FilePolicyAuditStore` for compliance traceability.

## Janus Agent Loop

```text
JanusChat / chat-orchestrator
-> chat-orchestrator.ts creates ChatStreamRequest
-> ai-runtime.ts resolves Vercel AI SDK model from @janusx/llm-core
-> janus-agent-loop.ts drives the loop:
   - system prompt (janus persona + workspace context)
   - user message -> model stream -> tool calls
   - beforeToolCall / afterToolCall hooks (policy gate, audit)
   - runtime-tool-adapter.ts bridges ToolRegistry to JanusAgentTool
   - vercel-stream-adapter.ts adapts to Vercel AI SDK streaming format
-> typed delta/done/error events for stream mode
-> tool trace entries persisted in chat history
```

Key types from `src/main/agent/loop/janus-agent-loop.ts`:

- `JanusAgentMessage`, `JanusToolCall`, `JanusAgentToolResult`, `JanusAgentTool`
- `JanusAgentStreamResult`, `JanusAgentEvent`
- `JanusBeforeToolCallContext/Result`, `JanusAfterToolCallContext`
- `JanusAgentLoopConfig`

`createJanusRuntimeTools`, `createJanusRuntimeCodingTools`, `createJanusRuntimeReadOnlyTools` adapt runtime tools for agent loops with resource scoping.

## LLM Chat

```text
Janus chat or workspace chat
-> services/llm.ts chat/chatStream
-> window.electron.llm.chat or chatStream
-> LlmService -> chat-orchestrator
-> @janusx/llm-core ProviderFactory / ModelCatalogService
-> ai-runtime.ts Vercel AI SDK model resolution
-> workspace-chat-tools.ts creates workspace-scoped tools + system prompt
-> generate/stream calls
-> typed delta/done/error events for stream mode
```

Provider settings live in `{userData}/janusx/llm-config.json`. Main process supports OpenAI-compatible and Vertex AI adapters through `packages/llm-core`. `development-config-sync.ts` synchronizes installed LLM config to the dev profile on startup.

Workspace chat tools include: file read/search, project detect/config, and process management. `hasExplicitWorkspaceMutationIntent` detects when a user message implies file mutations.

## Blueprint And Janus Analysis

```text
BlueprintView / BlueprintCanvas
-> services/blueprint.ts
-> window.electron.janus fixed typed API
-> shared Blueprint/Janus command or Island event contract
-> BlueprintStore JSON persistence
-> JanusAnalyzer for commit-diff analysis
-> LLM structured result
-> analysis history stored on node
-> optional apply patch / accept discovered requirement
```

Key concepts from `src/shared/janus/types.ts`:

- `Blueprint`: global planning graph with nodes, relations, and canvas layout.
- `BlueprintNode`: epic/feature/task/issue node with status, progress, features, issues, activities, analyses, workspace binding, terminal history.
- `BlueprintAnalysis`: structured LLM analysis result with evidence, unresolved items, feature updates, discovered requirements.
- `BlueprintRequirementCandidate`: AI-discovered requirement that must be accepted/rejected by user.

Relations are governed by `src/shared/janus/relations.ts` which enforces acyclic constraints on `depends-on` and `blocks` types and sanitizes relation endpoints.

## Blueprint Maintenance

```text
BlueprintMaintenancePanel
-> stores/blueprint-maintenance.ts
-> window.electron.janus maintenance commands
-> BlueprintMaintenanceService (src/main/janus/maintenance/service.ts)
-> LLM-driven proposal generation (blueprint-tools.ts)
-> ChangeSet operations (changeset.ts):
   create/update/move/archive/delete nodes
   add/update/remove relations
   update workspace bindings
-> scopeNodeIds determines affected nodes
-> applyOperations mutates Blueprint
-> buildReverseOperations for undo
-> audit records persisted
```

Maintenance types from `src/shared/janus/maintenance-types.ts` define all operation variants, change-set status, task lifecycle, evidence manifests, and audit records. `BlueprintMaintenanceService` is a singleton that manages window references for event delivery.

## Browser Surface

```text
BrowserSurface / StandaloneBrowser
-> services/browser.ts
-> window.electron.browser typed API
-> BrowserSurfaceManager (src/main/browser/surface-manager.ts)
-> Electron BrowserView / BrowserWindow creation
-> normalizeBrowserUrl
-> tab state management (carrier: pane or window)
-> typed browser events: surface state, agent control
```

Browser surfaces support two carriers: `pane` (embedded in workspace) and `window` (standalone). URL normalization prepends `https://` when missing.

## Companion Gateway (Feishu Remote Control)

```text
Feishu inbound message
-> FeishuInboundRuntime (src/main/remote-notifications/feishu-inbound/runtime.ts)
-> FeishuInboundRouter parses command
-> CompanionGateway dispatches
-> CompanionBindingStore resolves terminal binding
-> CompanionActionTokens verify card action token
-> MainProcessTerminalControl sends input to terminal
-> CompanionAuditStore records action
-> CompanionDedupe prevents duplicate processing
-> receipt sent back to Feishu
```

Remote notifications outbound:

```text
Agent event / checkpoint / completion
-> RemoteNotificationDispatcher
-> FeishuRemoteNotificationProvider
-> buildFeishuCard / buildFeishuTerminalDiscoveryCard
-> Feishu SDK sends card
-> RemoteDeliveryStore records delivery
```

Inbound Feishu uses `@larksuiteoapi/node-sdk` with SDK channel abstraction (`feishu-inbound/sdk-channel.ts`).

## Language Service (clangd)

```text
Monaco editor go-to-definition
-> window.electron.languageService.definition
-> ClangdManager (src/main/language-service/clangd-manager.ts)
-> ClangdClient LSP message exchange
-> LspMessageBuffer frames JSON-RPC
-> normalizeDefinitionResult
-> returns file:line:column
```

`isPathWithinWorkspace` guards file access. `clangdManager` is a singleton that manages clangd process lifecycle.

## Janus Chat Persistence

```text
JanusChatProvider
-> janusChatConversations.ts manages conversation state
-> window.electron.janusChat.load / save
-> JanusChatStore (src/main/janus/chat-store.ts)
-> persisted in userData/janusx/janus-chat/
-> normalizeJanusChatSnapshot validates and normalizes on load
```

Chat store handles conversation list, active conversation, and message history. `JanusChatStore` is a singleton.

## Release Verification Flow

```text
npm run verify
-> root and LLM Core type checks
-> build LLM Core package for root runtime-test resolution
-> root and LLM Core unit tests
-> strict unused-symbol check
-> production Electron build
-> package-boundary validation
-> i18n key completeness check
-> ESLint
-> Playwright launches out/main/index.js
-> fixed Workspace / Terminal / Project API smoke
-> bounded Electron and temporary-state cleanup
```

The desktop smoke uses its own Playwright configuration with no Vite server. Additional E2E specs cover island interaction, editor definition/find/tabs, and blueprint capsule. Each configuration explicitly collects only its own test surface.

## Knowledge Workbench And Context

```text
KnowledgeWorkbench / KnowledgeAssist / Janus context consumers
-> renderer Knowledge service exports
-> window.electron.knowledge fixed typed API
-> shared Knowledge channel and clone-safe DTO contract
-> Knowledge/settings handlers
-> contract, observation, search (BM25), context, recall, review, truth, operations, or config service
```

Workbench reads preserve independent fallbacks so one unavailable source does not erase successful parallel results. Direct search, context, review, truth, conflict, feedback, and settings calls propagate failures. Auto-prune is an explicit typed maintenance API; archive and compact remain main-internal capabilities. `agent-turn-recorder.ts` captures agent interaction context. `retention-classifier.ts` scores observation relevance.
