---
{
  "schema": "harness-note/2",
  "id": "0f2f5228-525d-5aec-86ec-e963e8cdd99a",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-17",
  "class": "process",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-17-agent-note-janusx-repo-identity-for-the-harness--0f2f5228.md",
      "sourceHash": "d998fb37211865cf63532c1bced3d12da3913289eddd1d896455a678adb4d4c3",
      "originalBodyHash": "1d084c46646b30323d7a69a879de6add80e40d0d56dfc94ae62051ff49f5406a",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents JanusX repo identity for the harness. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ../architecture/2026-09-18-own-notes-namespace.md -> ./2026-09-18-own-notes-namespace--5559a0b8.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/process/2026-09-17-harness-repo-identity-s7.md",
        "sourceHash": "1a28f9091d208801fa25f57030a4accc705431eeb91c07dfaff86a25c6d93046",
        "originalBodyHash": "864f73d1f09651ffea94cfe487ee85c62ce7864a9b096a00c347c6286e59d00b"
      }
    }
  },
  "updated": "2026-10-08T03:43:42.536Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd"
}
---
# JanusX repo identity for the harness


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
`1.0.0-s1.1` with the manifest digest (SHA-256 over LF-normalized
`standards/harness-note/1/manifest.json` bytes, verified against the
standard release). The repo id is a fresh
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
  new-format notes. The shared receipt-content hash matches the standard
  `receipt-content-hash` fixture digit for digit, so the s1.1 execution
  persistence rules need no code change on this side. Verification:
  read-only rescan over the repo root reports
  `repoId=972afef3-2fc7-49de-a3ee-7e041225d28c`; `npm run typecheck`
  passes; the harness-service suite with temp checkouts stays green.
- **Costs and limits**: old working notes scan as foreign-namespace and
  stay out of the invalid list since
  [own-notes-namespace](./history/own-notes-namespace.md);
  no bulk migration follows. The profile digest must be re-pinned
  whenever the standard changes. The shared identity reader requires the exact
  profile id, version and digest before managed writes and execution;
  mismatches remain visible in the desktop diagnostic list while file
  browsing stays available. Revisit when dependency
  identities publish or the cutover appends this checkout to the sync list.
