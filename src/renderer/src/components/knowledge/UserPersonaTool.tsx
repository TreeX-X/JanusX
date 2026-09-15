import { useCallback, useEffect, useRef, useState } from 'react'
import type { UserMemoryOverview } from '../../../../shared/knowledge'
import { getUserMemoryOverview } from '../../services/knowledge'
import { useAppStore } from '../../stores/app'
import { useI18n } from '@/i18n/useI18n'
import styles from './KnowledgeAssist.module.css'
import { UserPersonaCards } from './UserPersonaCards'

type LoadState = 'loading' | 'ready' | 'error'

/**
 * Persona RightDock tool (M4). Loads the workspace-free user overview on
 * mount; cards show state only, and the single action navigates to the
 * Workbench Inbox. Enabled with no workspace mounted.
 */
export function UserPersonaTool() {
  const { t } = useI18n('knowledge')
  const setActiveWorkbench = useAppStore((s) => s.setActiveWorkbench)
  const [overview, setOverview] = useState<UserMemoryOverview | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    void getUserMemoryOverview().then((next) => {
      if (!mountedRef.current) return
      if (next) {
        setOverview(next)
        setLoadState('ready')
      } else {
        setLoadState('error')
      }
    }).catch(() => {
      if (mountedRef.current) setLoadState('error')
    })
    return () => {
      mountedRef.current = false
    }
  }, [])

  const openInbox = useCallback(() => {
    setActiveWorkbench('knowledge')
  }, [setActiveWorkbench])

  return (
    <section className={styles.root} aria-label={t('knowledge:persona.toolAria')}>
      {loadState === 'loading' && (
        <div className={styles.state}>
          <strong>{t('knowledge:state.loading.title')}</strong>
          <span>{t('knowledge:state.loading.detail')}</span>
        </div>
      )}
      {loadState === 'error' && (
        <div className={styles.state}>
          <strong>{t('knowledge:persona.unavailable.title')}</strong>
          <span>{t('knowledge:persona.unavailable.detail')}</span>
        </div>
      )}
      {loadState === 'ready' && overview && (
        <UserPersonaCards overview={overview} onOpenInbox={openInbox} />
      )}
    </section>
  )
}
