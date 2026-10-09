---
{
  "schema": "harness-note/2",
  "id": "bfb406a2-8cd3-5384-ba90-18accf90ca0d",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-19",
  "class": "process",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-19-agent-note-ci-builds-sibling-workspaces-in-dependency-order--bfb406a2.md",
      "sourceHash": "c94ef90fd1d1aa4ad40395d46f92f656a952daa1cff2dac4f738ea3a7d7c8772",
      "originalBodyHash": "e41b575d11ba608d3530e88f8327061553302f43a7d48c5007db0141f52a913e",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents CI builds sibling workspaces in dependency order. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/process/2026-09-19-ci-sibling-build-order.md",
        "sourceHash": "c94ef90fd1d1aa4ad40395d46f92f656a952daa1cff2dac4f738ea3a7d7c8772",
        "originalBodyHash": "e41b575d11ba608d3530e88f8327061553302f43a7d48c5007db0141f52a913e"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e"
}
---
# CI builds sibling workspaces in dependency order


## Problem

The verify workflow failed on fresh clones inside the sibling build step: the `cli` package compiled in the same batch as its dependency `notes-cli`, whose `dist` types did not exist yet, so `tsc` reported missing module declarations plus knock-on implicit-any errors. Local checkouts never saw it because a previous build had already materialized `dist`. The old comment in the workflow even admitted single-pass builds fail, but the last line still batched `cli` with `notes-cli`.

## Decision

Both workflows (`verify.yml` and `release-win.yml`) now build the sibling in strict dependency layers: core packages first, then chat-core, node-hosts, harness-node, and notes-cli, then janus-agent, then `cli` alone last. A comment on the ordering rule names the exact hazard (a consumer must never share a batch with its own dependency on a fresh tree). The fix was proven by wiping local `cli` and `notes-cli` output and rebuilding in the new order with zero type errors.

## Alternatives considered

- Retry passes until green: strongest case is no file change, but the failure is structural on empty output directories, so retries only pass when a previous attempt already materialized `dist`; flaky by design.
- One combined workspace build: simplest invocation, but workspace scheduling ignores `file:` topology and compiles the consumer before its dependency; this is the exact failure being removed.
- Do nothing / reuse — leave the order and let contributors rebuild locally first: keeps the files untouched, but every pull request stays red on runners while passing on developer machines, which trains everyone to ignore the gate.

## Consequences

- **Gains**: fresh-clone sibling builds pass in one go in both workflows; the rule is written where the next editor will see it. Verification: local wipe-and-rebuild of `cli` plus `notes-cli` output in the new order, zero type errors.
- **Costs and limits**: the order is hand-maintained; adding a workspace with new `file:` edges means placing it in the right layer by hand. Revisit if the sibling adopts topological workspace builds, at which point these explicit layers collapse back into fewer commands.
