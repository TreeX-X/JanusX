# Agent Note: JanusX repo identity for the harness

Status: implemented

## Problem

JanusX notes have no stable repository identity: without
`.agents/harness.json` the note index reports a null repo id, no
`note://` URI can be minted for this checkout, and cross-repo references
stay unresolvable. Project graph ids then fall back to an 8-character
root prefix that can collide across checkouts. Adopter rule sync waits
for the S9 cutover, but identity is the per-repo prerequisite that must
land first.

## Decision

`.agents/harness.json` carries `schemaVersion: 1`, a stable repo id,
the name JanusX, and a profile pinning the `workflowx` standard
`1.0.0-s1` with the manifest digest (SHA-256 over LF-normalized
`standards/harness-note/1/manifest.json` bytes). The repo id is a fresh
UUID: ordinary clones keep it, renames and moves never change it, and a
fork that joins the same blueprint graph mints a new one while recording
its source. Dependency repositories stay omitted because no dependency
has published an identity yet. The sync repo list is untouched: S7 scope
is the owning repo only and adopters join at cutover. The ten forbidden
legacy template paths stay in place deliberately: the running
xdel/xflow rules still require them and skills switch only at S9.

## Alternatives considered

- Derive the identity from the checkout path — strongest case is zero new
  files, but moves, renames, and case-only平台差异 change the id and fork
  every existing reference; a stored UUID survives all three.
- Reuse the WorkFlowX repo identity — strongest case is one id to manage,
  but distinct repositories need distinct URI spaces or their notes merge
  into one addressable graph by accident.
- Delete or convert the legacy notes now — strongest case is a clean
  index, but bulk deletion is destructive and old-asset handling belongs
  to the S9 compatibility design, not to identity setup.
- Switch the running skills to the new standard now — strongest case is
  finishing early, but it breaks the xdel/xflow flows in flight; the
  standard manifest itself marks the bundle a candidate until S9.
- Do nothing / reuse — leave the checkout identity-less; rejected because
  every cross-repo reference then stays an unresolvable string.

## Consequences

- **Gains**: the checkout resolves an identity and mints URIs for
  new-format notes. Verification: read-only rescan over the repo root
  reports `repoId=972afef3-2fc7-49de-a3ee-7e041225d28c` with 73 scanned
  entries via `buildNoteIndex`; `npm run typecheck` passes; the
  harness-service suite with temp checkouts stays green.
- **Costs and limits**: all 73 existing notes report `SCHEMA_INVALID`
  under the new schema because they use the old note format; the graph
  projection shows them as invalid until the S9 migration, which is
  expected and not data loss. The profile digest must be re-pinned
  whenever the standard revs; a stale digest fails closed at readers that
  check it. Revisit when dependency identities publish or the cutover
  appends this checkout to the sync list.
