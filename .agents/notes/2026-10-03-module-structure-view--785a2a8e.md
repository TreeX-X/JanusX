---
schema: harness-note/1
id: 785a2a8e-79d5-4b8b-8ca1-efea8f682662
kind: task
lifecycle: accepted
created: 2026-10-03
class: architecture
relations:
  - type: depends-on
    target: note://d2499d5b-4ceb-4d46-aa3b-18e5c9b86034/5f4f7a62-f209-47ce-9ea5-58cdbf34c480
work:
  scope:
    - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      paths: [src/shared/, src/main/notes/, src/main/blueprint/, src/renderer/src/features/blueprint/, src/renderer/src/components/blueprint/, src/renderer/src/i18n/, tests/, scripts/, .agents/notes/]
  acceptanceRefs:
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/2baf7439-f3a2-4bcf-a451-b922db598ea7
      criterionId: AC-2
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/2baf7439-f3a2-4bcf-a451-b922db598ea7
      criterionId: AC-3
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/2baf7439-f3a2-4bcf-a451-b922db598ea7
      criterionId: AC-4
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/2baf7439-f3a2-4bcf-a451-b922db598ea7
      criterionId: AC-5
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/2baf7439-f3a2-4bcf-a451-b922db598ea7
      criterionId: AC-6
  verification:
    - id: V-1
      kind: command
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      program: npx
      args: [vitest, run, tests/unit/blueprint-architecture.test.ts]
    - id: V-2
      kind: command
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      program: npm
      args: [run, typecheck]
---

# Document-driven system structure in the blueprint

## Scope

Consume the [module authoring convention](note://d2499d5b-4ceb-4d46-aa3b-18e5c9b86034/5f4f7a62-f209-47ce-9ea5-58cdbf34c480) through existing Note snapshots. Add an opt-in architecture projection and view selector to the existing blueprint, retaining the complete Note graph and source-based detail/navigation. Derive structure, explicit interface connections and decision/work associations without a second persistent graph. No Archify installation, generated HTML pipeline, new Note kind or parser fork.

Reuse current automatic layout and refresh mechanisms. Current structure contains accepted project/module initiatives only; planned declarations remain accessible separately or in all Notes, with examples and retired declarations excluded from current structure. Show malformed roles, missing/cyclic parents and unresolved interfaces as diagnostics. Relationships retain direction and source checkout identity. No inference of runtime calls from task depends-on or prose. A single source decision or Task may be associated with several modules without duplication or reparenting.

Module declarations are optional. Existing untagged repositories retain the full Note graph. Tagged repositories can default to current structure while retaining an obvious all-Notes view. Opening a related decision/Task must resolve the original source and remain usable when its node is not in the architecture canvas. Architecture layouts and filtering must not erase or overwrite the complete graph or other-view layout.

## Acceptance criteria

- [x] AC-1: A pure tested projection recognizes only initiative role tags, preserves the source graph and identities, excludes examples/retired/planned declarations from current structure, and reports ambiguous or malformed structure. Untagged repositories remain usable.
- [x] AC-2: Users can switch between system structure and all Notes in embedded and workbench canvases; the current structure lays out automatically without manual coordinates. Filters, source focus, refresh and complete-note navigation continue to work.
- [x] AC-3: Module details expose associated decisions and work from declared relations/parent chains with deduplication and original-source navigation. Missing targets remain visible. Interface edges require explicit provider and matching provides; task dependency edges never become runtime architecture edges.
- [x] AC-4: Seed one real JanusX project and an evidence-backed coarse module set, preferably reusing suitable initiatives. Preserve existing decision/Task IDs, content and taskContractHash; do not mass-move files, invent interfaces or modify the user's dirty memory-domain Note. Validate every new/updated declaration and entry reference.
- [x] AC-5: Installed harness parse/serialize and Task hashes prove S1.2 compatibility. Focused unit and browser tests exercise switching, related-note navigation, automatic layout and missing/ambiguous references; run typecheck and relevant existing regression checks. Report baseline failures rather than modifying unrelated work.

## Verification

Use the installed harness-core dependency because the sibling janus-agentX package source tree has pre-existing deletions. Capture original Task contract hashes before corpus changes and compare afterward. V-1 covers projection semantics; V-2 checks integration types. Run focused Playwright coverage with real architecture tags, untagged fallback, interface connections and related Task navigation. Do not claim cross-repository execution baselines were exercised unless explicit fixtures ran.

## Results

2026-10-05: Each blueprint surface exposes one system-structure/all-Notes selector. The workbench places it in the shared toolbar; the embedded canvas retains its local selector. The canvas information disclosure is labeled “Blueprint information” and stays folded by default, with structure counts, checkout coverage and diagnostics inside. Repeating the view name on that disclosure makes metadata look like another switching control.

`npx playwright test tests/e2e/blueprint-architecture.spec.ts --workers=1` passes all three browser cases, including selector count and placement on both surfaces, folded information, view switching and source navigation. `npx vitest run tests/unit/blueprint-architecture.test.ts --maxWorkers=1 --minWorkers=1` passes eight cases. Typecheck, i18n validation and ESLint for `BlueprintArchitecturePanel.tsx` pass. Browser checks use mocked IPC; the workbench screenshot is manually inspected.

2026-10-03: Implemented and independently evaluated: PASS. Current structure uses the existing shared Note snapshot and optional initiative tags. The embedded and workbench canvases preserve all-Notes navigation, exact source checkout identity and Task operations; structure layout remains ephemeral.

Independent verification passes 75 unit cases covering projection, layout, navigation, checkout resolution and execution-adapter baseline/receipt/stale-contract behavior, plus 12 browser cases covering architecture, Note focus and composition navigation. Typecheck and i18n checks pass. The composition browser test explicitly closes its expanded overlay before normal canvas navigation; exact checkout assertions remain intact.

The real repository pipeline produces 229 valid source nodes, seven current structure nodes, six parent placements and seven rendered edges with no structure diagnostics. All seven declarations and their code entry references validate. The original 181 decision files and 13 Task files remain byte-identical, with unchanged Task contract hashes. Four existing initiatives provide current module declarations; no historical decision or Task is moved.

The full Note checker reports only six existing schema errors in dsh-integration.md and existing external-link notices. These are retained as baseline defects. WorkflowX conventions are committed in 82e844f with verification recorded in abffe28; JanusX and janus-agentX local skill copies are synchronized but remain ignored runtime configuration. No shared parser or sealed standard change is necessary. Execution-adapter tests exercise recorded baselines and receipts; no live cross-repository task execution is claimed.
