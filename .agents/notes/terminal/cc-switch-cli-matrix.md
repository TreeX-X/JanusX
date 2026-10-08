---
{
  "schema": "harness-note/2",
  "id": "2b16ef61-0073-5589-a8ea-4061dc6c680b",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-17",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/33cccd84-ffbf-4a67-aa3a-3380c842af04",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-17-agent-note-llm-side-multi-cli-matrix-with-sync-state--2b16ef61.md",
      "sourceHash": "ea192896dcd1556312b5eb9e708d4711a901cf00af3673614604eb72913cba7b",
      "originalBodyHash": "33358d51e491b8049edac91de597b31bb6bb9cfead1d1903860d66a7abc086df",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents LLM-side multi-CLI matrix with sync state. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ../../archived/feature/2026-09-17-cc-switch-llm-sync.md -> ./2026-09-17-cc-switch-llm-sync--5773a79c.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-17-cc-switch-cli-matrix.md",
        "sourceHash": "f51b69731a081819558c623bf9557c043b408fce830da7558efcca96240918b9",
        "originalBodyHash": "825b241d42bd05664109bfc429a48ac85fd6e4c7a85541b4b826c22a515ab71b"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# LLM-side multi-CLI matrix with sync state


## Problem

Provider credentials live in the LLM engine panel, but spending them anywhere outside JanusX means retyping secrets into external files. The first sync design put a sync block on the general settings card, which mixes two responsibilities: terminal health (is Claude Code installed, is it current) and credential distribution (which provider feeds which CLI). The general card must stay a pure detection and install surface, while the question "who uses my providers" belongs where providers are edited — including JanusX itself as the first consumer.

## Decision

The LLM engine tab owns a CLI section below the provider list. It renders one row per consumer: JanusX internal, pinned to the default provider with no action, and Claude Code, showing its last sync source and time or an unsynced state, with sync-default and rollback actions. Provider identity for the sync call travels explicitly (`applyProvider` takes a provider id, null for the default), so the panel never depends on ambient selection. Sync results persist in `userData/janusx/cc-switch-sync.json` through the house `SerialQueue` plus atomic-write pattern: the record keeps provider id, display name, endpoint, model, timestamp, and backup path, and never a secret. Rollback clears the record because the live file no longer matches it, and a record whose provider id no longer exists renders as source-deleted rather than silently passing. The general card drops its sync block and returns to detection, install, upgrade, and re-detect only. This supersedes [the card-side sync](./history/cc-switch-llm-sync.md), keeping its backup, verify, and rollback chain and moving only the entry point and the source tracking.

## Alternatives considered

- Per-provider "sync to CLI" buttons on every provider row — strongest case is fewer clicks for non-default relays. The driver that rules it out is state clarity: the consumer matrix shows at a glance who uses what, while scattered row buttons hide the current distribution; explicit provider ids in the protocol keep the per-provider path open without UI commitment.
- Persist the synced secret for drift comparison — strongest case is detecting hand edits after a sync. The driver that rules it out is secret sprawl: a second copy of the key on disk exists only to diff, and staleness is already visible through the source record plus the backup chain.
- Keep the sync block on the general card as well — strongest case is discoverability from the terminal-health view. The driver that rules it out is the stated home rule: general stays pure detection and install, and two sync entries invite divergent behavior over time.
- Do nothing / keep sync on the general card — staying put costs nothing now. The cost is the category error above: credential distribution living next to binary health, with no room for the internal consumer or the next CLI.

## Consequences

- **Gains**: Providers show their consumers in one matrix; sync source survives restarts and provider deletions render honestly; four sync-state tests pin the record lifecycle and malformed-record tolerance (`tests/unit/cc-switch/sync-state.test.ts` — 26 tests green in the domain). The applier concurrency test now proves serialization instead of asserting it: under two concurrent applies one backup is the initial file and the other is the first writer's output, so the second writer observably saw the first.
- **Costs and limits**: Only the default provider syncs from the UI today; the protocol already accepts explicit ids for later rows. One record per CLI means the matrix grows a row and a record field per tool, which fits the current two consumers but wants a table past a handful. Sync state is local-only with no cross-device story.
