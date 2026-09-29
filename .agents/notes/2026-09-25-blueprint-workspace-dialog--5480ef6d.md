---
schema: harness-note/1
id: 5480ef6d-5a86-45fd-9719-948d4cc462e5
kind: task
lifecycle: accepted
created: 2026-09-25
class: simplification
tags: [blueprint, janus-chat, workspace]
relations:
  - type: parent
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
  - type: implements
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
    criteria: [AC-10]
work:
  scope:
    - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      paths: [src/renderer/src/components/blueprint/BlueprintMaintenancePanel.tsx, src/renderer/src/components/blueprint/BlueprintWorkbench.tsx, src/renderer/src/components/blueprint/blueprint.css, src/renderer/src/i18n/, tests/e2e/blueprint-workbench.spec.ts, tests/e2e/project-conversation.spec.ts, tests/e2e/blueprint-maintenance.spec.ts, tests/e2e/island-harness/project.tsx, .agents/notes/]
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

# Blueprint right column becomes a single-session workspace dialog

## Goal

The blueprint workbench right column is one Janus dialog bound to the current workspace. No multi-session management: switching the active workspace shows a switch notice, resets the dialog context, and rebinds the same conversation. The dialog itself is minimal: message list plus a single input box.

## Scope

`BlueprintMaintenancePanel` keeps exactly one project conversation (`BLUEPRINT_PANEL_VIEW_REF`), attached to the active workspace only, with `plan` approval mode and direct `chat.send` for ordinary discussion. `JanusChat minimalComposer + compactNavigation` keeps messages, host approval content and a single input; thread toolbar, session sidebar, resource chips, edit actions and status bar stay hidden. On workspace switch the panel clears the conversation, shows `maintenance.workspaceSwitched` for 5s and rebinds. The workbench capsule looks up the same stable `viewRef`. Selected Note references bind their source hash and checkout. [Host proposal actions](./2026-09-29-blueprint-maintenance-approval-gap--a1b2c3d4.md) own explicit proposal generation, grouped approval, history and undo in the message area, reusing the existing maintenance backend.

`tests/e2e/blueprint-workbench.spec.ts` asserts the compact dialog and workspace switching with one session, context reset and a scoped subsequent stream. `tests/e2e/project-conversation.spec.ts` asserts panel/island isolation. `tests/e2e/blueprint-maintenance.spec.ts` exercises explicit proposals, approvals, checkout binding, source conflicts and undo through the production panel.

## Acceptance criteria

- [x] AC-1: Right column contains no `.bp-maintenance-controls`, `.bp-maintenance-context`, session sidebar, resource chips, or empty-state banner; a minimal `JanusChat` (single input) plus the transient switch notice remain.
- [x] AC-2: One panel conversation across workspace switches (`conversationId` set size 1); ordinary sending emits a `project` stream scoped to the active workspace without `maintenanceTaskId`. Explicit proposal generation carries its host task ID; switching shows the notice, clears old messages, and the next stream carries the new workspace. The panel session is ephemeral across application restarts.

## Verification

2026-09-30: Current proposal, conversation-isolation and workspace-switch evidence is recorded in [the maintenance decision](./2026-09-29-blueprint-maintenance-approval-gap--a1b2c3d4.md#verification).

- `npm run typecheck` PASS.
- Vitest `blueprint-maintenance-scope/progress/history/changeset` + `blueprint-store`: 5 files / 30 tests PASS.
- `npm run build` PASS (renderer bundle built).
- Playwright island E2E not run in this sandbox (webServer port check fails); updated specs are the executable evidence for the next full run.

## Alternatives considered

- Do nothing / keep the maintenance console folded: retains explicit node/scope/authorization/proposal/audit controls but keeps the squeezed chat layout the user rejected.
- Keep per-node binding with `expectedHash` gates: preserves checkout-precise maintenance transactions from R5, but requires the settings/proposal UI the user asked to remove. Revisit if workspace-scoped edits prove too coarse.

## Results

2026-09-30: The panel remains a single workspace dialog. Its message area includes explicit host proposal and approval actions as documented in [the maintenance decision](./2026-09-29-blueprint-maintenance-approval-gap--a1b2c3d4.md); these actions resolve source checkouts through maintenanceContext. The panel header, hidden session sidebar and single input retain the compact layout.
