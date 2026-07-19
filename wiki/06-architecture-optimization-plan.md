# Architecture Optimization and Cleanup Plan

Status: Implemented — Phases 1–5 are complete. Build artifacts are isolated, all renderer IPC uses fixed typed domain APIs, the main composition root and renderer controllers have explicit boundaries, and the unified release gate remains active.

Evidence verified: 2026-07-17

Implementation reviewed: 2026-07-17

## Overview

- Project Goal: JanusX is an Electron desktop workspace for AI-assisted development. It combines workspaces, terminals, project runners, checkpoints, LLM providers, knowledge features, and Janus Blueprint tooling.
- Tech Stack: Electron 35, electron-vite, React 18, TypeScript, Zustand, node-pty, xterm, React Flow, Vitest, Playwright, and the @janusx/llm-core workspace package.
- Current Summary Scope: Repository architecture, module boundaries, IPC contracts, package/build layout, dead-code candidates, file cleanup, and maintainability safeguards.
- Architectural Decision: Keep a modular monolith. Do not split the desktop application into services or packages merely for separation. Improve the existing layer boundaries incrementally.

### Verified Baseline

| Check | Result | Notes |
|---|---|---|
| Root type check | Pass | npm run typecheck |
| Root unit tests | Pass | 67 test files, 520 tests |
| LLM package type check | Pass | npm run typecheck:llm-core |
| LLM package tests | Pass | 5 test files, 63 tests |
| Strict unused-symbol overlay | 36 diagnostics | One diagnostic is in an existing uncommitted JanusIsland change and is excluded from cleanup planning; 35 remaining candidates require resolution. |
| Existing worktree changes | Preserved | Six user-modified files were not edited or attributed to this review. |

### Implementation Review

| Roadmap Area | Status | Verified Result |
|---|---|---|
| Phase 1 — proven redundancy | Complete | Five dead tracked paths removed; unused declarations resolved individually; strict-unused diagnostics reduced to 0; affected Wiki entries repaired. |
| Phase 2 — package isolation | Complete | Electron Builder includes only `out/main/**`, `out/preload/**`, `out/renderer/**`, and `package.json`; the 31 root screenshots moved to the ignored local archive under `artifacts/screenshots/architecture-review-2026-07/`; the fail-closed boundary gate remains covered. |
| Phase 3 — typed IPC slices | Complete | Workspace/File/FileTree, Terminal, and Project request/response operations use pure shared contracts, fixed preload domain APIs, typed main handlers/producers, and migrated renderer callers. No generic string-channel call remains for those domains. |
| Phase 4 — composition and controllers | Complete | `src/main/index.ts` is a 131-line lifecycle coordinator; session, services, IPC registration, renderer loading, main/editor windows, Workspace actions/bootstrap, Terminal lifecycle, and Blueprint layout/analysis actions have explicit modules. |
| Phase 5 — complete contracts and gate | Complete | The generic preload bridge is removed. LLM, Office, Agent, Checkpoint, Git, notification settings, runtime telemetry, Subagent, Dialog/Window/System, and desktop toast now use shared contracts and fixed preload APIs. |

Current verification: `npm run verify` passes both type checks, 84 root unit files / 609 tests, 5 LLM Core files / 63 tests, strict-unused, production build, package-boundary validation, and the real built-Electron desktop smoke (1/1).

## Engineering Structure and Module Responsibilities

