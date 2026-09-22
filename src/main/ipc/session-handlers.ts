import { ipcMain, type BrowserWindow } from 'electron'
import {
  SESSION_CHANNELS,
  type SessionContinueInput,
  type SessionFilter,
  type ShellRestoreManifest,
} from '../../shared/ipc/session'
import { agentSessionRegistry } from '../sessions/session-registry'
import { scanExternalSessions } from '../sessions/external-session-scanner'
import { continueAgentSession } from './terminal-handlers'

export function registerSessionHandlers(getMainWindow: () => BrowserWindow | null): void {
  void agentSessionRegistry
    .load()
    .then(() => scanExternalSessions(agentSessionRegistry).catch((err) => console.error('[sessions] boot backfill failed:', err)))
    .catch((err) => {
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

  ipcMain.handle(SESSION_CHANNELS.scanExternal, async () => {
    await agentSessionRegistry.load().catch(() => undefined)
    return scanExternalSessions(agentSessionRegistry)
  })

  ipcMain.handle(SESSION_CHANNELS.saveLayout, async (_event, layout: ShellRestoreManifest) => {
    await agentSessionRegistry.saveLayout(layout)
    return { success: true }
  })

  ipcMain.handle(SESSION_CHANNELS.getLayout, async () => {
    return agentSessionRegistry.getLayout()
  })

  ipcMain.handle(SESSION_CHANNELS.clearLayout, async () => {
    await agentSessionRegistry.clearLayout()
    return { success: true }
  })
}
