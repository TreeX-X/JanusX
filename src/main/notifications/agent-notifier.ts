import { BrowserWindow, Notification } from 'electron'
import type { AgentEvent, AgentSpawnOptions } from '../agent/types'

interface AgentNotificationContext {
  sessionId: string
  engine: AgentSpawnOptions['engine']
}

export function notifyAgentEvent(
  mainWindow: BrowserWindow,
  context: AgentNotificationContext,
  event: AgentEvent,
): void {
  if (event.type !== 'done' && event.type !== 'error') return
  if (!Notification.isSupported()) return
  if (mainWindow.isDestroyed()) return

  const isFailure =
    event.type === 'error' ||
    (event.type === 'done' && typeof event.exitCode === 'number' && event.exitCode !== 0)

  const notification = new Notification({
    title: isFailure ? 'JanusX - Agent 执行失败' : 'JanusX - Agent 任务已完成',
    body: isFailure
      ? `${context.engine} 会话遇到问题，点击返回 JanusX 查看详情。`
      : `${context.engine} 会话已结束，点击返回 JanusX 查看结果。`,
  })

  notification.on('click', () => {
    if (mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  notification.show()
}
