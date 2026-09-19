# Agent Note: Claude Code provider profile switching with rollback

Status: implemented

## Problem

Detecting and installing Claude Code is only half the switch: JanusX still cannot move provider credentials into the external CLI. Users keep one hand-edited `~/.claude/settings.json`, so switching between a relay and an official endpoint means retyping secrets into a JSON file with no backup and no way back. Any writer that touches that file must preserve unrelated sections (`hooks`, `permissions`) and survive concurrent switches, or the next activation silently drops automation the user depends on.

## Decision

The settings external-terminal row gains a provider-profile panel backed by three additions to the `src/main/cc-switch/` domain. `CcSwitchProfileStore` persists named profiles (`name`, `baseURL`, `authToken`, optional `model`) in `userData/janusx/cc-switch-profiles.json` through `SerialQueue` plus `writeFileAtomic`, with corrupt-file backup before any rebuild, first-profile auto-activation, and an emptied active flag when the active profile is removed rather than a silently chosen heir. `ClaudeSettingsApplier` applies a profile to `~/.claude/settings.json` under its own queue: it snapshots the live file to a timestamped backup (rotated to ten) before touching anything, replaces only the three owned `env` keys plus top-level `model` when the profile names one, preserves every other field byte-for-byte, and re-reads the file to verify the owned keys before reporting success. `rollback` restores the newest backup through the same atomic path and fails loudly when no backup exists. `CcSwitchService.activateProfile` flips the active flag only after the verified write, so the active id always equals the profile the live file was verified against; rollback clears the flag because the live file no longer matches it. Input validation lives in the shared IPC contract so renderer hints and main enforcement never drift. The renderer panel offers create, edit, two-step remove, switch, and rollback with zh-CN/en copy, reusing the detection card's row.

## Alternatives considered

- Store profiles inside the existing `llm-config.json` — strongest case is one fewer file and shared backup logic. The driver that rules it out is blast radius: internal chat credentials and external CLI projections have different write cadences and failure modes, and a corrupt external write must never endanger the internal providers; the formats stay separate while sharing the `SerialQueue` plus `writeFileAtomic` primitives.
- Silent merge without backups — strongest case is less disk clutter and simpler code. The driver that rules it out is irreversibility: a wrong token locks the user out of every terminal at once, and the backup plus one-click rollback is the only recovery that does not require remembering the previous secret.
- Clear the model keys when a profile has no model — strongest case is a fully declarative live file. The driver that rules it out is surprise deletion: an empty model field means "don't touch", and only an explicit model value writes the two model keys, so partial profiles compose with hand-managed model pins.
- Do nothing / keep hand-editing `settings.json` — staying put costs nothing now. The cost is unprotected secret edits with no history, no verification, and no recovery, exactly the failure the backup chain exists to prevent.

## Consequences

- **Gains**: Profiles switch end to end from Settings with backup, verification, and rollback; 12 new unit tests pin owned-key-only replacement, unknown-field preservation, backup rotation, malformed-file refusal, queue serialization, the activate-after-verify ordering, and honest active-flag clearing (`tests/unit/cc-switch/profile-store.test.ts`, `settings-applier.test.ts`, `profile-service.test.ts` — 25 tests green in the domain).
- **Costs and limits**: Profile secrets travel to the renderer for editing, same trust boundary as the existing LLM provider form; the backup directory keeps ten snapshots per machine with no cross-device sync; rollback restores file content but cannot restore a revoked server-side secret. Multi-app projection (Codex, Gemini) and shared-snippet backfill stay out of scope until a second consumer needs them.
