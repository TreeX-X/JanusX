---
schema: harness-note/1
id: 914a7e92-7fbd-4424-8fe2-a648bc24d2fd
kind: decision
lifecycle: implemented
created: 2026-09-20
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e
class: testing
tags: [ci, windows]
---

# Verification owns its environment and inputs

## Problem

A fresh checkout lacks the ignored personal `.codex` and `.claude` directories. Tests that discover the developer's config or compare their skill files produce different results on a runner. Shared temporary audit storage also exposes earlier test runs, while exact theme color assertions drift after intentional visual edits.

On Windows, libuv's short-path directory watcher assertion terminates the worker before Vitest can report all failures. The native failure reproduces under Node 24.20.0/libuv 1.52.1 when a short directory alias and a short file alias are used together. The same probe completes under Node 24.15.0/libuv 1.51.0, or with the watched directory expanded by `realpathSync.native`. Upstream [libuv issue 5010](https://github.com/libuv/libuv/issues/5010) documents the same assertion and GitHub runner temporary paths.

## Decision

`vitest.config.ts` expands Windows temporary directories before worker creation, so real filesystem tests retain their watchers without passing short directory aliases to libuv. CI and release use the exact Node version in `.node-version` and the same sibling repository commit. Sibling build commands stop at the first failure instead of allowing a later successful command to hide it.

Harness IPC tests own config discovery and reset mocks between cases; suspended executions finish in `finally` blocks. Audit tests use a private temporary user-data directory. Theme tests enforce visible line tint and stronger text tint without fixing obsolete color literals. Skill-checker tests use matching, missing, and divergent fixtures; the checker remains strict when explicitly run against a local installation. Product verification includes Note validation; `verify:local` additionally checks personal skill parity.

Strict unused checks remove dead imports, private helpers and unconsumed destructuring; unused public callback parameters retain their positions with explicit underscore names. A template-string comment avoids an unnecessary escape. These cleanup changes preserve runtime behavior and keep the existing strict checks enabled.

Desktop fixtures explicitly set `JANUSX_KNOWLEDGE_ROOT`; changing Electron's user-data path or HOME alone does not isolate knowledge storage on Windows. Playwright also canonicalizes temporary paths, keeping opened editor model URIs consistent with source-file IPC's real paths. UI scenarios using Chinese labels persist that language through the system IPC before reloading. The scripted model server handles non-streaming connection probes separately from task Responses requests. Geometry assertions wait for finite workbench animations, and closed dock assertions check opacity plus inert and aria-hidden because the mounted shell deliberately retains its layout box. Failed desktop runs upload their traces for seven days.

Release preparation installs Node before any build, verifies the pinned OfficeCLI checksum before bundling, and publishes prerelease versions with the matching GitHub release type. Tags remain lowercase and equal to the package version; historical tags are unchanged. Branch scope and cleanup rules live in `CONTRIBUTING.md`.

## Alternatives considered

- Serialize workers or enlarge their heap: useful for bounded runner resources, but neither changes the short-path input that triggers a native assertion. These settings are not a watcher fix.
- Pin an older Node release alone: the reproduction passes there, but a later runtime upgrade reintroduces the same path hazard. Canonical paths address the triggering condition directly.
- Commit personal tool settings: this makes one machine's fixtures available remotely, but exposes unrelated configuration and leaves the tests coupled to a developer's environment.
- Do nothing / reuse: the existing tests and floating inputs minimize maintenance, but leave local success unable to predict clean-checkout verification or release contents.

## Consequences

Desktop terminal input waits for the shell prompt before typing into xterm. A mounted terminal textarea only proves renderer readiness; on a cold Windows runner the PowerShell process can still be starting and discard early input. Both terminal tabs retain their command/output assertions after this readiness check.

Node and sibling pins require deliberate updates in both workflows. Temporary-path canonicalization covers the verification environment; it is not a claim that every application watcher accepts short aliases. Single-worker tests still use real filesystem events and preserve native watcher coverage. Release publishing requires an authorized tag push; validation of the workflow does not itself publish a release.

Verification on Windows: `CI=true` with the pinned Node executable running `node_modules/vitest/vitest.mjs run` passes 251 files and 1791 tests, with two existing opt-in tests skipped. A separate invocation of `tests/unit/agent-turn-sentinel.test.ts` with TEMP and TMP set to an actual 8.3 directory alias passes all 13 tests. The llm-core suite passes 74 tests. Type checking, strict unused checking, application build, package boundary, i18n, and Note checks pass; workflow YAML, verification command parity, dependency pins and this Note's schema are checked directly.

The complete desktop suite (`npm run test:e2e:desktop`) passes all nine scenarios with TEMP and TMP set to an actual Windows 8.3 directory alias before Playwright starts. Lint reports zero errors and 60 existing warnings. The OfficeCLI release artifact download matches the pinned SHA256.
