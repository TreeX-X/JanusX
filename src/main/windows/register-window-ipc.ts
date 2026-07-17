import { BrowserWindow, ipcMain } from 'electron'
import { SYSTEM_CHANNELS } from '../../shared/ipc/system'
import { type EditorWindowManager, type EditorWindowPayload } from './editor-window'

export function registerWindowIpc(editorWindows: EditorWindowManager): void {
  ipcMain.handle(SYSTEM_CHANNELS.minimize, () => BrowserWindow.getFocusedWindow()?.minimize())
  ipcMain.handle(SYSTEM_CHANNELS.maximize, () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) window.isMaximized() ? window.unmaximize() : window.maximize()
  })
  ipcMain.handle(SYSTEM_CHANNELS.close, () => BrowserWindow.getFocusedWindow()?.close())
  ipcMain.handle(SYSTEM_CHANNELS.openEditor, (_event, payload: EditorWindowPayload) => editorWindows.open(payload))
}
