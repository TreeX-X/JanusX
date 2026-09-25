---
schema: harness-note/1
id: 80f207b2-591b-5a1d-824e-e169dc5b80c0
kind: decision
lifecycle: implemented
created: 2026-09-21
class: bug-fix
---
# Agent Note: Workspace switch sweep survives background file-tree refreshes

Status: implemented

## Problem

`loadWorkspaceFileTree` in `src/renderer/src/features/workspace/actions.ts` is the single entry for full tree loads, and every load shares one generation counter plus one `fileTreeLoadState` (`loading`/`revealing`/`idle`/`error`). A workspace switch starts a visual load that is supposed to play a full top-to-bottom sweep (`revealing`), but the file watcher in `useWorkspaceBootstrap.ts` fires background loads for the same path concurrently. The commit path writes state unconditionally, so two failure shapes exist. When the background load commits after the visual load, it overwrites `revealing` with `idle` and the overlay unmounts mid-sweep: the first rows sweep, the rest appear instantly. When the background load commits first, the visual load hits the generation guard and returns without committing, so no sweep plays at all and the tree swaps instantly. The sweep is therefore flaky in exactly the situation switches create: fresh file events for the incoming workspace.

## Decision

A module-level `pendingVisualRevealPath` records the target path when a visual load starts. Any successful commit for that path plays `revealing` exactly once and clears the flag, whether the committing load is the visual one or a background refresh that won the generation race; the sweep always runs over freshly loaded data. Commits that play no reveal use a functional update that preserves an in-flight `revealing` instead of overwriting it with `idle`, so background refreshes update the tree under a running sweep without interrupting it. `error` and `loading` exits keep their previous transitions. The flag is only consumed on a commit whose `shouldCommit` guard passes for the same path, so a stale registration from a superseded switch can never start a sweep over another workspace's tree.

## Alternatives considered

- Do nothing and keep last-writer-wins commits: zero new state, but the sweep stays flaky on every switch that coincides with file events, which is the defect reported against the sweep.
- Track the animation locally in `FileExplorerTool` instead of the store: strongest case is that rendering state stays near the renderer, but the component cannot see commit ordering across concurrent loads, so it cannot distinguish a preempted visual load from a completed one and replays or skips sweeps on stale data.
- Debounce watcher reloads during switches: strongest case is fewer overlapping loads with no new commit logic, but it delays fresh file data reaching the tree and narrows rather than removes the race window.

## Consequences

- **Gains**: every workspace switch plays one complete sweep at a fixed speed over the newest committed tree, regardless of how many background refreshes land during it; data freshness still follows latest-commit-wins.
- **Costs and limits**: one module-level nullable string plus a functional setState on the commit path; reviewers of this file keep the flag and the generation guard consistent. When two overlapping loads both abort through the directory-mutation guard, the state can rest on `loading` with no commit arriving, which predates this change and is left untouched.
- **Verification**: `npx tsc --noEmit` passes; `npx eslint` on `actions.ts` reports no errors; `tests/unit/file-tree-scan.test.ts`, `workspace-source-files.test.ts`, `workspace-sidebar.test.ts` and `workspace-pane.test.ts` pass (34 tests).
