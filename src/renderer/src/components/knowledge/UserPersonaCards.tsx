import type { UserMemoryOverview, UserMemoryOverviewHabit, UserMemoryOverviewEpisode } from '../../../../shared/knowledge'
import { useI18n } from '@/i18n/useI18n'
import styles from './KnowledgeAssist.module.css'

/**
 * Glance cards with source citations and optional explicit correction actions.
 * No workspace is required.
 */
export function UserPersonaCards({
  overview,
  onOpenInbox,
  onCorrect,
  onForget,
  onForgetEpisode,
  onRefresh,
  onEditProfile,
}: {
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
  return (
    <div className={styles.body}>
      <section aria-label={t('knowledge:persona.profile.title')}>
        <div className={styles.resultMeta}>
          <span>{t('knowledge:persona.profile.title')}</span>
          {onEditProfile && <button type="button" className={styles.copyButton} onClick={onEditProfile}>{t('knowledge:persona.overrides.edit')}</button>}
        </div>
        {overview.profile.identity && <p className={styles.rowContent}>{overview.profile.identity}</p>}
        {prefs.length === 0 && !overview.profile.identity && (
          <div className={styles.state}><span>{t('knowledge:persona.profile.empty')}</span></div>
        )}
        {prefs.map((pref) => (
          <div key={pref} className={styles.resultRow}>
            <span className={styles.rowContent}>{pref}</span>
            <span className={styles.rowSource}>(profile)</span>
          </div>
        ))}
      </section>
      {[true, false].map(confirmed => {
        const memories = overview.habits.filter(habit => (habit.confirmed === true) === confirmed)
        const title = t(confirmed ? 'knowledge:persona.habits.title' : 'knowledge:persona.uncertainTitle')
        return <section key={String(confirmed)} aria-label={title}>
        <div className={styles.resultMeta}>
          <span>{title}</span>
          {!confirmed && overview.pendingHabitCount > 0 && (
            <strong>{t('knowledge:persona.pending.label', { count: overview.pendingHabitCount })}</strong>
          )}
        </div>
        {memories.length === 0 && (
          <div className={styles.state}><span>{t('knowledge:persona.habits.empty')}</span></div>
        )}
        {memories.map((habit) => (
          <div key={habit.id} className={styles.resultRow}>
            <span className={styles.rowTop}>
              <b>{title}</b>
              {habit.habitStrength !== undefined && (
                <code>{t('knowledge:persona.strength', { value: habit.habitStrength.toFixed(2) })}</code>
              )}
            </span>
            <span className={styles.rowContent}>{habit.content}</span>
            {!confirmed && <span className={styles.rowSource}>{t('knowledge:persona.unconfirmed')}</span>}
            {onForget && <button type="button" className={styles.copyButton} disabled={!habit.contentHash} onClick={() => onForget(habit)}>{t('knowledge:persona.forgetMemory')}</button>}
            {onCorrect && <button type="button" className={styles.copyButton} disabled={!habit.contentHash} onClick={() => onCorrect(habit)}>{t('knowledge:persona.correctMemory')}</button>}
            <span className={styles.rowSource}>
              {`fact:${habit.id}${habit.observationIds.length > 0 ? ` · observation:${habit.observationIds.join(',observation:')}` : ''}${habit.succession ? ` · ${habit.succession}` : ''}`}
            </span>
          </div>
        ))}
      </section>
      })}
      <section aria-label={t('knowledge:persona.recent.title')}>
        <div className={styles.resultMeta}><span>{t('knowledge:persona.recent.title')}</span></div>
        {overview.recent.length === 0 && (
          <div className={styles.state}><span>{t('knowledge:persona.recent.empty')}</span></div>
        )}
        {overview.recent.map((episode) => (
          <div key={episode.id} className={styles.resultRow}>
            <span className={styles.rowContent}>{episode.content}</span>
            {onForgetEpisode && <button type="button" className={styles.copyButton} disabled={!episode.contentHash} onClick={() => onForgetEpisode(episode)}>{t('knowledge:persona.forgetMemory')}</button>}
            <span className={styles.rowSource}>
              {`episode:${episode.id} · ${t('knowledge:persona.expires', { date: episode.expiresAt.slice(0, 10) })}`}
            </span>
          </div>
        ))}
      </section>
      <div className={styles.footer}>
        {onRefresh && <button type="button" className={styles.copyButton} onClick={onRefresh}>{t('knowledge:action.refresh')}</button>}
        {onOpenInbox && <button type="button" className={styles.copyButton} onClick={onOpenInbox}>
          {t('knowledge:persona.openInbox')}
        </button>}
      </div>
    </div>
  )
}
