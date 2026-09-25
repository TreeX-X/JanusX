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

`BlueprintMaintenancePanel` keeps exactly one project conversation (`BLUEPRINT_PANEL_VIEW_REF`), always attached to the active workspace only, `plan` approval mode, `chat.send` directly, `JanusChat minimalComposer + compactNavigation` (messages + approval slot + single input; thread toolbar, session sidebar, resource chips, edit actions, status bar hidden). The empty-state JANUSX banner is hidden by scoped CSS; the workspace/scope context line is removed — only the transient switch notice remains. On workspace switch the panel clears the conversation, shows `maintenance.workspaceSwitched` for 5s, and rebinds. The workbench capsule looks up the same stable `viewRef`. The maintenance backend (store, service, changeset, audit, undo, `maintenanceContext`) stays intact and unit-covered; only the right-column UI entry is minimal now.

`tests/e2e/blueprint-workbench.spec.ts` asserts the pure dialog plus a switch-workspace case (one session, context reset, notice, second stream scoped to the new workspace) driven by a `?switch-workspace` fixture flag in `tests/e2e/island-harness/project.tsx`. `tests/e2e/project-conversation.spec.ts` asserts the single dialog. `tests/e2e/blueprint-maintenance.spec.ts` drove the removed settings/proposal/audit UI and stays deleted.

## Acceptance criteria

- [x] AC-1: Right column contains no `.bp-maintenance-controls`, `.bp-maintenance-context`, session sidebar, resource chips, or empty-state banner; a minimal `JanusChat` (single input) plus the transient switch notice remain.
- [x] AC-2: One persisted conversation across workspace switches (`conversationId` set size 1); sending emits a `project` stream scoped to the active workspace with no `maintenanceTaskId`; switching shows the notice, clears old messages, and the next stream carries the new workspace.

## Verification

- `npm run typecheck` PASS.
- Vitest `blueprint-maintenance-scope/progress/history/changeset` + `blueprint-store`: 5 files / 30 tests PASS.
- `npm run build` PASS (renderer bundle built).
- Playwright island E2E not run in this sandbox (webServer port check fails); updated specs are the executable evidence for the next full run.

## Alternatives considered

- Do nothing / keep the maintenance console folded: retains explicit node/scope/authorization/proposal/audit controls but keeps the squeezed chat layout the user rejected.
- Keep per-node binding with `expectedHash` gates: preserves checkout-precise maintenance transactions from R5, but requires the settings/proposal UI the user asked to remove. Revisit if workspace-scoped edits prove too coarse.

## Results

2026-09-25: Panel rewritten to a single-session dialog; workbench capsule follows the same stable `viewRef`. Trade-off: cross-checkout one-shot edits and in-panel proposal/audit/undo entries are gone from the right column; use chat tool approvals and the remaining maintenance store paths instead. `maintenanceContext.ts` is no longer referenced by the panel but stays (with its scope-ui test) as a backend utility.

2026-09-25 (follow-up-2): user-reported remnants removed — session sidebar via `compactNavigation`, empty JANUSX banner via scoped CSS, workspace/scope context line deleted. Panel chrome is now header (title + close) + messages + single input.
