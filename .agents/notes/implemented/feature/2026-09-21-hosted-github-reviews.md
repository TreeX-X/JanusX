---
schema: harness-note/1
id: 97a21dee-2b5e-4cf8-8298-28263eeb02bb
kind: decision
lifecycle: implemented
created: 2026-09-21
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
extensions:
  r5Migration:
    sourceHash: 21e3beef9c3a5e773194188563a8ae65714c9b88f33121500cb54388743add3c
    repairs:
      - relations[0].reason
    originalRelations:
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
        reason: Hosted GitHub reviews and checks for the session requirement
---

# Agent Note: Hosted GitHub reviews and checks over gh

## Problem

Ship ended at the local merge, so review state, check results, and failure logs stayed in the browser while the work lived in JanusX. Each worktree knew its branch but nothing about its review, and a red check meant manual log hunting before an agent could help. A provider abstraction did not exist, and no checkout recorded which review it belonged to.

## Decision

`src/main/hosted/github.ts` implements a `HostedProvider` behind detection that requires both a github.com remote and a passing `gh auth status`, cached for five minutes and never blocking local flows. Reviews, checks, failed run logs, creation, and squash merge all run through the user's `gh`, so JanusX stores no credential for GitHub at all. Check rollups reduce to passing, failing, pending, or none; failed logs cap at three runs and six kilobytes with explicit truncation; creation binds the review number and push target onto the worktree metadata. The Ship dialog renders the review section only when a provider claims the checkout: linked reviews show state with refresh, checks list per check, failure logs expand on demand, and one click copies a fix prompt carrying names plus logs. Draft creation and squash merge stay in the same surface.

## Alternatives considered

- Direct GitHub API with OAuth or PAT — strongest case is no `gh` dependency and finer control. The driver that rules it out is credential ownership: OAuth needs an app registration and PATs need a vault, while `gh` reuses the login the user already maintains.
- GitLab in this slice — strongest case is one dual-platform landing. The driver that rules it out is auth shape: self-hosted instances need per-host URLs plus stored tokens, which is its own settings and keychain feature, so GitLab waits.
- Auto-merge and merge queue now — strongest case is hands-free delivery once checks pass. The driver that rules it out is blast radius: automatic merges into shared bases need the checks panel proven first, so manual squash merge ships alone.
- Do nothing / reuse — keep local-only Ship with browser-side reviews. The cost is the split brain between landed code and review truth that grows with every parallel worktree.

## Consequences

- **Gains**: GitHub checkouts detect silently, reviews bind to worktrees, checks and failure logs surface inline, and fix prompts carry failures to agents in one copy. Parser coverage spans review states, check normalization, failed-run selection, and log truncation; the IPC contract suite covers the new channels; project typecheck, touched-file lint, and bilingual key checks pass.
- **Costs and limits**: `gh` missing or logged out hides the section with no further guidance; merge strategy is fixed to squash; failure logs cap at three runs and six kilobytes; GitLab, comments, reactions, stacked reviews, and auto-merge stay scheduled. Built-app Electron acceptance was not exercised here.
