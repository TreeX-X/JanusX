---
schema: harness-note/1
id: e782007f-d07b-4f60-be32-63d1b22ec1f8
kind: decision
lifecycle: implemented
created: 2026-09-22
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/7f0d3ec5-50e4-46df-85b4-f0b75e589df0
    reason: The v3 slice fills the split checkpoint section with content; this slice removes the split and binds strips to turns per HiFi v5
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/bb3ef36c-f74e-4589-98c7-601f8823d367
    reason: The migration assigns checkpoint detail and review-gated restore to session cards; this slice keeps that ownership while changing the presentation
---

# Agent Note: Session unified timeline with modal diff per HiFi v5

## Problem

`src/renderer/src/components/SessionPanel.tsx` splits one conversation across two expands: the card header opens turns while a separate checkpoint button opens the checkpoint list, so restoring means matching a turn against rows in a second list. Diff expands inline inside the narrow right column, where long diffs fight the timeline for scroll space. Full file lists render open on every row, so large changes dominate the card.

## Decision

The card header owns the whole timeline: each turn renders its prompt plus status row with the bound checkpoint strip directly beneath. Each strip shows a one-line summary (index, file count, aggregated `+A −D`, turn-kind badge, timestamp) with the file list collapsed behind a click, capped at five rows plus a remaining-files line and internal scroll past 132px. Diff opens in an in-panel modal under the shared traffic-bar title: a left file list plus a diff pane showing the full diff by default and a per-file diff on row click, with binary and oversized rows disabled and labelled. Restore from the modal closes it and opens the strip inline review, so the two-step confirm lives in exactly one place. Checkpoints no turn references append after the turns with their recorded prompt, keeping restorable state visible. Turns without a checkpoint render a dashed no-checkpoint strip once the list resolves. Five locale keys ship in both languages with regenerated types.

## Alternatives considered

- Keep the split expands and add deep links between turns and rows — strongest case is the smallest diff. The driver that rules it out is the reported symptom: two expands remain two sources of truth for one conversation, and every restore still crosses lists.
- Cap the inline diff height instead of a modal — strongest case is zero new components. The driver that rules it out is geometry: a capped inline block still competes with the timeline scroll, and file switching stays linear.
- Open diff in a separate Electron window — strongest case is a true editor-grade surface. The driver that rules it out is plumbing: a new window needs registration, navigation, and focus handling, while the in-panel modal reuses the existing overlay pattern both session modals already share.
- Auto-expand file lists for small changes — strongest case is fewer clicks on trivial turns. The driver that rules it out is consistency: mixed open states make card heights unpredictable, and the large-change case the issue targets stays jumpy.
- Do nothing / reuse the v3 layout — no churn. The cost is the persistent turn-to-checkpoint matching step plus card-dominated large changes.

## Consequences

- **Gains**: one expand shows the full story per turn; large changes cost one line until opened; long diffs scroll in a dedicated pane with per-file focus; restore keeps prune warning, confirm, success, and conflict disclosure with existing IPC and styling.
- **Costs and limits**: per-file diff costs one IPC per file click, cached per modal open; the single expand shares the worktree `expandedSessionId`, so one card per path stays open at a time, as before; answer sides stay status-only because the turn record model carries no agent prose. Verification is machine evidence on touched paths: `tsc --noEmit` and `typecheck:strict-unused` are clean, `eslint` on the component reports zero errors with one pre-existing Chinese-literal warning on the transcript line, `npm run i18n:check` reports both languages in sync, and unit runs pass on `worktree-store` 2/2, `agent-session-registry` 11/11, and `companion-session-state` 1/1. Desktop e2e is not run: the change touches no IPC contract and needs a packaged build.
