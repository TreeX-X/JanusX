---
{
  "schema": "harness-note/2",
  "id": "4b49f066-10dc-5ef6-8223-bcc3d0656016",
  "kind": "decision",
  "lifecycle": "archived",
  "disposition": {
    "reason": "Superseded by the R5 maintenance loop reusing JanusChat and harness transactions; retained frozen as history."
  },
  "created": "2026-08-04",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-08-04-agent-note-controlled-blueprint-maintenance--4b49f066.md",
      "sourceHash": "7ae417aa5db218d410e1b6fad26779ced5f4098b91e703b2e6e84b2cf9ae0272",
      "originalBodyHash": "272c83e3c0bbda380cc02f79987106bebb44ddf361627425c143b9e0bdcdebc1",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Controlled blueprint maintenance. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-08-04-blueprint-maintenance.md",
        "sourceHash": "7ae417aa5db218d410e1b6fad26779ced5f4098b91e703b2e6e84b2cf9ae0272",
        "originalBodyHash": "272c83e3c0bbda380cc02f79987106bebb44ddf361627425c143b9e0bdcdebc1"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd"
}
---
# Controlled blueprint maintenance


## Problem

A model with direct blueprint write access mutates shared planning truth without review. Conversation-derived requirements, node moves, relation edits, and deletions need a path from discussion to durable state that no silent write can bypass.

## Proposal

Keep proposal and execution separate: the agent emits immutable changesets and never writes the formal blueprint mid-analysis. Users preview, select, and approve each changeset; the main side validates and applies atomically with audit and reverse operations for undo. Bind work to explicitly authorized workspace evidence, project background task status through the island, and run maintenance sessions under the same bounded runtime shape as chat (bounded steps, steering, tool traces, knowledge recall).

## Decision

Proposal and execution stay separate. The agent emits immutable changesets and never writes the formal blueprint mid-analysis. Users preview, select, and approve; the main side validates and applies atomically. Work binds to explicitly authorized workspace evidence, background analysis projects task status through the island, and every formal change carries audit with reverse operations for undo. Maintenance sessions run under the same runtime shape as chat: bounded steps, steering, tool traces, and knowledge recall.

## Alternatives considered

- Direct model writes with audit after the fact — strongest case removes approval friction. The driver that rules it out is unreviewed mutation of shared truth; logs cannot unwrite a bad merge.
- Chat-only suggestions without changesets — strongest case needs no machinery. The driver that rules it out is the missing tail: no atomic apply, no undo, no audit trail.
- Do nothing / reuse manual node editing — staying put keeps the blueprint hand-tended. The cost is drift between workspace evidence and planning state.

## Risks

- Approval friction: every formal change waits on explicit user approval, so long maintenances stall when the user is away.
- Session budgets and trace caps can be exhausted by extended maintenance runs.
- Task state lives in memory plus audit files with no database behind it; a crash loses in-flight session state.

## Consequences

- **Gains**: Every formal change arrives approved, validated, atomic, and reversible; discussion stays advisory until approval promotes it.
- **Costs and limits**: Sessions hold budgets and trace caps that long maintenances can exhaust; task state stays in memory plus audit files with no database behind it.