| Module or Directory | Primary Responsibility | Key Files | Optimization Direction |
|---|---|---|---|
| src/main | Electron lifecycle, domain services, persistence, and IPC handlers | index.ts, ipc/, terminal/, project/, knowledge/, office/, janus/ | Keep domain modules; split the composition root and make IPC registration contract-driven. |
| src/preload | Renderer-to-main security boundary | index.ts | Replace the generic string bridge with typed domain APIs derived from shared contracts. |
| src/renderer/src | React UI, state, services, desktop interaction | App.tsx, components/, stores/, services/ | Move repeated UI orchestration and direct IPC calls into domain services and hooks. |
| src/shared | Cross-process pure types and constants | knowledge.ts, office.ts, terminalLaunch.ts | Become the home of IPC contract definitions; do not import runtime main-process modules here. |
| packages/llm-core | Provider abstraction, adapters, registry, model metadata | core/, adapters/, registry/ | Preserve as an independent workspace package; do not delete generated model registry data. |
| tests | Unit coverage, a focused Island browser E2E, and a built-Electron critical-path smoke | tests/unit/, tests/e2e/ | Extend workflow coverage only where it protects a real release or architecture boundary. |
| design and wiki | Prototypes and engineering documentation | design/, wiki/ | Separate runtime assets from design archives; keep architecture documents synchronized with code. |

## Core Implementation and Workflow

### Current Runtime Flow

1. Electron starts from src/main/index.ts, creates windows, initializes services, and registers domain IPC handlers.
2. Every renderer caller uses a fixed `window.electron` domain API; generic invoke/send/on is no longer exposed.
3. Fixed preload adapters forward calls using shared channel constants and request/response/event types.
4. Main-process IPC handlers delegate to terminal, project, agent, knowledge, office, LLM, or Janus services.
5. Renderer components, stores, and services render results and maintain UI state.

### Target Runtime Flow

```text
Renderer feature / store
        -> typed renderer domain client
        -> typed preload domain API
        -> shared IPC contract and validation
        -> main IPC registry
        -> main domain service / persistence
```

The target still uses Electron IPC. The change is ownership and type safety: channels, payloads, responses, and events are declared once and exposed by domain instead of being scattered as string literals.

## Key Code Interpretation

- src/main/index.ts: Lifecycle coordinator only. Session/CSP, services, IPC registration, renderer loading, and window construction live under `bootstrap/`, `ipc/register.ts`, and `windows/`.
- src/preload/index.ts: Security boundary exposing fixed typed domain APIs only; no generic channel bridge or manually maintained allowlist remains.
- src/renderer/src/App.tsx: Top-level layout/provider shell. Workspace initialization and file-tree refresh now live in `features/workspace/`; Office preview and panel behavior remain composed by the shell.
- src/renderer/src/components/blueprint/BlueprintCanvas.tsx: React Flow view composition; layout derivation and analysis orchestration now live in `features/blueprint/`.
- src/renderer/src/components/TerminalArea.tsx: Pane/tab/layout view composition; terminal creation and lifecycle subscriptions now live in `lib/terminal-launch.ts` and `features/terminal/`.
- src/renderer/src/components/Panel.tsx and Sidebar.tsx: Workspace/file-tree mutations delegate to the shared action layer under `features/workspace/`.
- src/main/ipc/project-handlers.ts: Empty event subscriptions were removed; the runner still emits project lifecycle events pending a product decision about live renderer consumption.
- src/renderer/src/services/knowledge.ts: Unused demo datasets were removed; the remaining service is live knowledge IPC integration.
- electron-builder.yml: Uses explicit runtime globs. Historical root screenshots were moved to the ignored `artifacts/screenshots/architecture-review-2026-07/` archive, and the `out/` root is clean.

## Verified Pre-Implementation Risks and Current Status

