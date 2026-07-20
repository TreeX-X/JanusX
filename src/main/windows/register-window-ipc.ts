import { BrowserWindow, ipcMain } from 'electron'
import { SYSTEM_CHANNELS } from '../../shared/ipc/system'
import { type EditorWindowManager, type EditorWindowPayload } from './editor-window'

export function registerWindowIpc(editorWindows: EditorWindowManager, getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(SYSTEM_CHANNELS.minimize, () => BrowserWindow.getFocusedWindow()?.minimize())
  ipcMain.handle(SYSTEM_CHANNELS.maximize, () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) window.isMaximized() ? window.unmaximize() : window.maximize()
  })
  ipcMain.handle(SYSTEM_CHANNELS.close, () => BrowserWindow.getFocusedWindow()?.close())
  ipcMain.handle(SYSTEM_CHANNELS.openEditor, (_event, payload: EditorWindowPayload) => editorWindows.open(payload))
  ipcMain.handle(SYSTEM_CHANNELS.setAlwaysOnTop, (event, value: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || window.isDestroyed()) return { value: false }
    const enabled = Boolean(value)
    window.setAlwaysOnTop(enabled)
    if (window.isMinimized()) window.restore()
    if (!window.isVisible()) window.show()
    if (enabled) window.moveTop()
    window.focus()
    return { value: window?.isAlwaysOnTop() ?? false }
  })
  ipcMain.handle(SYSTEM_CHANNELS.embedEditor, (event, payload: EditorWindowPayload & { content?: string; isDirty?: boolean }) => {
    const source = BrowserWindow.fromWebContents(event.sender)
    if (!source || !payload.filePath || !payload.workspacePath) return { success: false }
    const target = getMainWindow()
    if (!target) return { success: false }
    target.webContents.send(SYSTEM_CHANNELS.editorEmbedded, payload)
    target.focus()
    source.close()
    return { success: true }
  })
}
