import { app, BrowserWindow, ipcMain, nativeImage, shell } from 'electron'
import { existsSync, mkdirSync } from 'fs'
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
import { terminalManager } from './terminal/manager'
import { agentStreamManager } from './agent/stream-manager'
import { checkpointManager } from './agent/checkpoint/checkpoint-manager'
import { isAgentHookClientInvocation, runAgentHookClient } from './notifications/agent-hook-client'

const isHookClient = isAgentHookClientInvocation()
const WINDOWS_APP_USER_MODEL_ID = 'com.janusx.app'

if (isHookClient) {
  void runAgentHookClient()
    .catch(() => {})
    .finally(() => {
      process.exit(0)
    })
}

if (!isHookClient && process.platform === 'win32') {
  app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID)
}

let mainWindow: BrowserWindow | null = null
let checkpointCleanupComplete = false

function ensureWindowsNotificationShortcut(): void {
  if (process.platform !== 'win32') return

  try {
    const programsDir = join(
      app.getPath('appData'),
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
    )
    const shortcutPath = join(programsDir, 'JanusX.lnk')
    const appPath = app.getAppPath()
    const iconPath = join(__dirname, '../../resources/icon.ico')
    const details = {
      target: process.execPath,
      args: app.isPackaged ? '' : `"${appPath}"`,
      description: 'JanusX',
      appUserModelId: WINDOWS_APP_USER_MODEL_ID,
      icon: existsSync(iconPath) ? iconPath : process.execPath,
      iconIndex: 0,
    }

    mkdirSync(programsDir, { recursive: true })
    const operation = existsSync(shortcutPath) ? 'replace' : 'create'
    if (!shell.writeShortcutLink(shortcutPath, operation, details)) {
      console.warn('Windows notification shortcut was not updated')
    }
  } catch (err) {
    console.warn('Windows notification shortcut setup failed:', err)
  }
}

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

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (!isHookClient) {
  app.whenReady().then(() => {
    ensureWindowsNotificationShortcut()
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
