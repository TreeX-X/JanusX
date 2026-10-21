---
{
  "schema": "harness-note/2",
  "id": "8d37d89b-3921-4b59-abcb-572c6cc0185c",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-10-20",
  "updated": "2026-10-20T10:38:02.218Z",
  "class": "architecture",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/WindowControls.tsx",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/windows/register-window-ipc.ts",
      "role": "implementation"
    }
  ]
}
---

# Platform window controls and internal close actions

## Problem

Desktop windows previously displayed macOS traffic lights on Windows. Internal dialogs and floating panels reused the same appearance even when minimize was unavailable or actually closed the panel.

## Decision

Main, standalone editor, browser and editor-loading windows share WindowControls. Windows and Linux show minimize, maximize/restore and close at the right; macOS shows traffic lights at the left. Existing application themes and centered Island remain. Platform indicator colors are explicit, bounded exceptions in the theme audit; ordinary chrome uses theme tokens.

Window IPC targets the requesting webContents rather than whichever window currently has focus. An initial query and native maximize/unmaximize events keep the restore affordance synchronized, including external window changes. Close callbacks retain the main exit confirmation and editor unsaved-file guard.

Internal dialogs use a visible close mark at the right on both platforms. FloatingPanel offers its local expand/restore action only when supported, plus close; the misleading minimize action is removed. Session dialogs, blueprint and knowledge headers, and toast dismissal follow the same close affordance. Workbench target geometry is owned by [workbench-close-hit-slop](../workbench/workbench-close-hit-slop.md).

## Alternatives considered

Keeping traffic lights everywhere preserves the previous appearance but conflicts with Windows placement and action expectations. Native system titlebars provide more OS behavior, but replacing the existing frameless chrome would require a separate layout and Island integration. The shared custom component keeps the current layout with one platform policy.

## Consequences

Custom Windows buttons do not provide the native maximize-hover Snap Layout flyout. macOS green retains maximize/restore rather than native fullscreen. macOS styling is tested with a simulated platform, not on a macOS machine. Native titlebar double-click is not covered by browser-synthesized pointer input. Revisit if native fullscreen or Snap Layout support becomes a requirement.

Verification is in tests/e2e/window-controls.spec.ts: four platform/theme combinations exercise placement, state labels, guarded close, panel actions and keyboard dialog dismissal; a Windows Electron case exercises native maximize events, restore, minimize and exit-confirmation cancellation. All five window-control cases passed. The editor window-sharing and native-close/save-failure/discard cases also passed. npm run typecheck, npm run build:app, npm run theme:check, npm run i18n:check, npm run check:notes and scoped ESLint passed (Notes reported existing cross-repository link diagnostics). The existing planche unit suite has an unrelated FileEditor filetab-close source assertion that no longer matches the pre-existing unified-editor refactor.

Additional regression gap: the existing HTML editor preview case in tests/e2e/editor-window-tabs.spec.ts fails waiting for .monaco-editor after its iframe checks pass, including when rerun under the desktop project timeout. This change does not modify HTML preview/editor mode switching; that regression remains unresolved. The targeted unit run passed 23 of 24 cases, with the source assertion described above failing.
