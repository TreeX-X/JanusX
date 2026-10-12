import { ipcMain, BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { agentStreamManager } from '../janus-runner/stream-manager'
import { notifyAgentEvent } from '../notifications/agent-notifier'
import { configService } from '../config/service'
import type { AgentSpawnOptions } from '../janus-runner/types'
import { normalizeAgentApprovalMode } from '../../shared/ipc/agent-runtime'
import { subAgentRunRegistry } from '../janus-runner/subagent-run-registry'
import type { AgentEvent } from '../janus-runner/types'
import { AGENT_CHANNELS } from '../../shared/ipc/janus-runner'

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

export function registerAgentHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(AGENT_CHANNELS.start, async (_event, options: AgentSpawnOptions) => {
    const effectiveOptions: AgentSpawnOptions = { ...options, approvalMode: normalizeAgentApprovalMode(options.approvalMode ?? await configService.getAgentApprovalMode()) }
    const sessionId = randomUUID()
    const startedAt = new Date().toISOString()

    subAgentRunRegistry.createRun({
      id: sessionId,
      source: effectiveOptions.source ?? 'headless',
      engine: effectiveOptions.engine,
      role: effectiveOptions.role ?? 'subagent',
      status: 'queued',
      title: effectiveOptions.title ?? `${effectiveOptions.engine} agent`,
      parentRunId: effectiveOptions.parentRunId,
      terminalId: effectiveOptions.terminalId,
      rootRunId: effectiveOptions.rootRunId,
      rootTerminalId: effectiveOptions.rootTerminalId,
      missionId: effectiveOptions.missionId,
      nodeId: effectiveOptions.nodeId,
      workspaceId: effectiveOptions.workspaceId,
      workspacePath: effectiveOptions.workspacePath ?? effectiveOptions.cwd,
      startedAt,
      lastEvent: 'Queued',
    })

    // Wire event forwarding to renderer
    agentStreamManager.onEvent(sessionId, (event) => {
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send(AGENT_CHANNELS.event, { sessionId, event })
      }
      subAgentRunRegistry.updateRun(sessionId, {
        status: statusFromAgentEvent(event),
        lastEvent: summarizeAgentEvent(event),
      })
      if (mainWindow) {
        void configService
          .getNotificationSettings()
          .then((settings) => {
            notifyAgentEvent(
              mainWindow,
              {
                sessionId,
                engine: effectiveOptions.engine,
                startedAt: agentStreamManager.getSession(sessionId)?.startedAt ?? startedAt,
              },
              event,
              settings,
            )
          })
          .catch(() => {
            notifyAgentEvent(mainWindow, {
              sessionId,
              engine: effectiveOptions.engine,
              startedAt: agentStreamManager.getSession(sessionId)?.startedAt ?? startedAt,
            }, event)
          })
      }
    })

    void agentStreamManager
      .startWithId(sessionId, effectiveOptions)
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

  ipcMain.handle(AGENT_CHANNELS.cancel, async (_event, { sessionId }: { sessionId: string }) => {
    agentStreamManager.cancel(sessionId)
    subAgentRunRegistry.finishRun(sessionId, 'cancelled', 'Cancelled')
    return { success: true }
  })

  ipcMain.handle(AGENT_CHANNELS.cancelAll, async () => {
    agentStreamManager.cancelAll()
    for (const run of subAgentRunRegistry.listRuns()) {
      if (run.source === 'headless' && (run.status === 'queued' || run.status === 'running')) {
        subAgentRunRegistry.finishRun(run.id, 'cancelled', 'Cancelled')
      }
    }
    return { success: true }
  })

  ipcMain.handle(AGENT_CHANNELS.listSessions, async () => {
    return agentStreamManager.listSessions().map(s => ({
      id: s.id,
      engine: s.engine,
      startedAt: s.startedAt,
      status: s.status,
    }))
  })
}
