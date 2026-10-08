---
{
  "schema": "harness-note/2",
  "id": "9ed7f1d7-dc1d-4330-82a9-5a064831040f",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-21",
  "class": "feature",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22"}
  ],
  "extensions": {
    "r5Migration": {
      "sourceHash": "3ec101196bd4b99f68eb7a046c680c78d2c2da3f95ef648677c34660440c0049",
      "repairs": ["relations[0].reason"],
      "originalRelations": [
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22",
          "reason": "Self-hosted GitLab instance configuration for the session requirement"
        }
      ]
    },
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-21-agent-note-self-hosted-gitlab-instance-configuration--9ed7f1d7.md",
      "sourceHash": "9d505f95902efda4a97c21229284fb7e62217fbcb4134cf7e6277c3882ee2975",
      "originalBodyHash": "b50b96aa063bb264c49fcaf4c6487d48a94ebf79a92c26d1a01ef7a87b123791",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Self-hosted GitLab instance configuration. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-21-gitlab-instance-config.md",
        "sourceHash": "9d505f95902efda4a97c21229284fb7e62217fbcb4134cf7e6277c3882ee2975",
        "originalBodyHash": "b50b96aa063bb264c49fcaf4c6487d48a94ebf79a92c26d1a01ef7a87b123791"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b653bb34-279f-45db-92d1-313d1c6bcdf5"
}
---

# Self-hosted GitLab instance configuration

## Problem

Company GitLab instances live on intranets with custom addresses, private accounts, and often self-signed certificates, so nothing about GitHub's fixed address and `gh` login transfers. Without a configured instance, every GitLab feature would fail opaquely, and stuffing tokens into plain settings files would trade convenience for credential leaks.

## Decision

Settings gains a hosting tab with two sections: a read-only GitHub row pointing at the local `gh` login, and a GitLab form with instance URL, PAT, self-signed toggle, and timeout. Instance URLs normalize to scheme plus host with subpaths kept and trailing slashes stripped; anything else fails with an actionable message. Non-secret fields persist as JSON while PATs live only in the OS keychain through encrypted storage, with `GITLAB_TOKEN` overriding both. Verification hits `/api/v4/user` with the form values before saving is required, and failures classify into config, token, certificate, and network with distinct guidance instead of one generic error. Self-signed certificates stay rejected by default behind an explicit intranet-only warning. New tab copy lives in `common.json` because `settings.json` carries a historical encoding freeze.

## Alternatives considered

- GitHub OAuth for everything — strongest case is one login for all hosting. The driver that rules it out is intranet reality: private instances have independent accounts, and OAuth to a public cloud cannot reach them.
- Plaintext PAT in settings JSON — strongest case is trivial implementation with no keychain dependency. The driver that rules it out is leak surface: settings files get copied, synced, and pasted, while keychain entries do not.
- Silent certificate bypass on failure — strongest case is fewer support questions from self-signed users. The driver that rules it out is downgrade risk: quietly disabling verification invites interception, so the toggle stays explicit with a warning.
- Do nothing / reuse — keep zero GitLab surface until the full provider lands. The cost is designing the provider against guesses instead of a real configured instance.

## Consequences

- **Gains**: self-hosted instances configure, verify, and persist with classified errors; tokens never touch plain JSON. URL normalization, error classification, config round-trips with keychain and env precedence, and live verification against a local HTTP server carry unit coverage; project typecheck, touched-file lint, and bilingual key checks pass.
- **Costs and limits**: one instance only, matched later by remote host; no proxy support; keychain-unavailable machines fall back to the environment variable with an explicit error. GitLab reviews, checks, and comments still await the provider phase. Built-app Electron acceptance was not exercised here.
