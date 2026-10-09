---
{
  "schema": "harness-note/2",
  "id": "914a7e92-7fbd-4424-8fe2-a648bc24d2fd",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-20",
  "class": "testing",
  "tags": ["ci","windows","electron","build-isolation"],
  "updated": "2026-10-09T02:39:08Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e"
}
---

# Verification owns its environment and inputs

## Problem

A fresh checkout lacks the ignored personal `.codex` and `.claude` directories. Tests that discover the developer's config or compare their skill files produce different results on a runner. Shared temporary audit storage also exposes earlier test runs, while exact theme color assertions drift after intentional visual edits.

A live Electron process retains hashed chunk paths from its startup build. If development and production both emit into `out`, a production build deletes the chunks that the live process has not imported yet. Blueprint proposal generation then fails with `ERR_MODULE_NOT_FOUND` before reaching the model, even though a fresh build contains the service under a different hash. Rebuilding that directory again cannot update imports already held by the process.

On Windows, libuv's short-path directory watcher assertion terminates the worker before Vitest can report all failures. The native failure reproduces under Node 24.20.0/libuv 1.52.1 when a short directory alias and a short file alias are used together. The same probe completes under Node 24.15.0/libuv 1.51.0, or with the watched directory expanded by `realpathSync.native`. Upstream [libuv issue 5010](https://github.com/libuv/libuv/issues/5010) documents the same assertion and GitHub runner temporary paths.

## Decision

`vitest.config.ts` expands Windows temporary directories before worker creation, so real filesystem tests retain their watchers without passing short directory aliases to libuv. CI and release use the exact Node version in `.node-version` and the same sibling repository commit. Sibling build commands stop at the first failure instead of allowing a later successful command to hide it.

The v0.9.0 replacement pins both workflows to agentX `df661f5034f2a9e77ffb5a996e45d6e8298a5a43`; verify also pins WorkflowX `efaf5ae7aac24362286251dc931487d5cfd2e2a5`. Both source revisions are pushed before JanusX consumes them. The previous agentX pin `6feb575bab1b067e6e4d8abc54d1f1d11a7bee23` existed only locally, so both remote jobs stopped at checkout with `not our ref`. Moving a dependency pin requires checking its remote availability as well as its local build. This replacement is explicitly authorized to reuse `v0.9.0`; branch protection and review requirements remain intact.

Release regression tests parse the initialized Note metadata instead of requiring the older YAML spelling. Static persona and dock tests own their translation fixture; the dock layout test stubs the unrelated live pending-count subscription. Personal-memory interaction tests explicitly expand recent memories and use the current refresh control, retaining the source-hash and failed-write retry assertions. Refreshing the installed shared core also exposed missing tool results at two steering boundaries; the source repair lives in agentX and the consumer pairing assertions remain unchanged.

The desktop capsule regression checks the current five toolbar actions and the data-source entry, with the removed system-view selector absent. It retains the toolbar bounds, non-overlap and independent-card checks; source-window behavior has separate browser coverage. Its final knowledge-workbench size check uses the current Knowledge & memory entry and region labels. The knowledge-settlement desktop fixture persists Chinese through the system IPC before reloading for its Chinese UI assertions; inheriting the English runner locale previously left its assistant-button locator waiting despite successful publication and revision checks.

The clean checkout also repairs three relative links in the committed legacy knowledge drafts. The migration's deferred hashes describe pre-existing local edits, so they cannot exempt the different committed originals on a runner. Only link destinations change in those originals; draft content, identities and historical metadata remain intact. The user's current working drafts retain their exact bytes, and the historical migration inventory is unchanged.

Harness IPC tests own config discovery and reset mocks between cases; suspended executions finish in `finally` blocks. Audit tests use a private temporary user-data directory. Theme tests enforce visible line tint and stronger text tint without fixing obsolete color literals. Skill-checker tests use matching, missing, and divergent fixtures; the checker remains strict when explicitly run against a local installation. Product verification includes Note validation; `verify:local` additionally checks personal skill parity.

