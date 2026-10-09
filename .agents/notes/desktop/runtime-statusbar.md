---
{
  "schema": "harness-note/2",
  "id": "b1978fa7-4732-553a-83c3-12aefd34c248",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-06-27",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-06-27-agent-note-application-runtime-status-bar--b1978fa7.md",
      "sourceHash": "2dd611de528749bddeccbbf688bee49bc1022ac3d3cc8fec8e3c944828aaeedf",
      "originalBodyHash": "b9e47f0f8ea3d7b4c2ffff50ccd0bf9a89f36a102a9cc5154b7bfde387237947",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Application runtime status bar. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ./2026-09-19-runtime-drawer-cards-resize.md -> ./2026-09-19-runtime-drawer-cards-resize--faacdaf7.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-06-27-runtime-statusbar.md",
        "sourceHash": "05cb526a3396a6d9bbd677930a7d88451166ef6e26d6fcc033f8157155362183",
        "originalBodyHash": "ea847e760464b3a19e7b9a2f18c78868e635a1f12206c71a32782b678c670116"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e"
}
---
# Application runtime status bar


## Problem

Running state has no stable address. Terminal, model, context, cost, subagent, approval, and cross-workspace summaries compete for ad-hoc corners, and every new source invents its own display. Users cannot glance once for system posture.

## Decision

The existing bottom bar serves as the application running-state layer rather than any single terminal accessory. It stays lightweight at chrome height, shows focused-terminal plus aggregate summaries under an explicit scope, and opens a monitoring drawer for full telemetry detail on demand. The drawer renders one card per terminal and its height follows a drag handle, owned by [runtime drawer cards and drag height](../workbench/runtime-drawer-cards-resize.md). The island keeps task posture while the bar keeps telemetry; panes keep execution while the drawer keeps observation. The bar never grows into an operations console.

## Alternatives considered

- A separate monitoring window — strongest case isolates rich detail. The driver that rules it out is attention split: posture leaves the main frame users already watch.
- Per-terminal bottom bars — strongest case binds state to its owner. The driver that rules it out is multiplicity: parallel terminals multiply chrome and disagree.
- Do nothing / reuse scattered indicators — staying put avoids all scope machinery. The cost is unglanceable system state.

## Consequences

- **Gains**: One fixed chrome strip answers system posture with scope-explicit summaries; detail lives one gesture away in the drawer.
- **Costs and limits**: Summary density caps at what fits the strip; new telemetry kinds must earn strip space or live in the drawer.
