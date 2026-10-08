---
{
  "schema": "harness-note/2",
  "id": "d50b6b23-b80a-5748-a34e-f89200058a5d",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-06-22",
  "class": "bug-fix",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-06-22-agent-note-ime-candidate-window-drift--d50b6b23.md",
      "sourceHash": "bfeeeb457fb71bf8e020ebd189432225dc38d65957a6f3bcb601a49c227e93fa",
      "originalBodyHash": "80efd6e0d95841ffde650bd3fd279f45cfbc49ff84845810ed73924017c460a6",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents IME candidate window drift. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/bug-fix/2026-06-22-ime-candidate-drift.md",
        "sourceHash": "bfeeeb457fb71bf8e020ebd189432225dc38d65957a6f3bcb601a49c227e93fa",
        "originalBodyHash": "80efd6e0d95841ffde650bd3fd279f45cfbc49ff84845810ed73924017c460a6"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# IME candidate window drift


## Problem

The input-method candidate window detaches from the cursor line. It lands on the next line or the row edge on first input and after delete-then-type sequences, while sibling terminals and the reference editor terminal never drift. Only this host plus one engine pairing triggers it.

## Decision

Terminal spawning selects the platform console configuration matching the reference editor: the bundled compatibility layer plus cursor-line reflow on the Windows backend. The hidden input surface then tracks buffer coordinates instead of freezing, and the candidate window anchors to the live cursor. Spawning keeps the non-compatibility path where the platform backend cannot apply.

## Alternatives considered

- Patch cursor reporting in the renderer — strongest case avoids spawning changes. The driver that rules it out is cause depth: frozen buffer coordinates originate below the renderer, so surface patches chase symptoms.
- Custom candidate positioning — strongest case controls placement exactly. The driver that rules it out is platform duel: fighting the input framework breaks with every system update.
- Do nothing / reuse default spawning — staying put keeps one spawn path. The cost is unreadable input for affected users on every session.

## Consequences

- **Gains**: Candidate placement matches the reference terminal behavior on first input, retype, and delete sequences.
- **Costs and limits**: Spawning now branches per backend with bundled binaries to ship; new engine pairings need drift verification.
