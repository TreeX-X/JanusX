---
schema: harness-note/1
id: cddc53a5-dcf8-5852-a83c-94dd90d02788
kind: decision
lifecycle: proposed
created: 2026-09-18
class: architecture
---
# Agent Note: Legacy maintenance loop removal plan

Status: proposed

## Problem

The legacy maintenance loop still serves unmigrated JSON blueprints: its
conversation, proposal, apply, audit, and undo paths are their only
maintenance access. Deleting the loop before on-demand migration strands
those tasks with no path forward, which contradicts the migrate-on-demand
policy. The removal needs a pinned cut list, proven equivalence per
capability, and the migration entry it waits on.

## Proposal

Remove in one commit once the gates below hold:

- Service: `respond`, session/steering/trace maps and helpers, `start`
  without conversation, `message`, `propose` (loop-bound), `steerTask`,
  `cancelSteerTask`. `cancel`/`complete`/`dismissProposal` stay: the panel
  footer and the shared proposal dismiss serve both lanes, not the loop.
  Keep `proposeForConversation`, conversation starts, selected apply with
  evidence recheck, audits read, and undo until migration consumes them;
  they serve frozen legacy tasks, not the loop.
- IPC: maintenance message, propose (loop-bound), steer, steer
  cancel. Keep start, apply, cancel, complete, dismiss, undo prepare/apply,
  audits, list, and the new harness channels.
- Renderer: the legacy conversation branch of `MaintenancePanel` with its
  message/steer/propose wiring and the non-harness start section; keep
  proposal selection, apply, audits, undo, cancel/complete footer, shared
  dismiss, and the harness-only start until migration repoints them.
- Store: legacy message/steer/propose actions; keep start, task list,
  audits, apply, cancel, complete, dismiss, and undo actions.
- JSON store: freeze writes after migration repoints the last writer;
  reads stay for migration input. No bulk conversion, no silent deletes.

## Alternatives considered

- Delete everything now including legacy apply and audits: smallest diff,
  but unmigrated tasks lose apply and history with no replacement, breaking
  migrate-on-demand.
- Freeze new legacy tasks first: stops growth, but legacy users lose all
  maintenance until migration lands, which is deletion by another name.
- Keep the loop indefinitely beside the new path: zero risk today, but the
  duplicated conversation ownership the unification removed returns
  permanently.
- Do nothing / reuse: leave the plan unpinned; rejected because the
  authorized deletion needs checkable gates, not intent.

## Acceptance criteria

- [ ] On-demand migration moves a JSON blueprint to Notes with audits
  readable on the new side; the migrated source archives, never deletes.
- [ ] Selection apply, evidence expiry, delete confirm, undo conflict,
  steering, and cancel each hold an equivalence test on the new path.
- [ ] No renderer, handler, or test references the removed loop symbols;
  typecheck, unit, island, and build pass on the removal commit.
- [ ] Legacy apply, audits read, and undo stay usable for tasks that predate
  migration until their migration completes.

## Risks

- Migration UI scope creep: the migration moves content and audit
  readability only, never history rewriting or auto-deletion.
- Partial deletion strands callers: the commit lands whole with the
  inventory above, verified by symbol search plus the full gates.