| Risk Item | Pre-Implementation Evidence | Current Status | Priority |
|---|---|---|---|
| Mixed build output and screenshots | 31 top-level PNGs / 3.69 MB were inside broadly packaged `out` | Resolved: archived under ignored `artifacts/screenshots/architecture-review-2026-07/`; `out` root is clean | High |
| Generic IPC bridge and contract drift | 122 allowed invoke channels plus known handler/producer gaps | Resolved: the generic bridge is removed and all public renderer domains use shared contracts and fixed APIs | High |
| Renderer god components | BlueprintCanvas 1701 lines; TerminalArea 1428; Panel 874 | Controller boundaries implemented: Blueprint layout/analysis, Terminal lifecycle, and Workspace bootstrap/actions are extracted; views remain intentionally cohesive | High |
| Dead or invalid tracked files | Root bundle, invalid image payloads, unused icon/window helper | Resolved: confirmed dead tracked files removed and verified | High |
| Stale duplicated window implementation | Unused `src/main/window.ts` with conflicting preload/security assumptions | Resolved: file deleted and Wiki indexes repaired | Medium |
| Unused declarations hidden by the default root check | 35 plan-baseline candidates; 37 at implementation start | Resolved: strict-unused diagnostics are 0 and the check is scripted | Medium |
| Limited end-to-end breadth | One focused Island E2E spec | Release path resolved: a separate built-Electron smoke now covers startup plus Workspace/Terminal/Project fixed APIs; broader UI workflows remain selective | Medium |
| Documentation drift | README identified SwitchX and Wiki listed the old window helper | Resolved for current cleanup/typed slices; future migrations must update docs in the same change | Medium |

## Confirmed Cleanup Manifest

### Safe After a Normal Verification Run

| Path or Code | Reason | Planned Action | Required Verification |
|---|---|---|---|
| index.js | Unreferenced root-level generated bundle; package entry is out/main/index.js | Delete from Git | npm run typecheck and npm run test:unit |
| src/renderer/src/assets/icons/claude.png | Identical HTML payload, invalid PNG format, no references | Delete | Confirm SVG terminal icon continues to be imported |
| src/renderer/src/assets/icons/codex.png | Same invalid duplicate as claude.png, no references | Delete | Confirm SVG terminal icon continues to be imported |
| src/renderer/src/assets/icons/app-icon.svg | No references; packaged app icon is under resources | Delete | Build/package smoke check |
| src/main/window.ts | No imports or call sites | Delete | Update Wiki, type check, and desktop startup smoke check |
| project-handlers empty callbacks | Four no-op listeners and unused event parameters | Delete | Existing project runner unit tests |
| knowledge.ts demo constants | Unused local demo declarations | Delete | Knowledge unit tests and renderer type check |
| BlueprintCanvas applyAnalysisPatch helper | Unused callback | Delete | Blueprint type check and targeted UI smoke check |

### Requires a Product Decision Before Removal

| Item | Why Confirmation Is Needed | Decision Needed |
|---|---|---|
| design/ directory | No runtime source references, but it contains design prototypes and may be source material | Keep in this repository, move to a design archive/repository, or store large binaries with LFS |
| knowledge:observations:auto-prune | It was unreachable from the renderer at plan baseline but represented a tested capability | Resolved: retained as an explicit typed maintenance API; automatic scheduling remains a product decision |
| Project runner started/output/ready/exit/error events | Empty forwarding subscriptions were removed, but `ProjectRunner` still emits lifecycle events without a renderer event contract or consumer | Define a typed event contract and UI consumer, or retain/remove the unused external event surface after confirming product intent |

Maintenance rule: strict-unused is currently zero. Review any future diagnostic individually; do not bulk-delete declarations without checking feature intent and public contracts.

### Never Treat as Cleanup Candidates Solely Because of Size

- packages/llm-core and its generated model registry: imported, built, and covered by package tests.
- resources/: used by Electron packaging and icons.
- out/main, out/preload, and out/renderer: required generated application output. The unrelated top-level screenshots identified at baseline were moved to the ignored artifact archive.
- tests/: currently provide meaningful coverage for terminal, agent, checkpoint, office, knowledge, and package behavior.

## Implemented Optimization Decisions

### 1. Establish Build-Artifact Hygiene

- Expected Benefit: Prevents packaging screenshots, reduces installed size, and makes release artifacts reproducible.
- Change Cost: Low.
- Applicable Scope: out/, electron-builder.yml, screenshot tooling, and .gitignore.

Implemented actions:

1. Reserve out exclusively for electron-vite output.
2. Move screenshots to a dedicated artifact or design archive directory outside out.
3. Make the Electron builder include only generated application paths, rather than a mixed directory.
4. Add a packaging preflight that fails when unexpected top-level files exist under out.

