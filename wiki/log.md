# Wiki Log

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
