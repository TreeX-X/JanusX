# Agent Note: Sync Claude Code credentials from the LLM engine

Status: implemented

## Problem

Claude Code reads its endpoint and key from `~/.claude/settings.json`, while JanusX already manages those same values in its LLM engine panel. Keeping a second credential store for the external CLI forces users to type the same secret twice and lets the two copies drift without anyone noticing. The previous profile-store design solved drift by duplication; review rejected the duplication because the LLM panel stays the single place users edit providers.

## Decision

The settings external-terminal card owns a sync block beside install and upgrade. `CcSwitchService.applyLlm` resolves credentials only from the existing LLM engine default provider through `llmConfigStore.getDefaultProvider`, accepts it only when it carries `api-key` auth with a non-empty base URL and key, maps `modelId` then `defaultModelId` to the model pin, and hands the triple to the unchanged `ClaudeSettingsApplier` chain: timestamped backup rotated to ten, owned-keys-only replacement, atomic write, and read-back verification. No credential is stored anywhere in this domain; `NO_LLM_PROVIDER` travels back as a sentinel the renderer maps to localized copy, while apply failures surface verbatim. Rollback restores the newest backup through the same atomic path. The same change fixes three install-card display defects found in testing: the refresh no longer clears error state so install failures stay visible, the not-installed manual command renders as a neutral hint instead of a red error, and the restart-terminals notice appears only after an in-session install while the update badge moves from red to amber. This supersedes [the profile-store design](../../archived/feature/2026-09-17-cc-switch-profile-switch.md), keeping its backup, verify, and rollback chain and dropping only the duplicate store.

## Alternatives considered

- Keep the profile store alongside LLM sync — strongest case is offline switching between saved relays without touching the LLM panel. The driver that rules it out is the review verdict: two editable copies of the same secret guarantee silent drift, and the rollback chain already covers recovery from a bad sync.
- Let the user pick any provider instead of the default — strongest case is multi-relay workflows without changing the LLM default. The driver that rules it out is scope: the card promises "same as my LLM setup", and a picker reintroduces the second-selection state the removal was meant to kill; a picker waits for a real multi-relay request.
- Write the synced values back into the LLM store as a new provider — strongest case is bidirectional parity. The driver that rules it out is direction: the LLM panel is the source of truth, the live file is a projection, and reverse flow would let hand edits in an external file corrupt the managed store.
- Do nothing / keep hand-editing `settings.json` — staying put costs nothing now. The cost is the original gap: secret edits with no backup, no verification, and no recovery.

## Consequences

- **Gains**: One click carries the LLM default endpoint, key, and model into Claude Code with backup and verification; three new service tests pin the mapping, the no-provider sentinel, and the unsupported-tool short-circuit (`tests/unit/cc-switch/llm-sync.test.ts` — 22 tests green in the domain).
- **Costs and limits**: Only `api-key` defaults sync; Vertex, OAuth, and keyless local providers refuse with guidance instead of guessing. Sync overwrites any hand edits in the owned keys, with the backup as the sole recovery. Non-Anthropic wire protocols pass through untouched, so an OpenAI-only endpoint syncs faithfully but may not serve Claude Code — endpoint compatibility stays the user's call.
