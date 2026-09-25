---
schema: harness-note/1
id: 35201fed-ceee-4ee2-84b6-27522cbfcc1c
kind: decision
lifecycle: implemented
created: 2026-09-22
class: bug-fix
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e968d1ae-593c-4a7e-b2a0-aba9fcb12f82
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/18fffeff-4922-423d-9f15-0e27f69048d2
extensions:
  r5Migration:
    sourceHash: 5ba0c2478181ef1b4a5f11a5594cded1a11f8944cfa01caca09e9aef851d1ac2
    repairs:
      - relations[0].reason
      - relations[1].reason
    originalRelations:
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e968d1ae-593c-4a7e-b2a0-aba9fcb12f82
        reason: Windowed renderer slice owns the modals this fix re-mounts above the
          dock
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/18fffeff-4922-423d-9f15-0e27f69048d2
        reason: Pull-mode transcript backfill gains first-prompt repair for titleless
          hook rows
---

# Agent Note: Session modals above the dock plus recognizable empty states

## Problem

`SessionDetailWindow` and the continue dialog render inline `fixed inset-0` overlays inside the right-dock tree, but `RightDock.module.css` sets a non-none `transform` on the dock host, which makes the dock the containing block for fixed descendants. Both windows therefore size against the dock instead of the viewport and read as embedded in the right workspace. Separately, an empty scope tab is indistinguishable from no data at all, and hook-owned rows whose prompt never reached submit-line stay titleless because the transcript import backfills only the transcript path on collision.

## Decision

Both session modals mount through `createPortal` into `document.body`, matching the settings, worktree, and remote modals, so dock transforms, overflow, and inactive-panel `inert` states never contain them. The panel header keeps its scope tabs; an empty visible list now reports the unfiltered totals beside the empty copy, fetched once per empty view, so a filtered-out list names the other scopes instead of reading as missing data. The transcript import additionally backfills `firstPrompt` plus `lastPrompt` on hook-owned collision rows when the row holds no prompt, leaving turns, counts, and checkpoint bindings untouched. One locale key ships in both languages with regenerated types.

## Alternatives considered

- Remove the dock `transform` so inline fixed modals center on the viewport — strongest case is zero component change. The driver that rules it out is blast radius: the transform drives the dock slide animation, and every dock panel would need re-verification for one tool's overlay.
- Open the detail view in a separate Electron window — strongest case is a true top-level surface. The driver that rules it out is plumbing: window registration, navigation, and focus handling for a view the in-page overlay already serves once portaled.
- Mirror the main cwd scope matcher into the renderer for per-tab counts — strongest case is exact per-scope numbers. The driver that rules it out is drift: two copies of the matching rule diverge, while the unfiltered totals answer the reported ambiguity with one fetch.
- Backfill whole turns from transcripts on collision — strongest case is complete rows. The driver that rules it out is authority: hook-owned turns stay the source of truth, and prose already resolves at read time through the transcript detail channel.
- Do nothing / keep inline modals and bare empty states — no churn. The cost is the reported symptom: windows trapped in the dock, empty tabs reading as data loss, and titleless rows.

## Consequences

- **Gains**: detail and continue windows center on the viewport from any dock state; empty scope tabs disclose totals; titleless hook rows regain their first question on the next backfill pass.
- **Costs and limits**: totals fetch one unfiltered summary list per empty view; first-prompt repair applies only where the transcript parse yields a question, and rows without any transcript stay titleless. Field evidence on this machine shows no transcript writes and no registry updates past the morning, so an empty afternoon view reflects absent activity, not pipeline loss; worktree-child scopes additionally hide root-recorded rows by the existing scope rule.
- **Verification**: machine evidence on touched paths — `npx tsc --noEmit` with strict unused flags is clean, `npx eslint` on touched source files reports zero errors, `npm run i18n:check` reports both languages in sync after `npm run i18n:types`, and unit runs pass on `agent-session-registry` 14/14, `transcript-reader` 5/5, and `external-session-scanner` 5/5. Desktop e2e is not run.
