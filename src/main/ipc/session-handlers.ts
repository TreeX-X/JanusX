import { ipcMain, type BrowserWindow } from 'electron'
import {
  SESSION_CHANNELS,
  type SessionContinueInput,
  type SessionFilter,
} from '../../shared/ipc/session'
import { agentSessionRegistry } from '../sessions/session-registry'
import { continueAgentSession } from './terminal-handlers'

export function registerSessionHandlers(getMainWindow: () => BrowserWindow | null): void {
  void agentSessionRegistry.load().catch((err) => {
    console.error('[sessions] load failed:', err)
  })
  agentSessionRegistry.setChangeListener((sessionId) => {
    const window = getMainWindow()
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
    try {
      window.webContents.send(SESSION_CHANNELS.event, { type: 'updated', sessionId })
    } catch (err) {
      console.error('[sessions] event send failed:', err)
    }
  })

  ipcMain.handle(SESSION_CHANNELS.list, async (_event, filter?: SessionFilter) => {
    await agentSessionRegistry.load().catch(() => undefined)
    return agentSessionRegistry.listSessions(filter)
  })

  ipcMain.handle(SESSION_CHANNELS.get, async (_event, { sessionId }: { sessionId: string }) => {
    await agentSessionRegistry.load().catch(() => undefined)
    return agentSessionRegistry.getSession(sessionId)
  })

  ipcMain.handle(SESSION_CHANNELS.continue, async (_event, input: SessionContinueInput) => {
    return continueAgentSession(input.sessionId, { engine: input.engine })
  })
}