Chat persistence checks compare the complete ordered message history together with its engineering references; context budgeting must not silently discard the persisted transcript. Janus IPC coverage includes the maintenance preview command, its argument forwarding and handler registration. Chat author colors are checked at the shared semantic-token rules (`shell-muted` and `shell-accent`), which own both themes. Restoring a removed 200-message cap or duplicating local theme overrides merely to satisfy an obsolete assertion would violate those contracts.

The desktop capsule test exercises the conversation composer with empty, filled and cleared input while retaining its independent-card layout assertions. Note proposals originate in the conversation; an always-present preparation button is not part of the current panel contract. This smoke test does not send a provider request or approve a Note change.

The personal-memory correction browser fixture commits each explicit activation with React `flushSync`. Consecutive inactive/active renders can otherwise be batched into a single active render, so the test waits forever for a refresh it never triggered. The fixture preserves the real component effects, draft state and submission assertions instead of extending the timeout or retrying a lost transition.

Truth-service fixtures track the promises returned by real schema-audit writes and await every write before removing the temporary knowledge root. Seeing one audit record is insufficient when several writes are queued: cleanup can race a later rename and produce Windows `ENOTEMPTY`. Audit failures remain test failures; the fixture neither mocks persistence nor retries directory deletion.

Build outputs have separate owners. `npm run dev` emits main and preload files into `.cache` and launches `scripts/dev-entry.mjs`; `npm run build` owns the standard `out` tree used by packaging; `npm run build:check` validates the complete application in `artifacts/build-check`. Use `build:check` while an application is running, including a legacy development process or a production preview that still reads `out`. Verification output is not a replacement runtime. `.cache` and `artifacts` are already excluded from packaging.

The development entry restores package name, version, desktop name and checkout app path before importing `.cache/main/index.js`. Passing a JavaScript file directly to Electron otherwise skips package-directory initialization. The one-level `.cache` layout preserves main/preload/resource relative paths, and `JANUSX_DEV_BUILD_ROOT` directs external knowledge MCP registration to the same development generation. Packaged and production-preview entries keep their existing resolution.

Strict unused checks remove dead imports, private helpers and unconsumed destructuring; unused public callback parameters retain their positions with explicit underscore names. A template-string comment avoids an unnecessary escape. These cleanup changes preserve runtime behavior and keep the existing strict checks enabled.

Desktop fixtures explicitly set `JANUSX_KNOWLEDGE_ROOT`; changing Electron's user-data path or HOME alone does not isolate knowledge storage on Windows. Playwright also canonicalizes temporary paths, keeping opened editor model URIs consistent with source-file IPC's real paths. UI scenarios using Chinese labels persist that language through the system IPC before reloading. The scripted model server handles non-streaming connection probes separately from task Responses requests. Geometry assertions wait for finite workbench animations, and closed dock assertions check opacity plus inert and aria-hidden because the mounted shell deliberately retains its layout box. Failed desktop runs upload their traces for seven days.

Release preparation installs Node before any build, verifies the pinned OfficeCLI checksum before bundling, and publishes prerelease versions with the matching GitHub release type. Tags remain lowercase and equal to the package version; historical tags are unchanged. Branch scope and cleanup rules live in `CONTRIBUTING.md`.

## Alternatives considered

- Serialize workers or enlarge their heap: useful for bounded runner resources, but neither changes the short-path input that triggers a native assertion. These settings are not a watcher fix.
- Pin an older Node release alone: the reproduction passes there, but a later runtime upgrade reintroduces the same path hazard. Canonical paths address the triggering condition directly.
- Commit personal tool settings: this makes one machine's fixtures available remotely, but exposes unrelated configuration and leaves the tests coupled to a developer's environment.
- Keep every hashed chunk by disabling output cleanup: this can sustain some old imports, but accumulates stale output and cannot guarantee that stable entry files or transitive dependencies belong to the same generation. Separate directories make ownership explicit.
- Restart the application after every verification build: this reloads a consistent graph, but interrupts active terminals and discards the ephemeral Blueprint conversation. Build validation must not force a restart of an unrelated live session.
- Do nothing / reuse: the existing tests and floating inputs minimize maintenance, but leave local success unable to predict clean-checkout verification or release contents.

