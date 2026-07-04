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
  endedAt?: string
}

interface AgentNotificationOptions {
  onClick?: () => void
  onNativeShow?: () => void
  onNativeFailure?: (error: string) => void
  onRendererFallback?: (reason: string, delivered: boolean) => void
  rendererFallbackDelayMs?: number
  terminalId?: string
  workspaceId?: string
}

interface RendererNotificationPayload {
  type: 'completed' | 'failed' | 'attention'
  engine: AgentNotificationContext['engine']
  title: string
  body: string
  terminalId?: string
  workspaceId?: string
}

const DEFAULT_RENDERER_FALLBACK_DELAY_MS = 4000

function getElapsedSeconds(startedAt?: string, endedAt?: string): number | null {
  if (!startedAt) return null
  const timestamp = Date.parse(startedAt)
  if (!Number.isFinite(timestamp)) return null
  const endedTimestamp = endedAt ? Date.parse(endedAt) : NaN
  const end = Number.isFinite(endedTimestamp) ? endedTimestamp : Date.now()
  return Math.max(0, Math.floor((end - timestamp) / 1000))
}

function truncateMessage(message: string, maxLength: number): string {
  const clean = message.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, Math.max(0, maxLength - 3))}...`
}

function focusMainWindow(mainWindow: BrowserWindow, options: AgentNotificationOptions): void {
  if (mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  options.onClick?.()
}

function sendRendererNotification(
  mainWindow: BrowserWindow,
  payload: RendererNotificationPayload,
): boolean {
  if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return false

  mainWindow.webContents.send('agent-notification:show', {
    id: `${payload.type}:${payload.engine}:${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...payload,
  })
  return true
}

function showNotificationWithFallback(
  mainWindow: BrowserWindow,
  payload: RendererNotificationPayload,
  options: AgentNotificationOptions,
): boolean {
  const sendFallback = (reason: string): boolean => {
    const delivered = sendRendererNotification(mainWindow, payload)
    options.onRendererFallback?.(reason, delivered)
    return delivered
  }

  if (!Notification.isSupported()) {
    return sendFallback('native-notification-unsupported')
  }

  let nativeSettled = false
  let fallbackSent = false
  let notification: Notification | null = null
  const sendFallbackOnce = (reason: string): boolean => {
    if (fallbackSent) return false
    fallbackSent = true
    return sendFallback(reason)
  }

  try {
    notification = new Notification({ title: payload.title, body: payload.body })
    notification.on('click', () => focusMainWindow(mainWindow, options))
    notification.on('show', () => {
      nativeSettled = true
      options.onNativeShow?.()
    })
    notification.on('failed', (_event, error) => {
      nativeSettled = true
      options.onNativeFailure?.(error)
      sendFallbackOnce(`native-notification-failed: ${error}`)
    })
    notification.show()
  } catch (error) {
    nativeSettled = true
    const message = error instanceof Error ? error.message : String(error)
    options.onNativeFailure?.(message)
    sendFallbackOnce(`native-notification-threw: ${message}`)
  }

  const fallbackTimer = setTimeout(() => {
    if (nativeSettled) return
    nativeSettled = true
    try {
      notification?.close()
    } catch {
      // ignore native notification close errors; renderer fallback is the recovery path.
    }
    sendFallbackOnce('native-notification-show-timeout')
  }, options.rendererFallbackDelayMs ?? DEFAULT_RENDERER_FALLBACK_DELAY_MS)
  fallbackTimer.unref?.()

  return true
}

export function notifyAgentEvent(
  mainWindow: BrowserWindow,
  context: AgentNotificationContext,
  event: AgentEvent,
  settings: AgentNotificationSettings = DEFAULT_AGENT_NOTIFICATION_SETTINGS,
  options: AgentNotificationOptions = {},
): boolean {
  if (event.type !== 'done' && event.type !== 'error') return false
  if (mainWindow.isDestroyed()) return false

  const resolvedSettings = normalizeAgentNotificationSettings(settings)
  if (!resolvedSettings.desktopEnabled) return false

  const isFailure =
    event.type === 'error' ||
    (event.type === 'done' && typeof event.exitCode === 'number' && event.exitCode !== 0)

  if (!isFailure && !resolvedSettings.notifyOnSuccess) return false
  if (isFailure && !resolvedSettings.notifyOnFailure) return false

  const elapsedSeconds = getElapsedSeconds(context.startedAt, context.endedAt)
  if (
    elapsedSeconds !== null &&
    resolvedSettings.minDurationSeconds > 0 &&
    elapsedSeconds < resolvedSettings.minDurationSeconds
  ) {
    return false
  }

  const failureBody =
    resolvedSettings.includeErrorMessage && event.type === 'error' && event.message.trim()
      ? `${context.engine} session failed: ${truncateMessage(
          event.message,
          resolvedSettings.errorMessageMaxLength,
        )}`
      : `${context.engine} session needs attention. Click to return to JanusX.`

  const title = isFailure ? 'JanusX - Agent failed' : 'JanusX - Agent completed'
  const body = isFailure ? failureBody : `${context.engine} session completed. Click to return to JanusX.`

  return showNotificationWithFallback(mainWindow, {
    type: isFailure ? 'failed' : 'completed',
    engine: context.engine,
    title,
    body,
    terminalId: options.terminalId,
    workspaceId: options.workspaceId,
  }, options)
}

export function notifyAgentAttention(
  mainWindow: BrowserWindow,
  context: AgentNotificationContext,
  message: string | undefined,
  settings: AgentNotificationSettings = DEFAULT_AGENT_NOTIFICATION_SETTINGS,
  options: AgentNotificationOptions = {},
): boolean {
  if (mainWindow.isDestroyed()) return false

  const resolvedSettings = normalizeAgentNotificationSettings(settings)
  if (!resolvedSettings.desktopEnabled) return false

  const title = `JanusX - ${context.engine} needs attention`
  const body = message?.trim()
    ? truncateMessage(message, resolvedSettings.errorMessageMaxLength)
    : `Click to return to JanusX and handle the ${context.engine} request.`

  return showNotificationWithFallback(mainWindow, {
    type: 'attention',
    engine: context.engine,
    title,
    body,
    terminalId: options.terminalId,
    workspaceId: options.workspaceId,
  }, options)
}
