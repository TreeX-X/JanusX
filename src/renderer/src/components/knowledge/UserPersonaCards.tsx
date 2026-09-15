import type { UserMemoryOverview } from '../../../../shared/knowledge'
import { useI18n } from '@/i18n/useI18n'
import styles from './KnowledgeAssist.module.css'

/**
 * Glance cards for durable user memory (M4). Read-only rows with source
 * citations; the only action navigates to the Workbench Inbox via
 * `onOpenInbox`. No workspace is required.
 */
export function UserPersonaCards({
  overview,
  onOpenInbox,
}: {
  overview: UserMemoryOverview
  onOpenInbox: () => void
}) {
  const { t } = useI18n('knowledge')
  const prefs = [...(overview.profile.formatPrefs ?? []), ...(overview.profile.toolPrefs ?? [])]
  return (
    <div className={styles.body}>
      <section aria-label={t('knowledge:persona.profile.title')}>
        <div className={styles.resultMeta}>
          <span>{t('knowledge:persona.profile.title')}</span>
          {overview.profile.identity && <strong>{overview.profile.identity}</strong>}
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
      <section aria-label={t('knowledge:persona.habits.title')}>
        <div className={styles.resultMeta}>
          <span>{t('knowledge:persona.habits.title')}</span>
          {overview.pendingHabitCount > 0 && (
            <strong>{t('knowledge:persona.pending.label', { count: overview.pendingHabitCount })}</strong>
          )}
        </div>
        {overview.habits.length === 0 && (
          <div className={styles.state}><span>{t('knowledge:persona.habits.empty')}</span></div>
        )}
        {overview.habits.map((habit) => (
          <div key={habit.id} className={styles.resultRow}>
            <span className={styles.rowTop}>
              <b>{t('knowledge:persona.habits.title')}</b>
              {habit.habitStrength !== undefined && (
                <code>{t('knowledge:persona.strength', { value: habit.habitStrength.toFixed(2) })}</code>
              )}
            </span>
            <span className={styles.rowContent}>{habit.content}</span>
            <span className={styles.rowSource}>
              {`fact:${habit.id}${habit.observationIds.length > 0 ? ` · observation:${habit.observationIds.join(',observation:')}` : ''}${habit.succession ? ` · ${habit.succession}` : ''}`}
            </span>
          </div>
        ))}
      </section>
      <section aria-label={t('knowledge:persona.recent.title')}>
        <div className={styles.resultMeta}><span>{t('knowledge:persona.recent.title')}</span></div>
        {overview.recent.length === 0 && (
          <div className={styles.state}><span>{t('knowledge:persona.recent.empty')}</span></div>
        )}
        {overview.recent.map((episode) => (
          <div key={episode.id} className={styles.resultRow}>
            <span className={styles.rowContent}>{episode.content}</span>
            <span className={styles.rowSource}>
              {`episode:${episode.id} · ${t('knowledge:persona.expires', { date: episode.expiresAt.slice(0, 10) })}`}
            </span>
          </div>
        ))}
      </section>
      <div className={styles.footer}>
        <button type="button" className={styles.copyButton} onClick={onOpenInbox}>
          {t('knowledge:persona.openInbox')}
        </button>
      </div>
    </div>
  )
}
