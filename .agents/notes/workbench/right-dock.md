---
{
  "schema": "harness-note/2",
  "id": "a73f2f05-7198-52b1-90ca-187f682460c1",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-07-19",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-07-19-agent-note-right-dock-rail-with-semantic-file-icons--a73f2f05.md",
      "sourceHash": "1f9832e09ef28f7203c6aef35005d94ee0be06cb94fa41123eff164448cb0a67",
      "originalBodyHash": "364955ecc709a743e53d569237272defdfbcff2ad862813402e823f358ac15e1",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Right dock rail with semantic file icons. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-07-19-right-dock.md",
        "sourceHash": "1f9832e09ef28f7203c6aef35005d94ee0be06cb94fa41123eff164448cb0a67",
        "originalBodyHash": "364955ecc709a743e53d569237272defdfbcff2ad862813402e823f358ac15e1"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---
# Right dock rail with semantic file icons


## Problem

The right side freezes four singleton tabs in a fixed strip while the file tree speaks no visual language. Adding a tool squeezes the tab row, tool state drifts across stores, and file kinds, selection, and version-control states collide in one channel.

## Decision

The right side composes a fixed tool rail, open tool tabs, and a variable-width panel. Tools stay open in multiples with exactly one visible, each tool runs as a singleton, and registry order fixes tab sequence with no drag sorting. Collapse keeps a single source of truth and tool business state follows existing stores per workspace. File icons lead with semantic shape plus low-saturation color inside the monochrome-plus-accent language, and file kind, selection, and version-control states travel three independent visual channels. Icon taxonomy shares one source with the file viewer classification. Office preview stays a transient middle workspace outside the rail.

## Alternatives considered

- Per-tool windows — strongest case gives every tool full space. The driver that rules it out is frame fragmentation: tools scatter beyond the working context.
- Repeatable tool instances — strongest case mirrors document tabs. The driver that rules it out is semantic mismatch: tools are capability entries, not documents.
- Full-color file icons — strongest case reads faster at a glance. The driver that rules it out is noise: saturated rainbows fight the restrained shell.
- Do nothing / reuse fixed tabs — staying put avoids all migration risk. The cost is an unextendable strip and a mute file tree.

## Consequences

- **Gains**: New tools arrive through registry order without squeezing chrome; file kinds read instantly across tree and viewer from one taxonomy.
- **Costs and limits**: Singleton tools cannot split side by side; drag sorting and pinning stay explicitly out until range pressure demands them.
