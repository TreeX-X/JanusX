import { useEffect, useState } from 'react'
import type { ObservationRevocationsPage } from '../../../../shared/ipc/knowledge'
import { useI18n } from '@/i18n/useI18n'

export function ObservationRevocations() {
  const { t } = useI18n('knowledge')
  const [offset, setOffset] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [page, setPage] = useState<ObservationRevocationsPage>()
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    setPage(undefined); setError('')
    void Promise.resolve().then(() => window.electron.knowledge.observationRevocations({ offset, limit: 20 })).then(result => {
      if (current) setPage(result)
    }).catch(reason => { if (current) setError(reason instanceof Error ? reason.message : t('knowledge:error.revokeFailed')) })
    return () => { current = false }
  }, [offset, refresh, t])
  return <section aria-label={t('knowledge:observation.history')}>
    <h3>{t('knowledge:observation.history')}{page ? ` (${page.total})` : ''}</h3>
    <p>{t('knowledge:observation.historyDetail')}</p>
    <button type="button" onClick={() => { setOffset(0); setRefresh(value => value + 1) }}>{t('knowledge:observation.historyRefresh')}</button>
    {error ? <p role="alert">{error}</p> : !page ? <p>{t('knowledge:action.working')}</p> : <>
      {page.total === 0 && <p>{t('knowledge:observation.historyEmpty')}</p>}
      {page.items.map(item => <details key={item.key}>
        <summary>{item.revokedAt} · {item.source ? `${item.source.workspaceId} / ${item.source.id}` : t('knowledge:observation.unresolvedSource')}</summary>
        <p>{t('knowledge:observation.impact', { observations: item.observationCount, facts: item.factCount })}</p>
        <p>{t(`knowledge:observation.sourceStatus.${item.sourceStatus}`)}</p>
        {item.source && <><p>{t('knowledge:observation.currentSource')}</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.source.content}</pre>{item.source.truncated && <p>{t('knowledge:observation.previewTruncated')}</p>}</>}
      </details>)}
      <button type="button" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 20))}>{t('knowledge:observation.previous')}</button>
      <button type="button" disabled={offset + page.items.length >= page.total} onClick={() => setOffset(value => value + 20)}>{t('knowledge:observation.next')}</button>
    </>}
  </section>
}
