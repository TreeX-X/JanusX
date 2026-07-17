import { useCallback, useEffect, useState } from 'react'
import styles from './DesktopToastApp.module.css'

interface DesktopToastPayload {
  id?: string
  type?: 'completed' | 'failed' | 'attention'
  engine?: string
  title?: string
  body?: string
  terminalId?: string
  workspaceId?: string
  createdAt?: string
}

interface DesktopToastState {
  id: string
  type: 'completed' | 'failed' | 'attention'
  title: string
  body: string
  engine?: string
}

function normalizePayload(payload: unknown): DesktopToastState | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as DesktopToastPayload
  if (typeof record.title !== 'string' || typeof record.body !== 'string') return null

  const type =
    record.type === 'completed' || record.type === 'failed' || record.type === 'attention'
      ? record.type
      : 'attention'

  return {
    id: typeof record.id === 'string' ? record.id : crypto.randomUUID(),
    type,
    title: record.title,
    body: record.body,
    engine: typeof record.engine === 'string' ? record.engine : undefined,
  }
}

export function DesktopToastApp() {
  const [toast, setToast] = useState<DesktopToastState | null>(null)
  const [closing, setClosing] = useState(false)

  const sendAction = useCallback((action: 'activate' | 'dismiss') => {
    setClosing(true)
    window.setTimeout(() => {
      window.electron.desktopToast.action(action)
      setToast(null)
      setClosing(false)
    }, 120)
  }, [])

  useEffect(() => {
    document.body.classList.add('desktop-toast-body')
    window.electron.desktopToast.ready()

    const unsubscribe = window.electron.desktopToast.onShow((payload) => {
      const nextToast = normalizePayload(payload)
      if (!nextToast) return
      setClosing(false)
      setToast(nextToast)
    })

    return () => {
      document.body.classList.remove('desktop-toast-body')
      unsubscribe()
    }
  }, [])

  if (!toast) return <div className={styles.empty} />

  return (
    <div className={styles.viewport}>
      <section className={`${styles.toast} ${styles[toast.type]} ${closing ? styles.closing : ''}`}>
        <div className={styles.filamentSpine} />
        <button
          type="button"
          className={styles.content}
          onClick={() => sendAction('activate')}
          aria-label="Open JanusX notification"
        >
          <span className={styles.kicker}>{toast.engine ?? 'Agent'}</span>
          <span className={styles.title}>{toast.title}</span>
          <span className={styles.body}>{toast.body}</span>
        </button>
        <div className={styles.controlColumn}>
          <button
            type="button"
            className={styles.close}
            aria-label="Dismiss notification"
            onClick={() => sendAction('dismiss')}
          />
        </div>
      </section>
    </div>
  )
}
