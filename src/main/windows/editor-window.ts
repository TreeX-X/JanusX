import { BrowserWindow, shell, type WebContents } from 'electron'
import { join, normalize } from 'path'
import { loadRendererWindow } from './renderer-loader'
import { SYSTEM_CHANNELS } from '../../shared/ipc/system'

export interface EditorWindowPayload { filePath?: string; workspacePath?: string }

interface EditorWindowEntry {
  window: BrowserWindow
  ready: boolean
  pending: EditorWindowPayload[]
}

function identityPath(value: string): string {
  const normalized = normalize(value).replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export class EditorWindowManager {
  private windows = new Map<string, EditorWindowEntry>()

  list(): BrowserWindow[] {
    return Array.from(this.windows.values())
      .map((entry) => entry.window)
      .filter((window) => !window.isDestroyed())
  }

  closeAll(): void {
    for (const entry of this.windows.values()) {
      if (!entry.window.isDestroyed()) entry.window.destroy()
    }
    this.windows.clear()
  }

  ready(sender: WebContents): void {
    for (const entry of this.windows.values()) {
      if (entry.window.webContents !== sender) continue
      entry.ready = true
      for (const payload of entry.pending.splice(0)) {
        entry.window.webContents.send(SYSTEM_CHANNELS.refreshEditor, payload)
      }
      return
    }
  }

  open(payload: EditorWindowPayload): { success: boolean; error?: string } {
    if (!payload.filePath || !payload.workspacePath) {
      return { success: false, error: 'Missing editor window payload' }
    }
    const workspaceKey = identityPath(payload.workspacePath)
    const fileKey = identityPath(payload.filePath)
    const existing = this.windows.get(workspaceKey)
    if (existing && !existing.window.isDestroyed()) {
      if (existing.window.isMinimized()) existing.window.restore()
      existing.window.show()
      existing.window.focus()
      if (existing.ready) {
        existing.window.webContents.send(SYSTEM_CHANNELS.refreshEditor, payload)
      } else if (!existing.pending.some((item) => identityPath(item.filePath ?? '') === fileKey)) {
        existing.pending.push(payload)
      }
      return { success: true }
    }
    if (existing) this.windows.delete(workspaceKey)

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
    window.on('closed', () => {
      if (this.windows.get(workspaceKey)?.window === window) this.windows.delete(workspaceKey)
    })
    window.webContents.setWindowOpenHandler((details) => {
      void shell.openExternal(details.url)
      return { action: 'deny' }
    })
    this.windows.set(workspaceKey, { window, ready: false, pending: [] })
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
