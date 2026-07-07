import { app, BrowserWindow, ipcMain, nativeImage, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerWorkspaceHandlers } from './ipc/handlers'
import { registerTerminalHandlers } from './ipc/terminal-handlers'
import { registerGitHandlers } from './ipc/git-handlers'
import { registerAgentHandlers } from './ipc/agent-handlers'
import { registerCheckpointHandlers } from './ipc/checkpoint-handlers'
import { registerFileHandlers } from './ipc/file-handlers'
import { registerProjectHandlers } from './ipc/project-handlers'
import { registerLlmHandlers } from './ipc/llm-handlers'
import { registerJanusHandlers } from './ipc/janus-handlers'
import { registerRuntimeTelemetryHandlers } from './ipc/runtime-telemetry-handlers'
import { registerSettingsHandlers } from './ipc/settings-handlers'
import { registerSubAgentRunHandlers } from './ipc/subagent-run-handlers'
import { registerKnowledgeHandlers } from './ipc/knowledge-handlers'
import { terminalManager } from './terminal/manager'
import { agentStreamManager } from './agent/stream-manager'
import { checkpointManager } from './agent/checkpoint/checkpoint-manager'
import { isAgentHookClientInvocation, runAgentHookClient } from './notifications/agent-hook-client'

const isHookClient = isAgentHookClientInvocation()

if (isHookClient) {
  void runAgentHookClient()
    .catch(() => {})
    .finally(() => {
      process.exit(0)
    })
}

let mainWindow: BrowserWindow | null = null
let checkpointCleanupComplete = false
const editorWindows = new Map<string, BrowserWindow>()

function createWindow(): void {
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const iconPath = join(__dirname, '../../resources', iconFile)
  const appIcon = nativeImage.createFromPath(iconPath)

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'JanusX',
    icon: appIcon,
    frame: false,
    backgroundColor: '#121212',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })

  // 注册 IPC handlers
  registerWorkspaceHandlers(mainWindow)
  registerTerminalHandlers(mainWindow)
  registerGitHandlers()
  registerAgentHandlers(mainWindow)
  registerCheckpointHandlers()
  registerFileHandlers()
  registerProjectHandlers()
  registerLlmHandlers()
  registerJanusHandlers(mainWindow)
  registerRuntimeTelemetryHandlers()
  registerSettingsHandlers()
  registerSubAgentRunHandlers(mainWindow)
  registerKnowledgeHandlers()

  // 窗口控制 IPC
  ipcMain.handle('window:minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })
  ipcMain.handle('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      win.isMaximized() ? win.unmaximize() : win.maximize()
    }
  })
  ipcMain.handle('window:close', () => {
    BrowserWindow.getFocusedWindow()?.close()
  })

  ipcMain.handle('editor-window:open', (_event, payload: { filePath?: string; workspacePath?: string }) => {
    if (!payload.filePath || !payload.workspacePath) {
      return { success: false, error: 'Missing editor window payload' }
    }

    const existing = editorWindows.get(payload.filePath)
    if (existing && !existing.isDestroyed()) {
      existing.focus()
      return { success: true }
    }

    const editorWindow = new BrowserWindow({
      width: 1100,
      height: 760,
      minWidth: 820,
      minHeight: 520,
      title: 'JanusX Editor',
      backgroundColor: '#0a0a0a',
      frame: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false,
      },
    })

    editorWindow.on('closed', () => {
      editorWindows.delete(payload.filePath!)
    })

    editorWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    editorWindows.set(payload.filePath, editorWindow)

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      const url = new URL(process.env['ELECTRON_RENDERER_URL'])
      url.searchParams.set('editorWindow', '1')
      url.searchParams.set('editorFile', payload.filePath)
      url.searchParams.set('workspacePath', payload.workspacePath)
      editorWindow.loadURL(url.toString())
    } else {
      editorWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        query: {
          editorWindow: '1',
          editorFile: payload.filePath,
          workspacePath: payload.workspacePath,
        },
      })
    }

    return { success: true }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (!isHookClient) {
  app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', (event) => {
    terminalManager.killAll()
    agentStreamManager.killAll()

    if (checkpointCleanupComplete) return

    event.preventDefault()
    checkpointCleanupComplete = true
    checkpointManager
      .clearAllLoaded()
      .catch((err) => {
        console.error('Checkpoint cleanup failed:', err)
      })
      .finally(() => {
        app.quit()
      })
  })
}
