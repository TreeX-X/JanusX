import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { CPA_CHANNELS } from '../../shared/ipc/cpa'
import type { BrowserSurfaceManager } from '../browser/surface-manager'
import { CpaService } from '../cpa/service'

export function registerCpaHandlers(getMainWindow: () => BrowserWindow | null, surfaces: BrowserSurfaceManager): void {
  const service = new CpaService(surfaces)
  const authorize = (event: IpcMainInvokeEvent): void => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents
      || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('unauthorized-cpa-request')
  }
  ipcMain.handle(CPA_CHANNELS.get, (event) => { authorize(event); return service.getSettings() })
  ipcMain.handle(CPA_CHANNELS.save, (event, input: unknown) => { authorize(event); return service.saveSettings(input) })
  ipcMain.handle(CPA_CHANNELS.open, (event) => { authorize(event); return service.open() })
  ipcMain.handle(CPA_CHANNELS.close, (event) => { authorize(event); return service.close() })
  ipcMain.handle(CPA_CHANNELS.openExternal, (event) => { authorize(event); return service.openExternal() })
}
