---
schema: harness-note/1
id: 04398816-0514-49da-bb9c-6038a295b6fa
kind: decision
lifecycle: implemented
created: 2026-09-21
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
    reason: Cold-restore shells for the session requirement
---

# Agent Note: Cold-restore shells with one-shot layout

## Problem

Quitting discarded the working set: terminal directories, engine choices, and names lived only in renderer memory, so reopening meant rebuilding context by hand while durable sessions waited in storage with nothing pointing at their directories. Any restore that relaunched agents would violate the explicit rule against auto-running them, and replaying a stale manifest twice would duplicate shells on every boot.

## Decision

The renderer snapshots live plus snapshotted terminals into a validated one-shot manifest on quit preparation, capped at ten shells per workspace with unusable entries dropped. Boot consumes the manifest exactly once: recorded terminals return as shells in their directories with original names, never as agents, and only when the user starts empty; anything already open cancels the replay. Quit can never block on a failed snapshot, one bad shell never stops the rest, and pane geometry stays out of scope until a dedicated layout phase.

## Alternatives considered

- Relaunch original agent presets on boot — strongest case is full fidelity with zero clicks. The driver that rules it out is the no-auto-run rule: agents execute code, and executing code without a present user is never a default.
- Persistent manifest with manual dismiss — strongest case is surviving repeated restarts until acknowledged. The driver that rules it out is replay risk: a forgotten manifest resurrects dead shells forever, while one-shot consumption keeps quit and boot symmetric.
- Full pane geometry restore now — strongest case is pixel-identical sessions. The driver that rules it out is mapping risk: recorded terminal ids no longer match live ptys, so geometry without identity is decoration over wrong targets.
- Do nothing / reuse — keep durable sessions with no directory pointers. The cost is a session list that names work without a way back into its directory.

## Consequences

- **Gains**: quit preserves the working set and boot restores shells in place with agents untouched. Manifest round-trips carry unit coverage for caps, validation, and clearing; project typecheck and touched-file lint pass.
- **Costs and limits**: pane splits do not restore; restored shells lose scrollback and turn state; sessions reattach by directory rather than by identity. Daemon-backed warm reattach stays unscheduled. Built-app Electron acceptance was not exercised here.
