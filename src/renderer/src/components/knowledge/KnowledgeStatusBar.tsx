import type { KnowledgeProcessingStats } from '../../../../shared/ipc/knowledge'
import { useI18n } from '@/i18n/useI18n'
import { processingTone } from './processingStatus'
import styles from './KnowledgeWorkbench.module.css'

interface Props {
  stats: KnowledgeProcessingStats | null
  busy: boolean
  onProcessNow: () => void
}

/**
 * Phase 4 top status strip (§6): pending/proposal pressure, failure queue,
 * last run, and the manual "process now" trigger. Read-only except the
 * trigger; never blocks the workbench when the bridge is unavailable.
 */
export function KnowledgeStatusBar({ stats, busy, onProcessNow }: Props) {
  const { t } = useI18n('knowledge')
  const tone = processingTone(stats)

  return (
    <div className={styles.statusBar} data-tone={tone} role="status" aria-label={t('knowledge:statusbar.label')}>
      <span className={styles.statusDot} data-tone={tone} aria-hidden="true" />
      {stats ? (
        <>
          <span>{t('knowledge:statusbar.pending', { count: stats.pendingTotal })}</span>
          {stats.failures > 0 && (
            <span className={styles.statusWarn}>
              {t('knowledge:statusbar.failures', { count: stats.failures })}
            </span>
          )}
          {!stats.handlerConfigured && (
            <span className={styles.statusWarn}>{t('knowledge:statusbar.handlerMissing')}</span>
          )}
          <span className={styles.statusDim}>
            {stats.lastRunAt
              ? t('knowledge:statusbar.lastRun', { time: formatTime(stats.lastRunAt, t('knowledge:time.unknown')) })
              : t('knowledge:statusbar.neverRun')}
          </span>
        </>
      ) : (
        <span className={styles.statusDim}>{t('knowledge:statusbar.unavailable')}</span>
      )}
      <span className={styles.statusSpacer} />
      <button
        type="button"
        className={styles.statusButton}
        disabled={busy || !stats?.handlerConfigured}
        onClick={onProcessNow}
      >
        {busy ? t('knowledge:action.working') : t('knowledge:statusbar.processNow')}
      </button>
    </div>
  )
}

function formatTime(value: string, unknownLabel: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
