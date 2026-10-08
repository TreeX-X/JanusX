# JanusX WorkflowX v2 integration evidence

The local implementation adopts WorkflowX `a44cfb7c46219b215a6e6c0dc93221a3d39e6d65` and agentX `61d6e7fe2e943deb8da725c6e518c5ba0ed030c2`. Profile: `workflowx / 2.0.0 / b76f1d5e98fce7a8fa56f5f60b023b457640e7036c32096e430a8481ef83c5e8`. This is implementation and Main Agent self-review evidence, not independent release acceptance.

## Runtime and consumer checks

Run from JanusX with the installed sibling packages refreshed using `npm install --install-links --ignore-scripts --no-audit --no-fund`.

| Command / test files | Observed result |
| --- | --- |
| `npm run typecheck` and `npm run typecheck:strict-unused` | Passed |
| `npm run build:check` | Passed; isolated output in `artifacts/build-check` |
| `npx vitest run tests/unit/workflowx-v2.test.ts tests/unit/maintenance-harness-apply.test.ts tests/unit/harness-desktop-executor.test.ts` | 58 passed |
| `npx vitest run tests/unit/blueprint-architecture.test.ts tests/unit/note-chat.test.ts tests/unit/note-wiki.test.ts tests/unit/roundtable-artifact-bundle.test.ts tests/unit/harness-s12-compatibility.test.ts tests/unit/harness-execution-adapter.test.ts` | 59 passed |
| `npx vitest run tests/unit/blueprint-migrate.test.ts` | 4 passed; includes v2 import, duplicate titles and mismatched repository rejection |
| `npx vitest run tests/unit/task-contract-adoption.test.ts` | 3 passed |
| `npx vitest run tests/unit/workflowx-v2.test.ts tests/unit/roundtable-artifact-bundle.test.ts tests/unit/maintenance-harness-apply.test.ts` | 24 passed after no-op timestamp preservation; overlaps earlier tests |
| `npx playwright test tests/e2e/blueprint-v2.spec.ts tests/e2e/note-wiki.spec.ts tests/e2e/blueprint-workspace-init.spec.ts --project=island --workers=1` | 15 passed |
| `npx playwright test tests/e2e/blueprint-architecture.spec.ts --project=island --workers=1` | 3 passed; legacy source focus, detail and all-Note fallback |
| `npx playwright test tests/e2e/desktop-harness-runtime.spec.ts --project=desktop --workers=1` | 5 passed against compiled Electron: xdo/self, xdel/self, xflow/independent, xdo/independent and xdel/independent-pending |
| `npm run i18n:check` and `npm run check:package-boundary` | Passed |
| `npx vitest run tests/unit/agent-notes-check.test.ts` | 7 passed, including real corpus and shared skill comparison |

ESLint on the twelve changed execution, authoring, import and canvas entry files reports zero errors and one pre-existing Chinese-literal warning in BlueprintCanvas. `git diff --check` passes.

Browser/Electron commands used `JANUS_E2E_PORT=41829`, cleared `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, and set `NO_PROXY=localhost,127.0.0.1`. Electron used `JANUS_DESKTOP_MAIN=artifacts/build-check/main/index.js`. Tests use temporary workspaces and a local deterministic HTTP model. They exercise actual file tools, command checks, IPC result transport, immutable receipts, process relaunch and history recovery. No personal model credential or external live model was used.

The Chat test executes shared workspace.read, workspace.edit and command.run against real files without creating a Task. Task tests preserve the contract hash and authored evidence, block subagent Task writes, refresh one Handoff block, and keep module state independent of Task results. The xdel pending case returns the implementation text and self-review receipt without invoking an evaluator or marking the Task complete.

## Migration and rule synchronization

The separate [migration Task](../../.agents/notes/blueprint/tasks/migrate-notes-v2.md) accounts for 257 original files: 254 migrated sources and 3 protected dirty legacy files. [The inventory](note-v2.json) retains exact original revision, identities, creation dates, source hashes, final target paths and historical execution. Maintained documents include nine modules and two new adoption/migration documents. The generic importer preserves historical feature/task descriptions as Notes until Main authors acceptance and execution contracts.

`node scripts/verify-note-corpus.mjs` passes with 256 maintained v2 documents, 254 migrated sources, 3 protected legacy files and zero errors. Its 22 read diagnostics comprise 19 unbound external-repository references and the 3 protected old paths. It checks identity, creation dates, v2 schemas, module structure and references; other read diagnostics fail the check. `npm run check:notes` validates 259 harness Notes with zero errors and 20 explicit link diagnostics. Three old relative links in the protected sources are explicitly deferred and their mapped targets must exist. Sixteen historical AC links now point to the existing Acceptance criteria heading while keeping their criterion labels. External Note URIs remain reported as unbound when checking only JanusX; this does not establish foreign checkout validity.

Managed parity passes with `node ../WorkFlowX/scripts/sync-harness-rules.mjs --check --repos .agents/.local/sync-janusx.list` (the list is local to WorkflowX and contains `../JanusX`). Repeated `--apply` leaves all 397 snapshotted entry/config/skill/standard files unchanged. `.codex/config.toml`, `.claude/settings.json` and `.claude/settings.local.json` match their pre-integration bytes. Managed AGENTS/CLAUDE text and teammate contracts intentionally changed. The shared dispatch adapter is checked for equality by `npm run check:skills-sync`; obsolete per-host marker expectations were removed.

Eight original user files remain byte-for-byte unchanged and are excluded from the integration commit: three knowledge Notes, `electron-builder.yml`, existing `blueprint.css`, `WORKFLOWX-NOTE-REFACTOR-DISCUSSION.md`, `release-notes-v0.9.0.md`, and `scripts/card-shot.mjs`. Local backups and command logs are under ignored `.agents/.local/`.

## Remaining acceptance

The [cross-repository Task](note://d2499d5b-4ceb-4d46-aa3b-18e5c9b86034/2ce416be-b118-40c4-bddc-87da25a8fe02) retains independent review and README demonstrations before release. Main's tests do not satisfy the independent-review obligation. The three protected knowledge Notes and their deferred links need a later authorized maintenance pass. No release, push or deployment is performed.
