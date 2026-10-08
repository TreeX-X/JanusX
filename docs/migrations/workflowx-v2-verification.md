# JanusX WorkflowX v2 integration evidence

Local integration acceptance is **PASS** after separate native evaluator review. Reviewed candidates: WorkflowX `4af8c1b`, agentX `5c41e2f`, JanusX production `0408046`, and test-only repairs through `8b99f8a`. Fixed Task snapshot: WorkflowX `cfd1cfe`; work and acceptance remain unchanged. Profile: `workflowx / 2.0.0 / b76f1d5e98fce7a8fa56f5f60b023b457640e7036c32096e430a8481ef83c5e8`. No push or release was performed; the native evaluation is not an embedded sealed receipt.

## Independent local acceptance

The evaluator executed the remaining integration checks, retaining prior scoped code review for unchanged evaluator/architect behavior. Main built and typechecked an isolated checkout of the exact JanusX production candidate; its shared dependency distributions match agentX byte-for-byte. The reviewer ran the complete desktop recording and runtime tests against this build, excluding unrelated working edits.

| Coverage | Independent result |
| --- | --- |
| Source and distribution | 14 WorkflowX tests and eight readiness assertions passed; standard/profile/skill-resource checks and three-repository managed parity passed. Two apply runs on each adopter's 398-file replica changed zero bytes. |
| Migration | Git comparison accounts for all 60 agentX originals, 254 migrated JanusX sources plus three protected sources, and 261 responsibility baseline files / 77 moves. Identities, created dates, ownership, 268 historical AC clauses and historical execution preservation passed. |
| References and navigation | All 40 cross-repository references, including section/criterion links, resolve with explicit checkouts. Fourteen resolver/index tests and two type-group/navigation surface cases passed. Three protected old relative links remain explicitly deferred. |
| Complete README demo | `npm run showcase -- build blueprint` passed on the isolated build: 271 frames at 1920×1080, exact scope/focus/reply/read/write/reply calls, nine documents, stable UUID/created and refreshed updated. Five showcase tests and 45 local documentation links passed; reviewer and Main inspected generated visuals. |
| Desktop persistence | All five logical `desktop-harness-runtime.spec.ts` scenarios passed across review runs. Final independent rerun selected `x(flow\|do)/independent` with `--repeat-each=2`: four passed, including actual generated-test execution, reviewer identity/output/coverage, process relaunch and persisted history. |
| Protection | All 29 protected files and seven config files matched the acceptance-run baseline. JanusX's three personal configurations also matched historical backups. |

The documented desktop test exposed two fixture issues: its scripted model did not recognize test planning, and one restart read the API before preload readiness. Repairs `2e2ce79` and `8b99f8a` add fixed-AC test requests, actual reviewer-evidence assertions and an API-readiness wait. Production code is unchanged. Run the desktop suite with `JANUS_DESKTOP_MAIN` pointing to the isolated build; set `NO_PROXY=localhost,127.0.0.1` and clear child-shell proxy variables for local servers.

Historical evidence qualifications are retained. Exact working-tree hashes reproduce for 249 of 254 original JanusX sources. Five remain unreproduced: IDs beginning `31cda2d8`, `2ec6c79b`, `6e9c114d`, `908d675a`, `a61e849c`. Their 161 original nonblank body lines, identities and historical metadata were accounted for against Git and the first migration commit; this does not establish data loss. AgentX's pre-adoption personal-config bytes are unavailable, so current preservation and synchronization are verified without claiming historical byte equality. The reviewer found no local-acceptance blocker; Main retains these qualifications without rewriting old inventories or receipts.

## Original adoption evidence

The remaining sections record the original WorkflowX `a44cfb7` / agentX `61d6e7f` adoption and its Main self-checks. Counts and revisions below belong to that historical baseline.

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

The separate [migration Task](../../.agents/notes/blueprint/documents/tasks/migrate-notes-v2.md) accounts for 257 original files: 254 migrated sources and 3 protected dirty legacy files. [The inventory](note-v2.json) retains exact original revision, identities, creation dates, source hashes, final target paths and historical execution. Maintained documents include nine modules and two new adoption/migration documents. The generic importer preserves historical feature/task descriptions as Notes until Main authors acceptance and execution contracts.

`node scripts/verify-note-corpus.mjs` passes with 256 maintained v2 documents, 254 migrated sources, 3 protected legacy files and zero errors. Its 22 read diagnostics comprise 19 unbound external-repository references and the 3 protected old paths. It checks identity, creation dates, v2 schemas, module structure and references; other read diagnostics fail the check. `npm run check:notes` validates 259 harness Notes with zero errors and 20 explicit link diagnostics. Three old relative links in the protected sources are explicitly deferred and their mapped targets must exist. Sixteen historical AC links now point to the existing Acceptance criteria heading while keeping their criterion labels. External Note URIs remain reported as unbound when checking only JanusX; this does not establish foreign checkout validity.

Managed parity passes with `node ../WorkFlowX/scripts/sync-harness-rules.mjs --check --repos .agents/.local/sync-janusx.list` (the list is local to WorkflowX and contains `../JanusX`). Repeated `--apply` leaves all 397 snapshotted entry/config/skill/standard files unchanged. `.codex/config.toml`, `.claude/settings.json` and `.claude/settings.local.json` match their pre-integration bytes. Managed AGENTS/CLAUDE text and teammate contracts intentionally changed. The shared dispatch adapter is checked for equality by `npm run check:skills-sync`; obsolete per-host marker expectations were removed.

Eight original user files remain byte-for-byte unchanged and are excluded from the integration commit: three knowledge Notes, `electron-builder.yml`, existing `blueprint.css`, `WORKFLOWX-NOTE-REFACTOR-DISCUSSION.md`, `release-notes-v0.9.0.md`, and `scripts/card-shot.mjs`. Local backups and command logs are under ignored `.agents/.local/`.

## Remaining acceptance

The [cross-repository Task](note://d2499d5b-4ceb-4d46-aa3b-18e5c9b86034/2ce416be-b118-40c4-bddc-87da25a8fe02) records completed local integration acceptance and the historical qualifications above. The three protected knowledge Notes and their deferred links remain excluded from this delivery. Publishing or deployment is a separate action; no external-model quality result is claimed.
