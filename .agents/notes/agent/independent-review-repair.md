---
{
  "schema": "harness-note/2",
  "id": "b055c1fe-f0ec-59f7-98b5-75f8ddf39d31",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-18",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-independent-review-and-limited-repair-on-the-desktop--b055c1fe.md",
      "sourceHash": "31139d63ee2c27089117cb8e6a291d0d587bb20bad22e4808e692f68e09a2090",
      "originalBodyHash": "91edbd107ef68f5ae7fdab0a8017153337574b18b1089f5f964eca9be5307567",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Independent review and limited repair on the desktop. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-18-independent-review-repair.md",
        "sourceHash": "31139d63ee2c27089117cb8e6a291d0d587bb20bad22e4808e692f68e09a2090",
        "originalBodyHash": "91edbd107ef68f5ae7fdab0a8017153337574b18b1089f5f964eca9be5307567"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Independent review and limited repair on the desktop


## Problem

Desktop runs verify and self-review in one host turn, but delegated work
needs a second pair of eyes: an evaluator that never saw the implementor's
working history, bound to the same pinned revision, with repairs spending an
explicit budget. Without it, `xdel` and `xflow` tasks cannot complete their
acceptance on the desktop, and every failed receipt dead-ends instead of
reopening the run.

## Decision

`src/main/harness/independent-review.ts` audits the pinned checks of a
verifying run through a read-only evaluator turn. The evaluator inherits no
implementor history: its brief carries an empty prior while the manifest,
the recorded checks, and the criterion hashes travel exactly. The reviewer
identity must differ from the run owner, or the request refuses; the verdict
lands as a separate immutable receipt plus a thread evaluation stored beside
implementor attempts, never merged into them. Missing checks, wrong states,
foreign receipts, and moved baselines all refuse before any model call.
`finishWithLatestReceipt` finishes a verifying run against its latest
receipt and a live snapshot. Repairs stay manual and explicit through
`runRepair` with the failing receipt and a summary, spending the kernel
budget that the panel now displays. New channels `runReview`, `runFinish`,
and `runRepair` cross IPC as data or coded failure with tokens held in the
main process.

## Alternatives considered

- Rerun checks inside the evaluator: simplest evidence, but evaluators are
  read-only by definition; re-execution belongs to implementor turns.
- Merge evaluations into attempt history: one list to render, but it mixes
  auditor verdicts with implementor work and inherits bias through shared
  context; separation is structural here.
- Auto-repair from the panel: fewer clicks, but automatic retries without a
  visible packet contradict the explicit-repair direction; the kernel still
  enforces the budget underneath.
- Do nothing / reuse: keep self-review only; rejected because delegated
  modes then have no desktop acceptance path and failed receipts never
  reopen.

## Consequences

- **Gains**: verifying runs gain a read-only audit with an independent
  receipt, an explicit finish, and budget-spending repairs that reopen the
  run for another attempt. Same-actor review, unpinned runs, missing
  evidence, foreign receipts, and spent auto budgets all refuse with named
  diagnostics. Unit, mapping, contract, and island suites pin the audit,
  the finish, the budget, and the panel flow. Typecheck, production build,
  package boundaries, and bilingual key checks pass.
- **Costs and limits**: the reviewer endpoint is typed per review and never
  falls back to the implementor's stored endpoint; single-model setups still
  get thread isolation but not weight diversity. Finish always takes the
  latest receipt; choosing an older one needs a follow-up. Automatic repair
  scheduling stays out; every repair here carries an explicit summary.
