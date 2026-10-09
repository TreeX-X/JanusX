---
{
  "schema": "harness-note/2",
  "id": "5559a0b8-d437-5e79-8bb5-c593bf30e8fc",
  "kind": "decision",
  "lifecycle": "archived",
  "created": "2026-09-18",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-own-working-notes-live-outside-the-harness-graph--5559a0b8.md",
      "sourceHash": "eccdfda642726d69521b795d9e54573e0da4902befb7cce67b31ec09c7c440a7",
      "originalBodyHash": "66cec5e775a3c6381143eb2557f6bfd5600b8b8bfdc61e3a6c4c7da427a8b3e3",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Own working notes live outside the harness graph. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: 2026-09-18-harness-s9-readiness.md -> ./2026-09-18-harness-s9-readiness--28ce4fe4.md",
        "Rebased Markdown destination: 2026-09-16-harness-project-graph-s4.md -> ./2026-09-16-harness-project-graph-s4--bcadcdc9.md",
        "Rebased Markdown destination: ../../proposed/architecture/2026-09-18-own-notes-namespace.md -> ./2026-09-18-own-notes-namespace--134ce6f7.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-18-own-notes-namespace.md",
        "sourceHash": "cc3eec764fdcd6b394382d17749132c74015d4e8424a31a55c1a2720a7e96c13",
        "originalBodyHash": "488d14ed9ea73246858e6529c4cde1d65f5d3f6386255c3dbeb74c1b1837b0a4"
      }
    }
  },
  "updated": "2026-10-08T09:06:56.496Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bd612cd8-0676-4c46-98ba-81d1dc008505",
  "disposition": {
    "reason": "Historical namespace policy; repository Notes are maintained v2 documents. Foreign-source diagnostics remain available for actual foreign files."
  }
}
---
# Own working notes live outside the harness graph


## Problem

The repository keeps agent working notes under `.agents/notes/` beside harness project assets. The project scanner judges every file against `harness-note/1`, so the working notes land in the invalid list. Operators stop reading an invalid list that fires on everything, and the real schema errors lose their signal. The working notes hold local thinking worth keeping, and rewriting them into harness shape destroys that history.

The proposal lives in [own working notes proposal](./own-notes-namespace-proposal.md). The surrounding graph lane is described in [harness project graph lane](./harness-project-graph-s4.md), and the remaining cutover ledger is tracked in [Harness S9 readiness](../../../agent/harness-s9-readiness.md).

## Decision

`harness-node` owns the shared namespace detector and exposes `foreign` index entries. `HarnessNoteService` and the CLI consume the same classification. Files claiming any `harness-note/` schema version enter validation; supported valid Notes enter the graph, while unknown versions and malformed claimed documents remain diagnostics. Files without a Harness schema remain foreign: their paths and hashes are readable, but they stay outside graph, coverage, execution and share projections. BOM, CRLF and quoted schema keys or values are tolerated. No historical Note is moved or rewritten.

Repository profile diagnostics also appear in the project invalid list, while compatible Note content stays browsable. Managed writes require the shared exact profile pin; the desktop share importer checks it before writing evidence.

## Alternatives considered

- Keep the current noise: zero code and zero migration risk, but every project view drowns the diagnostics and operators stop reading the invalid list that real errors need.
- Bulk-migrate working notes into the harness schema: silences the label in one pass, but rewrites history and forces ideas and local thinking into requirement, decision, or task shapes they never held.
- Move working notes to a separate directory: gives the cleanest separation on disk, but breaks every relative link, note tooling, and trained lookup path for zero semantic gain.
- Do nothing / reuse — keep treating absence of schema as failure: preserves the current scanner contract, but a label that fires on everything signals nothing and blocks the zero-diagnostic view the blueprint needs.

## Consequences

- **Gains**: a checkout holding only well-formed working notes shows zero invalid diagnostics while keeping its graph empty. Files claiming `harness-note/1` with schema errors still report file and field diagnostics. Four new checks in `tests/unit/harness-service.test.ts` pin the claim detector, the zero-diagnostic view, the broken-harness refusal, and the mixed valid plus foreign plus broken separation with share exclusion. Typecheck passes; the neighboring `harness-s9-acceptance`, `harness-run-handlers`, and `harness-ipc-contract` suites stay green.
- **Costs and limits**: a real harness asset missing its schema line hides as foreign instead of invalid; creation paths always write the schema, so absence means foreign by construction. The shared index classifies each file on its initial read; the desktop consumes the foreign marker without rereading it. No separate foreign list is exposed over `IPC` yet; a future namespace registry extends the label carried by the detector.
