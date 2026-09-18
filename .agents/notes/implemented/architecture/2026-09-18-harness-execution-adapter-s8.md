# Agent Note: JanusX harness execution adapter and legacy-lane closeout

Status: implemented

## Problem

The shared run kernel landed in janus-agentX (dispatch, baselines, leases, receipts, closeout), but JanusX has no execution entry: the C7 `execution-adapter.ts` never existed, so desktop runs cannot prepare, start, or close out tasks against the same C3 baselines the terminal kernel pins. Meanwhile three legacy lanes still fork project graphs: `appendAnalysis`, `applyAnalysisPatch`, `upsertRequirementCandidates`, and `setCursor` load the harness projection and then persist it through the unconditional legacy JSON writer, shadowing note files with divergent analyses, progress, candidates, and cursors.

## Decision

`src/main/harness/execution-adapter.ts` owns the JanusX side of the run lifecycle, Electron-free with roots from callers so unit tests drive real temp checkouts. `prepareTaskRun` pins the baseline through `collectTaskBaseline` and opens a queued run via `dispatchRun`; unaccepted tasks, missing identities, unknown notes, and unauthorized closeouts refuse before any run record exists. `startTaskRun` reloads the run, re-collects the baseline, and starts only when contract and inputs still match, otherwise the kernel reports `STALE_BASELINE` and the run stays queued for explicit rebaseline. `collectLiveSnapshot` rebuilds the finish-time validity snapshot from current files with recomputed per-criterion hashes. Verify, receipt, finish, repair, pause, resume, cancel, takeover, rebaseline, mark, closeout, handoff, get, and list are thin root-first wrappers preserving dispatcher diagnostics.

Lane closeout keeps one writable truth per lane. The four analyzer/candidate/cursor store methods throw `HARNESS_MANAGED` on project graph ids instead of writing shadow JSON. The analyzer detects project graphs once per session and skips all five persistence calls: analysis still runs in memory and Island events still publish, but no candidates are produced and the cursor is not persisted, so the next run rescans within its commit budget. Adopted conclusions enter notes only through the maintenance flow. The team lane needed no change: project metadata is already `HARNESS_READONLY` at the store.

## Alternatives considered

- Call the dispatcher directly from IPC handlers — strongest case is zero new modules, but every caller would reimplement baseline re-pinning and drift checks, and the first missed check executes a stale contract; the adapter pins once for all callers.
- Persist analyzer output into notes automatically — strongest case is no lost analysis, but raw analysis is run record, not adopted decision; auto-writing it pollutes decision prose and breaks the adopted-only rule the unified design requires.
- Ship IPC channels and renderer UI in the same commit — strongest case is end-to-end usability now, but backend-first then surface follows the S5 precedent and keeps this commit's contract small; IPC plus a run panel is the explicit follow-up.
- Do nothing / reuse — keep execution terminal-only and analyzer forking shadow JSON; rejected because desktop runs stay impossible and every analyzer pass on a project graph silently diverges a second truth.

## Consequences

- **Gains**: 6 adapter checks pass (queued prepare with pinned baseline, F09 refusal set of draft/unknown/identity-less/unauthorized, `STALE_BASELINE` block on moved contracts with the run staying queued, live snapshot matching the pin, verify plus malformed-receipt plus unknown-receipt plus cancel plus handoff wiring, missing-run reads). 2 lane checks pass (four guards with no shadow files, legacy analyzer writes untouched). 1 analyzer check passes (project graphs skip persistence yet still publish). Typecheck passes; 53 neighboring blueprint, maintenance, team, and harness checks pass; package-boundary check passes; touched sources lint clean.
- **Costs and limits**: no IPC channels or renderer surface yet; external and model-driven callers arrive with the follow-up run panel. Project-graph analyzer sessions rescan within the commit batch cap on every trigger because cursors do not persist. Cross-checkout runs, task work contracts from roundtables, and the S9 cutover remain downstream. Revisit when the run panel needs start preconditions beyond baseline pinning or when analyzer cursors earn a `.local` home.
