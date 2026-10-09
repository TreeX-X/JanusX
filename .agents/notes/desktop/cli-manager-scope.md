---
{
  "schema": "harness-note/2",
  "id": "e7bb35aa-e265-5307-834c-fc5ba36ec317",
  "kind": "decision",
  "lifecycle": "proposed",
  "created": "2026-07-14",
  "class": "process",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-07-14-agent-note-adjacent-suite-scope-boundary-with-auto-update--e7bb35aa.md",
      "sourceHash": "b6f0850d906f539ce2aa4589176afd236d165493e910cb2a1ec83698b0638ba6",
      "originalBodyHash": "cc8b7bc535b986e6e1846f46b30dcfb2e89609007c173532e3d1cbbacc68daaf",
      "category": "formal",
      "reason": "Retains the source decision in proposed lifecycle; body documents Adjacent-suite scope boundary with auto-update. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/proposed/process/2026-07-14-cli-manager-scope.md",
        "sourceHash": "b6f0850d906f539ce2aa4589176afd236d165493e910cb2a1ec83698b0638ba6",
        "originalBodyHash": "cc8b7bc535b986e6e1846f46b30dcfb2e89609007c173532e3d1cbbacc68daaf"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e"
}
---
# Adjacent-suite scope boundary with auto-update


## Problem

An adjacent terminal manager overlaps the product surface and invites scope sprawl. Without an explicit boundary, every release relitigates session workbenches, command palettes, token dashboards, and provider switching while the unglamorous updater nobody demos stays unbuilt.

## Decision

Implement in-app automatic updates as the sole adoption from the adjacent suite. Keep the restore-point prompt timeline and resource monitoring as later candidates. Decline the full session workbench, global command palette, historical token dashboard, provider switching, and deep personalization: external specialists own those directions. Hold the differentiation path of prompt to snapshot to agent execution to diff to blueprint and knowledge results instead of cloning chat archives.

## Alternatives considered

- Full suite parity — strongest case wins every feature checklist. The driver against it is dilution: competing with specialists starves the core workflow.
- Manual download releases — strongest case needs zero updater machinery. The driver against it is fragmentation: upgrade friction scatters installed versions.
- Do nothing / reuse unbounded scope — staying put decides nothing. The cost is version fragmentation plus a relitigated boundary every cycle.

## Acceptance criteria

- [ ] In-app automatic updates ship across packaged platforms.
- [ ] The declined suite stays out with reasons recorded here.
- [ ] The differentiation path reads as the product spine in planning docs.

## Consequences

- Updater behavior varies per OS packaging; each target needs its own verification pass.
- Declined items return as requests; this note is the standing answer.
