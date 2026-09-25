---
schema: harness-note/1
id: 5559a0b8-d437-5e79-8bb5-c593bf30e8fc
kind: decision
lifecycle: implemented
created: 2026-09-18
class: architecture
---
# Agent Note: Own working notes live outside the harness graph

Status: implemented

## Problem

The repository keeps agent working notes under `.agents/notes/` beside harness project assets. The project scanner judges every file against `harness-note/1`, so the working notes land in the invalid list. Operators stop reading an invalid list that fires on everything, and the real schema errors lose their signal. The working notes hold local thinking worth keeping, and rewriting them into harness shape destroys that history.

The proposal lives in [own working notes proposal](../../proposed/architecture/2026-09-18-own-notes-namespace.md). The surrounding graph lane is described in [harness project graph lane](2026-09-16-harness-project-graph-s4.md), and the remaining cutover ledger is tracked in [Harness S9 readiness](2026-09-18-harness-s9-readiness.md).

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
