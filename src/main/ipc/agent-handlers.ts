import { ipcMain, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { agentStreamManager } from '../agent/stream-manager'
import { notifyAgentEvent } from '../notifications/agent-notifier'
import { configService } from '../config/service'
import type { AgentSpawnOptions } from '../agent/types'
import { subAgentRunRegistry } from '../agent/subagent-run-registry'
import type { AgentEvent } from '../agent/types'

function summarizeAgentEvent(event: AgentEvent): string {
  switch (event.type) {
    case 'text-delta':
      return 'Streaming response'
    case 'text-chunk':
      return event.text.slice(0, 120)
    case 'tool-start':
      return `Tool started: ${event.name}`
    case 'tool-end':
      return `Tool completed: ${event.id}`
    case 'phase':
      return event.label ?? event.phase
    case 'error':
      return event.message
    case 'done':
      return event.exitCode === 0 || event.exitCode === undefined ? 'Completed' : `Exited with code ${event.exitCode}`
  }
}

function statusFromAgentEvent(event: AgentEvent): 'running' | 'done' | 'failed' {
  if (event.type === 'error') return 'failed'
  if (event.type === 'done') return event.exitCode === 0 || event.exitCode === undefined ? 'done' : 'failed'
  return 'running'
}

export function registerAgentHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('agent:start', async (_event, options: AgentSpawnOptions) => {
    const sessionId = randomUUID()
    const startedAt = new Date().toISOString()

    subAgentRunRegistry.createRun({
      id: sessionId,
      source: options.source ?? 'headless',
      engine: options.engine,
      role: options.role ?? 'subagent',
      status: 'queued',
      title: options.title ?? `${options.engine} agent`,
      parentRunId: options.parentRunId,
      terminalId: options.terminalId,
      rootRunId: options.rootRunId,
      rootTerminalId: options.rootTerminalId,
      missionId: options.missionId,
      nodeId: options.nodeId,
      workspaceId: options.workspaceId,
      workspacePath: options.workspacePath ?? options.cwd,
      startedAt,
      lastEvent: 'Queued',
    })

    // Wire event forwarding to renderer
    agentStreamManager.onEvent(sessionId, (event) => {
      mainWindow.webContents.send('agent:event', { sessionId, event })
      subAgentRunRegistry.updateRun(sessionId, {
        status: statusFromAgentEvent(event),
        lastEvent: summarizeAgentEvent(event),
      })
      void configService
        .getNotificationSettings()
        .then((settings) => {
          notifyAgentEvent(
            mainWindow,
            {
              sessionId,
              engine: options.engine,
              startedAt: agentStreamManager.getSession(sessionId)?.startedAt ?? startedAt,
            },
            event,
            settings,
          )
        })
        .catch(() => {
          notifyAgentEvent(mainWindow, {
            sessionId,
            engine: options.engine,
            startedAt: agentStreamManager.getSession(sessionId)?.startedAt ?? startedAt,
          }, event)
        })
    })

    void agentStreamManager
      .startWithId(sessionId, options)
      .then(() => {
        subAgentRunRegistry.updateRun(sessionId, {
          status: 'running',
          lastEvent: 'Started',
        })
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        subAgentRunRegistry.updateRun(sessionId, {
          status: 'failed',
          lastEvent: message,
        })
      })

    return { sessionId }
  })

  ipcMain.handle('agent:cancel', async (_event, { sessionId }: { sessionId: string }) => {
    agentStreamManager.cancel(sessionId)
    subAgentRunRegistry.finishRun(sessionId, 'cancelled', 'Cancelled')
    return { success: true }
  })

  ipcMain.handle('agent:cancelAll', async () => {
    agentStreamManager.cancelAll()
    for (const run of subAgentRunRegistry.listRuns()) {
      if (run.source === 'headless' && (run.status === 'queued' || run.status === 'running')) {
        subAgentRunRegistry.finishRun(run.id, 'cancelled', 'Cancelled')
      }
    }
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
