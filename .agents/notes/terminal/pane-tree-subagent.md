---
{
  "schema": "harness-note/2",
  "id": "93151b7b-6a33-5e5d-bf83-f2109fc85389",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-06-27",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-06-27-agent-note-pane-tree-with-island-subagent-surface--93151b7b.md",
      "sourceHash": "9efd729348ec4b92c711ec61d9c13e238828d33f3850dc28dd71d9b63f7c4850",
      "originalBodyHash": "0ece67af5ecfbf3d1a7725b5c7ac108a76fa4a0e515346b79991512ca37cf10a",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Pane tree with island subagent surface. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-06-27-pane-tree-subagent.md",
        "sourceHash": "9efd729348ec4b92c711ec61d9c13e238828d33f3850dc28dd71d9b63f7c4850",
        "originalBodyHash": "0ece67af5ecfbf3d1a7725b5c7ac108a76fa4a0e515346b79991512ca37cf10a"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# Pane tree with island subagent surface


## Problem

Split terminals need a shared focus truth and subagent activity needs a home. Without a focus model, panes, tabs, and terminals disagree about which terminal receives input. Without a designated surface, subagent states scatter across windows or bloat the working area.

## Decision

The middle workspace renders a pane tree of splits and leaves with a three-layer focus model: active pane, active tab within it, and the single focused terminal they determine. Splits resize, prune, and retain content across navigation without touching terminal lifecycles. The island serves as the sole subagent posture layer for the focused terminal covering states, alerts, scheduling, and navigation hints. Subagent detail never loads into the middle workspace, never becomes a pane tab, and never joins automatic layout. Execution stays in panes; posture stays on the island.

## Alternatives considered

- Subagents as more terminal windows — strongest case reuses the entire terminal stack. The driver that rules it out is conflation: supervision drowns in execution surfaces.
- Subagent tabs in the middle workspace — strongest case keeps everything visible at once. The driver that rules it out is layout theft: supervision competes with the work it supervises.
- Do nothing / reuse single-pane terminals — staying put avoids all focus machinery. The cost is no splits and no shared input truth.

## Consequences

- **Gains**: Exactly one terminal holds unambiguous focus across panes and tabs; subagent posture stays glanceable without consuming working space.
- **Costs and limits**: Focus derivations must stay pure and total over nullable trees; every new pane content kind inherits the focus contract.
