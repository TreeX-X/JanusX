---
schema: harness-note/1
id: bda5aa81-dc65-4408-9544-60fdfdf8c836
kind: decision
lifecycle: implemented
created: 2026-09-21
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
extensions:
  r5Migration:
    sourceHash: 361b01930cf98b6686e53875a0a5cba77f73b049a9a65d74000b6598773e8880
    repairs:
      - relations[0].reason
    originalRelations:
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
        reason: Worktree sidebar rows, right-side rescoping, and repo avatars for the
          session requirement
---

# Agent Note: Worktree sidebar rows with scoped surfaces and repo avatars

## Problem

The sidebar listed workspaces as flat rows with no notion of worktrees, so linked checkouts created by plain `git worktree add` stayed invisible and every review surface stayed pinned to the workspace root. Repository identity came from nothing: project rows showed a generic folder even when the checkout resolved to a recognizable hosted project. Switching context meant switching workspaces, and returning never restored what the right side had shown.

## Decision

`src/main/git/worktrees.ts` derives worktrees offline: the workspace root is always the main entry, and `git worktree list --porcelain` contributes linked checkouts with branch, detached, locked, and prunable flags. Bare entries and non-git checkouts resolve to the main row alone, and every git failure degrades to it without surfacing. Remote parsing covers https, ssh, and scp-like forms into host, owner, and repo with an upstream fork hint, all without network access.

Repo avatars ship without any login. GitHub checkouts resolve to the unauthenticated owner image URL while every other host keeps the letter fallback, matching the reference scope. Downloads pass through a seven-day disk cache under `userData`, stale bytes serve offline instead of failing, oversized payloads are refused, and failures resolve to null so the folder glyph stays. Team identity is untouched and no credential is stored.

The sidebar renders worktrees as sub-rows under the expanded workspace with branch icons, branch-first labels, and path subtitles, but only when more than one checkout exists; single-checkout workspaces keep the existing terminals-only view. Rows switch the active worktree path per workspace, and session cards, checkpoints, and diffs re-scope to that path on every switch. Expanded session and checkpoint selections persist per path and restore on return. New terminals still open in the workspace root until the creation flow arrives.

## Alternatives considered

- Full worktree creation and deletion in this slice — strongest case is one complete worktree feature instead of two landings. The driver that rules it out is review size: creation needs branch naming, dependency sharing, and delete-with-preserved-branches semantics that each deserve their own acceptance, while rows plus rescoping are independently reviewable against real external worktrees.
- Direct remote image URLs in the renderer — strongest case is zero main-process code for avatars. The driver that rules it out is offline behavior and request storms: the disk cache serves every row render without network, and stale bytes beat letter fallback when offline.
- GitLab avatar support now — strongest case is parity for self-hosted teams. The driver that rules it out is authentication: GitLab exposes no unauthenticated owner image path, so support waits for the per-host credential phase.
- Do nothing / reuse — keep flat workspace rows pinned to the root with folder glyphs. The cost is invisible linked checkouts, unscoped review surfaces, and recognizability left on the table.

## Consequences

- **Gains**: linked worktrees appear, switch, and rescope both review surfaces with restored selections; GitHub projects show cached owner avatars with silent fallback. Worktree git parsing plus avatar cache carry 17 unit checks; the IPC contract suite covers the new channels; project typecheck, touched-file lint, and bilingual key checks pass.
- **Costs and limits**: worktree enumeration shells out to git per expansion with no caching yet; active paths live in memory and reset on restart; avatar fetches run per workspace without a shared in-flight request. Worktree creation, Ship merge, quit-flush restore, and the turn-change island stay scheduled follow-ups. Built-app Electron acceptance was not exercised here.
