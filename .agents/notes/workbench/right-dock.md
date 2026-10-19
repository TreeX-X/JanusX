---
{
  "schema": "harness-note/2",
  "id": "a73f2f05-7198-52b1-90ca-187f682460c1",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-07-19",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-07-19-agent-note-right-dock-rail-with-semantic-file-icons--a73f2f05.md",
      "sourceHash": "1f9832e09ef28f7203c6aef35005d94ee0be06cb94fa41123eff164448cb0a67",
      "originalBodyHash": "364955ecc709a743e53d569237272defdfbcff2ad862813402e823f358ac15e1",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Right dock rail with semantic file icons. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-07-19-right-dock.md",
        "sourceHash": "1f9832e09ef28f7203c6aef35005d94ee0be06cb94fa41123eff164448cb0a67",
        "originalBodyHash": "364955ecc709a743e53d569237272defdfbcff2ad862813402e823f358ac15e1"
      }
    }
  },
  "updated": "2026-10-19T15:35:55Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---
# Right dock rail with semantic file icons


## Problem

The right side freezes four singleton tabs in a fixed strip while the file tree speaks no visual language. Adding a tool squeezes the tab row, tool state drifts across stores, and file kinds, selection, and version-control states collide in one channel.

## Decision

Files, Git and sessions now register as trusted bundled extensions through `extensions/builtins.tsx`. The adapter keeps their original tool IDs, translated labels, icons, order, gates and saved widths; the rail and content host no longer branch on these three tools. Disabling removes an entry and unmounts its view, while re-enabling retains its width and leaves it closed. Application-scoped shells preserve existing local state across project switches while the original stores own project/worktree context. Host services remain independent of the view lifecycle. The container supplies the same retry/close boundary for every right-hand contribution. Migration verification and limits are recorded in the [plugin delivery plan](../planning/plugin-platform-roadmap.md).

The right side composes a fixed tool rail, open tool tabs, and a variable-width panel. Tools stay open in multiples with exactly one visible, each tool runs as a singleton, and registry order fixes tab sequence with no drag sorting. Collapse keeps a single source of truth and tool business state follows existing stores per workspace. File icons lead with semantic shape plus low-saturation color inside the monochrome-plus-accent language, and file kind, selection, and version-control states travel three independent visual channels. Icon taxonomy shares one source with the file viewer classification. Office preview stays a transient middle workspace outside the rail.

Panel width now follows the active tool. Sessions and Git start at 360px with a 340px minimum and 520px maximum. The file tree starts at 260px with a 240px minimum and 420px maximum; the assistant retains the 280px default and the same 240–420px range. Dragging records a preference for that tool, so tab switches restore each width. The layout may temporarily constrain the rendered width to preserve the 320px center workspace; it does not persist that responsive constraint. When available width falls below the active tool's minimum, the existing rail-only responsive collapse applies. The workbench grid alone animates width on a 240ms curve; the panel shell follows its available width. Header and tool content use the destination width, anchored to the rail, so text lays out once instead of reflowing on every animation frame. The shell clips/reveals the left edge during the transition; active content fades in over 160ms. Pointer resizing stays immediate. Reduced-motion preferences disable both grid transitions and content animation. Open tool subtrees remain mounted to preserve local state; this change does not shorten IPC/data fetch time.

Tabs share the middle workspace's 7px corners, borderless neutral selected fill and theme-aware hover/focus colors. The right header retains its compact 36px height, 26px tabs, inherited 11px type and content-sized 84–160px widths; copying the middle's 32px tab height and 144px fixed width makes this narrow tool surface unnecessarily tall and forces early overflow. The header uses the canvas background without a bottom rule, and overflow fades use that same background. Close controls have a 20px target and visible keyboard focus. Child button keys bypass the tab container's activation handler, so Enter closes the focused tool rather than being consumed as tab activation. Registry order, singleton state and horizontal scrolling retain their existing behavior.

The far-right vertical rail and the top tool tabs each move a shared selection background immediately over 160ms, while a shared 100ms activation window coalesces rapid clicks to the last requested tool. Pending state stays local to the control, leaving the current panel visible until activation. aria-selected / aria-pressed still describe the committed tool, with aria-busy marking pending work. Repeating the same pending target does not extend the deadline; reversing to the current tool cancels it. A fresh rail click on the current tool retains immediate collapse/expand behavior. Closing tools, changing the active tool externally, hiding the dock or removing the pending target cancels queued work; the rail also resets on workspace and responsive-collapse changes. Timers clear on unmount. Indicators follow layout geometry and resizing, with reduced motion disabling animation while retaining coalescing. Terminal/pane tabs use the same sliding presentation with immediate content selection; their behavior is recorded in [workspace tabs](./pane-tab-reorder.md).

