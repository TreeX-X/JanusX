---
{
  "schema": "harness-note/2",
  "id": "d9f1d453-d9cc-5fba-8655-6ac51f3cb75c",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-18",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-thread-registry-with-activation-and-confirmed-close--d9f1d453.md",
      "sourceHash": "5468c18b4366befe3b5835314bcd292e085a4c9c927b943ad053c991d3dfe910",
      "originalBodyHash": "d0471cd506ded09335e0038d67f9a79bac017d7ffd869a33c25f145af95382f9",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Thread registry with activation and confirmed close. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ../../archived/architecture/2026-09-18-thread-close-confirmation.md -> ./2026-09-18-thread-close-confirmation--abb1ccb3.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-18-thread-registry-activation.md",
        "sourceHash": "753c14664990133198900ac3a4e474e9152bc66ef2604c7e500fac71c39a9f48",
        "originalBodyHash": "029490d0ce859af7f4c141394dd0c96f5adc09e787412bde4982aaf588258daf"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/dc1aca7c-408f-406d-add4-ba78d556b662"
}
---
# Thread registry with activation and confirmed close


## Problem

Task threads persist per run but stay invisible: no surface lists background
threads, threadless runs cannot be activated into threads, and closing a
thread has no path at all. The close rule proposal,
[thread close confirmation](../agent/history/thread-close-confirmation.md),
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
