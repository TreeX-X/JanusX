---
{
  "schema": "harness-note/2",
  "id": "640a69dd-bbea-4606-b51a-f9b545de37a5",
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
      "sourceHash": "d0d595ae940b31b781031ffa81ff340965b677de1f374a899ab7f3ee22f185dd",
      "repairs": [
        "relations[0].reason"
      ],
      "originalRelations": [
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22",
          "reason": "GitLab self-hosted provider for the session requirement"
        }
      ]
    },
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-21-agent-note-gitlab-self-hosted-provider-over-instance-v4-api--640a69dd.md",
      "sourceHash": "046993580530a857baa5125dbbcc39b01d9dc0bbbdf46b9659ff94700e32a0f1",
      "originalBodyHash": "5556a93fb54f368540c20c096931e5103328c0c89c178d985feed68558442d8c",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents GitLab self-hosted provider over instance v4 API. No age-based archival.",
      "edits": [
        "Removed redundant Agent Note title prefix"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-21-gitlab-provider-reviews.md",
        "sourceHash": "046993580530a857baa5125dbbcc39b01d9dc0bbbdf46b9659ff94700e32a0f1",
        "originalBodyHash": "5556a93fb54f368540c20c096931e5103328c0c89c178d985feed68558442d8c"
      }
    }
  },
  "updated": "2026-10-21T15:37:53.642Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b653bb34-279f-45db-92d1-313d1c6bcdf5"
}
---

# Self-hosted GitLab instance and provider reviews

## Problem
The hosted surface spoke GitHub only, so teams on private GitLab instances had configuration with nowhere to spend it: no merge requests, no pipelines, no logs, and no merge action. Instance URLs carry ports and subpaths, projects nest in subgroups, and drafts predate the modern flag, so naive URL parsing and GitHub-shaped assumptions fail against real intranet remotes.

### Self-hosted GitLab instance configuration
Company GitLab instances live on intranets with custom addresses, private accounts, and often self-signed certificates, so nothing about GitHub's fixed address and `gh` login transfers. Without a configured instance, every GitLab feature would fail opaquely, and stuffing tokens into plain settings files would trade convenience for credential leaks.


## Decision
`src/main/hosted/gitlab.ts` implements the provider contract against the configured instance: detection matches the remote host against the instance hostname with a present token, project paths encode nested groups, merge requests map states including legacy work-in-progress drafts, pipelines resolve to the latest run with per-job checks where allowed failures count as passing, failure logs stream job traces with the same size cap as GitHub, creation posts with draft and remove-source-branch flags, and merging accepts with an explicit squash choice. The Ship dialog needs no fork: detection, reviews, checks, logs, creation, and merge all flow through the shared surface with MR wording. Remote parsing now tolerates ports and multi-segment groups on every URL form.

### Self-hosted GitLab instance configuration
Settings gains a hosting tab with two sections: a read-only GitHub row pointing at the local `gh` login, and a GitLab form with instance URL, PAT, self-signed toggle, and timeout. Instance URLs normalize to scheme plus host with subpaths kept and trailing slashes stripped; anything else fails with an actionable message. Non-secret fields persist as JSON while PATs live only in the OS keychain through encrypted storage, with `GITLAB_TOKEN` overriding both. Verification hits `/api/v4/user` with the form values before saving is required, and failures classify into config, token, certificate, and network with distinct guidance instead of one generic error. Self-signed certificates stay rejected by default behind an explicit intranet-only warning. New tab copy lives in `common.json` because `settings.json` carries a historical encoding freeze.



## Alternatives considered
- Separate GitLab UI flows — strongest case is vocabulary precision for MR-specific concepts. The driver that rules it out is duplication: states, checks, logs, and creation map one-to-one onto the shared surface, so one dialog serves both providers.
- Server-side check rollups per MR — strongest case is fewer API calls. The driver that rules it out is freshness: the pipelines endpoint on demand reflects the latest run, while stored rollups go stale.
- Merge without an explicit squash choice — strongest case is matching each project's default method. The driver that rules it out is API variance across instance versions, so the choice stays explicit and visible.
- Do nothing / reuse — keep GitHub-only hosting with configured-but-useless instances. The cost is a settings page that promises what the product cannot do.

### Self-hosted GitLab instance configuration
- GitHub OAuth for everything — strongest case is one login for all hosting. The driver that rules it out is intranet reality: private instances have independent accounts, and OAuth to a public cloud cannot reach them.
- Plaintext PAT in settings JSON — strongest case is trivial implementation with no keychain dependency. The driver that rules it out is leak surface: settings files get copied, synced, and pasted, while keychain entries do not.
- Silent certificate bypass on failure — strongest case is fewer support questions from self-signed users. The driver that rules it out is downgrade risk: quietly disabling verification invites interception, so the toggle stays explicit with a warning.
- Do nothing / reuse — keep zero GitLab surface until the full provider lands. The cost is designing the provider against guesses instead of a real configured instance.


## Consequences
- **Gains**: configured instances detect, list, check, log, create, and merge merge requests inside Ship with MR wording throughout. Parser coverage spans MR states, job normalization, project encoding, and truncation; provider flows run end to end against a stub instance including auth gating and host mismatch; project typecheck, touched-file lint, and bilingual key checks pass.
- **Costs and limits**: comments, reactions, approvals, and auto-merge stay unscheduled; merge strategy stays an explicit choice rather than the project default; subgroup depth beyond two levels is untested. Built-app Electron acceptance was not exercised here.

### Self-hosted GitLab instance configuration
- **Gains**: self-hosted instances configure, verify, and persist with classified errors; tokens never touch plain JSON. URL normalization, error classification, config round-trips with keychain and env precedence, and live verification against a local HTTP server carry unit coverage; project typecheck, touched-file lint, and bilingual key checks pass.
- **Costs and limits**: one instance only, matched later by remote host; no proxy support; keychain-unavailable machines fall back to the environment variable with an explicit error. GitLab reviews, checks, and comments still await the provider phase. Built-app Electron acceptance was not exercised here.
