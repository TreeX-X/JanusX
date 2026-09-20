# Agent Note: Own working notes live outside the harness graph

Status: proposed

## Problem

The repository keeps agent working notes under `.agents/notes/` in the
noteX shape with lifecycle and class folders. The harness project scanner
reads the same directory and judges every file against `harness-note/1`, so
all 97 own-notes land in the invalid list. They are not broken project
assets; they belong to a different namespace, and the scanner cannot tell
the two apart today.

## Proposal

Declare two namespaces sharing one directory tree. Harness project assets
carry `schema: harness-note/1` and enter the graph, coverage, execution,
and sharing. Everything else under `.agents/notes/` is a foreign-namespace
working note: the scanner labels it `FOREIGN_NAMESPACE`, excludes it from
the graph and all gates, and never lists it as an invalid project asset.
`INVALID` stays reserved for files that claim the harness schema and fail
it. No working note is moved, rewritten, or deleted by this rule, and no
working note ever enters receipts, baselines, or shares.

## Alternatives considered

- Keep the current noise: zero code, but every project view drowns the 97
  diagnostics and operators stop reading the invalid list that real errors
  need.
- Bulk-migrate working notes into the harness schema: rewrites history to
  silence a label, and most working notes are not requirements, decisions,
  or tasks at all.
- Move working notes to a separate directory: cleanest separation, but
  breaks every relative link, noteX tooling, and the agents' trained paths
  for zero semantic gain.
- Do nothing / reuse: keep treating absence of schema as failure; rejected
  because a label that fires on everything signals nothing.

## Acceptance criteria

- [ ] Files without a harness schema scan as foreign-namespace and stay out
  of the graph, coverage, execution, and share previews.
- [ ] Files claiming `harness-note/1` with schema errors still report
  invalid with file and field diagnostics.
- [ ] No working note is renamed, moved, or rewritten by the scanner change.
- [ ] The blueprint view shows zero diagnostics for a checkout whose only
  notes are well-formed working notes.

## Risks

- A real harness asset missing its schema line hides as foreign instead of
  invalid; creation paths always write the schema, so absence means foreign
  by construction.
- Future namespaces need a registry rather than one hardcoded exception;
  the label carries the detected kind so the next namespace extends it.
