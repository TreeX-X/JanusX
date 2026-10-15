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
  "updated": "2026-10-15T05:54:59.168Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---
# Right dock rail with semantic file icons


## Problem

The right side freezes four singleton tabs in a fixed strip while the file tree speaks no visual language. Adding a tool squeezes the tab row, tool state drifts across stores, and file kinds, selection, and version-control states collide in one channel.

## Decision

The right side composes a fixed tool rail, open tool tabs, and a variable-width panel. Tools stay open in multiples with exactly one visible, each tool runs as a singleton, and registry order fixes tab sequence with no drag sorting. Collapse keeps a single source of truth and tool business state follows existing stores per workspace. File icons lead with semantic shape plus low-saturation color inside the monochrome-plus-accent language, and file kind, selection, and version-control states travel three independent visual channels. Icon taxonomy shares one source with the file viewer classification. Office preview stays a transient middle workspace outside the rail.

Panel width now follows the active tool. Sessions and Git start at 360px with a 340px minimum and 520px maximum. The file tree starts at 260px with a 240px minimum and 420px maximum; the assistant retains the 280px default and the same 240–420px range. Dragging records a preference for that tool, so tab switches restore each width. The layout may temporarily constrain the rendered width to preserve the 320px center workspace; it does not persist that responsive constraint. When available width falls below the active tool's minimum, the existing rail-only responsive collapse applies. Tab switches animate panel width on the same 240ms curve as the grid; pointer resizing stays immediate.

Tabs share the middle workspace's 7px corners, borderless neutral selected fill and theme-aware hover/focus colors. The right header retains its compact 36px height, 26px tabs, inherited 11px type and content-sized 84–160px widths; copying the middle's 32px tab height and 144px fixed width makes this narrow tool surface unnecessarily tall and forces early overflow. The header uses the canvas background without a bottom rule, and overflow fades use that same background. Close controls have a 20px target and visible keyboard focus. Child button keys bypass the tab container's activation handler, so Enter closes the focused tool rather than being consumed as tab activation. Registry order, singleton state and horizontal scrolling retain their existing behavior.

The file search input and adjacent external-editor button use shell tokens for borders, fill, text and focus. The input uses a neutral border at rest and the active theme accent while focused; its border belongs to CSS rather than an inline style so focus can override it. The external-editor button shares the same theme colors while keeping its disabled state.

Search control verification: an isolated browser stylesheet check passes default, hover and focus in planche/dark; screenshots are under artifacts/file-search-theme. The existing file-explorer-delete, file-tree-drag and planche-theme unit files pass 27 cases; typecheck, theme:check and scoped ESLint pass (two existing hook warnings). This does not establish live Electron validation.

The dock maps its local shell canvas, chrome, card and hover roles to tool-canvas/card/chrome/hover from the central theme definition. Planche keeps the dock ground identical to the central warm paper (#EFE4C5), with slightly lighter cards (#F2E9D2) and popovers (#F3EBD7). Large near-white tool surfaces were rejected because they split the workspace into mismatched color blocks. Workspace, file-tree and terminal-preset menus plus Select dropdowns share popover-background/hover/shadow and control-border, replacing yellow-brown fills and hard offset shadows. New themes supply these roles once rather than branching inside each component. Browser coverage in tests/e2e/tool-palette.spec.ts mounts the real Sidebar and RightDock in planche/dark, checks dock/menu colors, hover and Escape dismissal, and renders session cards; screenshots are under artifacts/tool-palette. IPC uses fallbacks, so this is not live Electron validation.

Right-rail icon hints prefer the left side and align with their own button, keeping the vertical control column clear. ThemedTooltip measures its rendered size before choosing a flipped position and clamping to an 8px viewport margin. Pointer input passes through all hints; pointerdown/click cancels visible and pending hints, while keyboard focus still explains controls. Scroll, resize and Escape also cancel pending timers. Git commit previews now follow the same non-blocking policy: leaving the row dismisses immediately, the preview does not capture pointer input or scroll, and clicking a commit expands its file details in the panel. Changing the active tool or workspace dismisses Git previews. The trade-off is that hover previews are bounded summaries; longer content is read in the expanded row. These behaviors are covered in tests/e2e/right-tool-tooltips.spec.ts with actual rail controls, long edge hints, keyboard focus and a clickable control underneath the Git preview in planche/dark. Verification: 4 browser cases pass across the tooltip and palette files, along with typecheck, scoped ESLint, theme:check, 47 planche/right-tool-state/theme-audit unit cases and check:notes (0 errors; 17 existing external-link diagnostics). Browser IPC uses fallbacks; live Electron behavior was not tested.

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
