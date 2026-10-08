---
{
  "schema": "harness-note/2",
  "id": "46d65946-125b-56d0-b23e-05552f5b281e",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-16",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-16-agent-note-roundtable-native-artifact-bundles--46d65946.md",
      "sourceHash": "4403b4d541de5b3fdb3600cd0b2b60348fda1b068d0713f3f68d265fec135a3c",
      "originalBodyHash": "c7765fe8740ff341bd37ec9a6a5d111276b6fabff9aa373ca202e9802d9449df",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Roundtable native artifact bundles. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: 2026-09-16-roundtable-artifact-card-s5.md -> ./2026-09-16-roundtable-artifact-card-s5--6471d8f2.md",
        "Rebased Markdown destination: ../../proposed/architecture/2026-09-16-note-harness-implementation-contract.md -> ./2026-09-16-note-harness-implementation-contract--537de6bf.md",
        "Rebased Markdown destination: ../../proposed/architecture/2026-09-16-unified-note-blueprint-harness.md -> ./2026-09-16-unified-note-blueprint-harness--1b210a76.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-16-roundtable-artifact-bundle-s5.md",
        "sourceHash": "e215d515810a1aa6048f5ad57dd4e298c44da480a51412ee1cf10dab53027515",
        "originalBodyHash": "b10060c4c62309892ccea79443cd3d12b5c723f1e30ee29c7e0ff8f18dbb7b7c"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Roundtable native artifact bundles


## Problem

Roundtable discussions end as meeting Markdown with no note identity and no target graph write. Renaming that export into `.agents/notes` forks the prose: one readable record plus one hand-made note, with no source coverage, no stable identities, and no safe retry. Downstream chat unification and task execution both need the same bundle shape, so each host inventing its own proposal format repeats the drift that shared parsing already removed.

## Decision

`src/main/roundtable/artifact-bundle.ts` builds `harness-bundle/1` proposals from selected session facts. The host assigns every identity (bundle, artifact, note, operation); model output never mints ids. Each selected fact maps to exactly one operation — requirement to requirement, solution to decision, action to task draft, everything else to idea draft — so coverage stays explicit and similar wording never merges silently. Exclusions carry a written reason; empty changesets fail validation instead of persisting as applicable-looking bundles.

Invalid proposals return diagnostics only and never reach `.agents/notes`. Clean bundles persist beside the roundtable journal before any apply, binding the source snapshot hash for later retry comparison. `RoundtableService.buildBundle` refuses unknown fact ids without guessing; `applyBundle` re-validates bundle and changeset, then delegates to `HarnessNoteService.applyBundleChangeSet`, which preserves incoming changeset identity so retrying one bundle never duplicates notes. Rebuilding under already-used bundle ids is guarded by `resolveBundleRetry` (`src/main/roundtable/artifact-bundle.ts`): an identical snapshot hands back the persisted bundle so retries keep operation identities, while moved or unreadable sources return `STALE_BASELINE` and demand a new revision instead of overwriting history. Stale `expectedHash` updates surface `HARNESS_CONFLICT` instead of overwriting. The old `exportMarkdown` path stays the explicit meeting-log export and never becomes a note asset. Relative links: [unified standard](../blueprint/unified-note-blueprint-harness.md), [implementation contract](../blueprint/note-harness-implementation-contract.md).

## Alternatives considered

- Define a JanusX-local bundle schema beside harness-core validation — strongest case is freedom to shape coverage fields at will, but two bundle dialects reintroduce the exact cross-host drift this segment removes; `validateBundle` and `validateChangeSet` already cover the envelope.
- Merge similar facts into one note at build time — strongest case is fewer files per meeting, but similarity merges hide provenance and break one-to-one coverage; explicit one-fact-per-operation keeps every source traceable.
- Reuse the canvas artifact producer directly — strongest case is zero new mapping code, but canvas field patches and fact-kind mapping answer different questions; only the fence-aware section setter is shared, the kind mapping is roundtable-owned.
- Do nothing / reuse — keep Markdown export plus manual note writing; rejected because hand-copied notes fork prose and later chat and execution hosts cannot share one proposal verdict.

## Consequences

- **Gains**: 6 new checks pass (kind mapping with full coverage, explicit exclusions, snapshot-bound retries, idempotent create retry, section update with stale-save conflict, bundle snapshot persistence). Retry-guard follow-up adds `resolveBundleRetry` verdicts plus a store round-trip check (same ids with identical snapshot reuse the saved bundle; moved sources get `STALE_BASELINE` and keep history intact). Typecheck passes; 33 related roundtable and harness checks pass; package-boundary check passes.
- **Costs and limits**: lint reports 1 pre-existing error in `src/main/web-test-gateway/page.ts`, untouched by this change. The dialog result card, mount-URI creates, and post-apply graph refresh land in the follow-up [artifact card note](./roundtable-artifact-card-s5.md). Callers rebuild with a new bundle id or revision for changed sources; the guard refuses in-place revision reuse on moved snapshots. Cross-checkout partial apply is untested in this single-checkout slice. Task notes land as drafts without work contracts; execution fields arrive with the later execution segment. `RoundtableService.buildBundle` wiring itself is covered by inspection, not execution: the service module pulls Electron/LLM singletons that unit tests cannot load, so the verdict table and store round-trip carry the automated proof.
