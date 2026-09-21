---
schema: harness-note/1
id: 636764b9-0105-4944-91f7-72fcbd3c4869
kind: decision
lifecycle: implemented
created: 2026-09-21
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
    reason: Worktree creation and deletion for the session requirement
---

# Agent Note: Worktree creation and deletion with scoped terminals

## Problem

Worktree rows could only display checkouts created elsewhere by hand, so the isolation model had no entry point inside JanusX. New terminals always opened in the workspace root, which kept every agent on the main checkout even after switching rows. Deleting a worktree meant dropping to a shell, with no guard for the main checkout, no branch review, and sessions left pointing at removed paths.

## Decision

`src/main/git/worktrees.ts` creates linked worktrees on new branches from a verified start point into a collision-proof sibling directory, then shares dependencies best-effort: `node_modules` arrives as a link and `.env` files as owned copies, with every step reported rather than failing creation. Creation runs cancellable in the background through a tracked child process with prune plus partial-directory cleanup on cancel. Removal refuses the main checkout, deletes disk plus branch by default, keeps branches git will not drop for explicit review, never deletes the main checkout's own branch, and archives the removed path's sessions. Dirty and locked states surface through a dedicated status query instead of failing silently.

The composer closes at submit while progress, cancel, and retry live on the sidebar row, and the submitting workspace expands automatically so the row is visible. New terminals open in the active worktree directory through an optional launch override; retry keeps the recorded directory. The workspace context menu carries the single creation entry, and worktree rows carry a hover delete entry with a confirm dialog covering dirty warnings and force deletion. Preserved branches render inline with two-step deletion that escalates to force only after a clean delete fails.

## Alternatives considered

- Foreground modal creation with a spinner — strongest case is fewer moving parts and no cancellation bookkeeping. The driver that rules it out is the accepted proposal semantics: creation closes at once with sidebar progress, cancel, and retry, and a modal lock contradicts it.
- Auto-merge or auto-delete branches on worktree removal — strongest case is one-click cleanup with no review list. The driver that rules it out is silent loss: unmerged commits and protected names belong to explicit review, so the disk goes and the branch waits.
- Full dependency reinstall per worktree — strongest case is perfect isolation with no link quirks. The driver that rules it out is cost: links plus literal secret copies cover the common case, and a missing link only costs an install.
- Do nothing / reuse — keep read-only external rows with terminals pinned to the root. The cost is an isolation model without an entry point and agents that cannot reach task checkouts.

## Consequences

- **Gains**: worktrees create, cancel, retry, and delete from the sidebar with scoped terminals and archived sessions. Real-git integration checks cover slug, collision, shared deps, merged and unmerged removal, branch review, dirtiness, and the main-checkout guard; the IPC contract suite covers the new channels; project typecheck, touched-file lint, and bilingual key checks pass.
- **Costs and limits**: cancellation kills the git child and prunes, but a mid-checkout kill can still leave admin entries for the next prune; preserved branches live in memory and reset on restart; branch names accept whatever git accepts with errors surfacing at submit. Ship merge, quit-flush restore, and the turn-change island stay scheduled follow-ups. Built-app Electron acceptance was not exercised here.
