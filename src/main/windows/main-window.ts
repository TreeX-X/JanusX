import { BrowserWindow, nativeImage } from 'electron'
import { join } from 'path'
import { installProductionCsp } from '../bootstrap/session'
import { loadRendererWindow } from './renderer-loader'

export function createMainWindow(onClosed: () => void): BrowserWindow {
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const appIcon = nativeImage.createFromPath(join(__dirname, '../../../resources', iconFile))
  const window = new BrowserWindow({
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
      preload: join(__dirname, '../../preload/index.mjs'),
      sandbox: false,
      webSecurity: true,
      webviewTag: false,
    },
  })
  installProductionCsp(window.webContents.session)
  window.on('closed', onClosed)
  void loadRendererWindow(window)
  return window
}
