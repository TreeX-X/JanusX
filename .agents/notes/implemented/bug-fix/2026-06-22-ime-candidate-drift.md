# Agent Note: IME candidate window drift

Status: implemented

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
