---
schema: harness-note/1
id: 640a69dd-bbea-4606-b51a-f9b545de37a5
kind: decision
lifecycle: implemented
created: 2026-09-21
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
    reason: GitLab self-hosted provider for the session requirement
---

# Agent Note: GitLab self-hosted provider over instance v4 API

## Problem

The hosted surface spoke GitHub only, so teams on private GitLab instances had configuration with nowhere to spend it: no merge requests, no pipelines, no logs, and no merge action. Instance URLs carry ports and subpaths, projects nest in subgroups, and drafts predate the modern flag, so naive URL parsing and GitHub-shaped assumptions fail against real intranet remotes.

## Decision

`src/main/hosted/gitlab.ts` implements the provider contract against the configured instance: detection matches the remote host against the instance hostname with a present token, project paths encode nested groups, merge requests map states including legacy work-in-progress drafts, pipelines resolve to the latest run with per-job checks where allowed failures count as passing, failure logs stream job traces with the same size cap as GitHub, creation posts with draft and remove-source-branch flags, and merging accepts with an explicit squash choice. The Ship dialog needs no fork: detection, reviews, checks, logs, creation, and merge all flow through the shared surface with MR wording. Remote parsing now tolerates ports and multi-segment groups on every URL form.

## Alternatives considered

- Separate GitLab UI flows — strongest case is vocabulary precision for MR-specific concepts. The driver that rules it out is duplication: states, checks, logs, and creation map one-to-one onto the shared surface, so one dialog serves both providers.
- Server-side check rollups per MR — strongest case is fewer API calls. The driver that rules it out is freshness: the pipelines endpoint on demand reflects the latest run, while stored rollups go stale.
- Merge without an explicit squash choice — strongest case is matching each project's default method. The driver that rules it out is API variance across instance versions, so the choice stays explicit and visible.
- Do nothing / reuse — keep GitHub-only hosting with configured-but-useless instances. The cost is a settings page that promises what the product cannot do.

## Consequences

- **Gains**: configured instances detect, list, check, log, create, and merge merge requests inside Ship with MR wording throughout. Parser coverage spans MR states, job normalization, project encoding, and truncation; provider flows run end to end against a stub instance including auth gating and host mismatch; project typecheck, touched-file lint, and bilingual key checks pass.
- **Costs and limits**: comments, reactions, approvals, and auto-merge stay unscheduled; merge strategy stays an explicit choice rather than the project default; subgroup depth beyond two levels is untested. Built-app Electron acceptance was not exercised here.
