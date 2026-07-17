import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { loadRendererWindow } from './renderer-loader'

export interface EditorWindowPayload { filePath?: string; workspacePath?: string }

export class EditorWindowManager {
  private windows = new Map<string, BrowserWindow>()

  list(): BrowserWindow[] {
    return Array.from(this.windows.values()).filter((window) => !window.isDestroyed())
  }

  closeAll(): void {
    for (const window of this.windows.values()) {
      if (!window.isDestroyed()) window.destroy()
    }
    this.windows.clear()
  }

  open(payload: EditorWindowPayload): { success: boolean; error?: string } {
    if (!payload.filePath || !payload.workspacePath) {
      return { success: false, error: 'Missing editor window payload' }
    }
    const existing = this.windows.get(payload.filePath)
    if (existing && !existing.isDestroyed()) {
      existing.focus()
      return { success: true }
    }

    const filePath = payload.filePath
    const workspacePath = payload.workspacePath
    const window = new BrowserWindow({
      width: 1100,
      height: 760,
      minWidth: 820,
      minHeight: 520,
      title: 'JanusX Editor',
      backgroundColor: '#0a0a0a',
      frame: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../../preload/index.mjs'),
        sandbox: false,
        webSecurity: true,
        webviewTag: false,
      },
    })
    window.on('closed', () => this.windows.delete(filePath))
    window.webContents.setWindowOpenHandler((details) => {
      void shell.openExternal(details.url)
      return { action: 'deny' }
    })
    this.windows.set(filePath, window)
    void loadRendererWindow(
      window,
      (url) => {
        url.searchParams.set('editorWindow', '1')
        url.searchParams.set('editorFile', filePath)
        url.searchParams.set('workspacePath', workspacePath)
      },
      { editorWindow: '1', editorFile: filePath, workspacePath },
    )
    return { success: true }
  }
}
