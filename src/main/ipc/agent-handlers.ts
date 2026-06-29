import { ipcMain, BrowserWindow } from 'electron'
import { agentStreamManager } from '../agent/stream-manager'
import { notifyAgentEvent } from '../notifications/agent-notifier'
import { configService } from '../config/service'
import type { AgentSpawnOptions } from '../agent/types'

export function registerAgentHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('agent:start', async (_event, options: AgentSpawnOptions) => {
    const sessionId = await agentStreamManager.start(options)
    const sessionStartedAt = agentStreamManager.getSession(sessionId)?.startedAt

    // Wire event forwarding to renderer
    agentStreamManager.onEvent(sessionId, (event) => {
      mainWindow.webContents.send('agent:event', { sessionId, event })
      void configService
        .getNotificationSettings()
        .then((settings) => {
          notifyAgentEvent(
            mainWindow,
            {
              sessionId,
              engine: options.engine,
              startedAt: agentStreamManager.getSession(sessionId)?.startedAt ?? sessionStartedAt,
            },
            event,
            settings,
          )
        })
        .catch(() => {
          notifyAgentEvent(mainWindow, {
            sessionId,
            engine: options.engine,
            startedAt: agentStreamManager.getSession(sessionId)?.startedAt ?? sessionStartedAt,
          }, event)
        })
    })

    return { sessionId }
  })

  ipcMain.handle('agent:cancel', async (_event, { sessionId }: { sessionId: string }) => {
    agentStreamManager.cancel(sessionId)
    return { success: true }
  })

  ipcMain.handle('agent:cancelAll', async () => {
    agentStreamManager.cancelAll()
    return { success: true }
  })

  ipcMain.handle('agent:listSessions', async () => {
    return agentStreamManager.listSessions().map(s => ({
      id: s.id,
      engine: s.engine,
      startedAt: s.startedAt,
      status: s.status,
    }))
  })
}
