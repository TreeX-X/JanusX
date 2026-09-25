---
schema: harness-note/1
id: e968d1ae-593c-4a7e-b2a0-aba9fcb12f82
kind: decision
lifecycle: implemented
created: 2026-09-22
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/3e9ec8d6-9ccc-44ee-ba3f-c1b577d88b7b
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e782007f-d07b-4f60-be32-63d1b22ec1f8
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/18fffeff-4922-423d-9f15-0e27f69048d2
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7
extensions:
  r5Migration:
    sourceHash: a12ae1c493684dcda245733b5873d3af12e9d519117bf7370111dd329f8e574d
    repairs:
      - relations[0].reason
      - relations[1].reason
      - relations[2].reason
      - relations[3].reason
    originalRelations:
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/3e9ec8d6-9ccc-44ee-ba3f-c1b577d88b7b
        reason: Orca-aligned three-layer requirement lands here as its first renderer
          slice
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e782007f-d07b-4f60-be32-63d1b22ec1f8
        reason: Unified inline timeline plus modal diff is the dock layout this slice
          retires
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/18fffeff-4922-423d-9f15-0e27f69048d2
        reason: Pull-mode transcript backfill supplies the external rows this slice
          presents read-only
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7
        reason: Turn-owned prompt plus excerpt fields seed the preview and window prose
---

# Agent Note: Windowed session reading with orca-aligned preview layers

## Problem

`src/renderer/src/components/SessionPanel.tsx` renders every turn with its bound checkpoint strip, file list, review box, and success banner inside the narrow right dock, so a long session pushes the card list off screen and forces timeline-versus-diff scroll fights. Full transcript prose stays unreachable from the panel even though the transcript path persists on every record. External rows share the same checkpoint chrome as internal rows, which implies restorable state where none exists.

## Decision

The card header owns two cheap layers and nothing else. L1 shows the orca-style single title row: engine icon, truncated first prompt, and expand chevron, with the external marker beside the icon where applicable. L2 expands inline with engine, status, turn and checkpoint counts, recency, the full first prompt plus Copy, session metadata with the read-only transcript reference, and the two most recent turns as clamped question-plus-excerpt pairs with kind badges. One 查看详情 action leaves the dock and opens `SessionDetailWindow`.

`SessionDetailWindow` centers over the workbench under the shared traffic-bar title, carries session metadata plus Copy chips for the first prompt, log path, and session id, and scrolls the full turn list with per-turn prompts, excerpts, kind badges, and timestamps. Each internal turn renders its one-line checkpoint strip with the file list collapsed behind a click; 查看 diff mounts `DiffSidePanel` as a right-side pane inside the same dialog while the dialog widens rightward, with the file list capped and both panes scrolling independently. Restore keeps the two-step review with prune warning, confirm, success, and conflict disclosure scoped to the owning session, and restores launched from the side panel open the review on the owning strip. External and archived rows render a banner and no checkpoint chrome in any layer; external rows expose a Copy resume command button assembled from the provider session id for claude and codex engines, with a stated reason where the engine has no known resume shape. The panel header gains a text filter over title, engine, directory, and branch. Sixteen locale keys ship in both languages with regenerated types.

## Alternatives considered

- Keep the v5 unified inline timeline and add paging — strongest case is zero new surfaces while long sessions shrink page by page. The driver that rules it out is geometry: every page still competes with the dock column for scroll, and full reading never gains a comfortable width.
- Render the detail view as a second right-dock column instead of a window — strongest case is no overlay plumbing with dock state reuse. The driver that rules it out is the reported symptom: two narrow columns side by side preserve the readability problem the window removes.
- Open diff in a separate Electron window stacked above the detail window — strongest case is a true editor-grade surface isolated from conversation scroll. The driver that rules it out is plumbing plus focus cost: a second window needs registration, navigation, and focus handling, while the side panel keeps one reading context with per-file focus.
- Bind checkpoints to external sessions through on-open snapshots — strongest case is uniform restore chrome across all rows. The driver that rules it out is ownership: snapshots of a foreign working directory invent state the provider never asked for and risk washing user files outside JanusX task scope.
- Do nothing / reuse the v5 dock timeline — no churn. The cost is persistent dock铺开 on long sessions, unreachable full prose, and checkpoint chrome implying restore on external rows.

## Consequences

- **Gains**: dock cards stay concise with preview-only expands; full reading, scoped checkpoints, and file-heavy diffs share one centered window with independent scroll regions; external rows read honestly as transcript-only with a working resume-command copy path.
- **Costs and limits**: full prose still resolves from cached turn excerpts, so sessions whose transcript holds more than the excerpt cap show excerpts until the bounded transcript-detail read lands; external resume runs only as a copied provider command, and opening a terminal plus running it stays a main-side follow-up; the detail window refetches its session on open beside the card preview fetch. Revisit when transcript schemas drift or a live external feed becomes ownable.
- **Verification**: machine evidence on touched paths — `npx tsc --noEmit` and `--noUnusedLocals --noUnusedParameters` are clean, `npx eslint` on the component reports zero errors, `npm run i18n:check` reports both languages in sync after `npm run i18n:types`, and unit runs pass on `agent-session-registry` 13/13, `external-session-scanner` 5/5, and `companion-session-state` 1/1. Desktop e2e is not run: the change touches no IPC contract.
