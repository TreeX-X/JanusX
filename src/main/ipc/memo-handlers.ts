import { BrowserWindow, ipcMain } from 'electron'
import { z } from 'zod'
import { MEMO_CHANNELS } from '../../shared/ipc/memo'
import { memoEditSchema } from '../../shared/memo'
import { memoStore } from '../memo/service'

export function registerMemoHandlers(): void {
  ipcMain.handle(MEMO_CHANNELS.list, () => memoStore().list())
  ipcMain.handle(MEMO_CHANNELS.create, (_, title) => memoStore().create(title))
  ipcMain.handle(MEMO_CHANNELS.edit, (_, id, edit) => memoStore().edit(id, memoEditSchema.parse(edit)))
  ipcMain.handle(MEMO_CHANNELS.remove, (_, id, revision) => memoStore().remove(id, z.number().int().nonnegative().parse(revision)))
  memoStore().subscribe(change => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(MEMO_CHANNELS.changed, change)
  })
}
