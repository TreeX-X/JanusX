# Runtime Flows

Last analyzed: 2026-09-06

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

All 24 renderer-accessible domains follow this design. No generic renderer bridge or preload channel allowlist remains.

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
BlueprintMaintenancePanel (group cards + digest + dismiss + steer + reasoning)
-> stores/blueprint-maintenance.ts (tasks + reasoning/toolTraces ephemeral)
-> window.electron.janus maintenance commands (start/message/propose/apply/dismiss/steer/cancel/complete/undo)
-> BlueprintMaintenanceService (src/main/janus/maintenance/service.ts)
   - per-task ChatSessionRuntime (budget via buildContext + dropped-handoff)
   - per-task AgentSteeringPort (stream preempt, cap 10)
   - afterToolCall recordToolResult + tool traces (cap 24)
   - shouldStopAfterTurn budget preview + getFollowUpMessages recovery
   - onEvent redacted agent events (reasoning 8k cap) via maintenance event
   - knowledge recall (5 items/3k) + capture (blueprint-maintenance) + queue immediate
   - maxSteps from configService (default 40)
-> LLM-driven proposal generation (blueprint-tools.ts) with budget-pruned context
-> ChangeSet operations (changeset.ts):
   create/update/move/archive/delete nodes
   add/update/remove relations
   update workspace bindings
-> groupMaintenanceOperations + resolveOperationRisk + buildGroupDigest (node-aggregated approval)
-> expandGroupSelection (groupIds + dependency closure) for apply
-> dismissProposal: proposal-ready -> active, version kept, discussion resumes
-> scopeNodeIds determines affected nodes
-> applyOperations mutates Blueprint
-> buildReverseOperations for undo (with groups/digest)
-> audit records persisted
```

Maintenance types from `src/shared/janus/maintenance-types.ts` define all operation variants, change-set status, task lifecycle, evidence manifests, audit records, intent groups (`node/relations/bindings/deletes`), proposal digests, and redacted agent events. `BlueprintMaintenanceService` is a singleton that manages window references for event delivery.

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

## Roundtable Deliberation

```text
JanusRoundtablePane start(prompt, workspaceResources?)
-> window.electron.roundtable.start
-> RoundtableService.start: resolveRegisteredWorkspace per resource
-> RoundtableRuntime.start (defaultRoundtableWorkflow participants)
-> per-agent run({ userInput, priorCards, priorFacts, workspaceResources, workspaceContext, workspaceTools })
   - workspaceTools: read-only workspace.list/read/readRange; failures are loud (no silent fallback)
-> roundtable:event stream to renderer (stage/badge/advance)
-> advance(sessionId, input) / end(sessionId) / restore(sessionId) / export(sessionId) -> human-readable parchment markdown
```

Restore consistency is covered by `roundtable workspace restore` test; export shape lives in `src/shared/roundtable/export.ts` + `parchment.ts`.

## Language Service Installer

```text
Settings / editor definition request
-> window.electron.languageService.installer.status/install/remove
-> language-service-installer-handlers (window-authorized sender check)
-> language-service/registry resolves descriptor per LanguageServiceId
-> ManagedBinaryInstaller runs with progress events
-> clangdManager owns the running clangd lifecycle; isPathWithinWorkspace guards files
```

OfficeCLI probing is adjacent: `officecli-manager.ts` pins `SUPPORTED_VERSION` 1.0.135 and requires `watch/create/batch` capabilities; auto-install stays disabled with manual guidance.

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

Workbench reads preserve independent fallbacks so one unavailable source does not erase successful parallel results. Direct search, context, review, truth, conflict, feedback, and settings calls propagate failures. `agent-turn-recorder.ts` captures agent interaction context. `retention-classifier.ts` scores observation relevance. `sortInboxCandidates` drives llm-preferred Inbox ordering with snapshot mode.

### Queue-owned pipeline (Phase 5)

```text
observe -> processing-queue (per-workspace cursor, SerialQueue lock, failure ledger, cursor.json/failures.jsonl)
-> deterministic stage (deterministic-extractor.ts) advances deterministic cursor
-> LLM stage (llm-stage.ts, batch <= 50) only if mode != deterministic-only and a default model exists
   - degraded extract rethrown to llm failure ledger + processing_failed audit; deterministic products untouched
   - clean skips advance llmCursor without work
