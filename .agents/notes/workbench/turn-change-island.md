---
{
  "schema": "harness-note/2",
  "id": "2f49a04f-4afd-49c5-9433-5581f7d9680f",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-21",
  "class": "feature",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22"}
  ],
  "extensions": {
    "r5Migration": {
      "sourceHash": "21dd894479610f99b7e6b9fe37f19680ffaffe1819d69be9b0a9faefad2d6214",
      "repairs": ["relations[0].reason"],
      "originalRelations": [
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22",
          "reason": "Turn-change island for the session requirement"
        }
      ]
    },
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-21-agent-note-turn-change-island-over-the-terminal-pane--2f49a04f.md",
      "sourceHash": "5afd0e91cfb3cfec843db657ef49be1162baaf9881bcfc7dae1646b28ebbc616",
      "originalBodyHash": "1044b0ed058c57a1bde09e8fc1a9fa706b46ebe888e2579ea809a45c44f9b548",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Turn-change island over the terminal pane. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-21-turn-change-island.md",
        "sourceHash": "5afd0e91cfb3cfec843db657ef49be1162baaf9881bcfc7dae1646b28ebbc616",
        "originalBodyHash": "1044b0ed058c57a1bde09e8fc1a9fa706b46ebe888e2579ea809a45c44f9b548"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Turn-change island over the terminal pane

## Problem

Turns ended invisibly: files changed behind the prompt with no per-turn signal, so the only way to learn what an agent did was scrolling output or opening the checkpoint drawer. The checkpoint layer could not carry a per-turn surface either, with unbounded reads, garbage binary diffs, and concatenated strings instead of records.

## Decision

The main process emits a turn-end change event with capped per-file records and aggregate counts. Per-terminal snapshots define adjacent-conversation differences; the checkpoint reference remains audit metadata. The persistent overlay, empty-turn handling, and bounded history follow [Terminal right-island turn file history](../terminal/terminal-right-island-turn-history.md). Binaries and oversized files report status without content.

## Alternatives considered

- Native per-engine cards — strongest case is fidelity inside each CLI. The driver that rules it out is the consistency invariant: two engines cannot host cards at all, and five different renders are five contracts to maintain.
- ANSI injection into the pty stream — strongest case is scrollback-native cards. The driver that rules it out is TUI repainting: injected bytes get wiped or corrupt the cursor model.
- Layout sidebar inside the pane — strongest case is persistence. The driver that rules it out is width: nested sidebars multiply against splits until columns collapse, while the overlay costs zero width.
- Deriving changes from tool calls — strongest case is precision without diffing. The driver that rules it out is observability: external CLIs expose no tool stream, and snapshots also catch shell-side writes.
- Do nothing / reuse — keep the checkpoint drawer as the only change surface. The cost is a turn boundary with no signal and discovery buried one panel away.

## Consequences

- **Gains**: turn-end changes are visible without leaving the terminal across all engines. A quiet turn clears the current signal and preserves earlier change records. The renderer never injects bytes into terminal scrollback.
- **Costs and limits**: capture reads workspace files at turn boundaries and cannot attribute concurrent writes to individual engines. Per-file counts may be unavailable for binaries, large files, and bounded diff work. Snapshot limits and validation commands live in the linked island history decision.
