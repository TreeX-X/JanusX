import { useCallback, useEffect, useRef, useState } from 'react'
import type { UserMemoryOverview, UserMemoryOverviewHabit } from '../../../../shared/knowledge'
import { getUserMemoryOverview } from '../../services/knowledge'
import { useRightToolStore } from '../../stores/right-tools'
import { useI18n } from '@/i18n/useI18n'
import styles from './KnowledgeAssist.module.css'
import { UserPersonaCards } from './UserPersonaCards'
import { PersonalMemoryCorrectionForm } from './PersonalMemoryCorrectionForm'

type LoadState = 'loading' | 'ready' | 'error'

/**
 * Persona RightDock tool (M4). Loads the workspace-free user overview on
 * activation; explicit corrections are proposed to the shared review tool.
 * Enabled with no workspace mounted.
 */
export function UserPersonaTool({ active = true }: { active?: boolean }) {
  const { t } = useI18n('knowledge')
  const openTool = useRightToolStore((s) => s.openTool)
  const [overview, setOverview] = useState<UserMemoryOverview | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const generation = useRef(0)
  const [correcting, setCorrecting] = useState<UserMemoryOverviewHabit | null>(null)

  const refresh = useCallback(async () => {
    const request = ++generation.current
    setLoadState('loading')
    try {
      const next = await getUserMemoryOverview()
      if (request !== generation.current) return
      if (next) {
        setOverview(next)
        setLoadState('ready')
      } else {
        setLoadState('error')
      }
    } catch {
      if (request === generation.current) setLoadState('error')
    }
  }, [])

  useEffect(() => {
    if (active) void refresh()
    return () => { generation.current += 1 }
  }, [active, refresh])

  const openInbox = useCallback(() => {
    openTool('review')
  }, [openTool])

  return (
    <section className={styles.root} aria-label={t('knowledge:persona.toolAria')}>
      {loadState === 'loading' && !correcting && (
        <div className={styles.state}>
          <strong>{t('knowledge:state.loading.title')}</strong>
          <span>{t('knowledge:state.loading.detail')}</span>
        </div>
      )}
      {loadState === 'error' && !correcting && (
        <div className={styles.state}>
          <strong>{t('knowledge:persona.unavailable.title')}</strong>
          <span>{t('knowledge:persona.unavailable.detail')}</span>
          <button type="button" onClick={() => void refresh()}>{t('knowledge:action.refresh')}</button>
        </div>
      )}
      {loadState === 'ready' && overview && !correcting && (
        <UserPersonaCards overview={overview} onOpenInbox={openInbox} onCorrect={setCorrecting} onRefresh={() => void refresh()} />
      )}
      {correcting && <PersonalMemoryCorrectionForm memory={correcting}
        onClose={() => { setCorrecting(null); void refresh() }}
        onSubmitted={status => { setCorrecting(null); void refresh(); if (status === 'proposed') openInbox() }} />}
    </section>
  )
}
