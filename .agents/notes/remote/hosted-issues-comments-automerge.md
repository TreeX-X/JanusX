---
{
  "schema": "harness-note/2",
  "id": "cee742a2-d7ca-4a61-8021-e1e118534c96",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-21",
  "class": "feature",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22"}
  ],
  "extensions": {
    "r5Migration": {
      "sourceHash": "2db28c3d16da4f504eed58786aa6f5ca5f534e73d749cf65d0231faef7d846d1",
      "repairs": ["relations[0].reason"],
      "originalRelations": [
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22",
          "reason": "Issue tasks, review comments, and auto-merge for the session requirement"
        }
      ]
    },
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-21-agent-note-hosted-issues-comments-and-auto-merge--cee742a2.md",
      "sourceHash": "117ea1ef78ea42dfe3ae0b95dbf2864c7fcccc96e3bd0f3ddd4915f141b2015d",
      "originalBodyHash": "009f2fa5403391524b570e13de397ff8d7e67121c0b62da6f33e5467acca1b2a",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Hosted issues, comments, and auto-merge. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-21-hosted-issues-comments-automerge.md",
        "sourceHash": "117ea1ef78ea42dfe3ae0b95dbf2864c7fcccc96e3bd0f3ddd4915f141b2015d",
        "originalBodyHash": "009f2fa5403391524b570e13de397ff8d7e67121c0b62da6f33e5467acca1b2a"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b653bb34-279f-45db-92d1-313d1c6bcdf5"
}
---

# Hosted issues, comments, and auto-merge

## Problem

Worktrees could be created and shipped, but tasks still started from blank names: open issues lived in the browser with no path into a worktree, and the issue link the design reserved had no writer. Review discussion stayed one-directional, with no way to read threads or reply without leaving the app. Merging stayed manual even when checks already passed, so finished work waited on a click that added no judgment.

## Decision

The composer grows an issue section backed by provider search across GitHub and configured GitLab instances: picking an issue fills the task name, derives the branch until hand-edited, and binds the issue reference into worktree metadata at creation. The Ship review section threads comments with inline file positions, reply boxes that refresh the thread, and an auto-merge toggle that tracks server state: squash auto-merge on GitHub, pipeline-gated merge with explicit cancellation on GitLab. Creation failures surface with retry, and empty states stay silent rather than blocking local flows.

## Alternatives considered

- Separate issue drawer surface — strongest case is a browsable task board independent of creation. The driver that rules it out is entry cost: binding at creation covers the task-to-worktree loop with one search box instead of a new panel, and a board can layer on later.
- Auto-merge by default on every review — strongest case is zero-click delivery. The driver that rules it out is consent: automatic merges into shared bases need an explicit opt-in per review, so the toggle starts off.
- Full reaction support now — strongest case is GitHub parity down to emoji votes. The driver that rules it out is signal: reactions carry no review semantics, so reading threads and replying ship first.
- Do nothing / reuse — keep blank-name creation with browser-side issues and manual merges. The cost is tasks without provenance and finished work waiting on empty clicks.

## Consequences

- **Gains**: issues flow into named, bound worktrees; threads read and reply inline; auto-merge tracks per-review state on both providers. Parser coverage spans issues, threaded comments, and GitLab notes; provider flows run against a stub instance; project typecheck, touched-file lint, and bilingual key checks pass.
- **Costs and limits**: issue search caps at twenty results with no pagination; comment rendering is plain text without markdown; stacked reviews stay unscheduled. Built-app Electron acceptance was not exercised here.
