---
{
  "schema": "harness-note/2",
  "id": "e76f4e20-d8e7-44dc-ae21-ab7387e6d12d",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-10-10",
  "class": "bug-fix",
  "tags": [
    "motion",
    "right-dock",
    "rail"
  ],
  "updated": "2026-10-21T15:37:53.642Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Right rail toggle motion and empty-state collapse

## Current design
The separate panel toggle has been removed together with the top tool tabs. Tool icons now own collapse/expand and show interactive cards while collapsed; [Right dock](./right-dock.md) owns that behavior. The old toggle-specific RAIL_TOGGLE_MOTION_MS coupling and railToggle styles no longer exist. useAnimatedOpen now owns the card's 320ms exit lifecycle, keeping visible content alive but immediately inert. The floating card retains its 240ms opacity / 320ms transform reveal and clicking a preview morphs it into a docked panel while reserving grid width over 240ms, with reduced-motion overrides. Tool entries stay fixed without a toggle mount lifecycle.


## Historical implementation and evidence
The following records describe the previous control and are retained as historical evidence, not current component contracts.


## Problem
`RightToolRail` gated the collapse/expand control on `hasOpenTools && panelToggle` as a plain conditional render, so the control popped in on the frame the first tab opened and vanished on the frame the last one closed. Two things made the pop worse than a missing animation. The control is the first child of `.railTools`, a `gap: 4px` flex column, so unmounting it also removed 36px of height plus the gap — the tool icons below snapped up 40px while the panel was already sliding away. And a freshly mounted element cannot run a CSS transition from its initial style, so even adding `opacity`/`transform` rules to `.railButton` would have left the entrance instant.

### Right dock hides panel toggle with no open tools
The right rail shows a collapse control with an empty tool set. The dock width only grows when an active tool exists (`getRightDockLayout` in `src/renderer/src/components/right-tools/layout.ts`), so toggling the collapsed flag with no open tool changes no pixels. The control also exposes `aria-expanded` with `aria-controls="right-tool-panel"` against a panel that renders nothing, which misleads assistive readers about available action.


## Decision
The control keeps the "rendered only when a tool is open" contract recorded in Right dock hides panel toggle with no open tools, but its mount is now owned by `useAnimatedOpen` from `src/renderer/src/components/shared/CardFrame.tsx` — the same helper the blueprint and knowledge workbenches use for side panels. `toggleVisible = hasOpenTools && Boolean(panelToggle)` drives it; opening mounts during the render phase and flips `visible` on `requestAnimationFrame` so the enter transition has a painted start state, and closing keeps the node mounted for the exit duration (`RAIL_TOGGLE_MOTION_MS` = 320ms) before unmounting, so the empty rail still renders no control.

The `.railToggle` wrapper is a sibling after `.railTools` and is anchored to the rail bottom with auto margin. Its height and opacity still animate on `data-visible`, but tool entries remain at fixed top positions throughout opening and closing. Exit delays `visibility` by 320ms to match the unmount timer; pointer events are disabled during exit. Keyboard traversal follows the visual order: tools first, panel toggle last.

320ms is deliberately slower than the 220ms `SIDE_PANEL_EXIT_MS` the rest of the shell uses — the first request was that the control read as loading in rather than flashing. `.panel` in the same stylesheet was moved onto the matching budget (`opacity 240ms ease, transform 320ms`, previously 150ms/240ms) so the window and the control arrive as one motion instead of the panel landing first and the control trailing it. `grid-template-columns` in `App.tsx` was left at `SIDE_PANEL_TRANSITION_MS` = 240ms because that one transition also drives the left sidebar; slowing it would change a surface outside this request.

### Right dock hides panel toggle with no open tools
`RightToolRail` renders no separate panel toggle in either empty or populated states. Rail-only stays the normal empty state. Each tool icon controls its own content: click opens or toggles the panel, while hover previews the real content without opening a tool in the store. The current interaction and dismissal rules are owned by [Right dock](./right-dock.md). The collapsed preference in `src/renderer/src/stores/app.ts` keeps its meaning for open tools and never gates the empty rail.



## Alternatives considered
- Always-mounted control toggled by CSS `data-visible`, no delayed unmount — strongest case is the smallest diff and symmetric enter/exit with no hook. The driver that rules it out is the recorded empty-rail decision: `tests/unit/right-tool-dock.test.ts` asserts the collapsed rail with `openToolIds: []` renders no `aria-controls="right-tool-panel"`, and a permanently mounted button contradicts the a11y reasoning in the note it encodes.
- Keep the control inside `.railTools` and animate only opacity and transform — strongest case is no DOM restructure. The driver that rules it out is the gap: the 4px flex gap survives a zero-height child, so the icons still snap at unmount, which is the second half of the reported pop.
- Keyframe `animation` on the button for enter plus a JS timer for exit — strongest case is no `data-visible` plumbing. The driver that rules it out is duplication: `useAnimatedOpen` already solves the reopen-mid-exit case and the reduced-motion collapse, and hand-rolling both here would fork the pattern the other two workbenches share.
- Negative `margin-bottom` on a zero-height slot to cancel the gap — strongest case is keeping the control in `.railTools`. The driver that rules it out is fragility: it depends on the gap value staying 4px and reads as a hack against the flex layout rather than a structural fix.

### Right dock hides panel toggle with no open tools
- Disabled toggle with tooltip — strongest case preserves control placement and teaches the entry path. The driver that rules it out is dead chrome: a permanently disabled button in the default launch state adds noise without action.
- Empty toggle opens the default tool — strongest case gives the button a meaning and speeds discovery. The driver that rules it out is surprise: expand must never invent workspace tool state the user did not request.
- Do nothing / reuse always-visible toggle — staying put avoids all churn. The cost is a control that promises an effect it cannot deliver, plus incorrect expand/collapse announcements.


## Consequences
- **Gains**: opening the first tab now expands and fades the control in over 320ms while tool icons remain fixed and the panel arrives on the same budget, and closing the last tab fades and collapses it out before unmounting, so neither direction pops. Reopening mid-exit snaps back to visible without unmounting, inherited from `animatedOpenReducer`.
- **Costs and limits**: the exit adds a 320ms window in which the control is still mounted and focusable before `visibility` flips — the same characteristic `.bp-node-detail` already has. Three numbers are hand-coupled and must move together: `RAIL_TOGGLE_MOTION_MS` in `RightToolRail.tsx`, the `.railToggle` CSS durations, and the `visibility 0s linear 320ms` delay that equals the unmount timer; changing one without the others either clips the fade-out or leaves a dead control mounted. `.railToggle` must also stay declared before the `prefers-reduced-motion` block in `RightDock.module.css`, because at equal specificity a later rule wins and the transition would override `transition: none`. `tests/unit/side-panel-collapse-ui.test.ts` pins both the ordering and the duration coupling. `.panel` now shares this budget, so any future retune of the dock's expand has to touch both rules.
- **Verification**: `npx vitest run tests/unit/right-tool-dock.test.ts tests/unit/side-panel-collapse-ui.test.ts tests/unit/planche-theme.test.ts tests/unit/right-tool-state.test.ts` passes (11 + 2 + 14 + 26), `npx eslint` on the changed component is clean, and `npx tsc --noEmit` reports only a pre-existing error in the untracked `src/main/blueprint/note-mcp-server.ts`. A throwaway Playwright harness under `.janusX/` (gitignored, since removed) measured the real stylesheet: on enter the wrapper ran 0 → 31.3px at 80ms → 38.1px at 160ms → 40px settled at 320ms, with the tool icons' top moving 14 → 54px and the panel's opacity 0 → 0.6 → 0.94 → 1 on the same curve; on exit the wrapper reached 0px and opacity 0 by 240ms, comfortably inside the 320ms unmount timer, and the post-exit layout matched the empty-rail baseline exactly. The full unit suite fails on unrelated files both with and without this change — the two runs share `memory-review-ui`, `workflowx-v2`, `blueprint-review-git`, `file-tree-git-ignore`, `office/workspace-watcher-coordinator` and others, while `web-test-gateway` failed only on the baseline run and `assistant-ui` / `harness-service` only on the changed run; every one of them passes when its file is run alone, which points at full-suite resource contention rather than this change. Not verified: the motion inside a running Electron app.

### Right dock hides panel toggle with no open tools
- **Gains**: The rail exposes no ineffective action; each icon announces its own expanded state.
- **Costs and limits**: Discovery of expand relies on the tool icons; a future empty-state hint on the rail remains open when first-run telemetry shows hesitation.
