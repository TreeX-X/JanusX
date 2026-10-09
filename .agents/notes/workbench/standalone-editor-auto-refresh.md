---
{
  "schema": "harness-note/2",
  "id": "fe22dc2d-905a-4918-b15d-8e096d75aa49",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-27",
  "class": "feature",
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Standalone double-click editor auto-refreshes on external file changes

## Problem

The double-click standalone editor shows stale content after the file changes on disk. External writers (agent runs, CLI, another tool) update the file, the embedded editor refreshes clean tabs through the `filetree:changed` channel, and the standalone window keeps the old text until the user clicks the Refresh badge. The trigger is clear: the main process emits `filetree:changed` only to the main window, and the standalone renderer never subscribes to that channel. Without a shared refresh path, every external update costs a manual reload click in the detached window.

## Decision

`src/main/ipc/handlers.ts` owns the file-tree change broadcast to every allowed window. `registerWorkspaceHandlers` accepts `getAllowedWindows`, `emitWorkspaceFsChange` debounces once per workspace and sends `{ workspacePath, changedFilePath }` to the union of registered watcher windows and allowed windows, with destroyed webContents pruned from the registry. `src/main/ipc/register.ts` passes the existing office-window allowlist (`getOfficeWindows`, main plus editor windows) into the workspace handlers. `src/renderer/src/components/StandaloneFileEditor.tsx` subscribes to `window.electron.fileTree.onChanged`, filters by its own `workspacePath`, invalidates the editor file cache, and calls `reloadOpenFiles(workspacePath, changedFilePath)`. Clean tabs reload from disk with cursor and scroll preserved by the existing `MonacoViewer` sync; dirty tabs keep the `externalChanged` badge and never lose unsaved edits. Markdown preview renders the new `content` directly and HTML preview follows through its 300ms debounce with no call-site changes.

## Alternatives considered

- Poll `mtime` or re-read on window focus in the standalone renderer — strongest case is zero main-process changes and a self-contained fix. The driver that rules it out is duplicated watch logic: the main process already debounces `fs.watch` per workspace, and a second poller adds wakeups plus focus-only gaps when the window stays foreground.
- Reuse the `onEditorRefresh` path to push file content from the main process — strongest case is one channel for both tab switches and disk changes. The driver that rules it out is payload size and ownership: `refreshEditor` carries open intents, while disk sync belongs to the file-tree watcher that already computes `changedFilePath`.
- Auto-overwrite dirty tabs as well as clean ones — strongest case is zero manual clicks in every state. The driver that rules it out is data loss: unsaved edits have no merge base in the editor store, so overwriting destroys user input without recovery.
- Do nothing / reuse — keeping the manual Refresh badge costs no code. It leaves the reported friction in place: detached editors stay stale after every external write, so it answers nothing.

## Consequences

- **Gains**: detached double-click editors track external writes on clean tabs with no clicks; embedded and standalone editors share one watcher debounce and one reload path; dirty-tab protection stays intact.
- **Costs and limits**: a disk event still fans out to every open window, so N detached editors each pay one `file.read` for the changed file; rapid save bursts collapse to one reload per 150ms debounce window, and a change landing inside the window supersedes earlier ones. The revisit signal is watcher-event loss on a platform without recursive `fs.watch`: the tab then refreshes on the next event or on manual Reload, never by background polling.
- **Verification**: `npx tsc --noEmit` passes with no output; `npx eslint src/main/ipc/handlers.ts src/main/ipc/register.ts src/renderer/src/components/StandaloneFileEditor.tsx` reports 0 errors and 2 pre-existing exhaustive-deps warnings; `npx vitest run tests/unit/editor-tabs.test.ts tests/unit/editor-window-manager.test.ts tests/unit/office/workspace-watcher-coordinator.test.ts` passes 11/11; `npx vitest run tests/unit/file-tree-git-ignore.test.ts tests/unit/file-tree-move.test.ts tests/unit/workspace-ipc-contract.test.ts` passes 8/8.
