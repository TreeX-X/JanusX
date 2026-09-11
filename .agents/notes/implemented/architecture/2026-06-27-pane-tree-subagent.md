# Agent Note: Pane tree with island subagent surface

Status: implemented

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
