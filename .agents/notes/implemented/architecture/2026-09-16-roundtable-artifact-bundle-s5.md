# Agent Note: Roundtable native artifact bundles

Status: implemented

## Problem

Roundtable discussions end as meeting Markdown with no note identity and no target graph write. Renaming that export into `.agents/notes` forks the prose: one readable record plus one hand-made note, with no source coverage, no stable identities, and no safe retry. Downstream chat unification and task execution both need the same bundle shape, so each host inventing its own proposal format repeats the drift that shared parsing already removed.

## Decision

`src/main/roundtable/artifact-bundle.ts` builds `harness-bundle/1` proposals from selected session facts. The host assigns every identity (bundle, artifact, note, operation); model output never mints ids. Each selected fact maps to exactly one operation — requirement to requirement, solution to decision, action to task draft, everything else to idea draft — so coverage stays explicit and similar wording never merges silently. Exclusions carry a written reason; empty changesets fail validation instead of persisting as applicable-looking bundles.

Invalid proposals return diagnostics only and never reach `.agents/notes`. Clean bundles persist beside the roundtable journal before any apply, binding the source snapshot hash for later retry comparison. `RoundtableService.buildBundle` refuses unknown fact ids without guessing; `applyBundle` re-validates bundle and changeset, then delegates to `HarnessNoteService.applyBundleChangeSet`, which preserves incoming changeset identity so retrying one bundle never duplicates notes. Stale `expectedHash` updates surface `HARNESS_CONFLICT` instead of overwriting. The old `exportMarkdown` path stays the explicit meeting-log export and never becomes a note asset. Relative links: [unified standard](../proposed/architecture/2026-09-16-unified-note-blueprint-harness.md), [implementation contract](../proposed/architecture/2026-09-16-note-harness-implementation-contract.md).

## Alternatives considered

- Define a JanusX-local bundle schema beside harness-core validation — strongest case is freedom to shape coverage fields at will, but two bundle dialects reintroduce the exact cross-host drift this segment removes; `validateBundle` and `validateChangeSet` already cover the envelope.
- Merge similar facts into one note at build time — strongest case is fewer files per meeting, but similarity merges hide provenance and break one-to-one coverage; explicit one-fact-per-operation keeps every source traceable.
- Reuse the canvas artifact producer directly — strongest case is zero new mapping code, but canvas field patches and fact-kind mapping answer different questions; only the fence-aware section setter is shared, the kind mapping is roundtable-owned.
- Do nothing / reuse — keep Markdown export plus manual note writing; rejected because hand-copied notes fork prose and later chat and execution hosts cannot share one proposal verdict.

## Consequences

- **Gains**: 6 new checks pass (kind mapping with full coverage, explicit exclusions, snapshot-bound retries, idempotent create retry, section update with stale-save conflict, bundle snapshot persistence). Typecheck passes; 33 related roundtable and harness checks pass; package-boundary check passes.
- **Costs and limits**: lint reports 1 pre-existing error in `src/main/web-test-gateway/page.ts`, untouched by this change. The Pane result-card rendering is not built — backend plus IPC only — and stays the S5 tail before the segment counts as whole. A revision bump over already-applied creates duplicates; callers must use update mode or a new bundle id, since the producer does not rewrite history. Cross-checkout partial apply is untested in this single-checkout slice. Task notes land as drafts without work contracts; execution fields arrive with the later execution segment.
