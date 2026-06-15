import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export interface WindowConfig {
  width: number
  height: number
  minWidth: number
  minHeight: number
  title: string
  backgroundColor: string
}

export const DEFAULT_WINDOW_CONFIG: WindowConfig = {
  width: 1400,
  height: 900,
  minWidth: 1000,
  minHeight: 600,
  title: 'JanusX',
  backgroundColor: '#121212',
}

export function createMainWindow(config: Partial<WindowConfig> = {}): BrowserWindow {
  const merged = { ...DEFAULT_WINDOW_CONFIG, ...config }

  const mainWindow = new BrowserWindow({
    width: merged.width,
    height: merged.height,
    minWidth: merged.minWidth,
    minHeight: merged.minHeight,
    title: merged.title,
    backgroundColor: merged.backgroundColor,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}
