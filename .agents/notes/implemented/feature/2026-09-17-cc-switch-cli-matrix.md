# Agent Note: LLM-side multi-CLI matrix with sync state

Status: implemented

## Problem

Provider credentials live in the LLM engine panel, but spending them anywhere outside JanusX means retyping secrets into external files. The first sync design put a sync block on the general settings card, which mixes two responsibilities: terminal health (is Claude Code installed, is it current) and credential distribution (which provider feeds which CLI). The general card must stay a pure detection and install surface, while the question "who uses my providers" belongs where providers are edited — including JanusX itself as the first consumer.

## Decision

The LLM engine tab owns a CLI section below the provider list. It renders one row per consumer: JanusX internal, pinned to the default provider with no action, and Claude Code, showing its last sync source and time or an unsynced state, with sync-default and rollback actions. Provider identity for the sync call travels explicitly (`applyProvider` takes a provider id, null for the default), so the panel never depends on ambient selection. Sync results persist in `userData/janusx/cc-switch-sync.json` through the house `SerialQueue` plus atomic-write pattern: the record keeps provider id, display name, endpoint, model, timestamp, and backup path, and never a secret. Rollback clears the record because the live file no longer matches it, and a record whose provider id no longer exists renders as source-deleted rather than silently passing. The general card drops its sync block and returns to detection, install, upgrade, and re-detect only. This supersedes [the card-side sync](../../archived/feature/2026-09-17-cc-switch-llm-sync.md), keeping its backup, verify, and rollback chain and moving only the entry point and the source tracking.

## Alternatives considered

- Per-provider "sync to CLI" buttons on every provider row — strongest case is fewer clicks for non-default relays. The driver that rules it out is state clarity: the consumer matrix shows at a glance who uses what, while scattered row buttons hide the current distribution; explicit provider ids in the protocol keep the per-provider path open without UI commitment.
- Persist the synced secret for drift comparison — strongest case is detecting hand edits after a sync. The driver that rules it out is secret sprawl: a second copy of the key on disk exists only to diff, and staleness is already visible through the source record plus the backup chain.
- Keep the sync block on the general card as well — strongest case is discoverability from the terminal-health view. The driver that rules it out is the stated home rule: general stays pure detection and install, and two sync entries invite divergent behavior over time.
- Do nothing / keep sync on the general card — staying put costs nothing now. The cost is the category error above: credential distribution living next to binary health, with no room for the internal consumer or the next CLI.

## Consequences

- **Gains**: Providers show their consumers in one matrix; sync source survives restarts and provider deletions render honestly; four sync-state tests pin the record lifecycle and malformed-record tolerance (`tests/unit/cc-switch/sync-state.test.ts` — 26 tests green in the domain).
- **Costs and limits**: Only the default provider syncs from the UI today; the protocol already accepts explicit ids for later rows. One record per CLI means the matrix grows a row and a record field per tool, which fits the current two consumers but wants a table past a handful. Sync state is local-only with no cross-device story.
