---
{
  "schema": "harness-note/2",
  "id": "2c0f6364-2d0f-53af-9b70-966f8a57ec97",
  "kind": "decision",
  "lifecycle": "archived",
  "disposition": {"reason":"One-shot batch complete; remaining migration owned by R5; retained frozen as history."},
  "created": "2026-09-19",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-19-agent-note-proposed-notes-enter-the-blueprint-graph-as-drafts--2c0f6364.md",
      "sourceHash": "6a350d7a2c9b6715fda53ba168f3f19cc85908a95cc9c88c596cfb7b46cb5ca6",
      "originalBodyHash": "8f7bbfebd4d6e5f8435ef50b7b0704acd92d4a784ac8de55a18cd80993d88edc",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Proposed notes enter the blueprint graph as drafts. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-19-proposed-notes-harness-migration.md",
        "sourceHash": "6a350d7a2c9b6715fda53ba168f3f19cc85908a95cc9c88c596cfb7b46cb5ca6",
        "originalBodyHash": "8f7bbfebd4d6e5f8435ef50b7b0704acd92d4a784ac8de55a18cd80993d88edc"
      }
    }
  },
  "updated": "2026-10-08T09:06:56.496Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bd612cd8-0676-4c46-98ba-81d1dc008505"
}
---
# Proposed notes enter the blueprint graph as drafts


## Problem

Twenty-four proposal notes sit outside the blueprint graph in the old note shape: twelve feature proposals, nine architecture directions, two research surveys, and one process boundary, plus three unification designs and two already-landed twins. The graph cannot show, filter, or edit what it cannot parse, so upcoming features stay invisible in the very view built to organize them. Bulk-converting everything would also drag landed history, superseded directions, and raw research into the active graph with fabricated acceptance.

## Proposal

Convert the thirteen current proposals into `requirement` drafts in place: same paths so relative links keep working, new UUID identities, first-proposed dates kept, folder-mapped classes, and the `Status:` line removed because the frontmatter lifecycle supersedes it. Keep body prose byte-identical and claim no acceptance. Exclude with recorded reasons: unification designs stay `proposed` until the S9 cutover, landed twins keep their implemented records, surveys stay working notes, stale/landed ToB and CLI notes stay out, and no relations ship (the graph starts flat; wiring happens in the editor).

## Decision

Thirteen current proposals become `requirement` drafts in place: same paths so relative links keep working, new UUID identities, first-proposed dates kept, folder-mapped classes, and the `Status:` line removed because the frontmatter lifecycle supersedes it. Body prose stays byte-identical; draft needs only a non-empty `Problem`, so no acceptance is invented and none is claimed. All thirteen validate clean under the shared parser. Excluded with reasons: the three unification designs stay `proposed` until the S9 cutover passes, the two landed twins already have implemented records, the two surveys stay working notes because research is not a requirement, the two ToB notes and the CLI scope note stay out as stale or landed. No relations ship with the batch: semantic edges are never derived from prose, so the graph starts flat and wiring happens in the blueprint editor. Git history is the archive; nothing was deleted or moved.

## Alternatives considered

- Migrate all 111 notes including implemented history: one clean sweep, but landed work re-enters the forward-looking graph as unverified nodes and surveys masquerade as requirements; history stays foreign-namespace by settled decision.
- Write full proposed lifecycles instead of drafts: stronger graph status, but harness `proposed` demands Expected behavior and Scope sections these files never wrote; inventing them fabricates the standard.
- Move files into lifecycle-free note directories: matches the future layout, but breaks every relative link the graph and agents already use; paths stay until a cutover renames them with link repair.
- Derive `governed-by` and `depends-on` edges from prose links: richest first graph, but reading links are not semantic edges and the contract forbids inferring them; explicit wiring only.
- Do nothing / reuse — leave proposals outside the graph; rejected because the user confirmed this batch for review and upcoming features belong in the organizing view.

## Risks

- Drafts carry no acceptance and no relations, so progress and dependency views show unstarted nodes until proposals mature and someone wires them by hand.
- Promotion to `proposed` requires the harness sections written by hand per note; a bulk pass would fabricate the standard.
- Staying flat at import means the graph understates real dependencies until editors wire them; reviewers must not mistake flat for independent.

## Consequences

- **Gains**: thirteen upcoming features and directions render as graph nodes with stable identities, filterable by class and draft lifecycle, editable from the blueprint. Verification: all thirteen pass `parseNote` plus `validateNote` with zero diagnostics through the same shared implementation the scanner uses; the invalid list stays empty.
- **Costs and limits**: drafts carry no acceptance and no relations, so progress and dependency views show unstarted nodes until proposals mature and someone wires them. Promotion to `proposed` needs the harness sections written by hand per note. Revisit at the S9 cutover, when live constraints migrate the same way and the remaining foreign notes get their final review.
