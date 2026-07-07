import { useCallback, useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'

interface AgentNotificationPayload {
  id?: string
  type?: 'completed' | 'failed' | 'attention'
  engine?: string
  title?: string
  body?: string
  terminalId?: string
  workspaceId?: string
  createdAt?: string
}

interface AgentNotificationToast extends Required<Pick<AgentNotificationPayload, 'id' | 'title' | 'body'>> {
  type: AgentNotificationPayload['type']
  engine?: string
  terminalId?: string
  workspaceId?: string
}

const TOAST_TTL_MS = 8_000
const MAX_TOASTS = 3

function getNotificationKicker(toast: AgentNotificationToast): string {
  if (toast.engine) return toast.engine
  if (toast.type === 'completed') return 'Janus Engine'
  if (toast.type === 'failed') return 'System Daemon'
  return 'Janus Protocol'
}

function normalizePayload(payload: unknown): AgentNotificationToast | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as AgentNotificationPayload
  if (typeof record.title !== 'string' || typeof record.body !== 'string') return null

  return {
    id: typeof record.id === 'string' ? record.id : crypto.randomUUID(),
    type: record.type,
    engine: typeof record.engine === 'string' ? record.engine : undefined,
    title: record.title,
    body: record.body,
    terminalId: typeof record.terminalId === 'string' ? record.terminalId : undefined,
    workspaceId: typeof record.workspaceId === 'string' ? record.workspaceId : undefined,
  }
}

function focusTerminal(terminalId: string, workspaceId?: string): void {
  const store = useWorkspaceStore.getState()
  const setLoadState = useAppStore.getState().setLoadState

  if (store.terminals.some((terminal) => terminal.id === terminalId)) {
    store.setActiveTerminal(terminalId)
    setLoadState('terminal-active')
    return
  }

  const targetWorkspaceId =
    workspaceId ??
    Object.entries(store.terminalSnapshots).find(([, snapshot]) =>
      snapshot.terminals.some((terminal) => terminal.id === terminalId),
    )?.[0]

  if (!targetWorkspaceId) return
  store.setActiveWorkspace(targetWorkspaceId)
  requestAnimationFrame(() => {
    useWorkspaceStore.getState().setActiveTerminal(terminalId)
    useAppStore.getState().setLoadState('terminal-active')
  })
}

export function AgentNotificationHost() {
  const [toasts, setToasts] = useState<AgentNotificationToast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  useEffect(() => {
    const unsubscribe = window.electron.on('agent-notification:show', (payload: unknown) => {
      const toast = normalizePayload(payload)
      if (!toast) return

      setToasts((current) => [toast, ...current.filter((item) => item.id !== toast.id)].slice(0, MAX_TOASTS))
      window.setTimeout(() => dismiss(toast.id), TOAST_TTL_MS)
    })

    return unsubscribe
  }, [dismiss])

  if (toasts.length === 0) return null

  return (
    <div className="agent-notification-stack" aria-live="polite" aria-label="Agent notifications">
      {toasts.map((toast) => (
        <div key={toast.id} className={`agent-notification agent-notification--${toast.type ?? 'attention'}`}>
          <button
            type="button"
            className="agent-notification__content"
            onClick={() => {
              if (toast.terminalId) focusTerminal(toast.terminalId, toast.workspaceId)
              dismiss(toast.id)
            }}
          >
            <span className="agent-notification__meta">
              <span className="agent-notification__led" />
              <span className="agent-notification__kicker">{getNotificationKicker(toast)}</span>
            </span>
            <span className="agent-notification__title">{toast.title}</span>
            <span className="agent-notification__body">{toast.body}</span>
          </button>
          <button
            type="button"
            className="agent-notification__close"
            aria-label="Dismiss notification"
            onClick={() => dismiss(toast.id)}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  )
}
