---
{
  "schema": "harness-note/2",
  "id": "abb1ccb3-be21-5f64-9b55-de5089e621e9",
  "kind": "decision",
  "lifecycle": "archived",
  "created": "2026-09-18",
  "class": "architecture",
  "disposition": {
    "reason": "Migrated from legacy lifecycle folder; historical state is retained and no execution is inferred."
  },
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-thread-close-needs-a-user-decision--abb1ccb3.md",
      "sourceHash": "1840be13345bf013ce7036050cb399a144e101ea32e44c734d815f1be7b86c4d",
      "originalBodyHash": "17f79682de71d54aaed88d52be82ab9b83556982e7123bca8e031118ecfc4c4d",
      "category": "historical",
      "reason": "Existing archived disposition remains historical; Migrated from legacy lifecycle folder; historical state is retained and no execution is inferred.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/archived/architecture/2026-09-18-thread-close-confirmation.md",
        "sourceHash": "1840be13345bf013ce7036050cb399a144e101ea32e44c734d815f1be7b86c4d",
        "originalBodyHash": "17f79682de71d54aaed88d52be82ab9b83556982e7123bca8e031118ecfc4c4d"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Thread close needs a user decision


## Problem

Task-bound threads outlive every turn, but nothing defines when one may end.
The agentX proposals only say the whole task destroys its threads on
completion and that humans keep an override. Under that rule a finished run
silently deletes the thread its repairs might still need, and no checkout
distinguishes an idle thread from a dead one. Desktop runs need an explicit
close rule before the thread registry and activation entries land.

## Decision

A thread closes through exactly two doors. The user declares removal, and
the thread is destroyed. Or the main agent proposes closure, the desktop pops
a confirmation carrying the task, the receipts, and the reason, and the user
confirms; only then is the thread destroyed. Completion never closes a
thread by itself: a done run parks its thread idle with receipts intact.
Closing removes the local thread file and the registry entry, never the task
Note, the receipts, or the run record. Idle threads stay resumable, keep
their lease behavior, and cost no concurrency slot.

## Alternatives considered

- Destroy on task completion as the agentX drafts describe: zero bookkeeping,
  but repairs after completion lose their thread and the close is invisible.
- Main-agent close without confirmation: fastest cleanup, but contradicts
  the human-override direction and risks deleting evidence context silently.
- Reference-counted auto close on idle timeout: self-cleaning, but timeouts
  guess user intent and add a second lifecycle clock next to leases.
- Do nothing / reuse: leave threads append-only forever; rejected because
  the registry fills with dead threads and activation cannot tell idle from
  abandoned.

## Acceptance criteria

- [ ] Done runs park idle with receipts; no path destroys a thread on completion alone.
- [ ] User-declared removal destroys the thread file plus the registry entry while Notes, receipts, and run records survive.
- [ ] Main-agent proposals pop a confirmation with task, receipts, and reason; dismissal keeps the thread idle.
- [ ] Activation of an idle thread reattaches its history and model endpoint without re-reading the world.

## Consequences

- Idle threads accumulate: the registry must show last activity so stale
  threads are closable on purpose, not by timeout guessing.
- Confirmation fatigue: proposals fire only when the main agent judges the
  thread done, never per attempt or per receipt.
