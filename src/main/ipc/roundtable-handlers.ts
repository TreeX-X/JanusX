import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { ROUNDTABLE_CHANNELS } from '../../shared/ipc/roundtable'
import { roundtableService } from '../roundtable/service'

let subscribed = false
export function registerRoundtableHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(ROUNDTABLE_CHANNELS.start, (_event, input: string) => roundtableService.start(input))
  ipcMain.handle(ROUNDTABLE_CHANNELS.advance, (_event, sessionId: string, input?: string) => roundtableService.advance(sessionId, input))
  ipcMain.handle(ROUNDTABLE_CHANNELS.end, (_event, sessionId: string) => roundtableService.end(sessionId))
  ipcMain.handle(ROUNDTABLE_CHANNELS.state, (_event, sessionId: string) => roundtableService.getState(sessionId))
  ipcMain.handle(ROUNDTABLE_CHANNELS.restore, (_event, sessionId: string) => roundtableService.restore(sessionId))
  ipcMain.handle(ROUNDTABLE_CHANNELS.export, (_event, sessionId: string) => roundtableService.exportMarkdown(sessionId))
  if (!subscribed) {
    subscribed = true
    roundtableService.onEvent((event) => {
      const window = getMainWindow()
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(ROUNDTABLE_CHANNELS.event, event)
    })
  }
}
