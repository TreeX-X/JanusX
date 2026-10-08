---
{
  "schema": "harness-note/2",
  "id": "90af6e6c-526e-58a8-b0c1-f524a24af92b",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-18",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-task-bound-persistent-threads-for-desktop-runs--90af6e6c.md",
      "sourceHash": "d03dd9e897774aa23955354ddb3ff3eef6c6e36890f9528f2d704d8d65e1b23a",
      "originalBodyHash": "e91ecbc665f7286616a901f81baf66b829380df1d91ad20a11ee5e78dfc0e421",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Task-bound persistent threads for desktop runs. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: 2026-09-19-desktop-implementation-history.md -> ./2026-09-19-desktop-implementation-history--854981c7.md",
        "Rebased Markdown destination: ../note://62b44166-82f0-41ff-838d-e2b02388ed06/f337c49b-fdd3-4e16-be05-a614df57ac13 -> ../../../janus-agentX/.agents/notes/proposed/architecture/2026-09-11-harness-persistent-subagents.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-18-persistent-task-threads.md",
        "sourceHash": "4438d652477e87a13d86bb3ff810509f8bd638c7ecfa5531a2741aa17a7d6a07",
        "originalBodyHash": "9ce11f4247c295e856f52e4fb5610fad43d66536c506e6a7bed2e23ed9b71efe"
      }
    }
  },
  "updated": "2026-10-08T09:06:56.496Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/0fc34aee-911c-44f3-b873-a1272d93631a"
}
---
# Task-bound persistent threads for desktop runs


## Problem

Desktop executions are one-shot calls: checks run, a review claim arrives,
and a receipt lands or nothing does. Consecutive executions on the same run
share no memory beyond the run record, so every repair re-reads the world,
the review model must be retyped per execution, and a restart silently drops
the model endpoint the recovery needed. The agentX persistent-subagent
proposal,
[janus-agentX 2026-09-11](note://62b44166-82f0-41ff-838d-e2b02388ed06/f337c49b-fdd3-4e16-be05-a614df57ac13),
requires the opposite: one thread per task, repairs appended to the same
thread, and model endpoints restored together with history.

## Decision

`src/main/harness/task-thread.ts` persists one thread per run under
`.agents/.local/runs/<runId>/thread.json` with atomic temp-plus-rename
writes. Separate [implementation observations](../../agent/desktop-implementation-history.md) carry bounded model output, tool outcomes and baseline-matched recovery. Each thread carries the review model endpoint and one entry per
attempt with the tested manifest hash, check outcomes, review verdict,
receipt id, and repair packet. `executeDesktopXdo` ensures the thread on
entry, feeds the last attempts as review history, and records the attempt
with whatever the turn produced, including refused reviews. Thread writes
never fail a run: kernel truth dwarfs auxiliary history. The execute handler
resolves a missing review model from the stored endpoint and persists an
explicitly chosen one, so recovery reuses the endpoint instead of asking
again. Concurrent desktop executions are bounded by the `[agents]`
`max_threads` budget from `.codex/config.toml`; an absent config runs
unguarded and says so. Corrupt thread files recover loader-tolerantly to a
fresh thread while run records, Notes, and receipts stay intact.

## Alternatives considered

- Persist full turn transcripts: richest context, but unbounded growth and
  private tool output in a shared-shaped store; attempt summaries plus
  receipts carry the repair signal.
- Fail runs on thread-store errors: loudest consistency, but the thread is
  auxiliary and `.local` pressure must never veto kernel truth.
- Invent a desktop concurrency default: always guarded, but the budget
  belongs to config truth; absence stays explicit instead of guessed.
- Do nothing / reuse: keep one-shot executions with retyped models and
  context-free repairs; rejected because it contradicts the persistent
  repair semantics the harness standard requires.
- Build hidden-thread lifecycles and evaluator threads here: correct
  direction, but owned by the delegated-review block with its own reviewer
  identity and budget rules, not by direct xdo turns.

## Consequences

- **Gains**: repairs reattach to the same thread with prior verdicts and
  failures in the review prompt; model endpoints survive restarts and
  re-entries; over-budget dispatches refuse `BUSY` with the spent ratio.
  Thread round-trips, loader tolerance, budget parsing, reattachment
  history, endpoint recovery, and the budget guard carry unit and mapping
  coverage. Awaiting runs hold no execution slot while keeping their lease,
  matching the proposal's idle-thread rule.
- **Costs and limits**: history condenses into the handoff brief with caps
  and a truncation marker; deeper archaeology still reads receipts and
  Notes. Hidden-thread approval routing does not apply:
  desktop turns run no interactive tools, so there are no hidden approvals
  to route. `max_depth` holds trivially because direct turns never nest.
  The panel restores cancellation controls from host activity after remount.
  The overall job time budget remains unenforced.
