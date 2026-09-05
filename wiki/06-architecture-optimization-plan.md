# Architecture Optimization and Cleanup Plan

Status: Implemented — Phases 1-5 are complete. Post-v0.5 evolution through v0.8.0 added significant new subsystems while preserving the modular-monolith boundary.

Evidence verified: 2026-08-17

## Overview

- Project Goal: JanusX is an Electron desktop workspace for AI-assisted development. It combines workspaces, terminals, project runners, checkpoints, LLM providers, knowledge features, browser surfaces, companion gateway, remote notifications, language services, and Janus Blueprint tooling with maintenance.
- Tech Stack: Electron 35, electron-vite, React 18, TypeScript, Zustand, node-pty, xterm, React Flow, Vercel AI SDK, i18next, Feishu/Lark SDK, Vitest, Playwright, and the @janusx/llm-core workspace package.
- Current Summary Scope: Repository architecture, module boundaries, IPC contracts, package/build layout, dead-code candidates, file cleanup, maintainability safeguards, and post-v0.8 new subsystem status.
- Architectural Decision: Keep a modular monolith. Do not split the desktop application into services or packages merely for separation. Improve the existing layer boundaries incrementally.

### Verified Baseline (v0.5.0)

| Check | Result | Notes |
|---|---|---|
| Root type check | Pass | npm run typecheck |
| Root unit tests | Pass | 67 test files, 520 tests |
| LLM package type check | Pass | npm run typecheck:llm-core |
| LLM package tests | Pass | 5 test files, 63 tests |
| Strict unused-symbol overlay | 36 diagnostics | Resolved in Phase 1 |

### Implementation Review (Phases 1-5)

| Roadmap Area | Status | Verified Result |
|---|---|---|
| Phase 1 — proven redundancy | Complete | Five dead tracked paths removed; strict-unused diagnostics reduced to 0 |
| Phase 2 — package isolation | Complete | Electron Builder includes only `out/main/**`, `out/preload/**`, `out/renderer/**`, and `package.json`; screenshots archived; fail-closed boundary gate remains |
| Phase 3 — typed IPC slices | Complete | Workspace/File/FileTree, Terminal, and Project use pure shared contracts, fixed preload domain APIs, typed handlers/producers, and migrated renderer callers |
| Phase 4 — composition and controllers | Complete | `src/main/index.ts` is a lifecycle coordinator; session, services, IPC registration, windows, Workspace actions/bootstrap, Terminal lifecycle, Blueprint layout/analysis have explicit modules |
| Phase 5 — complete contracts and gate | Complete | All renderer-accessible domains use shared contracts and fixed preload APIs; generic bridge removed |

## Post-v0.5 Evolution (v0.8.0)

After the Phase 1-5 optimization, the project advanced from v0.5.0 to v0.8.0 with the following new subsystems added while preserving the modular-monolith boundary:

