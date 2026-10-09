import type { UserMemoryOverview, UserMemoryOverviewHabit, UserMemoryOverviewEpisode } from '../../../../shared/knowledge'
import { useI18n } from '@/i18n/useI18n'
import styles from './UserPersonaCards.module.css'
import surface from './MemorySurface.module.css'

// Note: compact summaries keep sources and explicit edits reachable — see .agents/notes/knowledge/assistant-persona-layout.md
export function UserPersonaCards({ overview, onOpenInbox, onCorrect, onForget, onForgetEpisode, onRefresh, onEditProfile }: {
  overview: UserMemoryOverview
  onOpenInbox?: () => void
  onForgetEpisode?: (episode: UserMemoryOverviewEpisode) => void
  onForget?: (memory: UserMemoryOverviewHabit) => void
  onCorrect?: (memory: UserMemoryOverviewHabit) => void
  onRefresh?: () => void
  onEditProfile?: () => void
}) {
  const { t } = useI18n('knowledge')
  const prefs = [...(overview.profile.formatPrefs ?? []), ...(overview.profile.toolPrefs ?? [])]
  return <div className={styles.root}>
    <section className={`${surface.card} ${styles.profile}`} aria-label={t('knowledge:persona.profile.title')}>
      <header><strong>{t('knowledge:persona.profile.title')}</strong>{onEditProfile && <button type="button" onClick={onEditProfile}>{t('knowledge:persona.overrides.edit')}</button>}</header>
      {overview.profile.identity && <p>{overview.profile.identity}</p>}
      {prefs.length > 0 && <div className={styles.preferences}>{prefs.map((pref, index) => <span key={index}>{pref}</span>)}</div>}
      {!prefs.length && !overview.profile.identity && <p className={styles.muted}>{t('knowledge:persona.profile.empty')}</p>}
    </section>
    {[true, false].map(confirmed => {
      const memories = overview.habits.filter(habit => (habit.confirmed === true) === confirmed)
      const title = t(confirmed ? 'knowledge:persona.habits.title' : 'knowledge:persona.uncertainTitle')
      return <details key={String(confirmed)} className={styles.group} open={confirmed}>
        <summary>{title}<span>{memories.length}</span></summary>
        <div className={styles.list}>
          {!memories.length && <p className={styles.muted}>{t('knowledge:persona.habits.empty')}</p>}
          {memories.map(habit => <article key={habit.id} className={`${surface.card} ${styles.memory}`}>
            <p>{habit.content}</p>
            <details className={styles.sources}><summary>{t('knowledge:detail.source')}</summary><p>{[habit.id, ...habit.observationIds, habit.succession].filter(Boolean).join(' · ')}</p></details>
            <div className={styles.actions}>
              {onCorrect && <button type="button" disabled={!habit.contentHash} onClick={() => onCorrect(habit)}>{t('knowledge:persona.correctMemory')}</button>}
              {onForget && <button type="button" disabled={!habit.contentHash} onClick={() => onForget(habit)}>{t('knowledge:persona.forgetMemory')}</button>}
            </div>
          </article>)}
        </div>
      </details>
    })}
    <details className={styles.group}>
      <summary>{t('knowledge:persona.recent.title')}<span>{overview.recent.length}</span></summary>
      <div className={styles.list}>
        {!overview.recent.length && <p className={styles.muted}>{t('knowledge:persona.recent.empty')}</p>}
        {overview.recent.map(episode => <article key={episode.id} className={`${surface.card} ${styles.memory}`}>
          <p>{episode.content}</p>
          <small className={styles.muted}>{t('knowledge:persona.expires', { date: episode.expiresAt.slice(0, 10) })}</small>
          <details className={styles.sources}><summary>{t('knowledge:detail.source')}</summary><p>{episode.id}</p></details>
          {onForgetEpisode && <div className={styles.actions}><button type="button" disabled={!episode.contentHash} onClick={() => onForgetEpisode(episode)}>{t('knowledge:persona.forgetMemory')}</button></div>}
        </article>)}
      </div>
    </details>
    <footer className={styles.actions}>
      {onRefresh && <button type="button" onClick={onRefresh}>{t('knowledge:personalBoard.refresh')}</button>}
      {onOpenInbox && <button type="button" onClick={onOpenInbox}>{t('knowledge:persona.openInbox')}{overview.pendingHabitCount > 0 && ` · ${overview.pendingHabitCount}`}</button>}
    </footer>
  </div>
}
