---
{
  "schema": "harness-note/2",
  "id": "8e32dd4e-bb0f-588e-a581-653b94a609be",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-08-14",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-08-14-agent-note-f12-code-navigation-workbench--8e32dd4e.md",
      "sourceHash": "94a55040ed30657f9eeea62871562ca89f8aa6884309abdc7bad18ad665541be",
      "originalBodyHash": "8a0c54d64d4a0aac31c91c5b7855726c52d347fb355233cc8754160b26fdbed2",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents F12 code navigation workbench. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-08-14-f12-navigation.md",
        "sourceHash": "94a55040ed30657f9eeea62871562ca89f8aa6884309abdc7bad18ad665541be",
        "originalBodyHash": "8a0c54d64d4a0aac31c91c5b7855726c52d347fb355233cc8754160b26fdbed2"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---
# F12 code navigation workbench


## Problem

The file viewer shows code without understanding it. Jumping to a declaration means manual search across files, and large projects make definition hunts the dominant navigation cost.

## Decision

The viewer grows a full definition chain behind one key. Stable file identities back every editor with cross-tab model retention, so targets survive viewer unmounts. TypeScript and JavaScript resolve through the editor worker across files with automatic tab creation and selection landing; C and C++ resolve through per-workspace language sessions that rebuild on failure and recycle on exit. Unsaved buffers participate through synchronization before resolution, and consecutive requests carry incrementing ids that discard stale results. Embedded and standalone hosts share one navigation contract and one target store.

## Alternatives considered

- Keybinding-only jump — strongest case ships in an afternoon. The driver that rules it out is chain depth: stable identity, retention, creation, and landing each need their own mechanism.
- External editor handoff — strongest case borrows a complete navigator. The driver that rules it out is context exile: navigation leaves the reviewing workspace.
- Do nothing / reuse text search — staying put keeps the viewer simple. The cost is definition hunts on every unfamiliar codebase.

## Consequences

- **Gains**: One key traverses same-file and cross-file definitions in both hosted modes with multi-result and history seams reserved.
- **Costs and limits**: Project configuration and alias resolution stay unparsed under generic compiler options; workspace scans cap file counts and sizes for responsiveness.