| New Subsystem | Key Paths | Status |
|---|---|---|
| Agent Runtime | `src/main/agent/runtime/` | Complete — `WorkspaceAgentRuntime`, `ToolRegistry`, `PathGuard`, `PolicyGate`, `FilePolicyAuditStore`, file transactions, 4 tool sets (workspace/git/project/command) |
| Janus Agent Loop | `src/main/agent/loop/` | Complete — Vercel AI SDK stream adapter, runtime tool adapter, before/after tool hooks, structured events |
| Agent Environment | `src/main/agent/environment/` | Complete — `JanusWorkspaceFs` for workspace filesystem access and evidence context |
| Companion Gateway | `src/main/companion/` | Complete — gateway, binding store, session state, action tokens, audit, dedupe, terminal control, rollback, workspace registry |
| Remote Notifications | `src/main/remote-notifications/` | Complete — Feishu provider, inbound router/runtime, dispatcher, delivery store, secret redaction |
| Browser Surface | `src/main/browser/` | Complete — `BrowserSurfaceManager` for embedded panes and standalone windows |
| Language Service | `src/main/language-service/` | Complete — clangd LSP client/manager for go-to-definition |
| Blueprint Maintenance | `src/main/janus/maintenance/` | Complete — change-set operations, reverse operations, blueprint tools, `BlueprintMaintenanceService` |
| Janus Chat Store | `src/main/janus/chat-store.ts` | Complete — conversation persistence with normalization |
| Chat Orchestration | `src/main/llm/chat-orchestrator.ts`, `ai-runtime.ts`, `workspace-chat-tools.ts` | Complete — chat stream management, tool trace, AI SDK runtime, workspace chat tools |
| Model Catalog | `src/main/llm/ModelCatalogService.ts` | Complete — model registry access, OpenRouter normalization |
| Development Config Sync | `src/main/llm/development-config-sync.ts` | Complete — dev profile LLM config synchronization |
| i18n Framework | `src/renderer/src/i18n/` | Complete — i18next, en/zh-CN locales, type generation, check pipeline |
| Right Tools Dock | `src/renderer/src/components/right-tools/`, `stores/right-tools.ts` | Complete — dockable tool panels, rail, tabs |
| Quick Notes | `src/renderer/src/components/note/`, `stores/note.ts` | Complete — quick note editor, behavior, export |
| Workbench Switcher | `src/renderer/src/components/WorkbenchSwitcher.tsx` | Complete — workspace switcher with styled icons |
| File Explorer Tool | `src/renderer/src/components/FileExplorerTool.tsx` | Complete — file tree tool panel |
| Blueprint Graph Controller | `src/renderer/src/features/blueprint/useBlueprintGraphController.ts` | Complete — graph state and node interaction |
| Adaptive Edge Geometry | `src/renderer/src/features/blueprint/adaptive-edge-geometry.ts` | Complete — adaptive edge routing |
| Canvas Navigation | `src/renderer/src/features/blueprint/canvas-navigation.ts` | Complete — pan/zoom/focus |
| Relation Invariants | `src/shared/janus/relations.ts` | Complete — acyclic enforcement, cycle detection, sanitize |
| Maintenance Types | `src/shared/janus/maintenance-types.ts` | Complete — all operation variants, change-sets, audit, tasks |
| Knowledge MCP | `src/main/knowledge/knowledge-mcp.ts`, `knowledge-mcp-tools.ts` | Complete — MCP server for knowledge (search/context plus wiki_list/get and fact_get two-stage read) |
| Knowledge Search | `src/main/knowledge/search/bm25.ts`, `tokenizer.ts` | Complete — BM25 search with tokenizer |
| Agent Turn Recorder | `src/main/knowledge/agent-turn-recorder.ts` | Complete — captures agent interaction context |
| Retention Classifier | `src/main/knowledge/retention-classifier.ts` | Complete — observation relevance scoring |
| Office Skills/Rules | `src/main/office/office-skills.ts`, `office-project-rules.ts` | Complete — Office skills and project rules |
| Office Agent Policy | `src/main/office/office-agent-policy.ts` | Complete — Office agent action policy |
| Terminal Diagnostics | `src/main/terminal/diagnostics.ts` | Complete — terminal health diagnostics |
| Project Task Runner | `src/main/project/runner/task-runner.ts` | Complete — individual task lifecycle |
| Port Extractor | `src/main/project/utils/port-extractor.ts` | Complete — dev server port extraction |

## Engineering Structure and Module Responsibilities