Acceptance criteria:

- out contains only main, preload, renderer, and explicitly documented build metadata.
- A package dry-run does not include PNG debug/prototype files from the out root.

### 2. Create a Single Typed IPC Contract

- Expected Benefit: Eliminates duplicated channel lists, reduces unsafe casts, and catches channel drift during compilation.
- Change Cost: Medium; migrate by domain.
- Applicable Scope: src/shared, src/preload, src/main/ipc, src/renderer/src/services, and selected stores/components.

Implemented design:

1. Domain contracts live under `src/shared/ipc/` rather than a monolithic contract file.
2. Request, response, and event types are shared; existing validation remains at write-capable boundaries.
3. Preload exposes fixed `window.electron` domain clients for every renderer-accessible capability.
4. `src/main/ipc/register.ts` owns ordered application handler registration.
5. The temporary generic bridge and channel allowlists were deleted after all domains migrated.

Migration order:

1. Workspace and file tree: repeated calls in App, Sidebar, and Panel give immediate duplication reduction.
2. Terminal: consolidate create, input, resize, replay, and lifecycle events.
3. Project runner: request/response migration is complete; polling remains the renderer synchronization contract while live events await a product decision.
4. Knowledge and Blueprint/Janus migrations and Blueprint layout/analysis controller extraction are complete.
5. LLM, Office, Agent, Checkpoint, Git, Settings, System, telemetry, and Subagent domains are aligned with the same contract model.

Acceptance criteria:

- No new renderer component calls a generic string IPC bridge.
- Every enabled preload channel has a main producer/handler and an owning domain.
- Every main IPC handler is either exposed through a typed contract or explicitly documented as internal.
- Compiler checks reject a removed/renamed channel at call sites.

### 3. Split Renderer Orchestration by Feature, Not by File Size Alone

- Expected Benefit: Lower regression risk and clearer ownership without a framework rewrite.
- Change Cost: Medium to high; execute one feature at a time.
- Applicable Scope: Blueprint, terminal, workspace/file tree, and application shell.

Guiding feature layout:

```text
src/renderer/src/features/
  workspace/  -> workspace client, actions, hooks, file tree views
  terminal/   -> creation action, lifecycle hook, pane/tab views
  blueprint/  -> controller hooks, graph views, dialogs, analysis actions
  project/    -> project client, run-state store, settings and running views
```

Refactoring rules:

- Extract a hook or action only when it has a clear business owner; do not create generic utility folders for one-off code.
- Keep pure geometry, parsing, and pane-tree logic as isolated testable modules.
- Keep JSX views focused on rendering and user events; keep IPC calls in a domain client/action layer.
- Migrate existing files gradually and preserve exports until callers are moved.

Initial cuts:

| Current File | First Extraction | Keep in Original File |
|---|---|---|
| BlueprintCanvas.tsx | `canvas-layout.ts`, `useBlueprintAnalysisActions.ts` | React Flow composition, terminal binding, dialogs, and graph-specific rendering |
| TerminalArea.tsx | shared terminal creation action and `useTerminalLifecycle.ts` | pane/tab layout and toolbar composition |
| Panel.tsx and Sidebar.tsx | workspace file-tree actions and workspace switching commands | their distinct visual navigation/layout responsibilities |
| App.tsx | initialization and file-tree refresh actions | top-level layout and provider composition |

Acceptance criteria:

- BlueprintCanvas and TerminalArea have named controller boundaries and fewer direct IPC calls.
- File-tree loading has one authoritative workspace action.
- Terminal creation configuration is not replicated in three UI locations.

### 4. Narrow the Main-Process Composition Root

- Expected Benefit: Makes startup, window policy, service lifecycle, and IPC registration independently understandable and testable.
- Change Cost: Medium.
- Applicable Scope: src/main/index.ts and new bootstrap/windows modules.

Implemented target modules:

