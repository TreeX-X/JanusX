---
{
  "schema": "harness-note/2",
  "id": "553f17a8-e800-5e4a-ac55-ae454a51825b",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-18",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-janusx-harness-execution-adapter-and-legacy-lane-closeout--553f17a8.md",
      "sourceHash": "a1186026afd5255e439455ec522ac56506ff66550588659a090f534b43897627",
      "originalBodyHash": "f7747eed50751163b5745dac5b996c4e67651c4642d7ee676d23232571028767",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents JanusX harness execution adapter and legacy-lane closeout. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ../note://62b44166-82f0-41ff-838d-e2b02388ed06/c514cc8a-ba91-4102-add4-54f7f8460ee9 -> ../../../janus-agentX/.agents/notes/implemented/architecture/2026-09-18-harness-task-execution.md",
        "Rebased Markdown destination: ../note://62b44166-82f0-41ff-838d-e2b02388ed06/202ee600-5445-40bf-9cff-545de64ae4e8 -> ../../../janus-agentX/.agents/notes/implemented/bug-fix/2026-09-18-harness-receipt-gates.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-18-harness-execution-adapter-s8.md",
        "sourceHash": "a1186026afd5255e439455ec522ac56506ff66550588659a090f534b43897627",
        "originalBodyHash": "f7747eed50751163b5745dac5b996c4e67651c4642d7ee676d23232571028767"
      }
    }
  },
  "updated": "2026-10-08T03:25:17.738Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# JanusX harness execution adapter and legacy-lane closeout


## Problem

The shared run kernel landed in janus-agentX (dispatch, baselines, leases, receipts, closeout), but JanusX has no execution entry: the C7 `execution-adapter.ts` never existed, so desktop runs cannot prepare, start, or close out tasks against the same C3 baselines the terminal kernel pins. Meanwhile three legacy lanes still fork project graphs: `appendAnalysis`, `applyAnalysisPatch`, `upsertRequirementCandidates`, and `setCursor` load the harness projection and then persist it through the unconditional legacy JSON writer, shadowing note files with divergent analyses, progress, candidates, and cursors.

## Decision

`src/main/harness/execution-adapter.ts` owns the JanusX side of the run lifecycle, Electron-free with roots from callers so unit tests drive real temp checkouts. `prepareTaskRun` pins the baseline through `collectTaskBaseline` and opens a queued run via `dispatchRun`; unaccepted tasks, missing identities, unknown notes, and unauthorized closeouts refuse before any run record exists. `startTaskRun` reloads the run, re-collects the baseline, and starts only when contract and inputs still match, otherwise the kernel reports `STALE_BASELINE` and the run stays queued for explicit rebaseline. `collectLiveSnapshot` rebuilds the finish-time validity snapshot from current files with recomputed per-criterion hashes. Verify, receipt, finish, repair, pause, resume, cancel, takeover, rebaseline, mark, closeout, handoff, get, and list are thin root-first wrappers preserving dispatcher diagnostics.

Lane closeout keeps one writable truth per lane. The four analyzer/candidate/cursor store methods throw `HARNESS_MANAGED` on project graph ids instead of writing shadow JSON. The analyzer detects project graphs once per session and skips all five persistence calls: analysis still runs in memory and Island events still publish, but no candidates are produced and the cursor is not persisted, so the next run rescans within its commit budget. Adopted conclusions enter notes only through the maintenance flow. The team lane needed no change: project metadata is already `HARNESS_READONLY` at the store.

Run surface follow-up: seven `harness:run:*` IPC channels (prepare, start, status, list, cancel, closeout, handoff) map adapter OpResults onto the shared `HarnessFailure` envelope with renderer-safe input validation, and `HarnessRunPanel` mounts in the focus view aside for task nodes carrying `sourceUri` plus a workspace path. Verify, receipt, finish, repair, pause, resume, takeover, and rebaseline stay executor-side until evidence UX lands.

The live snapshot carries the task's acceptance references and declared verification steps into the shared receipt validator. Missing criteria, omitted or downgraded checks, changed commands, and missing file hashes fail completion. A present null code hash proves a deleted file is absent. Snapshot collection refuses a task changed between scans and never resolves a foreign Note URI by local id. `tests/unit/harness-execution-adapter.test.ts` verifies both incomplete-coverage refusal and completion with one matching receipt; the [shared evidence gates](note://62b44166-82f0-41ff-838d-e2b02388ed06/202ee600-5445-40bf-9cff-545de64ae4e8) define the remaining proof rules.

Snapshot collection delegates to `harness-node`, so desktop and CLI resolve the same acceptance references, contract checks and criterion hashes. The adapter exports `prepareTaskExecutionTurn` and `executeTaskVerification` from the shared execution host. Callers supply runtime command and reviewer ports; the desktop panel does not invoke them yet. The [shared task execution Note](note://62b44166-82f0-41ff-838d-e2b02388ed06/c514cc8a-ba91-4102-add4-54f7f8460ee9) defines scope policy, capability failures and receipt construction. Review validity compares the canonical manifest digest, including deletions, with the supplied review hash.

The shared snapshot path is verified by `npx vitest run tests/unit/harness-execution-adapter.test.ts tests/unit/harness-s9-acceptance.test.ts tests/unit/harness-run-handlers.test.ts tests/unit/harness-service.test.ts` with 22 passing checks. Typecheck, adapter lint and the package-boundary check pass.

## Alternatives considered

- Call the dispatcher directly from IPC handlers — strongest case is zero new modules, but every caller would reimplement baseline re-pinning and drift checks, and the first missed check executes a stale contract; the adapter pins once for all callers.
- Persist analyzer output into notes automatically — strongest case is no lost analysis, but raw analysis is run record, not adopted decision; auto-writing it pollutes decision prose and breaks the adopted-only rule the unified design requires.
- Ship IPC channels and renderer UI in the same commit — strongest case is end-to-end usability now, but backend-first then surface follows the S5 precedent and keeps this commit's contract small; IPC plus a run panel is the explicit follow-up.
- Do nothing / reuse — keep execution terminal-only and analyzer forking shadow JSON; rejected because desktop runs stay impossible and every analyzer pass on a project graph silently diverges a second truth.

## Consequences

- **Gains**: 6 adapter checks pass (queued prepare with pinned baseline, F09 refusal set of draft/unknown/identity-less/unauthorized, `STALE_BASELINE` block on moved contracts with the run staying queued, live snapshot matching the pin, verify plus malformed-receipt plus unknown-receipt plus cancel plus handoff wiring, missing-run reads). 3 run-IPC checks pass (checkout-first resolution, prepare mapping with first-diagnostic failures and input validation, start/status/list/cancel/closeout/handoff wiring with lease-token passthrough). Contract suite pins all 15 harness channels and 16 preload methods. 2 lane checks pass (four guards with no shadow files, legacy analyzer writes untouched). 1 analyzer check passes (project graphs skip persistence yet still publish). Typecheck passes; 53 neighboring blueprint, maintenance, team, and harness checks pass; package-boundary check passes; touched sources lint clean; i18n 12 namespaces in sync.
- **Costs and limits**: run surface covers prepare through handoff; verify, receipt, finish, repair, pause, resume, takeover, and rebaseline stay executor-side until evidence UX lands, and the panel has no component test (no tsx harness exists; coverage is handler mapping plus adapter integration). Project-graph analyzer sessions rescan within the commit batch cap on every trigger because cursors do not persist. Cross-checkout runs, task work contracts from roundtables, and the S9 cutover remain downstream. Revisit when the run panel needs start preconditions beyond baseline pinning or when analyzer cursors earn a `.local` home.