| Module or Directory | Primary Responsibility | Key Files | Optimization Direction |
|---|---|---|---|
| src/main | Electron lifecycle, domain services, persistence, and IPC handlers | index.ts, ipc/, terminal/, project/, knowledge/, office/, janus/, companion/, remote-notifications/, browser/, language-service/ | Keep domain modules; maintain contract-driven IPC registration |
| src/preload | Renderer-to-main security boundary | index.ts | Maintain typed domain APIs derived from shared contracts; never reintroduce generic bridge |
| src/renderer/src | React UI, state, services, desktop interaction, i18n | App.tsx, components/, stores/, services/, features/, i18n/ | Move repeated UI orchestration into domain services and hooks; keep feature boundaries |
| src/shared | Cross-process pure types and constants | ipc/, janus/, knowledge.ts, office.ts, terminalLaunch.ts | Home of IPC contract definitions; do not import runtime main-process modules here |
| packages/llm-core | Provider abstraction, adapters, registry, model metadata | core/, adapters/, registry/ | Preserve as independent workspace package; do not delete generated model registry data |
| tests | Unit coverage, E2E browser and built-Electron critical-path smoke | tests/unit/, tests/e2e/ | Extend workflow coverage only where it protects a real release or architecture boundary |
| design and wiki | Prototypes and engineering documentation | design/, wiki/ | Separate runtime assets from design archives; keep architecture documents synchronized with code |

## Verification and Rollback Strategy

| Change Type | Required Verification | Rollback Boundary |
|---|---|---|
| Dead-file/code deletion | Type checks, affected unit tests, repository reference search | One cleanup commit per logical group |
| Build-output separation | Package contents inspection plus desktop startup | Separate packaging-config commit |
| IPC migration | Unit tests, preload/handler contract tests, renderer interaction smoke test | One domain per commit; retain temporary compatibility adapter only during migration |
| UI component extraction | Existing tests plus targeted feature smoke test | One feature/controller extraction per commit |
| Main bootstrap extraction | Desktop startup, main/editor window smoke, shutdown test | Separate startup/window commits |
| New subsystem addition | Type checks, domain unit tests, contract tests if IPC involved | One subsystem per commit group |

Never mix deletion, user-visible redesign, broad formatting, and behavior changes in the same commit.

## Metrics and Completion Criteria

| Metric | Baseline (v0.5) | Current (v0.8) | Target |
|---|---|---|---|
| Top-level non-build files in out | 31 PNG files / 3.69 MB | 0 | 0 |
| Generic preload invoke channels | 122 | 0 | 0 |
| Main/preload contract drift | 4+ inconsistencies | 0 | 0 |
| Strict unused-symbol diagnostics | 35 | 0 | 0, with CI enforcement |
| Renderer direct bridge files | 29 files / ~150 calls | 0 | 0 |
| IPC domains | 10 at Phase 5 completion | 20+ typed domains | Maintain typed contracts for all domains |
| Unit test files | 67 | 120+ | Maintain green domain and contract coverage |
| E2E specs | 1 focused spec | 5+ specs (desktop smoke, island, editor, blueprint capsule) | Maintain release smoke; add only high-value workflow coverage |
| Agent runtime tool sets | 0 | 4 (workspace/git/project/command) | Add only when new workspace-scoped capability is needed |

## Pending Confirmation

- Whether design prototypes must remain in the primary source repository.
- Whether Knowledge auto-prune should later be scheduled automatically; it is currently retained as an explicit typed maintenance API.
- Whether Project lifecycle events should later gain a renderer consumer; they currently remain internal runner events rather than an unused public IPC surface.
- Whether the root package distribution needs an explicit workspace dependency declaration after a packaged release smoke test.
- Whether additional remote notification providers beyond Feishu are needed.
- Whether companion gateway needs additional providers beyond `feishu`.
- Whether browser surface event contract needs agent control events for non-agent use.

## Conclusion and Next Steps

- Conclusion: The planned modular-monolith boundary repair is implemented without a framework rewrite. Post-v0.5 evolution added 30+ new subsystems while preserving the established boundary discipline.
- Recommended Priority Actions: Keep the release gate blocking, add only high-value controller extractions when responsibilities actually diverge, and prevent new generic IPC or mixed build artifacts through the existing tests.
- Definition of Success: The repository has no known invalid/dead tracked assets, out is clean build output, IPC is domain-typed across 20+ domains, major renderer files have explicit controller/view boundaries, and a unified verification command blocks regressions.
