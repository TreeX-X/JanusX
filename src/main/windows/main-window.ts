import { BrowserWindow, nativeImage } from 'electron'
import { join } from 'node:path'
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
    // 默认主题为 planche 纸面：首漆底色用纸色，避免纸面主题下闪黑。
    backgroundColor: '#EFE4C5',
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
