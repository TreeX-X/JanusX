---
schema: harness-note/1
id: c58ff1db-a725-4c22-843e-df0b95e2934d
kind: decision
lifecycle: implemented
created: 2026-09-22
class: bug-fix
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/bda5aa81-dc65-4408-9544-60fdfdf8c836
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/636764b9-0105-4944-91f7-72fcbd3c4869
extensions:
  r5Migration:
    sourceHash: 63d10102479f0b608e746db69614f83e8986a86509fda43e79d6a2385652f1c3
    repairs:
      - relations[0].reason
      - relations[1].reason
    originalRelations:
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/bda5aa81-dc65-4408-9544-60fdfdf8c836
        reason: Worktree rows switch the active path while the file tree stays pinned to
          the workspace root
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/636764b9-0105-4944-91f7-72fcbd3c4869
        reason: Worktree creation and deletion move the active path and need the same
          tree rescope
---

# Agent Note: Worktree switch rescopes the file tree with a sweep

## Problem

The sidebar worktree rows switch only `activePaths` in the worktree store, while `FileExplorerTool` derives its root from `Workspace.path`. The tree therefore keeps showing the previous checkout after a switch, and per-worktree file differences never appear. Mutations, search loading, VS Code reveal, and the file watcher all resolve against the workspace root as well, so operating the tree while a linked worktree is active touches the wrong checkout. Session cards and terminal creation already follow the active worktree path; the file tree is the outlier.

## Decision

`src/renderer/src/features/workspace/actions.ts` owns the effective root: `getActiveScopePath` returns the active worktree path when set and falls back to the workspace root, and `getScopePathForWorkspace` resolves the same mapping for a workspace that is not yet active. `switchActiveWorktree` guards same-path clicks, sets the active path, then runs `refreshScopeFileTree`, which clears the selection, invalidates the editor cache for the scope, fetches git status for the scope, and reloads through the single `loadWorkspaceFileTree` entry with `visualTransition`, so every switch plays the existing loading-to-revealing sweep. Creation, retry, deletion, and post-ship deletion refresh the resulting scope through the same helper and only when the affected workspace is active; deleting a non-active worktree issues no reload.

`FileExplorerTool` binds to the scope path instead of the workspace root for display, directory loading keys, search backfill, mutations, editor handoff, and the scan overlay key, and it resets expansion, loading keys, search, and scroll on scope change. Workspace switching loads the target scope rather than the root, so returning to a workspace restores its worktree view. The bootstrap watcher subscribes to both stores, fetches status per scope, and filters file events by scope equality, which keeps the pending-reveal race guarantee intact because commits still flow through the same generation guard.

## Alternatives considered

- Switch-only reload that keeps the tree root on `Workspace.path` — strongest case is the smallest diff for the reported symptom. The driver that rules it out is correctness: the tree would reload the wrong directory and every mutation would still target the root checkout.
- Auto-load on scope change inside `FileExplorerTool` — strongest case is one subscriber covering switch, create, and delete without touching callers. The driver that rules it out is double loading: workspace switching already loads explicitly from the sidebar, and two loaders racing on the same generation counter wastes IPC and risks reveal flicker.
- Debounced silent reload without the sweep — strongest case is fewer visual interruptions. The driver that rules it out is the request itself: scope changes swap the entire visible tree, and the sweep is the established signal that the swap completed.
- Do nothing / reuse — keep the tree pinned to the workspace root. The cost is stale trees on every switch, file operations landing in the wrong checkout, and watcher refreshes filtered against the wrong path.

## Consequences

- **Gains**: switching, creating, retrying, deleting, and shipping worktrees rescope the tree, git status, editor cache, and watcher to the same path session cards and terminals already use, each with one complete sweep.
- **Costs and limits**: scope helpers add one worktree-store read per guard; `getActiveWorkspacePath` stays exported with no in-tree callers for compatibility. Active paths remain in-memory and reset on restart, so the scope falls back to the root after relaunch. File operations in a worktree resolve within that checkout and never reach the workspace root.
- **Verification**: `npx tsc --noEmit` passes; `npx eslint` on the five touched renderer files reports no errors; `npx vitest run` over the file-tree, workspace-sidebar, workspace-pane, and worktree suites passes (9 files, 99 tests). Built-app Electron acceptance was not exercised here.