| Implemented Module | Ownership |
|---|---|
| src/main/bootstrap/session.ts | Session paths, production CSP, and startup prerequisites |
| src/main/bootstrap/services.ts | Explicit construction of service graph and shutdown dependencies |
| src/main/ipc/register.ts | Ordered registration of domain handlers with dependencies |
| src/main/windows/main-window.ts | Main window creation and navigation policy |
| src/main/windows/editor-window.ts | Secondary editor window lifecycle and deduplication |

The obsolete `src/main/window.ts` was deleted; the active window modules preserve the current security settings, preload artifact path, and external-link policy.

Acceptance criteria:

- src/main/index.ts reads as a short startup sequence.
- Window creation and IPC registration can be read without unrelated lifecycle code.
- Main and editor windows share only intentional policy/configuration.

### 5. Turn Quality Checks into a Single Release Gate

- Expected Benefit: Prevents new dead code and verifies both workspace packages consistently.
- Change Cost: Low.
- Applicable Scope: package.json, CI configuration, and test scripts.

Add a verify script that runs, in order:

1. Root type check.
2. LLM package type check.
3. Root unit tests.
4. LLM package tests.
5. Strict unused-symbol check after the existing backlog is resolved.
6. A packaged or production-build desktop smoke test.

Implemented 2026-07-17: `npm run verify` is enforced by a `windows-latest` workflow. Root TypeScript resolves LLM Core from source in a clean checkout; after both type checks, the gate builds the workspace package required by root runtime tests. The final step launches the built Electron entry with isolated user data, exercises Workspace, Terminal, and Project critical paths, and performs bounded failure-safe cleanup. The Island browser harness remains separate.

Use staged adoption for noUnusedLocals and noUnusedParameters: resolve the current baseline first, then make the setting blocking. Do not introduce a permanently ignored error list.

### 6. Repair Documentation as Part of Each Migration

- Expected Benefit: Keeps routing knowledge useful for humans and coding agents.
- Change Cost: Low.
- Applicable Scope: README.md and wiki/.

Completed documentation tasks:

1. Replaced the root README SwitchX title with JanusX and documented development, verification, packaging, and architecture entry points.
2. Removed `src/main/window.ts` from Wiki entry-point tables after deletion.
3. Updated the Wiki IPC sections for the completed typed contract boundary.
4. Updated the file index and runtime flows with the extracted modules.

## Execution Roadmap

### Phase 0 — Protect the Baseline

Scope: No architectural behavior change.

- Create a dedicated optimization branch.
- Record a clean verification baseline.
- Do not absorb unrelated uncommitted terminal, JanusIsland, CSS, or test work into this effort.
- Add this plan to change review context.

Exit criteria: all baseline checks remain green and the change set contains only declared optimization files.

### Phase 1 — Remove Proven Dead Assets and Code

Scope: Confirmed cleanup manifest only.

- Delete root bundle, invalid images, unused app icon, old window factory, unused callbacks, empty event listeners, and unused demo data.
- Repair Wiki and README references affected by those deletions.
- Resolve the remaining strict unused diagnostics one at a time.

Exit criteria: application behavior unchanged, all unit tests/type checks pass, and no deleted item has a repository reference.

### Phase 2 — Isolate Build Outputs

Scope: out and package configuration.

- Move non-build screenshots out of out.
- Narrow builder inclusion and add a preflight check.
- Run a package dry-run or inspect a generated package contents list.

Exit criteria: no screenshot/debug PNG is present in the application package.

### Phase 3 — Migrate Workspace, Terminal, and Project IPC

Scope: First three typed domain slices.

- Add shared contracts and typed preload APIs for workspace/file tree, terminal, and Project request/response operations.
- Consolidate duplicate file-tree loads and terminal creation.
- Add IPC contract and renderer integration tests for the migrated domains.

Exit criteria: migrated UI code has no direct generic string-channel call for those domains.

### Phase 4 — Split Main Startup and Renderer Controllers

