import { PersonalMemoryBoard } from './PersonalMemoryBoard'
import { CardSkeleton } from '../shared/CardFrame'
import surface from './MemorySurface.module.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { UserMemoryOverview, UserMemoryOverviewHabit } from '../../../../shared/knowledge'
import { getUserMemoryOverview } from '../../services/knowledge'
import { useRightToolStore } from '../../stores/right-tools'
import { useExperimentalStore } from '../../stores/experimental'
import { useI18n } from '@/i18n/useI18n'
import styles from './KnowledgeAssist.module.css'
import { UserPersonaCards } from './UserPersonaCards'
import { PersonalMemoryForgetForm } from './PersonalMemoryForgetForm'
import { PersonalMemoryCorrectionForm } from './PersonalMemoryCorrectionForm'
import { PersonalProfileEditor } from './PersonalProfileEditor'

type LoadState = 'loading' | 'ready' | 'error'

/**
 * Persona RightDock tool (M4). Loads the workspace-free user overview on
 * activation; explicit corrections are proposed to the shared review tool.
 * Enabled with no workspace mounted.
 */
export function UserPersonaTool({ active = true, onOpenReview, expanded = false }: { active?: boolean; onOpenReview?: () => void; expanded?: boolean }) {
  const { t } = useI18n('knowledge')
  const openTool = useRightToolStore((s) => s.openTool)
  const reviewEnabled = useExperimentalStore((s) => s.persona)
  const [overview, setOverview] = useState<UserMemoryOverview | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const generation = useRef(0)
  const [forgetting, setForgetting] = useState<(Pick<UserMemoryOverviewHabit, 'id' | 'content' | 'contentHash'> & { kind?: 'episode' }) | null>(null)
  const [correcting, setCorrecting] = useState<UserMemoryOverviewHabit | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)

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

  const Cards = expanded ? PersonalMemoryBoard : UserPersonaCards
  const openInbox = useCallback(() => {
    openTool('review')
  }, [openTool])

  return (
    <section key={editingProfile ? 'edit' : correcting ? 'correct' : forgetting ? 'forget' : 'overview'} className={`${styles.root} ${surface.enter}`} data-persona="true" data-expanded={expanded || undefined} aria-busy={loadState === 'loading'} aria-label={t('knowledge:persona.toolAria')}>
      {loadState === 'loading' && !correcting && !forgetting && !editingProfile && (
        <CardSkeleton lines={4} label={t('knowledge:state.loading.title')} />
      )}
      {loadState === 'error' && !correcting && !forgetting && !editingProfile && (
        <div className={styles.state}>
          <strong>{t('knowledge:persona.unavailable.title')}</strong>
          <span>{t('knowledge:persona.unavailable.detail')}</span>
          <button type="button" onClick={() => void refresh()}>{t('knowledge:action.refresh')}</button>
        </div>
      )}
      {loadState === 'ready' && overview && !correcting && !forgetting && !editingProfile && (
        <Cards overview={overview} onEditProfile={() => setEditingProfile(true)} onOpenInbox={reviewEnabled ? onOpenReview ?? openInbox : undefined} onForgetEpisode={episode => setForgetting({ ...episode, kind: 'episode' })} onForget={setForgetting} onCorrect={setCorrecting} onRefresh={() => void refresh()} />
      )}
      {editingProfile && <PersonalProfileEditor onClose={() => { setEditingProfile(false); void refresh() }}
        onSaved={() => { setEditingProfile(false); void refresh() }} />}
      {forgetting && <PersonalMemoryForgetForm memory={forgetting}
        onClose={() => { setForgetting(null); void refresh() }}
        onForgotten={() => { setForgetting(null); void refresh() }} />}
      {correcting && <PersonalMemoryCorrectionForm memory={correcting}
        onClose={() => { setCorrecting(null); void refresh() }}
        onSubmitted={status => { setCorrecting(null); void refresh(); if (status === 'proposed') (onOpenReview ?? openInbox)() }} />}
    </section>
  )
}
