import { useEffect, useRef, useState } from 'react'
import { FlaskConical, LoaderCircle } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { KNOWLEDGE_STAGES, type KnowledgeAutomationSettings, type KnowledgeConfigurationTestResult,
  type KnowledgeStage } from '../../../../shared/knowledge-automation'
import styles from '../KnowledgeSettingsPanel.module.css'
import automationStyles from '../KnowledgeAutomationPanel.module.css'

// Note: hot-reloaded settings may outlive their main/preload API — see .agents/notes/2026-10-03-knowledge-accumulate-review-wiki-rereview--3944b368.md
type TestRow = KnowledgeConfigurationTestResult | { status: 'waiting' | 'testing' }
export function KnowledgeConfigurationTest({ config, credential, disabled }: {
  config: KnowledgeAutomationSettings; credential: { key?: string; revision: number }; disabled: boolean
}) {
  const { t } = useI18n('knowledge')
  const [busy, setBusy] = useState(false)
  const [snapshot, setSnapshot] = useState<number>()
  const [rows, setRows] = useState<Partial<Record<KnowledgeStage, TestRow>>>({})
  const signature = JSON.stringify([config, credential.revision])
  const latest = useRef({ signature, revision: 0 })
  if (latest.current.signature !== signature) latest.current = { signature, revision: latest.current.revision + 1 }
  const revision = latest.current.revision
  const mounted = useRef(true)
  const lock = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const run = async () => {
    if (lock.current || disabled) return
    lock.current = true; setBusy(true); setSnapshot(revision)
    const next: Partial<Record<KnowledgeStage, TestRow>> = Object.fromEntries(KNOWLEDGE_STAGES.map(stage => [stage,
      config.stages[stage].provider === 'off' ? { status: 'skipped', reason: stage === 'extraction' ? 'rules-only' : 'manual' } : { status: 'waiting' }]))
    setRows({ ...next })
    try {
      for (const stage of KNOWLEDGE_STAGES) {
        if (!mounted.current || latest.current.revision !== revision) break
        if (next[stage]?.status === 'skipped') continue
        next[stage] = { status: 'testing' }; setRows({ ...next })
        try {
          const api = window.electron?.knowledge
          next[stage] = typeof api?.testConfiguration !== 'function' ? { status: 'failed', reason: 'runtime-outdated' }
            : await api.testConfiguration({ stage, model: config.stages[stage],
              jevEndpoint: config.jev.endpoint, ...(config.stages[stage].provider !== 'jev' || credential.key === undefined ? {} : { jevKey: credential.key }) })
        } catch (error) {
          const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
          next[stage] = { status: 'failed', reason: /No handler registered for ['"]knowledge:configuration:test['"]/.test(message)
            ? 'runtime-outdated' : 'test-service-unavailable' }
        }
        if (!mounted.current || latest.current.revision !== revision) break
        setRows({ ...next })
      }
    } finally {
      lock.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const current = snapshot === revision
  const values = Object.values(rows)
  const incomplete = values.some(row => row.status === 'incomplete')
  const failed = values.some(row => row.status === 'failed')
  const skipped = values.every(row => row.status === 'skipped')
  const summary = !current ? 'changed' : busy ? 'running' : incomplete ? 'incomplete' : failed ? 'failed' : skipped ? 'empty' : 'passed'
  return <section className={automationStyles.testPanel} aria-label={t('knowledge:configurationTest.title')}>
    <div className={styles.actions}>
      <button type="button" className={`${styles.button} ${styles.primaryButton}`} disabled={disabled || busy} onClick={() => void run()}>
        {busy ? <LoaderCircle size={14} aria-hidden /> : <FlaskConical size={14} aria-hidden />}
        {t(busy ? 'knowledge:configurationTest.running' : 'knowledge:configurationTest.button')}
      </button>
    </div>
    <p className={styles.hint}>{t('knowledge:configurationTest.hint')}</p>
    {snapshot !== undefined && <>
      <p role={current && !busy && (incomplete || failed) ? 'alert' : 'status'}
        className={`${styles.status} ${current && !busy && (incomplete || failed) ? styles.statusError : ''}`}>
        {t(`knowledge:configurationTest.${summary}`)}
      </p>
      {current && <ul className={automationStyles.testResults} aria-live="polite" aria-busy={busy}>
        {KNOWLEDGE_STAGES.map(stage => {
          const row = rows[stage]
          if (!row) return null
          return <li key={stage} data-test-stage={stage} data-test-status={row.status}>
            <span>{t(`knowledge:automation.stage.${stage}`)}</span>
            <span className={row.status === 'passed' ? styles.statusSuccess : row.status === 'failed' || row.status === 'incomplete' ? styles.statusError : styles.hint}>
              {t(`knowledge:configurationTest.status.${row.status}`)}
              {'reason' in row && row.reason && <> · {t(`knowledge:configurationTest.reason.${row.reason}`)}</>}
              {'durationMs' in row && row.durationMs !== undefined && <> · {t('knowledge:configurationTest.duration', { seconds: (row.durationMs / 1000).toFixed(1) })}</>}
            </span>
          </li>
        })}
      </ul>}
    </>}
  </section>
}
