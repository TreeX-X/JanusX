# Agent Note: Roundtable artifact card with blueprint refresh

Status: implemented

## Problem

The bundle producer from the previous segment has no face: building a proposal needs hand-written IPC calls, and applied notes only appear after a manual rescan plus a manual blueprint reload. New notes also land as roots every time, so meeting output never joins the existing graph hierarchy without a second round of canvas edits.

## Decision

`RoundtableArtifactCard` sits in the roundtable dialog whenever session facts exist. It resolves the attached workspace to a harness checkout, lists current graph nodes as mount targets, and lets reviewers check or uncheck each fact before building. Unchecked facts travel as exclusions with a written reason, so coverage records the review decision instead of silently dropping sources. The preview shows per-artifact kinds, excluded entries with reasons, and every diagnostic; apply stays disabled until diagnostics clear. Creates accept an optional mount URI written to frontmatter, and the existing projection derives hierarchy from it with no second write. Apply runs through the bundle IPC, then refreshes the harness index and reloads the open harness blueprint when it targets the same project, so new nodes and relations appear at once. All visible strings live under `janus:roundtable.artifact` in both locales. Relative link: [bundle producer segment](2026-09-16-roundtable-artifact-bundle-s5.md).

## Alternatives considered

- Mount new notes with a follow-up canvas drag after apply — strongest case is zero producer change, but every meeting then needs a second manual pass and the mount decision leaves no record; writing the mount URI at build time keeps one write and one review.
- Auto-mount everything under the discussion topic node — strongest case is zero reviewer clicks, but roundtables often range across unrelated conclusions and forced grouping invents hierarchy; an explicit mount picker with a top-level default keeps the reviewer in charge.
- Refresh the canvas through the file watcher alone — strongest case is no card-to-blueprint coupling, but watcher delivery lags behind the apply return and the open blueprint holds stale bytes; an explicit rescan plus conditional reload lands the user on current data.
- Do nothing / reuse — keep Markdown export plus manual note writing; rejected because hand-copied notes fork prose and the producer stays unreachable from the dialog.

## Consequences

- **Gains**: typecheck, i18n check, and package-boundary checks pass; 8 bundle checks plus 13 neighboring roundtable and harness checks pass; the new card introduces no new lint warnings. Review, build, preview, apply, and graph refresh complete inside one dialog.
- **Costs and limits**: the mount picker reads the graph once per checkout selection and does not live-update while open; reopening or rebuilding re-reads it. Update-mode operations and cross-checkout partial apply stay backend-only with no card controls yet; the card builds creates. Task notes still land as drafts without work contracts until the execution segment arrives.
