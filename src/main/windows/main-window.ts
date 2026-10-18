import { BrowserWindow, nativeImage } from 'electron'
import { join } from 'node:path'
import { installProductionCsp } from '../bootstrap/session'
import { loadRendererWindow } from './renderer-loader'
import { configService } from '../config/service'
import { getThemeDefinition } from '../../shared/theme/registry'

export function createMainWindow(onClosed: () => void): BrowserWindow {
  // Bootstrap loads the profile before creating any main window.
  // Note: .agents/notes/workbench/standalone-editor-initial-theme.md
  const theme = getThemeDefinition(configService.getCachedTheme())
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
    show: false,
    backgroundColor: theme.tokens['shell-canvas'],
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../../preload/index.mjs'),
      sandbox: false,
      webSecurity: true,
      webviewTag: false,
    },
  })
  installProductionCsp(window.webContents.session)
  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) window.show()
  })
  window.on('closed', onClosed)
  const query = {
    initialTheme: theme.id,
    initialBackground: theme.tokens['shell-canvas'],
    initialColorScheme: theme.base,
  }
  void loadRendererWindow(window, (url) => {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  }, query)
  return window
}
