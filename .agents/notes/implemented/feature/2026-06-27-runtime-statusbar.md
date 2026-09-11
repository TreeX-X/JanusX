# Agent Note: Application runtime status bar

Status: implemented

## Problem

Running state has no stable address. Terminal, model, context, cost, subagent, approval, and cross-workspace summaries compete for ad-hoc corners, and every new source invents its own display. Users cannot glance once for system posture.

## Decision

The existing bottom bar serves as the application running-state layer rather than any single terminal accessory. It stays lightweight at chrome height, shows focused-terminal plus aggregate summaries under an explicit scope, and opens a monitoring drawer for full telemetry detail on demand. The island keeps task posture while the bar keeps telemetry; panes keep execution while the drawer keeps observation. The bar never grows into an operations console.

## Alternatives considered

- A separate monitoring window — strongest case isolates rich detail. The driver that rules it out is attention split: posture leaves the main frame users already watch.
- Per-terminal bottom bars — strongest case binds state to its owner. The driver that rules it out is multiplicity: parallel terminals multiply chrome and disagree.
- Do nothing / reuse scattered indicators — staying put avoids all scope machinery. The cost is unglanceable system state.

## Consequences

- **Gains**: One fixed chrome strip answers system posture with scope-explicit summaries; detail lives one gesture away in the drawer.
- **Costs and limits**: Summary density caps at what fits the strip; new telemetry kinds must earn strip space or live in the drawer.
