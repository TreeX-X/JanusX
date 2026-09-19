# Agent Note: Thread registry with activation and confirmed close

Status: implemented

## Problem

Task threads persist per run but stay invisible: no surface lists background
threads, threadless runs cannot be activated into threads, and closing a
thread has no path at all. The close rule proposal,
[thread close confirmation](../../archived/architecture/2026-09-18-thread-close-confirmation.md),
defines the only two legal doors but ships no UI. Without a registry,
operators cannot tell idle threads from abandoned ones, and activation means
re-reading the world.

## Decision

`listTaskThreads` aggregates the registry from local runs plus thread files
on every call with no persistent index: runs without a thread file appear
threadless and activatable, and the registry never invents history.
`openTaskThread` activates a thread, creating it on first touch and returning
its model endpoint plus attempt history for reattachment. `closeTaskThread`
destroys only the thread file and its briefs after the explicit user
decision; Notes, receipts, and run records always survive, and actively
owned running or verifying runs refuse with `BUSY`. New channels
`runThreads`, `runThread`, and `runThreadClose` cross IPC as data or coded
failure. The panel lists background threads with state, attempts, verdict,
and model presence, activates into a detail view with the attempt timeline,
and closes through a two-step confirm carrying the run and its receipt
count. Completion alone never offers or performs a close.

## Alternatives considered

- Persist a registry index file: faster listing, but a second truth that
  drifts from run records; rescan rebuild matches the index-free projection
  rule the harness already follows.
- Fold thread data into run states: fewer channels, but execution states
  bloat with auxiliary history and every existing consumer re-verifies.
- One-step thread delete buttons: fastest cleanup, but contradicts the
  confirmed-close rule and risks invisible evidence-context loss.
- Auto-close done threads: zero bookkeeping, but violates the parked-idle
  decision the close rule exists to protect.
- Do nothing / reuse: keep threads file-only; rejected because activation
  stays undiscoverable and the close rule stays unenforced prose.

## Consequences

- **Gains**: background threads are glanceable, activatable with history and
  endpoint intact, and closable only on decision with receipts preserved.
  Adapter, mapping, contract, and island suites pin listing, activation
  creation, owned-run refusal, missing-thread refusal, and the confirm flow.
  Typecheck, production build, package boundaries, and bilingual key checks
  pass.
- **Costs and limits**: the registry scans run records per call; hundreds of
  local runs will want pagination as a follow-up. Agent-proposed closure
  still needs its chat proposal card; the panel confirm covers the user
  door today. Threads on other checkouts stay out of view until their
  checkouts bind.
