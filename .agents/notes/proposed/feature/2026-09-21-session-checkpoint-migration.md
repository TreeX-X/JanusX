# Agent Note: Session-owned checkpoints, standalone checkpoints tool retires

Status: proposed

## Problem

The right dock carries two checkpoint surfaces for one mechanism: the standalone `checkpoints` tool (cwd-scoped timeline) and the per-session checkpoint lists inside session cards. Users meet restore in two places with different guarantees, and the standalone panel owns five capabilities the session view lacks: manual creation, engine filter, full diff preview, a restore review modal (prune warning plus conflict files), and a cross-session timeline.

## Proposal

Retire the standalone tool and move only what sessions cannot do today into the session cards. Drop manual creation (auto checkpoints on the turn lifecycle in `src/main/ipc/terminal-handlers.ts` stay the sole producer). Drop the engine filter (session cards already render one engine each). Drop the cross-session timeline (each card owns its checkpoints). Keep full diff preview and the restore review gate, and add orca-parity card expansion for session detail.

### Kept capability 1: full diff preview per checkpoint

Reuse the existing channel, zero new IPC. `SessionCard` already lazy-loads `records` per checkpoint; add a `diff ▾` toggle beside each checkpoint that calls the existing `useCheckpointStore.fetchAllDiffs` and renders `diffs[`${id}:`]` as a unified block in the checkpoint card language. Binary/oversized guard is mandatory: `getAllDiffs` stringifies snapshot bytes, so a checkpoint whose records contain `binary` or `oversized` status must render the `binary · 84KB` row and never mount the diff toggle (same hazard recorded for turn-end diffs).

### Kept capability 2: restore review gate

Restore stays a two-phase action inside the expanded checkpoint, and execution stays blocked until review confirms. Phase one (`恢复到 #N`) opens a review block carrying everything knowable before execution: prune count derived from `conversationIndex` (checkpoints above the target are pruned), the file record list, and the full diff on demand. Phase two (`确认恢复` / `取消`) executes `restoreCheckpoint` and refreshes the list. Conflict files are knowable only after the manager runs, so they surface post-restore in the same block with red styling and the existing hint copy; the gate before execution is the prune plus file review, never a bare second click. Archived sessions keep restore disabled with the current hint.

### New capability: click-to-expand session detail (orca parity)

Orca session cards expand on click to detailed session content; the orca source is not present in this checkout, so the detail contract below is an assumption flagged in Open questions. Card header click toggles a detail section fed by the existing `fetchSessionDetail` (`session:get`, no new IPC): turn list with per-turn kind badge (`done` / `failed` / `interrupted`), time range, and linked checkpoint index via `turn.checkpointId`; owning `terminalIds`; `transcriptPath` as a read-only reference; `continuedFrom` when present; created/updated timestamps; cwd plus branch. The header toggle owns detail only; the `还原点 N ▾` button keeps owning the checkpoint list, so the two expansions never fight. Detail loads lazily on first expand and caches per session id for the panel lifetime.

### Removal checklist (lands with the migration, one commit)

- Delete `src/renderer/src/components/CheckpointPanel.tsx`; drop the `checkpoints` branch and import in `RightToolHost.tsx`.
- Remove the `checkpoints` entry in `src/renderer/src/right-tools/registry.ts`, both `RightToolId` / `RightToolIconKind` members in `right-tools/types.ts`, `common:rightTool.tool.checkpoints.*` in both locales plus generated `i18n/types.ts` keys.
- Update `tests/unit/right-tool-state.test.ts` tool id expectations.
- Orphaned renderer surface: store `createCheckpoint`, `fetchDiff`, `fetchAllDiffs` (kept: still called by session cards), `diffs` (kept), engine filter state, per-path `expandedCheckpointId` UI state; main-process `checkpoint:create` IPC stays (zero-cost, auto flows untouched).
- No main-process behavior change: turn-lifecycle auto creation, finalize, and event subscription stay exactly as they are.

## Acceptance

- AC-1: With the standalone tool removed, every checkpoint reachable before remains reachable under its session card, and no right-dock tab references `checkpoints`.
- AC-2: Each expanded checkpoint offers a diff toggle rendering the full unified diff, except binary/oversized checkpoints which render the size row and no toggle.
- AC-3: Restore executes only from the review block after explicit confirm; the block shows prune count, file list, and on-demand diff before execution, and conflict files with red styling after a conflicting restore.
- AC-4: Clicking a session card header expands detail (turns with kind, time, linked checkpoint; terminals; transcript reference; continued-from; timestamps) fed by `session:get`, lazily loaded once per session.
- AC-5: Archived sessions still refuse restore with the existing hint, and restores still refresh the checkpoint list.

## Verification

- `node node_modules/vitest/vitest.mjs run tests/unit/right-tool-state.test.ts` plus checkpoint/session store suites; `tsc --noEmit` shows no new error; `i18n:check` passes after key removal; clicked-through states against the updated `design/session-mgmt-hifi.html` reference in this note's commit.

## Open questions

- Orca card parity is designed from the described behavior (click expands to detailed session content) because no orca UI source exists in this checkout; align field-by-field once the orca card source is available.
- Whether `checkpoint:create` IPC should also be removed or kept for future manual flows; current design keeps it main-side only.
