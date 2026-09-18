# Agent Note: Desktop projections of portable task evidence

Status: implemented

## Problem

A desktop run list based only on local run files omits completed work from a shared checkout. Canvas acceptance checkboxes also describe prose rather than verified coverage. The graph and terminal can disagree after local state is removed or source code changes.

## Decision

The execution adapter reads task results through the shared harness-node validator. Local runs retain their controls; portable task records use their Note URI as a read-only result reference. The panel displays execution and evidence validity separately, disables execution controls without local ownership and checks closeout through the same current-branch proof as the terminal.

Graph projection rebuilds task completion and requirement acceptance from currently valid formal receipts. Checkbox marks do not establish completion. Project reads refresh source Notes, and coverage rechecks the checkout. Share snapshots include the selected tasks' referenced formal receipts, under the managed asset lock; they exclude local runs, leases and conversations and still pass the existing export leak gate.

## Alternatives considered

- Reuse local run lists: preserves inexpensive lookups, but a fresh checkout cannot show portable results.
- Interpret checked acceptance boxes as completion: familiar and cheap, but prose edits cannot prove commands, review or current code validity.
- Copy local runs into shares: retains operational detail, but exports checkout-specific ownership and introduces competing execution truth. Shares carry formal evidence only.

## Consequences

The adapter integration test removes local state after verification, rebuilds a valid result and graph completion, exports referenced receipts, then changes acceptance and observes stale evidence. `npm run test:unit -- --run` with the harness adapter, run handlers, service, acceptance, IPC contract, store branch, maintenance apply and maintenance routing files passes 42 checks. Typecheck, package boundaries and i18n checks pass. Rendering continues to use the existing run panel and canvas components.

Repeated evidence checks add file IO; large graphs with many receipt dependencies require performance measurement. A share carries evidence claims, not an assurance that the receiver's code matches. [Shared conversation control](2026-09-18-project-conversation-controller.md) and [task contract adoption](2026-09-18-task-contract-adoption.md) now cover the new Note entry workflow. GUI model-driven execution and full Electron interaction acceptance remain incomplete. The standard remains a candidate.
