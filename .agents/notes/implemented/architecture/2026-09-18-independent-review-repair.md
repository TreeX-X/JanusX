# Agent Note: Independent review and limited repair on the desktop

Status: implemented

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
