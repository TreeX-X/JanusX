# Agent Note: Controlled blueprint maintenance

Status: implemented

## Problem

A model with direct blueprint write access mutates shared planning truth without review. Conversation-derived requirements, node moves, relation edits, and deletions need a path from discussion to durable state that no silent write can bypass.

## Decision

Proposal and execution stay separate. The agent emits immutable changesets and never writes the formal blueprint mid-analysis. Users preview, select, and approve; the main side validates and applies atomically. Work binds to explicitly authorized workspace evidence, background analysis projects task status through the island, and every formal change carries audit with reverse operations for undo. Maintenance sessions run under the same runtime shape as chat: bounded steps, steering, tool traces, and knowledge recall.

## Alternatives considered

- Direct model writes with audit after the fact — strongest case removes approval friction. The driver that rules it out is unreviewed mutation of shared truth; logs cannot unwrite a bad merge.
- Chat-only suggestions without changesets — strongest case needs no machinery. The driver that rules it out is the missing tail: no atomic apply, no undo, no audit trail.
- Do nothing / reuse manual node editing — staying put keeps the blueprint hand-tended. The cost is drift between workspace evidence and planning state.

## Consequences

- **Gains**: Every formal change arrives approved, validated, atomic, and reversible; discussion stays advisory until approval promotes it.
- **Costs and limits**: Sessions hold budgets and trace caps that long maintenances can exhaust; task state stays in memory plus audit files with no database behind it.