## Consequences

Desktop terminal input waits for the shell prompt before typing into xterm. A mounted terminal textarea only proves renderer readiness; on a cold Windows runner the PowerShell process can still be starting and discard early input. Both terminal tabs retain their command/output assertions after this readiness check.

Node and sibling pins require deliberate updates in both workflows. Temporary-path canonicalization covers the verification environment; it is not a claim that every application watcher accepts short aliases. Single-worker tests still use real filesystem events and preserve native watcher coverage. Release publishing requires an authorized tag push; validation of the workflow does not itself publish a release.

A process started against the shared `out` layout needs one deliberate restart to enter the isolated development layout. Save any required Blueprint conversation before restarting: the [workspace dialog contract](../blueprint/maintenance/tasks/blueprint-workspace-dialog.md) keeps that history in memory only. The build commands neither kill a running process nor apply a pending proposal. A production preview still owns `out` for its lifetime; use `build:check` instead of rebuilding its live files. Launching a second dev server against the same `.cache` directory is not supported.

Build-isolation verification uses `tests/unit/electron-build-isolation.test.ts`: real Electron-Vite builds reproduce a missing lazy module when two generations share a directory, then keep deferred imports intact across distinct development, production and verification outputs. All fixture output paths are absolute beneath private temporary directories because Electron-Vite resolves relative output overrides from the process working directory. Four isolation cases, seven external MCP registration cases and 48 proposal/approval/transaction cases pass with `npx vitest run tests/unit/electron-build-isolation.test.ts tests/unit/knowledge/external-mcp.test.ts tests/unit/llm/chat-turn-guard.test.ts tests/unit/blueprint-maintenance-harness-routing.test.ts tests/unit/maintenance-harness-apply.test.ts`. `npx playwright test tests/e2e/blueprint-maintenance.spec.ts` passes all 14 cases using a mocked provider and real renderer controls. `npm run build:check` passes; an isolated Electron invocation of `scripts/dev-entry.mjs --smoke-test=module-graph` reports `ok`, including maintenance service imports, and verifies the original package identity and checkout path. No live provider request or user Note approval is exercised by these checks.

Verification on Windows: `CI=true` with the pinned Node executable running `node_modules/vitest/vitest.mjs run` passes 251 files and 1791 tests, with two existing opt-in tests skipped. A separate invocation of `tests/unit/agent-turn-sentinel.test.ts` with TEMP and TMP set to an actual 8.3 directory alias passes all 13 tests. The llm-core suite passes 74 tests. Type checking, strict unused checking, application build, package boundary, i18n, and Note checks pass; workflow YAML, verification command parity, dependency pins and this Note's schema are checked directly.

The complete desktop suite (`npm run test:e2e:desktop`) passes all nine scenarios with TEMP and TMP set to an actual Windows 8.3 directory alias before Playwright starts. Lint reports zero errors and 60 existing warnings. The OfficeCLI release artifact download matches the pinned SHA256.

2026-10-03 verification: the CI-mode unit run passes 2657 cases with three opt-in skips; its one failing Note-link case reflects pre-existing source deletions in the local sibling checkout. All seven `agent-notes-check` cases pass with the unchanged JanusX source mounted beside archives of the workflow-pinned janus-agentX and WorkFlowX commits, covering all 234 Notes without suppressing link diagnostics. The local sibling deletions remain intact, so a plain repository-local `npm run verify` still requires that checkout to be repaired. The llm-core suite passes 74 cases; type checks, strict unused checks, build, package boundary, packaging exclusions and i18n pass. Lint has zero errors and 96 warnings. Desktop verification covers eight passing scenarios plus the passing corrected capsule scenario, including composer state, all six toolbar controls and independent-card geometry. Release packaging and a remote CI run are separate checks.
