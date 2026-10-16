import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { CPA_CHANNELS } from '../../shared/ipc/cpa'
import type { BrowserSurfaceManager } from '../browser/surface-manager'
import { CpaService } from '../cpa/service'

export function registerCpaHandlers(getMainWindow: () => BrowserWindow | null, surfaces: BrowserSurfaceManager): CpaService {
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
  ipcMain.handle(CPA_CHANNELS.status, (event) => { authorize(event); return service.status() })
  ipcMain.handle(CPA_CHANNELS.start, (event) => { authorize(event); return service.start() })
  ipcMain.handle(CPA_CHANNELS.stop, (event) => { authorize(event); return service.stop() })
  ipcMain.handle(CPA_CHANNELS.restart, (event) => { authorize(event); return service.restart() })
  ipcMain.handle(CPA_CHANNELS.update, (event) => { authorize(event); return service.update() })
  ipcMain.handle(CPA_CHANNELS.logs, (event) => { authorize(event); return service.openLogs() })
  ipcMain.handle(CPA_CHANNELS.copyKey, (event) => { authorize(event); return service.copyManagementKey() })
  return service
}
