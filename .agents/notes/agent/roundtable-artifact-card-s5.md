---
{
  "schema": "harness-note/2",
  "id": "6471d8f2-ee72-5a63-897c-0d8e44110eb6",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-16",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-16-agent-note-roundtable-artifact-card-with-blueprint-refresh--6471d8f2.md",
      "sourceHash": "5ea0296f1581660d013f27dbeea19f67c1907f1f6738289f8bafa29137e563e8",
      "originalBodyHash": "f00da12755a03ef006d4304c8dfb5bace8be0105fccf9bae9354148ff78730e6",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Roundtable artifact card with blueprint refresh. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: 2026-09-16-roundtable-artifact-bundle-s5.md -> ./2026-09-16-roundtable-artifact-bundle-s5--46d65946.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-16-roundtable-artifact-card-s5.md",
        "sourceHash": "95fe171879679323e3c24be87bf0f26df6591a06fba16177da98278ad9dd7200",
        "originalBodyHash": "d794cb854c9af65def921d4a5032c24353dd5713412682a1e5e25238c4cdb442"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Roundtable artifact card with blueprint refresh


## Problem

The bundle producer from the previous segment has no face: building a proposal needs hand-written IPC calls, and applied notes only appear after a manual rescan plus a manual blueprint reload. New notes also land as roots every time, so meeting output never joins the existing graph hierarchy without a second round of canvas edits.

## Decision

`RoundtableArtifactCard` sits in the roundtable dialog whenever session facts exist. It resolves the attached workspace to a harness checkout, lists current graph nodes as mount targets, and lets reviewers check or uncheck each fact before building. Unchecked facts travel as exclusions with a written reason, so coverage records the review decision instead of silently dropping sources. The preview shows per-artifact kinds, excluded entries with reasons, and every diagnostic; apply stays disabled until diagnostics clear. Creates accept an optional mount URI written to frontmatter, and the existing projection derives hierarchy from it with no second write. Apply runs through the bundle IPC, then refreshes the harness index and reloads the open harness blueprint when it targets the same project, so new nodes and relations appear at once. All visible strings live under `janus:roundtable.artifact` in both locales. Relative link: [bundle producer segment](./roundtable-artifact-bundle-s5.md).

## Alternatives considered

- Mount new notes with a follow-up canvas drag after apply — strongest case is zero producer change, but every meeting then needs a second manual pass and the mount decision leaves no record; writing the mount URI at build time keeps one write and one review.
- Auto-mount everything under the discussion topic node — strongest case is zero reviewer clicks, but roundtables often range across unrelated conclusions and forced grouping invents hierarchy; an explicit mount picker with a top-level default keeps the reviewer in charge.
- Refresh the canvas through the file watcher alone — strongest case is no card-to-blueprint coupling, but watcher delivery lags behind the apply return and the open blueprint holds stale bytes; an explicit rescan plus conditional reload lands the user on current data.
- Do nothing / reuse — keep Markdown export plus manual note writing; rejected because hand-copied notes fork prose and the producer stays unreachable from the dialog.

## Consequences

- **Gains**: typecheck, i18n check, and package-boundary checks pass; 8 bundle checks plus 13 neighboring roundtable and harness checks pass; the new card introduces no new lint warnings. Review, build, preview, apply, and graph refresh complete inside one dialog.
- **Costs and limits**: the mount picker reads the graph once per checkout selection and does not live-update while open; reopening or rebuilding re-reads it. Update-mode operations and cross-checkout partial apply stay backend-only with no card controls yet; the card builds creates. Task notes still land as drafts without work contracts until the execution segment arrives.
