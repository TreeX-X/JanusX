---
schema: harness-note/1
id: 7822452e-cef7-4ef3-a138-2ae6abc84667
kind: decision
lifecycle: implemented
created: 2026-09-21
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
extensions:
  r5Migration:
    sourceHash: d3b3ba2162e0422a661e05a3b3e468532a8fd3cb464f5ca305b0a0def95579cd
    repairs:
      - relations[0].reason
    originalRelations:
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
        reason: Local Ship merge flow for the session requirement
---

# Agent Note: Local Ship merge flow for worktrees

## Problem

A finished worktree had no delivery path inside JanusX: reviewing meant shelling out, committing leftovers meant switching tools, merging into the base meant hand-typed git, and the worktree stayed behind afterwards with its sessions detached from any outcome. Without an explicit Ship step, parallel work could never land through the same surface that created it.

## Decision

`WorktreeShipDialog` runs the local Ship in one place: branch diff against the base with per-file counts, commit box for worktree leftovers through the existing stage and commit channels, merge into the base with optional push, and delete-and-archive to finish. Creation records the start point per worktree path in `worktree-meta.ts`, so the base resolves without asking twice; external checkouts fall back to an editable `origin/main`. The merge refuses dirty main checkouts and self merges, returns conflicts as an explicit list with abort instead of merging silently, and reports up-to-date reruns as no-ops. Push failures never roll back a completed merge. The worktree row carries the Ship entry beside delete, gated to branched non-main checkouts, and the dialog closes the loop by reusing the delete flow that archives sessions.

## Alternatives considered

- Hosted reviews in this slice — strongest case is one complete Ship with PR creation and checks. The driver that rules it out is the missing provider phase: GitHub and self-hosted GitLab need the `HostedProvider` abstraction first, and the local flow stands alone without it.
- Auto-push without a checkbox — strongest case is fewer clicks on the happy path. The driver that rules it out is remote gravity: pushing the base branch deserves an explicit visible default, so the checkbox stays checked but removable.
- Auto-commit leftovers with a generated message — strongest case is skipping the commit box entirely. The driver that rules it out is authorship: the message belongs to the user, and the box blocks merging until dirt is committed.
- Do nothing / reuse — keep terminal-only merging with no review surface. The cost is a creation flow with no delivery and sessions that outlive their purpose.

## Consequences

- **Gains**: worktrees review, commit, merge, push, and delete from the sidebar with conflicts and aborts handled explicitly. Real-git integration checks cover branch diffs, clean merges, up-to-date reruns, conflict lists with abort recovery, dirty-main refusal, and the self-merge guard; project typecheck, touched-file lint, and bilingual key checks pass.
- **Costs and limits**: hosted review creation, checks, auto-merge, and failure handoff wait for the provider phase; merge strategy is fixed to `--no-ff` with no rebase or squash option yet; push assumes the base tracks a reachable remote. Quit-flush restore and the turn-change island stay scheduled follow-ups. Built-app Electron acceptance was not exercised here.
