---
schema: harness-note/1
id: bb3ef36c-f74e-4589-98c7-601f8823d367
kind: decision
lifecycle: implemented
created: 2026-09-21
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/d87e7a46-1d85-45e5-a635-63a6838d441c
extensions:
  r5Migration:
    sourceHash: 2acff95fff17418bba67bb204271d95217c14887eb2ef17400d63fb24aed818a
    repairs:
      - relations[0].reason
    originalRelations:
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/d87e7a46-1d85-45e5-a635-63a6838d441c
        reason: Session cards render the checkpoints surfaced under each sidebar
          worktree group
---

# Agent Note: Session-owned checkpoints, standalone checkpoints tool retired

## Problem

The right dock carries two checkpoint surfaces for one mechanism: the standalone `checkpoints` tool (cwd-scoped timeline) and the per-session checkpoint lists inside session cards. Users meet restore in two places with different guarantees, while the standalone panel owns capabilities the session view lacks: full diff preview and a restore review carrying prune warnings plus conflict files. Manual creation, the engine filter, and the cross-session timeline have no equivalent in the session view and need an explicit keep-or-drop ruling before anything is removed.

## Decision

The standalone tool is retired and only its irreplaceable capabilities move into the session cards. Manual creation is dropped (turn-lifecycle auto checkpoints in `src/main/ipc/terminal-handlers.ts` stay the sole producer). The engine filter is dropped (each session card already renders one engine). The cross-session timeline is dropped (each card owns its checkpoints).

Full diff preview lives on every expanded checkpoint as a `diff ▾` toggle reusing the existing `fetchAllDiffs` channel with zero new IPC. A checkpoint whose change records carry `binary` or `oversized` status renders the size row and never mounts the toggle, because `getAllDiffs` stringifies snapshot bytes.

Restore is a two-phase action inside the expanded checkpoint and execution stays blocked until review confirms. The review block carries everything knowable before execution: the prune count derived from `conversationIndex`, the file record list, and the full diff on demand. Conflict files are knowable only after the manager runs, so they surface post-restore in the same block with red styling; the pre-execution gate is the prune plus file review, never a bare second click. Archived sessions keep restore disabled with the existing hint, and every restore refreshes the checkpoint list.

Card header click toggles a detail section fed by the existing `fetchSessionDetail` (`session:get`, no new IPC): two meta lines (workdir, branch; transcript reference plus start time) followed by one block per turn carrying the linked checkpoint's user prompt, the turn kind badge, time, and linked checkpoint index. Agent response prose has no data source in the turn record model, so the answer side renders status metadata only and never invented text; transcript-content IPC is the revisit signal for full Q&A pairs. Detail loads lazily on first expand and caches per card instance; the header toggle owns detail only while the `还原点 N ▾` button keeps owning the checkpoint list.

Removal lands in the same commit: `CheckpointPanel.tsx` is deleted with its `RightToolHost` branch, the registry entry, both `RightToolId` / `RightToolIconKind` members, the rail icon entry, the `common:rightTool.tool.checkpoints.*` keys in both locales plus generated types, and the orphaned renderer surface (`createCheckpoint`, `fetchDiff` in the checkpoint store; `expandedCheckpointId` in worktree UI state). Stored preferences naming `checkpoints` migrate silently through the registry-derived `isRightToolId` filter. Main-process checkpoint IPC is untouched, and `terminal:checkpoint.*` locale keys stay because the session cards consume them.

## Alternatives considered

- Keep both surfaces — strongest case is zero migration risk and no review-gate redesign. The driver that rules it out is the duplicate restore contract: two places restore with different guarantees, and every future checkpoint feature pays the double-surface tax.
- Direct deletion without migration — strongest case is the smallest diff. The driver that rules it out is silent capability loss: full diff preview and conflict disclosure vanish with no replacement, and session restore keeps executing on a bare double click.
- Transcript-content IPC in this slice — strongest case is full Q&A pairs matching the reference exactly. The driver that rules it out is scope: per-engine transcript formats plus size caps and turn mapping deserve their own acceptance, while status-only answer sides ship the review value now.
- Do nothing / reuse — keep the standalone timeline beside session lists. The cost is permanent double maintenance and the weaker restore path staying the default.

## Consequences

- **Gains**: one checkpoint surface with the stronger restore contract everywhere; every migrated capability reuses existing IPC and locale keys, so no new channels, keys, or backend behavior ship.
- **Costs and limits**: per-turn agent prose stays unavailable until transcript-content IPC lands; stored `checkpoints` tool ids vanish from docks on next launch by filter rather than explicit migration copy; `checkpoint:create` IPC stays main-side with no renderer caller. Verification is machine evidence on touched paths: `tsc --noEmit` shows no new error (six pre-existing missing-module errors remain), strict unused checks are clean for touched files, `tests/unit/right-tool-state.test.ts` plus `worktree-store.test.ts` pass 26/26, and `scripts/i18n-check.mjs` reports both languages in sync; built-app Electron acceptance was not exercised here.
