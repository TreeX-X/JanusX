---
{
  "schema": "harness-note/2",
  "id": "5773a79c-1cfd-54bb-a4e7-ac047d7d8935",
  "kind": "decision",
  "lifecycle": "archived",
  "created": "2026-09-17",
  "class": "feature",
  "disposition": {
    "reason": "Migrated from legacy lifecycle folder; historical state is retained and no execution is inferred."
  },
  "extensions": {
    "r5Migration": {"sourceHash":"791ffa67b7e1cece9efe0bc434f9307f552a72852c5baa29910d74bca6097117"},
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-17-agent-note-sync-claude-code-credentials-from-the-llm-engine--5773a79c.md",
      "sourceHash": "4ec0adf6d81879399d01e7f2af50a881a13d64022fd9ac55839d5cbcaed0b106",
      "originalBodyHash": "340d4a31ed0336cd6a766d10a0c741ed5d9fe14dc9ef42aaf45ba65b42a589ab",
      "category": "historical",
      "reason": "Existing archived disposition remains historical; Migrated from legacy lifecycle folder; historical state is retained and no execution is inferred.",
      "edits": [
        "Rebased Markdown destination: ../../archived/feature/2026-09-17-cc-switch-profile-switch.md -> ./2026-09-17-cc-switch-profile-switch--0c4db530.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/archived/feature/2026-09-17-cc-switch-llm-sync.md",
        "sourceHash": "30ad05ea90dfe353331b0ab4e991c08f9a692365a6ac0877ed8febc725960575",
        "originalBodyHash": "6f29a00c60a06ed20ed79df78303de6cc2409535323aadc54513b25fc4a3fd85"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# Sync Claude Code credentials from the LLM engine


## Problem

Claude Code reads its endpoint and key from `~/.claude/settings.json`, while JanusX already manages those same values in its LLM engine panel. Keeping a second credential store for the external CLI forces users to type the same secret twice and lets the two copies drift without anyone noticing. The previous profile-store design solved drift by duplication; review rejected the duplication because the LLM panel stays the single place users edit providers.

## Decision
The settings external-terminal card owns a sync block beside install and upgrade. `CcSwitchService.applyLlm` resolves credentials only from the existing LLM engine default provider through `llmConfigStore.getDefaultProvider`, accepts it only when it carries `api-key` auth with a non-empty base URL and key, maps `modelId` then `defaultModelId` to the model pin, and hands the triple to the unchanged `ClaudeSettingsApplier` chain: timestamped backup rotated to ten, owned-keys-only replacement, atomic write, and read-back verification. No credential is stored anywhere in this domain; `NO_LLM_PROVIDER` travels back as a sentinel the renderer maps to localized copy, while apply failures surface verbatim. Rollback restores the newest backup through the same atomic path. The same change fixes three install-card display defects found in testing: the refresh no longer clears error state so install failures stay visible, the not-installed manual command renders as a neutral hint instead of a red error, and the restart-terminals notice appears only after an in-session install while the update badge moves from red to amber. This supersedes [the profile-store design](./cc-switch-profile-switch.md), keeping its backup, verify, and rollback chain and dropping only the duplicate store.

## Alternatives considered

- Keep the profile store alongside LLM sync — strongest case is offline switching between saved relays without touching the LLM panel. The driver that rules it out is the review verdict: two editable copies of the same secret guarantee silent drift, and the rollback chain already covers recovery from a bad sync.
- Let the user pick any provider instead of the default — strongest case is multi-relay workflows without changing the LLM default. The driver that rules it out is scope: the card promises "same as my LLM setup", and a picker reintroduces the second-selection state the removal was meant to kill; a picker waits for a real multi-relay request.
- Write the synced values back into the LLM store as a new provider — strongest case is bidirectional parity. The driver that rules it out is direction: the LLM panel is the source of truth, the live file is a projection, and reverse flow would let hand edits in an external file corrupt the managed store.
- Do nothing / keep hand-editing `settings.json` — staying put costs nothing now. The cost is the original gap: secret edits with no backup, no verification, and no recovery.

## Consequences
- **Gains**: One click carries the LLM default endpoint, key, and model into Claude Code with backup and verification; three new service tests pin the mapping, the no-provider sentinel, and the unsupported-tool short-circuit (`tests/unit/cc-switch/llm-sync.test.ts` — 22 tests green in the domain).
- **Costs and limits**: Only `api-key` defaults sync; Vertex, OAuth, and keyless local providers refuse with guidance instead of guessing. Sync overwrites any hand edits in the owned keys, with the backup as the sole recovery. Non-Anthropic wire protocols pass through untouched, so an OpenAI-only endpoint syncs faithfully but may not serve Claude Code — endpoint compatibility stays the user's call.