Previously the rail bypassed the top-tab feedback window: every fast click synchronously updated the global tool state, activating intermediate panels and rerendering unrelated mounted tool content. ToolContent now memoizes stable view/context/active props, so unaffected hidden tools skip parent-driven rendering while their own subscriptions and registry changes still work. The 100ms window adds a small activation delay in exchange for fewer redundant panel changes; it cannot interrupt a synchronous render already underway or shorten IPC reads. Revisit if real desktop profiling still shows long commits after coalescing.

The file search input and adjacent external-editor button use shell tokens for borders, fill, text and focus. The input uses a neutral border at rest and the active theme accent while focused; its border belongs to CSS rather than an inline style so focus can override it. The external-editor button shares the same theme colors while keeping its disabled state.

The right rail now selects tools with neutral fill and foreground contrast, without the accent stripe. Open inactive tools retain their small dot. The panel toggle sits at the bottom of the rail and keeps its enter/exit lifecycle, so opening the first tool or closing the last no longer moves tool entries. Per-tool width preferences remain unchanged. File and session searches share 28px height, 12px horizontal toolbar padding and neutral card fill; focus keeps the accent outline. The session toolbar omits the duplicate current-tool heading. Git uses a neutral branch marker, nonzero-only plain-text change statistics and unfilled section headers with 11px labels. Existing staging, commit, remote operations and history controls retain their behavior.

Search control verification: an isolated browser stylesheet check passes default, hover and focus in planche/dark; screenshots are under artifacts/file-search-theme. The existing file-explorer-delete, file-tree-drag and planche-theme unit files pass 27 cases; typecheck, theme:check and scoped ESLint pass (two existing hook warnings). This does not establish live Electron validation.

