---
{
  "schema": "harness-note/2",
  "id": "97a21dee-2b5e-4cf8-8298-28263eeb02bb",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-21",
  "class": "feature",
  "relations": [
    {
      "type": "related-to",
      "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22"
    }
  ],
  "extensions": {
    "r5Migration": {
      "sourceHash": "21e3beef9c3a5e773194188563a8ae65714c9b88f33121500cb54388743add3c",
      "repairs": [
        "relations[0].reason"
      ],
      "originalRelations": [
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22",
          "reason": "Hosted GitHub reviews and checks for the session requirement"
        }
      ]
    },
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-21-agent-note-hosted-github-reviews-and-checks-over-gh--97a21dee.md",
      "sourceHash": "95a88d2fb9bf878abe8f32fbde68f18cbecaa0003134a29a153937d63d207d8e",
      "originalBodyHash": "e8b7cd5293e2bbb783d0311a9e982c3009f3ad926b5018196440767e5ac3c642",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Hosted GitHub reviews and checks over gh. No age-based archival.",
      "edits": [
        "Removed redundant Agent Note title prefix"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-21-hosted-github-reviews.md",
        "sourceHash": "95a88d2fb9bf878abe8f32fbde68f18cbecaa0003134a29a153937d63d207d8e",
        "originalBodyHash": "e8b7cd5293e2bbb783d0311a9e982c3009f3ad926b5018196440767e5ac3c642"
      }
    }
  },
  "updated": "2026-10-21T15:37:53.642Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b653bb34-279f-45db-92d1-313d1c6bcdf5"
}
---

# Hosted GitHub reviews, issues, comments and auto-merge

## Problem
Ship ended at the local merge, so review state, check results, and failure logs stayed in the browser while the work lived in JanusX. Each worktree knew its branch but nothing about its review, and a red check meant manual log hunting before an agent could help. A provider abstraction did not exist, and no checkout recorded which review it belonged to.

### Hosted issues, comments, and auto-merge
Worktrees could be created and shipped, but tasks still started from blank names: open issues lived in the browser with no path into a worktree, and the issue link the design reserved had no writer. Review discussion stayed one-directional, with no way to read threads or reply without leaving the app. Merging stayed manual even when checks already passed, so finished work waited on a click that added no judgment.


## Decision
`src/main/hosted/github.ts` implements a `HostedProvider` behind detection that requires both a github.com remote and a passing `gh auth status`, cached for five minutes and never blocking local flows. Reviews, checks, failed run logs, creation, and squash merge all run through the user's `gh`, so JanusX stores no credential for GitHub at all. Check rollups reduce to passing, failing, pending, or none; failed logs cap at three runs and six kilobytes with explicit truncation; creation binds the review number and push target onto the worktree metadata. The Ship dialog renders the review section only when a provider claims the checkout: linked reviews show state with refresh, checks list per check, failure logs expand on demand, and one click copies a fix prompt carrying names plus logs. Draft creation and squash merge stay in the same surface.

### Hosted issues, comments, and auto-merge
The composer grows an issue section backed by provider search across GitHub and configured GitLab instances: picking an issue fills the task name, derives the branch until hand-edited, and binds the issue reference into worktree metadata at creation. The Ship review section threads comments with inline file positions, reply boxes that refresh the thread, and an auto-merge toggle that tracks server state: squash auto-merge on GitHub, pipeline-gated merge with explicit cancellation on GitLab. Creation failures surface with retry, and empty states stay silent rather than blocking local flows.



## Alternatives considered
- Direct GitHub API with OAuth or PAT — strongest case is no `gh` dependency and finer control. The driver that rules it out is credential ownership: OAuth needs an app registration and PATs need a vault, while `gh` reuses the login the user already maintains.
- GitLab in this slice — strongest case is one dual-platform landing. The driver that rules it out is auth shape: self-hosted instances need per-host URLs plus stored tokens, which is its own settings and keychain feature, so GitLab waits.
- Auto-merge and merge queue now — strongest case is hands-free delivery once checks pass. The driver that rules it out is blast radius: automatic merges into shared bases need the checks panel proven first, so manual squash merge ships alone.
- Do nothing / reuse — keep local-only Ship with browser-side reviews. The cost is the split brain between landed code and review truth that grows with every parallel worktree.

### Hosted issues, comments, and auto-merge
- Separate issue drawer surface — strongest case is a browsable task board independent of creation. The driver that rules it out is entry cost: binding at creation covers the task-to-worktree loop with one search box instead of a new panel, and a board can layer on later.
- Auto-merge by default on every review — strongest case is zero-click delivery. The driver that rules it out is consent: automatic merges into shared bases need an explicit opt-in per review, so the toggle starts off.
- Full reaction support now — strongest case is GitHub parity down to emoji votes. The driver that rules it out is signal: reactions carry no review semantics, so reading threads and replying ship first.
- Do nothing / reuse — keep blank-name creation with browser-side issues and manual merges. The cost is tasks without provenance and finished work waiting on empty clicks.


## Consequences
- **Gains**: GitHub checkouts detect silently, reviews bind to worktrees, checks and failure logs surface inline, and fix prompts carry failures to agents in one copy. Parser coverage spans review states, check normalization, failed-run selection, and log truncation; the IPC contract suite covers the new channels; project typecheck, touched-file lint, and bilingual key checks pass.
- **Costs and limits**: `gh` missing or logged out hides the section with no further guidance; merge strategy is fixed to squash; failure logs cap at three runs and six kilobytes; GitLab, comments, reactions, stacked reviews, and auto-merge stay scheduled. Built-app Electron acceptance was not exercised here.

### Hosted issues, comments, and auto-merge
- **Gains**: issues flow into named, bound worktrees; threads read and reply inline; auto-merge tracks per-review state on both providers. Parser coverage spans issues, threaded comments, and GitLab notes; provider flows run against a stub instance; project typecheck, touched-file lint, and bilingual key checks pass.
- **Costs and limits**: issue search caps at twenty results with no pagination; comment rendering is plain text without markdown; stacked reviews stay unscheduled. Built-app Electron acceptance was not exercised here.
