import { app, BrowserWindow, ipcMain, nativeImage, shell } from 'electron'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { isAgentHookClientInvocation, runAgentHookClient } from './notifications/agent-hook-client'

const isHookClient = isAgentHookClientInvocation()

function canWriteDirectory(directory: string): boolean {
  try {
    mkdirSync(directory, { recursive: true })
    const probePath = join(directory, `.janusx-write-test-${process.pid}`)
    writeFileSync(probePath, '')
    unlinkSync(probePath)
    return true
  } catch {
    return false
  }
}

function configureChromiumSessionPaths(): void {
  if (isHookClient) {
    const hookDataRoot = join(tmpdir(), 'JanusX', 'hook-client', String(process.pid))
    const hookSessionData = join(hookDataRoot, 'session')
    const hookCacheData = join(hookDataRoot, 'Cache')
    if (
      !canWriteDirectory(hookDataRoot) ||
      !canWriteDirectory(hookSessionData) ||
      !canWriteDirectory(hookCacheData)
    ) {
      return
    }

    app.setPath('userData', hookDataRoot)
    app.setPath('sessionData', hookSessionData)
    app.commandLine.appendSwitch('disk-cache-dir', hookCacheData)
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
    app.disableHardwareAcceleration()
    return
  }

  const preferredSessionData = join(app.getPath('userData'), 'chromium-session')
  const sessionDataPath = canWriteDirectory(preferredSessionData)
    ? preferredSessionData
    : join(tmpdir(), 'JanusX', 'chromium-session', String(process.pid))

  if (!canWriteDirectory(sessionDataPath)) return

  app.setPath('sessionData', sessionDataPath)
  app.commandLine.appendSwitch('disk-cache-dir', join(sessionDataPath, 'Cache'))
}

configureChromiumSessionPaths()

if (isHookClient) {
  void runAgentHookClient()
    .catch(() => {})
    .finally(() => {
      process.exit(0)
    })
} else {
  void bootstrapApp()
}

async function bootstrapApp(): Promise<void> {
  const [
    { is },
    { registerWorkspaceHandlers },
    { registerTerminalHandlers },
    { registerGitHandlers },
    { registerAgentHandlers },
    { registerCheckpointHandlers },
    { registerFileHandlers },
    { registerProjectHandlers },
    { registerLlmHandlers },
    { registerJanusHandlers },
    { registerRuntimeTelemetryHandlers },
    { registerSettingsHandlers },
    { registerSubAgentRunHandlers },
    { registerKnowledgeHandlers },
    { terminalManager },
    { agentStreamManager },
    { checkpointManager },
  ] = await Promise.all([
    import('@electron-toolkit/utils'),
    import('./ipc/handlers'),
    import('./ipc/terminal-handlers'),
    import('./ipc/git-handlers'),
    import('./ipc/agent-handlers'),
    import('./ipc/checkpoint-handlers'),
    import('./ipc/file-handlers'),
    import('./ipc/project-handlers'),
    import('./ipc/llm-handlers'),
    import('./ipc/janus-handlers'),
    import('./ipc/runtime-telemetry-handlers'),
    import('./ipc/settings-handlers'),
    import('./ipc/subagent-run-handlers'),
    import('./ipc/knowledge-handlers'),
    import('./terminal/manager'),
    import('./agent/stream-manager'),
    import('./agent/checkpoint/checkpoint-manager'),
  ])

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

  const hasSingleInstanceLock = app.requestSingleInstanceLock()

  if (!hasSingleInstanceLock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        if (app.isReady()) createWindow()
        return
      }

      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    })

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
}
