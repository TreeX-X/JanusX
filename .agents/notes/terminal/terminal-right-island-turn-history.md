---
{
  "schema": "harness-note/2",
  "id": "70beb72a-424d-5e96-a0d0-8e1a29635220",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-23",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-23-agent-note-terminal-right-island-turn-file-history--70beb72a.md",
      "sourceHash": "6919857c310698fdebb7ccae62292c930ac407f5ee15cf07c7b56bfee93e5cc1",
      "originalBodyHash": "032624db129185f8413dd12e8b3c3a6b4378c9383a47ecbdcee2c176525adc31",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Terminal right-island turn file history. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-23-terminal-right-island-turn-history.md",
        "sourceHash": "2b70756b0357c085763307b7f5438033aa785d3a53db340cba7602b8c3232563",
        "originalBodyHash": "5ec25512db3dd918d3bbce1987b7ad955f716b2d0dc64c7c6a3d800056b70427"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# Terminal right-island turn file history

## Problem

A terminal's file-change signal must describe the difference between consecutive completed conversations. Reusing a submission checkpoint ties this signal to input parsing and can combine several conversations. Multiple mounted islands subscribe to the same global event, so unguarded appends create duplicate history entries. Empty turns require an empty latest view while prior change records remain accessible.

## Decision

`TerminalTurnChangeTracker` owns one in-memory file baseline per terminal. The initial capture precedes CLI creation; each accepted turn end compares its captured state with the previous completed turn and advances the baseline, including quiet turns. Start/end gating ignores duplicate completion hooks, per-terminal queues preserve event order, and unregistering discards pending results. Snapshot failures clear the baseline and publish an unavailable result; the next successful capture re-establishes the baseline without claiming a cumulative change.

The tracker reads Git's tracked and nonignored untracked paths, with a directory walk for folders without Git. Internal checkpoint and build directories are excluded. Small regular files use content hashes; files at least 2 MiB use size and modification metadata and have no content diff. Text retention is bounded at 16 MiB per terminal snapshot. The `diff` library counts added and deleted lines in chronological order with a per-file time limit; omitted content or a diff timeout leaves counts unknown. Captures are observational filesystem reads, so concurrent writers can affect a boundary; a detected size change during a read invalidates that capture.

The renderer shares one reference-counted IPC subscription. Turn identity and sequence reject duplicates and stale results. Only nonempty successful changes append to the twenty-record history; every quiet or unavailable turn clears latest independently. Identical file lists from different turns remain separate valid records. Terminal teardown clears both views. History stores immutable summaries in memory, and file clicks open the current embedded editor preview.

The right-edge dock is 32 px wide when collapsed, with 2 px horizontal padding to keep the 99+ badge readable while covering less terminal content. It displays only the latest nonzero file count, caps its compact label at 99+, and keeps the exact count in the accessible label. A quiet dock hides the number and remains operable for latest and history. Single click opens latest; double click opens history; keyboard activation and explicit view buttons provide the same access. Expanded latest and history cards retain their 340 px and 370 px width limits. Cards emphasize filenames over directory paths, align line counts, use localized status and timestamps, and share dark/paper theme tokens with reduced-motion support.

## Alternatives considered

- Reuse submission checkpoints and filter empty renderer events. This keeps one snapshot mechanism, but its baseline depends on input recognition and represents submission time rather than the previous completed conversation.
- Persist additional end-of-turn checkpoints. This reuses blob storage, but mixes transient UI tracking with restore-point retention and session checkpoint counts.
- Keep one event subscription per island with content-based deduplication. This minimizes lifecycle plumbing, but repeats global work and can erase legitimate identical changes in different conversations.

## Consequences

Latest reflects the current conversation while history contains only actual change records. Independent baselines add filesystem reads and bounded text retention per open terminal; large-file metadata is approximate, and shared-workspace edits from other terminals are included. History is not persisted, and editor previews are current files rather than archived contents.

Verification uses `npx vitest run tests/unit/turn-change-tracker.test.ts tests/unit/turn-changes-store.test.ts` for adjacent turns, quiet turns, duplicate subscriptions, failures, teardown, Git ignores, and binary/large files. `npx playwright test tests/e2e/turn-changes.spec.ts --project=island --workers=1` checks latest clearing, retained history, compact counts, keyboard access, and dark/paper screenshots.
