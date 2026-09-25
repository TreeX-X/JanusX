---
schema: harness-note/1
id: b3704d91-c17d-4492-ae71-a44cfec8bbd7
kind: decision
lifecycle: implemented
created: 2026-09-21
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
extensions:
  r5Migration:
    sourceHash: 015af5a52f9c2a5285ea98cecb94c17476f310e1bf6c7d51faf5851017a3d771
    repairs:
      - relations[0].reason
    originalRelations:
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
        reason: V1 delivery of the workspace session requirement
---

# Agent Note: Workspace session cards with rebuilt checkpoints and continue

## Problem

Terminals die and their ids die with them, so checkpoints keyed by terminal id plus a workspace-global index cannot answer which conversation a file state belongs to. Restoring one terminal's checkpoint pruned every later checkpoint in the workspace, including other terminals'. The renderer listed one undifferentiated timeline with no session ledger, and continuing work after a usage cutoff, context rot, or agent switch meant hunting transcript files by hand. Binary and oversized files had no guard: diffs rendered garbage and full content entered memory every turn end.

## Decision

`src/main/sessions/session-registry.ts` owns one stable session per agent terminal with atomic persisted storage, corrupt-tolerant load, and a bounded ledger. Terminal creation registers the session, submit-line records prompts, checkpoint finalization links snapshots, hook turn ends record kinds against the pending baseline, and provider session ids arrive from turn starts. The registry never ends a session when its terminal closes, so transcripts stay resumable, and closing events only detach the terminal mapping.

Checkpoints bind to sessions end to end. New checkpoints carry session, turn, kind, worktree, and parent fields through creation, IPC, and the renderer summary. Restore prunes the owning session scope, falling back to the owning terminal for legacy records, and the renderer passes the session scope explicitly. Files at or above 2 MiB record size without blobs, survive restore untouched, and stay out of the delete sweep; binary content returns empty diffs; per-file change records with line counts load lazily per checkpoint while concatenated diffs stay for the legacy drawer.

`src/renderer/src/components/SessionPanel.tsx` mounts as the sixth right-dock tool beside files, git, checkpoints, assist, and persona. Cards show the engine icon with its type name, first prompt, turns, checkpoint counts, and branch, embed the session checkpoint segment with per-file records and a two-step restore, and render merged sessions as read-only archive cards with restore disabled and Continue available. The panel title stays fixed while scope tabs filter workspace, project, and all.

Continue in New Session opens a fresh terminal in the original working directory with the original shell and preset, builds a focused handoff from the task title, latest progress, transcript reference, and checkpoint, and submits it as the first line once the pty proves live. A dead terminal keeps the handoff on the record for manual resend, and a failed launch archives the empty session instead of leaving a ghost card.

The checkpoint engine change lives in the sibling `janus-agentX` `agent-core` package with its own unit coverage, since JanusX consumes the compiled `dist` through a `file:` dependency. The JanusX tree carries the rebuilt `dist` checkpoint files in `node_modules` so unit tests exercise the new behavior; the sibling source of truth is rebuilt and committed alongside.

## Alternatives considered

- Scope the global index per terminal only, with no session registry — strongest case is the smallest diff to the checkpoint manager. The driver that rules it out is terminal id volatility: closed terminals lose identity, cards cannot span restarts, and Continue has no stable handoff anchor.
- Adopt daemon-backed warm reattach now — strongest case is full Orca parity with agents surviving quit. The driver that rules it out is scope: PTY ownership across quit, relay allowlists, and memory models dwarf session management, and the persisted registry plus cold entries cover V1 without it.
- Auto-submit handoff without a confirm dialog — strongest case is one fewer click on the highest-frequency action. The driver that rules it out is keystroke injection into a live agent: the dialog is the authorization boundary for typing into another process.
- Do nothing / reuse — keep cwd-keyed checkpoints and the whole-disk timeline with no session ledger. The cost is interleaved prune damage forever, no per-workspace conversation view, and manual transcript hunting for every continuation.

## Consequences

- **Gains**: sessions list per workspace with embedded scoped checkpoints; restore never crosses sessions; binary and oversized files stay cheap; Continue reopens work in one confirmed click with a recorded fallback. Sibling `agent-core` 351 checks pass with 24 checkpoint checks covering session fields, scoped prune, oversized survival, binary records, and line counts; JanusX targeted suites pass with 57 checks; project typecheck, touched-file lint, and bilingual key checks pass.
- **Costs and limits**: the persisted registry caps at 200 sessions with oldest-first eviction, and transcripts stay read-only references rather than replayable state. The sibling `dist` copy inside JanusX `node_modules` must be re-synced after every sibling checkpoint rebuild until the dependency moves off `file:` copies. Full-transcript handoff, the turn-change island, worktree sidebar rows, and quit-flush cold restore stay scheduled follow-ups. Built-app Electron acceptance was not exercised here.