Scope: Composition root, windows, BlueprintCanvas, TerminalArea, Panel, Sidebar, and App shell.

- Extract modules in small independently testable commits.
- Preserve visible behavior and public UI contracts during each extraction.
- Avoid combining visual redesign with architecture refactoring.

Exit criteria: composition and controller responsibilities are explicit; major files no longer own unrelated concerns.

### Phase 5 — Complete Contract Migration and Gate It

Scope: Remaining IPC domains, quality scripts, release smoke coverage, and documentation.

- Completed LLM, Office, Agent, Checkpoint, Git, Settings, System, telemetry, and Subagent contract migration after the earlier slices.
- Retained Knowledge auto-prune as an explicit typed maintenance API and kept Project lifecycle events main-internal pending a product decision.
- Kept strict unused checks and the Windows `verify` workflow blocking after migration completion.

Exit criteria: one source of truth for IPC contracts, green release gate, and current Wiki/README documentation.

## Verification and Rollback Strategy

| Change Type | Required Verification | Rollback Boundary |
|---|---|---|
| Dead-file/code deletion | Type checks, affected unit tests, repository reference search | One cleanup commit per logical group |
| Build-output separation | Package contents inspection plus desktop startup | Separate packaging-config commit |
| IPC migration | Unit tests, preload/handler contract tests, renderer interaction smoke test | One domain per commit; retain temporary compatibility adapter only during migration |
| UI component extraction | Existing tests plus targeted feature smoke test | One feature/controller extraction per commit |
| Main bootstrap extraction | Desktop startup, main/editor window smoke, shutdown test | Separate startup/window commits |

Never mix deletion, user-visible redesign, broad formatting, and behavior changes in the same commit. It makes a regression impossible to attribute and rollback safely.

## Metrics and Completion Criteria

Track these before and after each phase:

| Metric | Baseline | Current | Target |
|---|---|---|---|
| Top-level non-build files in out | 31 PNG files / 3.69 MB | 0; historical images archived outside `out` | 0 |
| Generic preload invoke channels | 122 | 0; generic bridge removed | 0 |
| Main/preload contract drift | At least 4 observed inconsistencies | 0 in migrated domains | 0 across all domains |
| Strict unused-symbol diagnostics | 35 baseline candidates, excluding current user WIP | 0 | 0, with CI enforcement |
| Renderer direct bridge files | 29 files / about 150 calls | 0 generic calls | Only typed domain-client implementations |
| BlueprintCanvas and TerminalArea | 1701 / 1428 lines | 1444 / 1419 with named controller/model boundaries | Reduced by responsibility extraction; no artificial line-count target |
| Unit coverage | 67 files / 520 tests at plan baseline | 84 files / 609 tests | Maintain green domain and contract coverage |
| E2E workflow coverage | 1 focused spec | Separate Island browser spec plus 1 built-Electron startup/Workspace/Terminal/Project smoke | Maintain the release smoke and add only high-value workflow coverage |

## Pending Confirmation

- Whether design prototypes must remain in the primary source repository.
- Whether Knowledge auto-prune should later be scheduled automatically; it is currently retained as an explicit typed maintenance API.
- Whether Project lifecycle events should later gain a renderer consumer; they currently remain internal runner events rather than an unused public IPC surface.
- Whether the root package distribution needs an explicit workspace dependency declaration after a packaged release smoke test. Current builds bundle the LLM implementation, but packaging behavior should be confirmed rather than assumed.

## Conclusion and Next Steps

- Conclusion: The planned modular-monolith boundary repair is implemented without a framework rewrite.
- Recommended Priority Actions: Keep the release gate blocking, add only high-value controller extractions when responsibilities actually diverge, and prevent new generic IPC or mixed build artifacts through the existing tests.
- Definition of Success: The repository has no known invalid/dead tracked assets, out is clean build output, IPC is domain-typed, major renderer files have explicit controller/view boundaries, and a unified verification command blocks regressions.