-> processNow / processingStats / diagnostics IPC; knowledge-pipeline desktop E2E guards the chain
```

`knowledge:extract` direct IPC was intentionally removed; `runLlmStage` via `knowledgeExtractService.extract` is the only LLM entry.

### External MCP registration

```text
Knowledge settings "外部终端 MCP 接入"
-> window.electron.knowledge.externalMcpStatus / registerExternalMcp(cursor|vscode|claude-code)
-> external-mcp.ts merges only the janusx-knowledge stdio key (entry path + copyable launch command)
-> corrupt client JSON backed up beside the original before rewrite; build-status gate blocks registration on broken builds
```

### Janus reasoning region

Reasoning (`janusReasoning.ts`, `MAX_REASONING_CHARS` 4000) is UI-only: appended via `appendReasoningDelta` (truncate-head/keep-tail, `truncated` flag, total `chars` for "已思考 N 字"), rendered by `ThinkingRegion.tsx`, never counted into `streamedText`. Close-button token cleanup and context-budget handoff keep island/roundtable input bounded.

### Wiki sourceFactIds chain (extract → review → read)

```text
extract wikiPatches (+ optional model-proposed sourceFactIds, filtered to known truth)
-> review applyWikiPatch unions candidate ids into pages-index sourceFactIds
-> truth list exposes pages with markdown + sourceFactIds
-> recall wikiDocument carries factIds into context provenance
-> MCP wiki_get returns the page plus resolved linkedFacts
```

### Knowledge MCP two-stage read

```text
wiki_list (slug index: slug/title/tags/version/factCount, optional workspaceId)
-> wiki_get (full markdown with maxChars budget + truncated flag, sourceFactIds, linkedFacts)
-> fact_get (settled fact with full provenance by id + referencingPages)
```

`knowledge_search` / `knowledge_context` remain for mixed BM25 recall; the wiki tools are the fast path when the agent already knows the topic area. All five tools are read-only and idempotent.

### Recall ranking and wiki excerpts

BM25 (`search/bm25.ts`) ranks over title + content + tags + fileRefs + observation ids; `lexicalExplanation` adds `exactTitle` (3), `titlePhrase` (1.5), `titleTerm` (query-term overlap in title, up to 1.2), `slugMatch` (wiki slug exact 2 / contains 1 — slugs are ids, never indexed text), `bodyPhrase` (0.5), plus confidence/freshness boosts. Wiki pages inherit file/observation provenance and workspace path from their linked settled facts, so path- and file-scoped queries match them. `context-service` serves long wiki pages as query-centered excerpts (`excerptAroundQuery`, 1500 chars); full text stays one `wiki_get` away, so a single page can no longer eat the shared `maxChars` budget.

### Knowledge Graph Canvas

```text
buildKnowledgeGraphView(snapshot) — truth-only adapter (facts, wiki pages,
stored edges, shared-concept/file entities; review proposals stay in the Inbox)
-> layoutKnowledgeGraph — deterministic force-spread per connected component
-> mergeStoredLayout — renderer-side drag positions overlay (versioned
   localStorage key; stale pre-spread coordinates are ignored)
-> KnowledgeGraphCanvas (React Flow) — dot nodes, hover/click/double-click,
   kind + relation filters, one-hop evidence expansion
-> Inspector — settled-node records (fact/wiki revocable); legacy proposal ids
   still resolve for backward compatibility
```

- Scope: the graph maps settled truth only. Proposed candidates never become nodes, so `conflicts_with` no longer appears; edges are stored relations plus synthetic `mentions` (shared concept/file), `supersedes`, and on-demand `derived_from` evidence links. With nodes but no edges the canvas shows a floating no-edges pill explaining when links appear.
- Rendering: Obsidian-style dots (dark core + kind-colored ring, diameter 10–22px by connection degree) with a short floating caption; full label on hover. Node/edge styling, dark controls, and minimap colors follow the workbench panel language; the canvas background reuses the stage dot texture (no accent gradient).
- Interaction: hovering a dot highlights its one-hop neighborhood and dims the rest (connected edges thicken); single click focuses the neighborhood (distant nodes hide) and opens the inspector, clicking the focused node again releases focus; double-click zooms to the neighborhood; dragging persists per-workspace layout, and the toolbar reset restores the computed spread. Kind/relation filters, locate search, and the focus chip narrow the visible set without touching stored data.
- Inbox cards in the same workbench are fixed-height (216px) with title 3-line / summary 2-line ellipsis; full content lives in the inspector. The inspector close control matches Blueprint `.bp-panel-close` (28px ghost button + Lucide X).
