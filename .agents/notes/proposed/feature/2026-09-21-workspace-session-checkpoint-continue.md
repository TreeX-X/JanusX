---
schema: harness-note/1
id: c23ebb35-2d89-4c56-8dee-03bb7e277a22
kind: requirement
lifecycle: draft
created: 2026-09-21
class: feature
---

# Agent Note: Workspace-scoped sessions with rebuilt checkpoints and continue-in-new-session

## Problem

JanusX terminals share one on-disk working directory per workspace, and checkpoints are keyed by resolved `cwd` with a workspace-global `conversationIndex` and a volatile `terminalId` as the only session binding. Two terminals submitting prompts interleave the same index sequence, and restoring one terminal's checkpoint prunes later checkpoints from every other terminal in the workspace. The renderer has no session ledger, so a workspace cannot list the conversations that happened in it, and there is no continue flow for the most frequent cases: usage-limit cutoff, context rot in long sessions, planning-to-implementation handoff, and switching agents mid-task. Worktree isolation plus merge and close semantics stay undecided, so parallel agents cannot run without stepping on shared files.

Orca evidence fixes the vocabulary. Session restore rehydrates layout and warm-reattaches live processes without creating anything new. Resume re-enters the provider's original session ID in a fresh terminal. Continue in New Session opens a fresh sequential session for the same unfinished task while the original stays intact. Fork opens parallel work. The worktree lifecycle runs Create, Work, Review, Ship, Archive/Delete, and Ship stays an explicit user action: commit, push, open review, wait on checks. Deleting a worktree removes the directory and the branch with confirmation, while branches git refuses to drop survive in a review list. Closing the app never deletes files and never merges; a surviving daemon keeps agents running for warm reattach, otherwise layout and scrollback restore into shells that resume only on user action.

## Proposal

Land in two phases. V1 ships without worktrees: a per-workspace session registry, session cards with embedded checkpoints, rebuilt checkpoint scoping, and Continue in New Session with focused handoff only. P2 adds worktrees with the Ship/Delete/close semantics below. The checkpoint rebuild drops legacy constraints outright and reserves `worktreeId` from day one, so V1 storage keys stay valid when the key switches from workspace path to worktree path.

The session registry persists one record per agent session under the owning workspace: stable session id, workspace id, reserved worktree id, engine, cwd, branch, start-from ref, status, provider session id or transcript path, first prompt, message count, and timestamps. Turns attach to sessions with prompt, start and end time, completion kind, and before/after checkpoint references plus a per-file change set. The card list scopes to the active workspace first; Project and All scopes follow later. Each card embeds that session's checkpoint segment with lazy per-file diffs and the existing explicit-confirm restore path.

The checkpoint rebuild replaces weak terminal binding with session binding. New checkpoints carry session id, turn id, completion kind, and parent id alongside the content-addressed blob store. Pruning scopes to the owning session plus a per-workspace cap, ending cross-terminal prune damage. Snapshots keep the git candidate set and add a size guard for oversized untracked files, binary marking without content diffing, and per-file change records replacing the concatenated diff string. Writes stay atomic with fsync and rolling backups, hydration failure blocks the session writer and surfaces loudly, and legacy checkpoints import best-effort with terminal id mapped to sessions and the global index mapped to turn order.

Continue in New Session opens a new terminal in the original cwd with the original engine by default and an explicit agent switch option. The handoff prompt delivers after the TUI reports ready and carries the task summary, latest progress, original transcript path when present, and checkpoint reference, framed as untrusted reference with current repository state authoritative. The original session stays resumable and untouched. Full-transcript delivery, cross-agent matrices, and compaction linkage wait for P1.

P2 introduces the worktree as the task isolation unit while Workspace keeps its existing registration role without migration. Worktree identity uses repo id plus path, creation runs `git worktree add` with a new branch from the base ref or a local branch in the background with progress, cancel, and retry, and each worktree locks its own directory, branch, terminals, and checkpoint scope. A branch and a worktree are different things: the branch is a commit pointer and appears only as an attribute on the worktree card, while the worktree is the operable row because only it owns a directory, terminals, checkpoints, and sessions. Branches without a worktree never occupy sidebar rows and surface only in the start-from picker and branch lists. Large rebuildable directories arrive via symlink-style sharing and local secrets via literal-path copy. Merge timing stays explicit Ship after review with commit, push, review creation, and check waiting; agent completion never merges. Deletion removes disk and branch by default, keeps git-refused branches in a review list, and bulk paths behave identically. Closing the software persists live resumable sessions with a quit origin marker plus one checkpoint and layout per worktree, restores shells with Restart, Resume, and Continue entries on relaunch, and never auto-runs agents or merges.

