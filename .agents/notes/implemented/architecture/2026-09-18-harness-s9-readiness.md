# Agent Note: Harness S9 readiness on JanusX with the F-matrix

Status: implemented

## Problem

S1–S8 all landed somewhere, but nobody can say which F01–F12 acceptance clause holds on JanusX, which belongs to janus-agentX, and what blocks the S9 cutover. Without that ledger the cutover is either premature (old assets and skills flip with unverified gates) or stuck forever (waiting for a whole-repo green that no single segment owns).

## Decision

`tests/unit/harness-s9-acceptance.test.ts` pins the JanusX slice with six checks: F03 concurrent same-hash replaces land exactly once and the loser retries cleanly against the fresh hash; F09 double start never duplicates execution and verify parks the run; F07 closeout without a receipt refuses `NOT_READY` instead of passing vacuous; F10 rescans rebuild the identical projection with no persistent index and pick up external edits watcher-free; F11 degraded renderer APIs reject instead of faking success; F12 share exports exclude `.local` and twin checkouts of one repo demand explicit binding.

Recorded F-matrix (J = JanusX test, A = janus-agentX suite, E = existing suite, G = gap):

- F01 schema rejects: A (core parse fixtures); J indirect through bundle/producer validation.
- F02 hash stability: A (`hash.test.ts`); J indirect through live-snapshot equality.
- F03 single-winner transactions: J direct (new).
- F04 journal crash recovery: A (injected crash stages); same library JanusX rides on.
- F05 bundle retry and coverage: J direct (artifact-bundle suite plus the retry guard).
- F06 receipt validity: A (evaluateReceipt); J shape-level (malformed and unknown receipts refuse).
- F07 closeout lattice: A (commit/dirty/no-git branches); J gate-level (receipt-less refusal, unsatisfied passthrough).
- F08 dual entry and power scope: E (`blueprint-maintenance-discussion-unified`, chat-turn hosting).
- F09 external runners and idempotence: J direct (double start, verifying park, handoff file, idempotent create retry).
- F10 cross-host equivalence and index rebuild: J partial (rescan stability, shared `validateNote` across roundtable and maintenance producers); chat/CLI/built-in equivalence stays A-side.
- F11 degraded-mode honesty: J direct (fallback rejects; the panel carries no install prompt by construction).
- F12 portable shares and checkout binding: J direct (whitelist export, twin-checkout refusal).

## Alternatives considered

- Claim S9 done now — strongest case is momentum, but the skills switch, old-asset policy, version matrix, and pushes are all outstanding; declaring done would be exactly the unverified cutover this ledger exists to prevent.
- Run the whole F01–F12 battery inside JanusX — strongest case is one-repo proof, but core hashing, journal crashes, and receipt lattices live in janus-agentX packages; duplicating their fixtures here forks the source of truth.
- Migrate the 73 old-format notes in this commit — strongest case is a clean index, but bulk conversion is destructive and the design reserves retain-or-delete for the cutover decision with user sign-off; the notes stay listed-invalid, never silently dropped.
- Do nothing / reuse — keep segments landed-but-unledgered; rejected because the next stop (Step 4/5 and any release) would build on unmapped gates.

## Consequences

- **Gains**: six S9 checks pass; every F clause has an owner and a path. Typecheck passes; neighboring suites stay green (re-verified at commit time).
- **Costs and limits**: cutover blockers outside this commit: (1) old-asset policy needs an explicit user decision (leave-invalid vs convert, no auto-delete either way); (2) the skills switch to new-format rules plus Hybrid removal spans all three repos and is not started; (3) the version matrix plus pushes need publish authorization (JanusX ahead, agentX ahead 15, WorkFlowX ahead 3); (4) the three unified-design docs stay `proposed` until the cutover lands — flipping them is S9 exit criteria, not this commit; (5) cross-repo partial apply and full cross-host fixture equivalence need a joint agentX/JanusX pass. Revisit when the user signs the old-asset policy or authorizes the cross-repo cutover run.
