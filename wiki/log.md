# Wiki Log

## 2026-08-17

- Full wiki rewrite to reflect v0.8.0 project state (was v0.5.0 baseline).
- Documented new main-process subsystems: Agent Runtime (`src/main/agent/runtime/`), Janus Agent Loop (`src/main/agent/loop/`), Companion Gateway (`src/main/companion/`), Remote Notifications (`src/main/remote-notifications/`), Browser Surface (`src/main/browser/`), Language Service (`src/main/language-service/`), Blueprint Maintenance (`src/main/janus/maintenance/`), Janus Chat Store, Chat Orchestration, Model Catalog, Development Config Sync.
- Documented new IPC domains: `agentRuntime`, `browser`, `janusChat`, `languageService` — preload now exposes 20+ typed domain APIs.
- Documented new shared contracts: `agent-runtime.ts`, `browser.ts`, `janus-chat.ts`, `language-service.ts`, `maintenance-types.ts`, `relations.ts`, `knowledge-card.ts`, `knowledge-settings.ts`, `terminalPaste.ts`, `workspace-sidebar.ts`, `subAgentRun.ts`.
- Documented new renderer modules: i18n framework, right-tools dock, Quick Notes, Workbench Switcher, FileExplorer tool, browser surface UI, blueprint graph controller, adaptive edge geometry, canvas navigation, blueprint maintenance panel, editor find/tabs/definition, DesktopToastApp.
- Documented new LLM modules: `chat-orchestrator.ts`, `ai-runtime.ts`, `workspace-chat-tools.ts`, `ModelCatalogService.ts`, `development-config-sync.ts`.
- Documented new knowledge modules: BM25 search, tokenizer, recall service, retention classifier, agent turn recorder, knowledge MCP.
- Updated commands table with i18n pipeline (`i18n:extract`, `i18n:types`, `i18n:check`, `i18n`), models update, and expanded verify gate.
- Updated file index to cover all current source files across main, renderer, shared, and packages.
- Updated module map with all new main-process, renderer, and shared modules.
- Updated runtime flows: agent runtime, Janus agent loop, browser surface, companion gateway, language service, blueprint maintenance, Janus chat persistence.
- Updated maintenance page with new update triggers and pending decisions for new subsystems.
- Updated architecture optimization plan with post-v0.5 evolution table documenting 30+ new subsystems.
- Updated data persistence table with policy audit, companion audit, remote delivery store, and Janus chat store locations.
- Updated test coverage table with companion, remote notification, browser, language service, editor, blueprint maintenance, and i18n test areas.

## 2026-07-17

- Closed the Phase 1-5 modular-monolith architecture optimization at commit `c6bc283`.
- Recorded repository cleanup and package isolation: dead tracked paths removed, historical screenshots archived outside `out/`, and fail-closed Electron runtime packaging enforced.
- Documented the completed IPC boundary: shared contracts and fixed typed preload APIs now cover every renderer-accessible domain; generic bridges and channel allowlists were removed.
- Documented main-process composition boundaries under `bootstrap/`, `windows/`, and `ipc/register.ts`; `src/main/index.ts` is now a lifecycle coordinator.
- Documented renderer feature boundaries for Workspace bootstrap/actions, Terminal lifecycle, and Blueprint layout/analysis.
- Recorded the unified Windows release gate: both type checks and test suites, strict-unused, production build, package-boundary validation, and built-Electron Workspace/Terminal/Project smoke.
- Replaced stale Wiki gaps with four non-blocking pending decisions: `design/` ownership, Knowledge auto-prune scheduling, Project lifecycle event consumption, and explicit root workspace dependency confirmation.
- Isolated `npm run dev` under `%APPDATA%/JanusX-Dev`, allowing the packaged workbench and hot-reload development app to run concurrently while each remains single-instance.

## 2026-06-30

- Created initial Agent-facing JanusX wiki.
- Added project quickstart, architecture map, module map, runtime flows, file index, and maintenance rules.
- Added `AGENTS.md` quickstart pointer to `wiki/README.md`.
