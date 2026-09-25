---
schema: harness-note/1
id: 2f49a04f-4afd-49c5-9433-5581f7d9680f
kind: decision
lifecycle: implemented
created: 2026-09-21
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
extensions:
  r5Migration:
    sourceHash: 21dd894479610f99b7e6b9fe37f19680ffaffe1819d69be9b0a9faefad2d6214
    repairs:
      - relations[0].reason
    originalRelations:
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
        reason: Turn-change island for the session requirement
---

# Agent Note: Turn-change island over the terminal pane

## Problem

Turns ended invisibly: files changed behind the prompt with no per-turn signal, so the only way to learn what an agent did was scrolling output or opening the checkpoint drawer. The checkpoint layer could not carry a per-turn surface either, with unbounded reads, garbage binary diffs, and concatenated strings instead of records.

## Decision

The main process emits a turn-end change event carrying kind, baseline reference, capped per-file records, and aggregate counts, computed off the turn pipeline with the hash-index fast path keeping quiet trees cheap. `TurnChangeIsland` mounts one overlay per terminal pane for every engine with no per-engine branch: a collapsed pill by default, an expanded file index on focused turns or pinned clicks, and dismissal on Esc, click-away, close, or the next turn. The chrome never steals terminal focus, sizing stays relative to the pane with narrow panes pinned to the pill, and a short hover-aware TTL collapses the signal while the session panel keeps the record. Binaries and oversized files report kind and size without content.

## Alternatives considered

- Native per-engine cards — strongest case is fidelity inside each CLI. The driver that rules it out is the consistency invariant: two engines cannot host cards at all, and five different renders are five contracts to maintain.
- ANSI injection into the pty stream — strongest case is scrollback-native cards. The driver that rules it out is TUI repainting: injected bytes get wiped or corrupt the cursor model.
- Layout sidebar inside the pane — strongest case is persistence. The driver that rules it out is width: nested sidebars multiply against splits until columns collapse, while the overlay costs zero width.
- Deriving changes from tool calls — strongest case is precision without diffing. The driver that rules it out is observability: external CLIs expose no tool stream, and snapshots also catch shell-side writes.
- Do nothing / reuse — keep the checkpoint drawer as the only change surface. The cost is a turn boundary with no signal and discovery buried one panel away.

## Consequences

- **Gains**: every turn end lands a transient, focus-safe signal with per-file counts across all engines. The hash-index fast path skips reads on quiet trees; sibling `agent-core` checks cover it; turn feed, store, and IPC contract checks pass with project typecheck, touched-file lint, and bilingual keys.
- **Costs and limits**: composer clearance is a fixed heuristic with no TUI geometry reported; file lists cap at one hundred entries with the drawer-equivalent record in Sessions; scrollback never contains the island. Daemon-backed reattach stays unscheduled. Built-app Electron acceptance was not exercised here.
