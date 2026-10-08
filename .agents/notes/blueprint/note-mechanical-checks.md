---
{
  "schema": "harness-note/2",
  "id": "3b7d1e9b-8880-5052-93e9-68d26adbceb6",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-19",
  "class": "process",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-19-agent-note-note-mechanical-gates-run-in-verify--3b7d1e9b.md",
      "sourceHash": "532d9f2511bcfbbeb930cc509f08fbb2f39539f62693366b61668a7571f63584",
      "originalBodyHash": "27e83b7a52178efc99397f90fa74d4edd4d70a2fe153aab70a3a0cfad81f2c99",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Note mechanical gates run in verify. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/process/2026-09-19-note-mechanical-checks.md",
        "sourceHash": "532d9f2511bcfbbeb930cc509f08fbb2f39539f62693366b61668a7571f63584",
        "originalBodyHash": "27e83b7a52178efc99397f90fa74d4edd4d70a2fe153aab70a3a0cfad81f2c99"
      }
    }
  },
  "updated": "2026-10-08T04:35:16.605Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd"
}
---
# Note mechanical gates run in verify


## Problem

noteX section 5 runs by hand: path depth, lifecycle and class closed sets, header shape, required and forbidden sections, link resolution, and provenance pins have no machine gate. The first strict draft flagged 150 findings on history, most of them checker bugs (CRLF line endings, Windows paths, host-specific adapter wording), plus 4 genuine off-by-one relative links nobody had noticed. Without a gate, every new note repeats the same drift.

## Decision

Two scripts own the gate and run inside the `verify` chain. `scripts/check-agent-notes.mjs` checks old-shape notes (path depth, closed lifecycle and class sets, filename dates, header three lines, status matching its folder, `## Problem` first, per-lifecycle required and forbidden sections, `Alternatives considered`, in-repo relative links, provenance pins); harness frontmatter files stay covered by harness-core unit tests, and archived files stay frozen. `scripts/check-skills-sync.mjs` compares shared `.claude` and `.codex` skill files with host paths normalized, including the shared WorkflowX v2 dispatch adapter. `check:notes` and `check:skills-sync` run in `verify`, and `tests/unit/agent-notes-check.test.ts` pins the gate with fixture violations plus a whole-repo green run.

## Alternatives considered

- Keep hand checks and fix notes on review: zero code, but the 4 broken links prove reviewers miss depth arithmetic; drift grows with every parallel landing.
- One mega-script covering harness schema too: strongest case is a single gate, but the schema, hashing, and receipt lattice already have harness-core suites; duplicating them here forks the source of truth.
- Fail the build on every historical finding with no allowlist: purest gate, but two version pins predate the rule and describe real release context; they stay allowlisted with a cutover cleanup note instead of rewriting history.
- Do nothing / reuse — keep the checklist prose only: preserves the current workflow, but a rule no machine enforces stops being a rule under parallel agents.

## Consequences

- **Gains**: `check:notes` passes 106 old-shape notes with 0 errors; `check:skills-sync` passes 47 shared files; 3 notes get one-line link-depth repairs; new violations fail `verify` before landing. Verification: `node scripts/check-agent-notes.mjs`, `node scripts/check-skills-sync.mjs`, and `npm run test:unit -- --run tests/unit/agent-notes-check.test.ts` (5 tests) all green.
- **Costs and limits**: cross-checkout links resolving outside the repo root are skipped, not verified; the shared dispatch adapter is compared byte-for-byte after host-path normalization; two grandfathered version pins stay allowlisted until the cutover rewrites live constraints. Revisit when the new-shape gate (`verify-harness-standard`, managed-block sync) lands in WorkFlowX.
