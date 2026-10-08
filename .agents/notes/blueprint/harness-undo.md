---
{
  "schema": "harness-note/2",
  "id": "ee0e8ff1-8aba-560e-8585-498c71f1718c",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-18",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-reversible-managed-writes--ee0e8ff1.md",
      "sourceHash": "65f3b40a30536702887f847e228eb2f9e7cffd7f20b7f4f9d5059397cd75846f",
      "originalBodyHash": "48511af8329d34d975e5676c89ef5b8b7b7947c655f722d36b2b84127c5216d0",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Reversible managed writes. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-18-harness-undo.md",
        "sourceHash": "65f3b40a30536702887f847e228eb2f9e7cffd7f20b7f4f9d5059397cd75846f",
        "originalBodyHash": "48511af8329d34d975e5676c89ef5b8b7b7947c655f722d36b2b84127c5216d0"
      }
    }
  },
  "updated": "2026-10-08T03:43:42.543Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd"
}
---
# Reversible managed writes


## Problem

Managed writes only move forward: a mistaken proposal apply, canvas edit,
or adoption rewrites notes with no per-write way back, and concurrent edits
either silently win or fail opaquely. The legacy maintenance loop owned the
only undo path with snapshots and conflict handling, so removing it strands
operators with git archaeology for uncommitted work. Evidence and receipts
must never move backwards even while file bytes do.

## Decision

`src/main/harness/undo.ts` reverses one committed write as a new undoable
changeset. Preview classifies every touched file against the journal
before/after hashes into reversible, already-reverted, or conflict without
moving a byte; apply refuses the whole package on any conflict and writes
nothing. Reverse operations rebuild note identities from snapshot bytes
code-side, translate checkout-relative journal paths into notes-relative
create paths, and travel through the standard transacted apply with an
explicit delete grant carried by the panel confirmation. Already-reverted
writes report nothing to do instead of duplicating history. New channels
`undoPreview` and `undoApply` cross IPC as data or coded failure, and the
panel shows the candidate with per-file status behind a confirm step.

## Alternatives considered

- Read-only git restore: zero new code, but uncommitted writes have no
  commit to return to and per-operation granularity is lost in diff
  archaeology.
- Reverse in place without a new changeset: fewer journal entries, but the
  reversal itself becomes unreviewable and un-undoable; the undo-of-undo
  chain is a stated requirement.
- Partial reversal skipping conflicted files: more forgiving, but half
  reversed packages leave graphs no one can reason about; atomicity stays.
- Silent latest-write reversal without preview: one click faster, but
  operators cannot see the blast radius before bytes move.
- Do nothing / reuse: keep the legacy undo; rejected because the legacy
  loop exit requires this equivalence on the new path.

## Consequences

- **Gains**: replaces, creates, and deletes each reverse correctly with
  real temp checkouts pinning restore bytes, conflict refusal without
  writes, and no-op detection. The create-path prefix translation is locked
  by the same suite after it caught the doubled-path trap during
  development. Mapping, contract, and island suites pin the channels and
  the confirm flow. Typecheck, production build, package boundaries, and
  bilingual key checks pass.
- **Costs and limits**: undo targets the latest committed write or an
  explicit transaction id; there is no cross-write selective picker yet.
  Journal retention bounds history depth; pruned transactions refuse as
  missing instead of guessing. Evidence, receipts, audits, and run records
  never reverse by construction.
