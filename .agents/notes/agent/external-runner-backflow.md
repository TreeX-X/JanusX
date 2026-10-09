---
{
  "schema": "harness-note/2",
  "id": "5352fb79-fb38-570a-aed8-7f39cac2a91b",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-18",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-external-runner-backflow-through-handoff-and-takeover--5352fb79.md",
      "sourceHash": "cc1a6874db8bee060a05f4b505b34433180957c39c541520864803e515cf01bb",
      "originalBodyHash": "ec97765cfa5c9cb9897e654f306962692726e24755ec0981a83b98f6dda4010f",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents External runner backflow through handoff and takeover. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-18-external-runner-backflow.md",
        "sourceHash": "cc1a6874db8bee060a05f4b505b34433180957c39c541520864803e515cf01bb",
        "originalBodyHash": "ec97765cfa5c9cb9897e654f306962692726e24755ec0981a83b98f6dda4010f"
      }
    }
  },
  "updated": "2026-10-08T03:43:42.451Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# External runner backflow through handoff and takeover


## Problem

Desktop runs complete inside Electron, and terminal runs complete inside the
CLI, but the handover between them has no desktop surface. A run prepared for
an external terminal cannot show its launch entry, the handoff file stays
invisible until read from disk, and taking over a run from another owner has
no panel path. Without these, external evidence arrives without provenance
and host switches happen silently.

## Decision

The prepare form gains an executor choice. Internal runs keep the desktop xdo
host; external runs show an awaiting-launch hint while queued and an
external-running hint while owned elsewhere, and the desktop execute button
stays disabled for them. `readTaskHandoff` in the execution adapter reads a
written handoff for display and refuses missing or empty files instead of
inventing content. New channels `runHandoffRead` and `runTakeover` cross IPC
as data or coded failure; takeover needs an explicit reason, refuses while a
desktop execution is in flight, and never returns the new lease token to the
renderer. The panel shows the handoff markdown, the terminal entry command
for the pinned task, copy actions for the path and the command, and a reason
plus takeover action. External evidence still lands only as files: rescan
plus the shared kernel decide validity, exit codes never do.

## Alternatives considered

- Reuse the raw handoff path display only: less UI, but operators copy the
  wrong revision or mistype the CLI entry; the pinned command travels with
  the displayed handoff.
- Return the takeover lease token to the renderer: saves one lookup, but
  leases are owner secrets and every later call re-resolves them in the main
  process anyway.
- Do nothing / reuse: keep handoff write-only and ownership implicit;
  rejected because silent host switches strand runs and contradict the
  explicit-takeover rule the design requires.
- Build the Ink TUI loop here: out of scope; Ink lives in the janus-agentX
  CLI package and lands there against the same handoff contract.

## Consequences

- **Gains**: external runs are preparable, visible while awaiting launch,
  enterable through one copied command, and takeable over with a recorded
  reason. Handoff reads refuse before any write. Adapter, mapping, contract,
  and island suites pin the new channels; the island spec walks prepare as
  external, start, handoff display, and reasoned takeover. Typecheck,
  production build, package boundaries, and bilingual key checks pass.
- **Costs and limits**: the desktop never launches the external process
  itself; opening the terminal stays a manual step next to the copied
  command. The handoff path mirrors the kernel run-store location until the
  recorded move of the kernel into `harness-node`. Cross-machine sharing
  still travels through git portable results, not the local handoff file.
