# Agent Note: Harness S9 readiness on JanusX with the F-matrix

Status: implemented

## Problem

Schema, storage, graph editing, roundtable artifacts, shared turns, and run-state adapters have implementations across the three repositories. The plain CLI executes scoped internal xdo turns with declared checks and structured self-review receipts. New Note blueprints share the main Chat controller, and action drafts can be explicitly adopted as task contracts. The desktop internal xdo host implements scoped file changes before verification and repeats implementation within the repair budget. Real-provider Electron acceptance remains open. A repository-specific F01–F12 ledger identifies both verified mechanisms and missing integration so that partial segment implementations cannot be mistaken for a completed cutover.

## Decision

`tests/unit/harness-s9-acceptance.test.ts` pins the JanusX slice with six checks: F03 concurrent same-hash replaces land exactly once and the loser retries cleanly against the fresh hash; F09 double start never duplicates execution and verify parks the run; F07 closeout without a receipt refuses `NOT_READY` instead of passing vacuous; F10 rescans rebuild the identical projection with no persistent index and pick up external edits watcher-free; F11 degraded renderer APIs reject instead of faking success; F12 share exports exclude `.local` and twin checkouts of one repo demand explicit binding.

Recorded F-matrix (J = JanusX test, A = janus-agentX suite, E = existing suite, G = gap):

- F01 schema rejects: A (core parse fixtures); J indirect through bundle/producer validation.
- F02 hash stability: A (`hash.test.ts`); J indirect through live-snapshot equality.
- F03 single-winner transactions: J direct (new).
- F04 journal crash recovery: A (injected crash stages); same library JanusX rides on.
- F05 bundle retry and coverage: J direct (artifact-bundle suite plus the retry guard).
- F06 receipt validity: A (evaluateReceipt, canonical review digest, scoped execution and verification); J live-snapshot and adapter coverage with the same shared validator.
- F07 closeout lattice: A (commit/dirty/no-git branches); J gate-level (receipt-less refusal, unsatisfied passthrough).
- F08 dual entry and power scope: J/E (shared project controller, turn exclusion, proposal ownership, validated Note context and browser dual-entry interaction with mocked host ports); real-model Electron acceptance remains G.
- F09 external runners and idempotence: J direct (double start, verifying park, handoff file, idempotent create retry).
- F10 cross-host equivalence and index rebuild: J partial (rescan stability, shared `validateNote` across producers, roundtable draft adoption through real verification and fresh-clone result/coverage reconstruction); shared foreign-asset/profile checks and desktop implementation/repair tool tests pass; complete chat/CLI/built-in interaction equivalence remains G.
- F11 degraded-mode honesty: J direct (fallback rejects; the panel carries no install prompt by construction).
- F12 portable shares and checkout binding: J direct (whitelist export, twin-checkout refusal).

## Alternatives considered

- Claim S9 done now — strongest case is momentum, but the skills switch, old-asset policy, version matrix, and pushes are all outstanding; declaring done would be exactly the unverified cutover this ledger exists to prevent.
- Run the whole F01–F12 battery inside JanusX — strongest case is one-repo proof, but core hashing, journal crashes, and receipt lattices live in janus-agentX packages; duplicating their fixtures here forks the source of truth.
- Convert historical working Notes into managed assets: this yields one schema, but rewrites their meaning and links. The shared scanner retains them as foreign prose, with unknown claimed Harness versions reported as errors.
- Do nothing / reuse — keep segments landed-but-unledgered; rejected because the next stop (Step 4/5 and any release) would build on unmapped gates.

## Consequences

- **Gains**: six S9 checks pass; every F clause has an owner and a path. Typecheck passes; neighboring suites stay green (re-verified at commit time).
- **Costs and limits**: old working notes scan as foreign-namespace with zero invalid diagnostics since [own-notes-namespace](2026-09-18-own-notes-namespace.md); the retain-or-delete decision settled on retain with no bulk rewrite, and only live constraints get hand-rewritten as harness decisions at cutover. WorkFlowX uses task-note rules locally; JanusX and janus-agentX retain the older rules, and the sync list includes only WorkFlowX. Adaptation flows one way only: WorkFlowX changes define the standard and JanusX with janus-agentX adapt to them; no push lands while the three-repo versions diverge. [Portable task results](2026-09-18-harness-portable-results.md) support formal evidence, fresh-checkout reconstruction and shared current-branch closeout. [Shared project conversations](2026-09-18-project-conversation-controller.md) and [explicit task adoption](2026-09-18-task-contract-adoption.md) close the new Note entry workflow. The [legacy maintenance loop](2026-09-18-legacy-loop-removal.md) has exited in JanusX with settlement kept; per-checkout share import ([share import](2026-09-19-share-import.md)) covers the JanusX half of partial apply, with cross-machine orchestration still explicit. The [desktop implementation host](2026-09-19-desktop-task-implementation.md) runs scoped model tools before verification and implements reopened attempts within the shared repair budget. Ink binds commands and ordinary messages to the same task controller. The shared profile gate refuses unsupported managed writes and execution while retaining browsable Notes. Ink native screens, real-model desktop acceptance, cross-machine launch orchestration, delegated review on the terminal host, and versioned cross-repo releases remain integration work. The [shared execution host](../../../../../janus-agentX/.agents/notes/implemented/architecture/2026-09-18-harness-task-execution.md) records the executable CLI boundary. The release matrix, cross-checkout partial apply, and full cross-host fixture equivalence still need joint verification. The three unified-design documents remain `proposed` until that cutover passes. Publishing follows user authorization.