Switching the sidebar row switches the entire right surface. The session card list, embedded checkpoint segments, expanded diffs, and turn-change island all re-scope to the newly active worktree path on every switch, reusing the existing active-workspace reload path with the worktree id as key. Per-worktree right-side UI state such as the selected session and expanded diffs caches by worktree id and restores on return, mirroring the terminal snapshot approach, so returning to a worktree finds the right surface exactly as left.

After Ship completes, the worktree ends through Archive or Delete. Archive keeps the disk, branch, sessions, and checkpoints with a completed marker for read-only reference. Delete removes the disk with its checkpoint store and moves session records plus transcripts into a central archive keyed by worktree id. Archived sessions stay readable with restore disabled and the reason stated, while Continue in New Session stays available from the archived transcript. Restore executes only inside the owning worktree path and refuses loudly once the path is gone, so worktree snapshots can never wash merged code on another path. Deleting a dirty worktree requires explicit confirmation with a commit entry offered first.

Repository avatars ship without any login. Import resolves the git remote into host, owner, and repo purely from local git config, then GitHub repositories use the unauthenticated owner image URL with lazy loading and a userData disk cache, falling back to the existing initial-letter avatar on any failure. Forks resolve upstream from the offline upstream remote and fall back to the origin owner, with authoritative confirmation deferred to the hosted phase. Self-hosted GitLab without credentials keeps the letter fallback. Team identity stays untouched: hosted capabilities arrive separately through per-host stored credentials, and manually chosen icons are never overwritten.

## Alternatives considered

- Scope the global index per terminal only, with no session registry — strongest case is the smallest diff to the checkpoint manager. The driver that rules it out is terminal id volatility: closed terminals lose identity, cards cannot span restarts, and Continue has no stable handoff anchor.
- Adopt daemon-backed warm reattach now — strongest case is full Orca parity with agents surviving quit. The driver that rules it out is scope: PTY ownership across quit, relay allowlists, and memory models dwarf session management, and quit-flush plus cold restore covers V1 without it.
- Auto-merge when an agent reports done — strongest case is fewer clicks on trivial tasks. The driver that rules it out is silent loss: review, conflict judgment, and check results belong to the user, and Orca evidence keeps Ship explicit.
- Do nothing / reuse — keep cwd-keyed checkpoints and the whole-disk timeline with no session ledger. The cost is interleaved prune damage forever, no per-workspace conversation view, and manual transcript hunting for every continuation.

## Acceptance criteria

- [ ] AC-1: One workspace lists its agent sessions as cards with engine, cwd, branch, first prompt, message count, and turn state.
- [ ] AC-2: Each card embeds its session's checkpoints with per-file change counts, lazy diffs, and explicit-confirm restore that never prunes other sessions.
- [ ] AC-3: Oversized and binary files report size and kind without content diffing, and blob storage enforces a cap with eviction.
- [ ] AC-4: Continue in New Session opens a new terminal in the original cwd, delivers a focused handoff after TUI ready, and leaves the original session resumable.
- [ ] AC-5: Checkpoint writes are atomic with rolling backups, and hydration failure blocks writes and surfaces instead of overwriting state.
- [ ] AC-6: Session, turn, and checkpoint records carry reserved worktree identity without requiring worktrees.
- [ ] AC-7: Worktree creation, explicit Ship merge timing, delete-with-preserved-branches, and quit-flush plus cold-restore shells follow the Proposal semantics.
- [ ] AC-8: Closing the software deletes no files, merges nothing, and auto-runs no agents.
- [ ] AC-9: Sidebar rows are worktrees grouped under projects with branch as a card attribute; branches without a worktree never occupy rows.
- [ ] AC-10: Switching the sidebar row re-scopes session cards, checkpoints, diffs, and the turn island to the new worktree, and returning restores cached right-side state.
- [ ] AC-11: Shipped worktrees end through Archive or Delete with sessions centrally archived read-only, checkpoints following the disk, restore refusing without its path, and dirty delete gated on explicit confirmation.
- [ ] AC-12: GitHub repositories show the cached owner avatar on project rows with letter fallback and no login; team login and hosted credentials stay separate.

## Risks

- Full re-hash per turn end regresses large workspaces; mitigation is git-incremental listing with the mtime fast path retained.
- Blob growth without eviction exhausts disk; mitigation is the cap plus retention window before shipping.
- Turn-to-checkpoint binding stays approximate where inputs bypass submit-line; mitigation is the git HEAD fallback with the fallback recorded.
- Disk and branch inflation from worktree sprawl; mitigation is the cleanup entry plus sleeping filter shipped with P2.
- Windows path casing and synonym paths collide worktree identity; mitigation is a single normalizing resolver.
- Quit-flush loss on hard kill leaves the last checkpoint plus transcript as truth; interrupted turns must never present as done.