The dock maps its local shell canvas, chrome, card and hover roles to tool-canvas/card/chrome/hover from the central theme definition. Planche keeps the dock ground identical to the central warm paper (#EFE4C5), with slightly lighter cards (#F2E9D2) and popovers (#F3EBD7). Large near-white tool surfaces were rejected because they split the workspace into mismatched color blocks. Workspace, file-tree and terminal-preset menus plus Select dropdowns share popover-background/hover/shadow and control-border, replacing yellow-brown fills and hard offset shadows. New themes supply these roles once rather than branching inside each component. Browser coverage in tests/e2e/tool-palette.spec.ts mounts the real Sidebar and RightDock in planche/dark, checks dock/menu colors, hover and Escape dismissal, and renders session cards; screenshots are under artifacts/tool-palette. IPC uses fallbacks, so this is not live Electron validation.

Right-rail icon hints prefer the left side and align with their own button, keeping the vertical control column clear. ThemedTooltip measures its rendered size before choosing a flipped position and clamping to an 8px viewport margin. Pointer input passes through all hints; pointerdown/click cancels visible and pending hints, while keyboard focus still explains controls. Scroll, resize and Escape also cancel pending timers. Git commit previews now follow the same non-blocking policy: leaving the row dismisses immediately, the preview does not capture pointer input or scroll, and clicking a commit expands its file details in the panel. Changing the active tool or workspace dismisses Git previews. The trade-off is that hover previews are bounded summaries; longer content is read in the expanded row. These behaviors are covered in tests/e2e/right-tool-tooltips.spec.ts with actual rail controls, long edge hints, keyboard focus and a clickable control underneath the Git preview in planche/dark. Verification: 4 browser cases pass across the tooltip and palette files, along with typecheck, scoped ESLint, theme:check, 47 planche/right-tool-state/theme-audit unit cases and check:notes (0 errors; 17 existing external-link diagnostics). Browser IPC uses fallbacks; live Electron behavior was not tested.

ThemedTooltip subscribes to global scroll, resize, pointerdown and Escape only while a hint is pending or visible, then removes those listeners on dismissal. This preserves cancellation during the delay without installing four global listeners for every idle instance. Both theme cases in `tests/e2e/right-tool-tooltips.spec.ts` pass after this lifecycle change; packaged long-session latency remains unmeasured.

## Alternatives considered

- Per-tool windows — strongest case gives every tool full space. The driver that rules it out is frame fragmentation: tools scatter beyond the working context.
- Repeatable tool instances — strongest case mirrors document tabs. The driver that rules it out is semantic mismatch: tools are capability entries, not documents.
- Full-color file icons — strongest case reads faster at a glance. The driver that rules it out is noise: saturated rainbows fight the restrained shell.
- Do nothing / reuse fixed tabs — staying put avoids all migration risk. The cost is an unextendable strip and a mute file tree.

## Consequences

- **Gains**: New tools arrive through registry order without squeezing chrome; file kinds read instantly across tree and viewer from one taxonomy.
- **Costs and limits**: Singleton tools cannot split side by side; drag sorting and pinning stay explicitly out until range pressure demands them.
- **Width behavior**: A narrow viewport may collapse Git or sessions sooner than the file tree because their minimum is larger. Saved manual widths return when space is available again. The v1 persisted shared width remains the fallback for tools without a dedicated drag preference.

## Tab appearance verification, 2026-10-14

The four existing right-dock, state, collapse and planche-theme unit files pass 58 cases. A temporary browser fixture mounts the real `RightToolTabs` and styles beside the middle header. Eight scenarios cover planche/dark at 240, 260, 360 and 520px, checking compact height, inherited font, unclipped text height, borderless rounded tabs, overflow visibility, End/Enter activation and closing the active tool with the keyboard. Screenshots and measured results are under `artifacts/right-tabs-alignment`; the fixture uses browser IPC fallbacks and does not establish live Electron validation.

Verification of the compact right-tool design: 8 browser cases pass across right-workspace-design, tool-palette and right-tool-tooltips, covering planche/dark, 340/520px panels, keyboard expansion, search, stable tool positions after the last close, and tooltip dismissal. Four related unit files pass 58 cases. Typecheck and scoped ESLint pass; FileExplorerTool retains its two existing hook warnings. Browser IPC is seeded, so this does not establish live Electron verification. Preview: artifacts/right-workspace-preview/comparison.png.

## Width transition verification, 2026-10-15

The browser palette fixture uses the production layout calculation and shared grid transition, including per-tool widths, collapse and immediate pointer resizing. `right-dock-motion`, `right-workspace-design`, `tool-palette` and `right-tool-tooltips` pass 12 browser cases in planche/dark. Frame samples verify a changing shell width, constant 520px destination content and a stationary rail; other checks cover return to file width, rapid switches with retained search, saved drag width and reduced motion. Screenshots use `artifacts/right-dock-motion`. The right-tool dock/state unit files pass 42 cases; typecheck and scoped ESLint pass. IPC is seeded in the browser fixture; live Electron performance has not been measured.

## Tab feedback verification, 2026-10-19

Four `right-tool-tab-feedback.spec.ts` browser cases pass: planche/dark observe marker movement while the old panel is still visible, cross-frame Git/session reversals activate only the final target, returning to the current tab/closing/collapsing cancels pending activation, and keyboard activation/close plus reduced motion remain usable. Screenshots under `artifacts/right-tab-feedback/motion` were visually inspected. Six existing motion and switch-performance cases pass; the width sampler now starts measuring the destination content once that panel is activated. Eight lifecycle, tooltip and 340/520px workspace cases pass under `artifacts/right-tab-feedback/regression`. These 18 cases use real components and seeded IPC. The initial motion assertions sampled native CSS transitions as though Playwright's JS clock controlled them; switching to frame-position polling fixed the assertions. Real desktop frame latency remains unmeasured.

`npx vitest run tests/unit/right-tool-dock.test.ts tests/unit/right-tool-state.test.ts tests/unit/planche-theme.test.ts` passes 56 cases. Typecheck and scoped ESLint pass. Verification retains the previous session data reuse changes and does not package or restart the user's dev process.

## Vertical rail and pane feedback verification, 2026-10-19

The new rail test first fails in both themes against immediate activation, confirming that the actual far-right entry bypassed the feedback window. After the change, five rail cases cover cross-frame latest-target activation, reversal, close/gate removal, reopening, collapse/expand, external activation, repeated-target deadlines and native keyboard use. A reduced-motion failure exposed CSS rule ordering; moving the indicator definition before the media override fixes it. The final seven-case rail/performance run passes under `artifacts/right-rail-feedback/final`. Eight real rail round trips commit all 16 Git/session transitions yet read the scoped session list only once. This proves work reuse in the seeded fixture, not real desktop frame latency.

Across the targeted runs, 55 distinct browser cases pass: rail/top-tab feedback, pane feedback/dragging, width motion, extension lifecycle, session reuse and workspace surfaces. The five dock/state/theme/pane/drop-hint unit files pass 98 cases. Typecheck, scoped implementation ESLint, diff whitespace and Note validation pass (322 Notes, zero errors, 17 existing external-link diagnostics). Rail planche and pane dark screenshots were visually inspected. These tests use real components with fixture IPC; the user's existing dev process remains available for real workload testing.
