# Agent Note: Proposed notes enter the blueprint graph as drafts

Status: implemented

## Problem

Twenty-four proposal notes sit outside the blueprint graph in the old note shape: twelve feature proposals, nine architecture directions, two research surveys, and one process boundary, plus three unification designs and two already-landed twins. The graph cannot show, filter, or edit what it cannot parse, so upcoming features stay invisible in the very view built to organize them. Bulk-converting everything would also drag landed history, superseded directions, and raw research into the active graph with fabricated acceptance.

## Decision

Thirteen current proposals become `requirement` drafts in place: same paths so relative links keep working, new UUID identities, first-proposed dates kept, folder-mapped classes, and the `Status:` line removed because the frontmatter lifecycle supersedes it. Body prose stays byte-identical; draft needs only a non-empty `Problem`, so no acceptance is invented and none is claimed. All thirteen validate clean under the shared parser. Excluded with reasons: the three unification designs stay `proposed` until the S9 cutover passes, the two landed twins already have implemented records, the two surveys stay working notes because research is not a requirement, the two ToB notes and the CLI scope note stay out as stale or landed. No relations ship with the batch: semantic edges are never derived from prose, so the graph starts flat and wiring happens in the blueprint editor. Git history is the archive; nothing was deleted or moved.

## Alternatives considered

- Migrate all 111 notes including implemented history: one clean sweep, but landed work re-enters the forward-looking graph as unverified nodes and surveys masquerade as requirements; history stays foreign-namespace by settled decision.
- Write full proposed lifecycles instead of drafts: stronger graph status, but harness `proposed` demands Expected behavior and Scope sections these files never wrote; inventing them fabricates the standard.
- Move files into lifecycle-free note directories: matches the future layout, but breaks every relative link the graph and agents already use; paths stay until a cutover renames them with link repair.
- Derive `governed-by` and `depends-on` edges from prose links: richest first graph, but reading links are not semantic edges and the contract forbids inferring them; explicit wiring only.
- Do nothing / reuse — leave proposals outside the graph; rejected because the user confirmed this batch for review and upcoming features belong in the organizing view.

## Consequences

- **Gains**: thirteen upcoming features and directions render as graph nodes with stable identities, filterable by class and draft lifecycle, editable from the blueprint. Verification: all thirteen pass `parseNote` plus `validateNote` with zero diagnostics through the same shared implementation the scanner uses; the invalid list stays empty.
- **Costs and limits**: drafts carry no acceptance and no relations, so progress and dependency views show unstarted nodes until proposals mature and someone wires them. Promotion to `proposed` needs the harness sections written by hand per note. Revisit at the S9 cutover, when live constraints migrate the same way and the remaining foreign notes get their final review.
