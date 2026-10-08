---
{
  "schema": "harness-note/2",
  "id": "bfc7dcb4-f257-4931-ae82-11ec0fcc55e1",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-21",
  "class": "feature",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22"}
  ],
  "extensions": {
    "r5Migration": {
      "sourceHash": "c382d6a629951ba6d0d9993f0b89b1e2d0a6374bbfbcd10a4cc630376f12b004",
      "repairs": ["relations[0].reason"],
      "originalRelations": [
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22",
          "reason": "Checkpoint retention and eviction for the session requirement"
        }
      ]
    },
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-21-agent-note-checkpoint-retention-with-count-and-age-caps--bfc7dcb4.md",
      "sourceHash": "2a19417b968178e765f76933b0ddc6da6830270a5ec5ec64fc1877cee61080e4",
      "originalBodyHash": "e597bad5f5928a76c0f362dea251a6f9257eb6bb80d5e95939155ff97bdb7fd2",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Checkpoint retention with count and age caps. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-21-checkpoint-retention.md",
        "sourceHash": "2a19417b968178e765f76933b0ddc6da6830270a5ec5ec64fc1877cee61080e4",
        "originalBodyHash": "e597bad5f5928a76c0f362dea251a6f9257eb6bb80d5e95939155ff97bdb7fd2"
      }
    }
  },
  "updated": "2026-10-08T09:06:56.496Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/984f67da-38f0-455e-8903-2b0083c5b533"
}
---

# Checkpoint retention with count and age caps

## Problem

Snapshot and blob storage grew without bound: forty checkpoints was a count cap with no age limit, so abandoned workspaces accumulated restore points forever, and blob bytes followed checkpoint count with no ceiling of their own. Eviction ran only on creation with no policy beyond newest-wins, leaving retention to chance.

## Decision

The checkpoint engine now enforces two caps on every creation: newest forty survive regardless of age, and anything older than thirty days goes except the newest five, which always survive. Unparseable dates are kept rather than risking valid history on a clock glitch. Blob storage follows automatically since unreferenced blobs collect on delete. The JanusX tree carries the rebuilt engine files; no shell contract changed.

## Alternatives considered

- Size-based blob eviction — strongest case is a true byte ceiling independent of checkpoint age. The driver that rules it out is sharing: content-addressed blobs span checkpoints, so byte budgets cannot evict without reference analysis the engine does not have.
- Configurable retention per workspace — strongest case is team policies over personal defaults. The driver that rules it out is surface: no settings UI consumes retention yet, and constants document the policy in one place.
- Aggressive age pruning without a floor — strongest case is minimal disk use. The driver that rules it out is recovery: a quiet month must never empty a workspace, so five newest always survive.
- Do nothing / reuse — keep the count cap alone. The cost is unbounded growth on every abandoned checkout.

## Consequences

- **Gains**: storage converges to forty recent plus five newest regardless of abandonment. Sibling `agent-core` checks cover the count cap, the thirty-day window, and the newest-five floor; the JanusX tree runs the rebuilt engine through its existing suites.
- **Costs and limits**: no per-workspace tuning and no byte-level ceiling; eviction runs on creation only, so idle checkouts keep history until the next checkpoint. Built-app Electron acceptance was not exercised here.
