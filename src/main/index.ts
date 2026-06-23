import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { nativeImage } from 'electron'
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
import { terminalManager } from './terminal/manager'
import { agentStreamManager } from './agent/stream-manager'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const iconPath = join(__dirname, '../../resources/icon.png')
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

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  terminalManager.killAll()
  agentStreamManager.killAll()
})
