---
schema: harness-note/1
id: 5480ef6d-5a86-45fd-9719-948d4cc462e5
kind: task
lifecycle: accepted
created: 2026-09-25
class: simplification
tags: [blueprint, janus-chat, workspace]
relations:
  - type: implements
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
    criteria: [AC-10]
work:
  scope:
    - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      paths: [src/renderer/src/components/blueprint/BlueprintMaintenancePanel.tsx, tests/e2e/blueprint-workbench.spec.ts, tests/e2e/project-conversation.spec.ts, tests/e2e/blueprint-maintenance.spec.ts, .agents/notes/]
  acceptanceRefs:
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
      criterionId: AC-10
  verification:
    - id: V-1
      kind: command
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      program: npm
      args: [run, typecheck]
---

# Blueprint right column becomes a workspace-following pure dialog

## Goal

The blueprint workbench right column shows only a Janus dialog. Switching the active workspace rebinds the dialog to that workspace. No node display, maintenance task form, proposal approval, or audit history lives in the right column.

## Scope

`BlueprintMaintenancePanel` binds one project conversation per workspace (`viewRef` prefers the blueprint that owns the active checkout, otherwise `workspace:<id>`), attaches only the active workspace, forces `plan` approval mode, and sends with `chat.send` directly. The maintenance backend (store, service, changeset, audit, undo) stays intact and covered by unit tests; only the right-column UI entry is removed.

`tests/e2e/blueprint-workbench.spec.ts` and `tests/e2e/project-conversation.spec.ts` assert the pure dialog. `tests/e2e/blueprint-maintenance.spec.ts` drove the removed settings/proposal/audit UI and is deleted.

## Acceptance criteria

- [x] AC-1: Right column contains no `.bp-maintenance-controls`, settings, proposal, or audit sections; a workspace context line plus a visible `JanusChat` composer remain.
- [x] AC-2: Sending from the dialog emits a `project` stream scoped to the active workspace with no `maintenanceTaskId`; switching workspaces rebinds the conversation and its attached resources.

## Verification

- `npm run typecheck` PASS.
- Vitest `blueprint-maintenance-scope/progress/history/changeset` + `blueprint-store`: 5 files / 30 tests PASS.
- `npm run build` PASS (renderer bundle built).
- Playwright island E2E not run in this sandbox (webServer port check fails); updated specs are the executable evidence for the next full run.

## Alternatives considered

- Do nothing / keep the maintenance console folded: retains explicit node/scope/authorization/proposal/audit controls but keeps the squeezed chat layout the user rejected.
- Keep per-node binding with `expectedHash` gates: preserves checkout-precise maintenance transactions from R5, but requires the settings/proposal UI the user asked to remove. Revisit if workspace-scoped edits prove too coarse.

## Results

2026-09-25: Panel rewritten to `WorkspaceChatColumn`; workbench capsule keeps working because the preferred `viewRef` still uses the owning blueprint id when the active checkout matches. Trade-off: cross-checkout one-shot edits and in-panel proposal/audit/undo entries are gone from the right column; use chat tool approvals and the remaining maintenance store paths instead.
