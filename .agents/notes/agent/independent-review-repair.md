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
  "updated": "2026-10-08T12:41:09Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Independent review and limited repair on the desktop


## Problem

Independent evaluation must test fixed acceptance against the implemented revision without inheriting implementation history. Auditing only the implementor's prior checks leaves the evaluator unable to exercise missing cases. xflow and explicitly retained independent obligations need this evaluation; xdel stops after self-review and leaves any independent obligation pending.

## Decision

Desktop execution and standalone review use the shared agentX test request contract. The evaluator first submits minimal tests for fixed AC; the host reruns named Main-authored checks or executes generated Node assertions against copied, read-only manifest files. It returns actual results before the final model verdict. A missing test phase is refused, unavailable execution blocks approval and failed required checks produce needs-fix. Execution limits and permission behavior belong to the [shared runtime Note](note://62b44166-82f0-41ff-838d-e2b02388ed06/0b2e7c13-8ae0-42d9-b185-1dd575c43a19).

The evaluator inherits no implementation history: its brief carries an empty prior, actual AC text, exact manifest and criterion hashes. Both desktop entry points support source reads during planning. Reviewer identity differs from the implementor; new checks record that reviewer, while existing evidence keeps its original actor. The verdict lands as an immutable receipt and a thread evaluation. State, lease, attempt and acceptance are rechecked during evaluation; changed code blocks receipt validity. Task content remains Main-owned.
`finishWithLatestReceipt` finishes a verifying run against its latest
receipt and a live snapshot. Repairs stay manual and explicit through
`runRepair` with the failing receipt and a summary, spending the kernel
budget that the panel now displays. New channels `runReview`, `runFinish`,
and `runRepair` cross IPC as data or coded failure with tokens held in the
main process.

## Alternatives considered

- Give the evaluator unrestricted command and write tools: flexible, but loses the source and Task ownership boundary. Reuse host execution with exact declared commands and permission-limited temporary tests.
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

Current Main checks pass 45 desktop executor tests, six standalone review tests and 15 IPC mapping tests across targeted runs. The added model-port test executes a real reviewer-generated assertion and binds it to the reviewer receipt; another rejects approval without test execution. Model replies are controlled test fixtures. These checks do not replace independent evaluation of the final integration.

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
