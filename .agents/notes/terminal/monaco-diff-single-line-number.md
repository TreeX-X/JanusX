---
{
  "schema": "harness-note/2",
  "id": "5c873080-4f76-597f-9fbd-0bdcc59a02a3",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-19",
  "class": "bug-fix",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-19-agent-note-monaco-diff-single-line-number--5c873080.md",
      "sourceHash": "e2bb49d3661a27df3b7d5bed3214ccb528338a6878d5d055849617fbd103ce55",
      "originalBodyHash": "af449fcd011c5cd6b21fc4b0440bf8450d6944e035c8f4314576286e4eaac580",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Monaco diff single line number. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/bug-fix/2026-09-19-monaco-diff-single-line-number.md",
        "sourceHash": "e2bb49d3661a27df3b7d5bed3214ccb528338a6878d5d055849617fbd103ce55",
        "originalBodyHash": "af449fcd011c5cd6b21fc4b0440bf8450d6944e035c8f4314576286e4eaac580"
      }
    }
  },
  "updated": "2026-10-21T16:28:29Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# Monaco diff single line number


## Problem
The right-side preview editor enters diff mode against the git baseline, and the gutter shows old and new line numbers side by side in one column. Unchanged lines repeat the same number, shifted lines show mismatched pairs, and both numbers share one color. Readers parse this as duplicated chrome rather than an old-to-new mapping, and the wide gutter steals space from the narrow preview window.

## Decision
The diff viewer renders one line-number column per visible pane. By default, a ResizeObserver selects unified layout below 800px and side-by-side layout at larger widths. The diff toolbar offers Unified / Side by side and previous / next change; an explicit layout choice persists in localStorage and overrides resizing. Side-by-side labels identify HEAD and the current file. These rules apply to code, Markdown and HTML editors only after explicitly enabling HEAD comparison, as described in [file editor experience](../workbench/file-editor-experience.md).

The former `useTrueInlineView` flag did not remove the old-number gutter. Unified layout now uses `compactMode: true` and disables true inline rendering so changed old rows remain above new rows. Unchanged and added rows keep current-file numbers. `lib/monaco-diff-line-numbers.ts` fills Monaco's native deleted-row margins with old-file numbers, using the original editor's line offsets to account for wrapping. It does not hide a gutter through CSS or replace native editing. Floating editor height uses the viewport; embedded editors use their host height.

## Alternatives considered
- Keep forced inline with dual numbers and add a legend — strongest case is zero code churn, but the legend explains clutter instead of removing it, and the gutter stays wide in the 560px embedded window.
- Turn line numbers off in diff mode — strongest case is maximum space saving, but reviewers lose the anchor they need to discuss a change, and opencode keeps numbers visible for this reason.
- Render a read-only patch view beside the editor — strongest case is pixel parity with opencode, but the preview must stay editable, so a second view doubles state and edit routing.
- Do nothing / reuse — staying with forced `renderSideBySide: false` keeps current behavior, but the double-number complaint persists and every future preview inherits it.

## Consequences
- **Gains**: `src/renderer/src/components/viewers/MonacoViewer.tsx` shows one number per pane, and narrow windows degrade to a single-column inline view instead of a dual-number gutter.
- **Costs and limits**: an explicitly chosen side-by-side layout stays active even in a narrow window. Deleted-number augmentation depends on Monaco's native deletion-margin DOM and must be rechecked on Monaco upgrades; subscriptions and pending animation frames are disposed when comparison ends. The diff engine, tokens, word highlights and edit model remain native.

## Verification

Browser regression: `npx playwright test tests/e2e/editor-preview.spec.ts --project=island --workers=1` covers 560px / wide layout, explicit choice across resize and reopening comparison, dark / planche screenshots, wrapped deleted lines, separated deletion blocks, addition-only / empty / identical files, navigation, preserved unsaved edits and Markdown scroll synchronization. Machine browser evidence is separate from a packaged desktop check, which was not run for this change.

2026-10-22 result: all 5 browser tests passed; dark and planche screenshots inspected. `typecheck`, `typecheck:strict-unused`, scoped ESLint, `i18n:check`, and 20 tests in `planche-theme`, `editor-session`, `editor-routing` passed. `check:notes` reported 4 existing broken wiki asset links in `desktop/readme-presentation-plan.md` and `desktop/readme-showcase.md`; none were introduced by the diff UI change.
