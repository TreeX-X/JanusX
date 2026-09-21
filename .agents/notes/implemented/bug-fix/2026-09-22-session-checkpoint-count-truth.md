---
schema: harness-note/1
id: b363ad92-ed9e-4a63-808b-032e16283edd
kind: decision
lifecycle: implemented
created: 2026-09-22
class: bug-fix
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/bb3ef36c-f74e-4589-98c7-601f8823d367
    reason: The migration moves checkpoint ownership into session cards, whose count and list must read one truth
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/7f0d3ec5-50e4-46df-85b4-f0b75e589df0
    reason: Expand-content states assume the session-scoped list returns the counted checkpoints
---

# Agent Note: Session checkpoint count and list share one truth

## Problem

A session card shows a nonzero checkpoint count while its expand resolves to an empty list. The count comes from the session ledger (`checkpointIds` appended on every turn-lifecycle creation in `src/main/ipc/terminal-handlers.ts`), but the expand queries `checkpoint:list` filtered by `sessionId`, and the turn-lifecycle producer never tags new checkpoints with one, so the manager filter drops every checkpoint the card counted. The ledger also never shrinks when restore prune or retention caps delete from storage, so counts drift high even for tagged data.

## Decision

The turn-lifecycle producer resolves `sessionIdForTerminal` and tags each new checkpoint, which joins future counts with the session-scoped list through the existing `CheckpointCreateOptions.sessionId` field with zero IPC or schema changes. The `checkpoint:list` handler repairs the two legacy gaps on session-scoped reads only: it merges untagged checkpoints owned by the session's own terminals into the result (deduped, newest-first) and reconciles the ledger through the new `retainCheckpoints` registry method against live storage ids for the same cwd, persisting only on change. Turn records keep their own checkpoint references and never shrink in this path.

## Alternatives considered

- Backfill sessionId into stored checkpoint JSON from the main process — strongest case is a one-time permanent repair with no read-path cost. The driver that rules it out is storage ownership: checkpoint blobs belong to the checkpoint manager, and direct mutation bypasses its index and save paths.
- Filter the card by terminal instead of session — strongest case is zero tagging dependence. The driver that rules it out is identity volatility: terminal ids die on restart while the session model exists to survive them.
- Reconcile counts on every session list read — strongest case is always-truthful counts everywhere. The driver that rules it out is fan-out cost: one storage scan per session per list against a ledger the checkpoint read already touches.
- Do nothing / reuse the ledger count — no churn. The cost is the reported symptom class: nonzero counts expanding to empty or short lists with no user-recourse signal.

## Consequences

- **Gains**: expand returns the counted checkpoints for both tagged and legacy data, and restore or retention deletions settle the card count on the next expand with existing manager APIs.
- **Costs and limits**: legacy untagged checkpoints newer than a restore target survive manager-side session pruning (prune scope lives in the external agent-core manager and matches on session tags); the card count reconciles while prune coverage for pre-tag data stays partial. Verification is machine evidence on touched paths: `tsc --noEmit` is clean, `eslint` on the three touched main files reports zero problems, and `tests/unit/agent-session-registry.test.ts` plus `tests/unit/worktree-store.test.ts` pass 13/13 including the new retain coverage.
