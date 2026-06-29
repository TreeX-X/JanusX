import { BrowserWindow, Notification } from 'electron'
import type { AgentEvent, AgentSpawnOptions } from '../agent/types'
import {
  DEFAULT_AGENT_NOTIFICATION_SETTINGS,
  normalizeAgentNotificationSettings,
  type AgentNotificationSettings,
} from '../../shared/notifications'

interface AgentNotificationContext {
  sessionId: string
  engine: AgentSpawnOptions['engine']
  startedAt?: string
}

function getElapsedSeconds(startedAt?: string): number | null {
  if (!startedAt) return null
  const timestamp = Date.parse(startedAt)
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
}

function truncateMessage(message: string, maxLength: number): string {
  const clean = message.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, Math.max(0, maxLength - 3))}...`
}

export function notifyAgentEvent(
  mainWindow: BrowserWindow,
  context: AgentNotificationContext,
  event: AgentEvent,
  settings: AgentNotificationSettings = DEFAULT_AGENT_NOTIFICATION_SETTINGS,
): void {
  if (event.type !== 'done' && event.type !== 'error') return
  if (!Notification.isSupported()) return
  if (mainWindow.isDestroyed()) return

  const resolvedSettings = normalizeAgentNotificationSettings(settings)
  if (!resolvedSettings.desktopEnabled) return

  const isFailure =
    event.type === 'error' ||
    (event.type === 'done' && typeof event.exitCode === 'number' && event.exitCode !== 0)

  if (!isFailure && !resolvedSettings.notifyOnSuccess) return
  if (isFailure && !resolvedSettings.notifyOnFailure) return

  const elapsedSeconds = getElapsedSeconds(context.startedAt)
  if (
    elapsedSeconds !== null &&
    resolvedSettings.minDurationSeconds > 0 &&
    elapsedSeconds < resolvedSettings.minDurationSeconds
  ) {
    return
  }

  const failureBody =
    resolvedSettings.includeErrorMessage && event.type === 'error' && event.message.trim()
      ? `${context.engine} 会话失败：${truncateMessage(
          event.message,
          resolvedSettings.errorMessageMaxLength,
        )}`
      : `${context.engine} 会话遇到问题，点击返回 JanusX 查看详情。`

  const notification = new Notification({
    title: isFailure ? 'JanusX - Agent 执行失败' : 'JanusX - Agent 任务已完成',
    body: isFailure ? failureBody : `${context.engine} 会话已结束，点击返回 JanusX 查看结果。`,
  })

  notification.on('click', () => {
    if (mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  notification.show()
}
