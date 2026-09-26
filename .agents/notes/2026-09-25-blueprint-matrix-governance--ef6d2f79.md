---
schema: harness-note/1
id: ef6d2f79-c5d6-4306-82ea-4ecd34d5157c
kind: task
lifecycle: accepted
created: 2026-09-25
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
class: architecture
tags: [blueprint, canvas, hierarchy, simplification]
relations:
  - type: implements
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
    criteria: [AC-10]
work:
  scope:
    - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      paths: [.agents/notes/, src/renderer/src/features/blueprint/canvas-navigation.ts, src/renderer/src/features/blueprint/canvas-layout.ts, src/renderer/src/features/blueprint/useBlueprintGraphController.ts, src/renderer/src/components/blueprint/BlueprintCanvas.tsx, src/renderer/src/components/blueprint/BlueprintToolbar.tsx, src/renderer/src/components/blueprint/blueprint.css, src/renderer/src/i18n/types.ts, src/renderer/src/i18n/locales/zh-CN/blueprint.json, src/renderer/src/i18n/locales/en/blueprint.json, tests/unit/blueprint-canvas-layout.test.ts, tests/unit/blueprint-canvas-navigation.test.ts, tests/e2e/blueprint-workbench.spec.ts, tests/e2e/island-harness/project.tsx, tests/e2e/island-harness/workbench-fixture.ts]
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
      args: [run, check:notes]
---

# Blueprint matrix governance: parent backfill plus connectivity clustering

## Goal

The middle canvas stops being an unreadable rectangular matrix. Measured baseline: 189 nodes, 0 `parent` edges (all roots, shelf-packed 4-wide), 132 dashed relation edges, 146 connected components (one 36-cluster, one 9-cluster, 144 isolated). Two moves: backfill the only hierarchy the data actually carries, and fold edgeless roots behind a toggle.

## Scope

Parent rules (user-confirmed): R1 `task.parent` = its `implements` target when local and unique — 7 tasks (R1–R6 plus the dialog task) point at the plan initiative `e7c03317`. R2 no parents between initiatives/requirements (`governed-by`/`depends-on` are governance/order, not hierarchy). R3 no parents for decisions/ideas (`related-to` never enters the tree). R4 history samples untouched. R5 scripted, idempotent, byte-preserving edit; UUIDs and bodies unchanged.

Canvas: `groupRootsByConnectivity` (union-find over hierarchy + relations + interfaces, deterministic) in `canvas-navigation.ts`; `computeBlueprintLayout` orders roots by component rank so clusters read as adjacent blocks; `deriveBlueprintFlow`/`computeVisibleBlueprintLayout` accept `extraHidden`; the graph controller forwards `hiddenNodeIds` (in topology key, never persisted). `useHideIsolatedState` (shared by toolbar provider and canvas embedded state) auto-hides isolated roots above 24 until the user toggles; search/filter activity suspends hiding so matches stay visible. Toggle button with live count in both toolbars; new `blueprint:action.hideIsolated/showIsolated` keys (zh/en).

## Acceptance criteria

- [x] AC-1: The 7 tasks carry exactly one local `parent` edge to `e7c03317`; `check:notes` 0 errors; the adapter builds one 8-node tree, everything else keeps its relations untouched.
- [x] AC-2: With 30 edgeless roots the canvas mounts 5 nodes with the toggle pressed; expanding shows 35, collapsing returns to 5. Small graphs (isolated <= 24) render exactly as before.
- [x] AC-3: Targeted unit tests cover clustering, rank ordering, and extra-hidden filtering; existing layout/navigation/controller/composition suites keep passing.

## Verification

- `npm run check:notes`: 189 Notes, 0 errors.
- Vitest (direct `vitest.mjs`, repo `.bin` shim currently missing in this sandbox): navigation 12, layout 22, controller 8, composition 7, adaptive-edge 5, notes-adapter 16, agent-notes gate 7 — all PASS.
- `tsc --noEmit`: no errors in touched files (repo-wide run reports only pre-existing missing workspace deps from a pruned `node_modules`: `@ai-sdk/*`, `@electron-toolkit/utils`).
- Playwright island E2E not run in this sandbox (webServer port check fails); the `?isolated` workbench case is the executable evidence for the next full run.

## Alternatives considered

- Do nothing / search-only navigation: keeps the 189-card matrix with dim-only filters; rejected by the user.
- Hand-write parents for all 189 notes: 161 decisions have no natural parent; invented hierarchy would fake semantics the R6 migration deliberately refused to guess.
- Kind/lifecycle swimlanes: measured skew (161 decision, 135 implemented) collapses into single giant columns; connectivity clusters carry more signal.

## Results

2026-09-25: 7 parent edges landed; canvas groups by connectivity, folds edgeless roots behind a count toggle, and search/filter activity suspends hiding so matches stay visible. Residual: intra-cluster relation hairball (esp. the 36-node session cluster) is untouched — selected-only edges (C1) remain the follow-up if clusters still read dense.
