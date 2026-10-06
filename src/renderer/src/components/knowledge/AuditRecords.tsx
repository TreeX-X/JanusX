import { useEffect, useRef, useState } from 'react'
import type { AuditPage, AuditRecord } from '../../../../shared/ipc/knowledge'
import { useI18n } from '@/i18n/useI18n'
import { auditActions, auditTypes, snapshotCount } from './auditPresentation'
import styles from './AuditRecords.module.css'

export function useAuditLabels() {
  const { t } = useI18n('knowledge')
  const action = (value: string) => auditActions.includes(value as typeof auditActions[number]) ? t(`knowledge:auditView.actions.${value as typeof auditActions[number]}`) : t('knowledge:auditView.unknownAction')
  const type = (value: string) => auditTypes.includes(value as typeof auditTypes[number]) ? t(`knowledge:auditView.types.${value as typeof auditTypes[number]}`) : t('knowledge:auditView.unknownType')
  const title = (event: AuditRecord) => snapshotCount(event) !== undefined ? t('knowledge:auditView.batchCount', { count: snapshotCount(event)! }) : event.displayTitle || type(event.targetType)
  const time = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : t('knowledge:time.unknown')
  return { t, action, type, title, time }
}

// Note: task records and immutable audit events have separate readers — see .agents/notes/2026-10-06-knowledge-review-status-audit-plan--76ef32d1.md
export function AuditRecords({ selectedId, onSelect }: { selectedId?: string; onSelect: (event: AuditRecord | null) => void }) {
  const { t, action, title, time } = useAuditLabels()
  const [workspace, setWorkspace] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [revision, setRevision] = useState(0)
  const [page, setPage] = useState<AuditPage>()
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const moreLock = useRef(false)
  const select = useRef(onSelect); select.current = onSelect
  const query = () => ({ domain: 'engineering' as const, limit: 30, ...(workspace ? { workspaceId: workspace } : {}), ...(actionFilter ? { action: actionFilter } : {}) })
  useEffect(() => {
    const request = ++generation.current
    moreLock.current = false; setPage(undefined); setError(false); setBusy(true); select.current(null)
    void Promise.resolve().then(() => window.electron.knowledge.auditPage({ domain: 'engineering', limit: 30, ...(workspace ? { workspaceId: workspace } : {}), ...(actionFilter ? { action: actionFilter } : {}) }))
      .then(result => { if (generation.current === request) setPage(result) })
      .catch(() => { if (generation.current === request) setError(true) })
      .finally(() => { if (generation.current === request) setBusy(false) })
    return () => { generation.current = request + 1; select.current(null) }
  }, [workspace, actionFilter, revision])
  const more = async () => {
    if (!page?.nextCursor || moreLock.current) return
    moreLock.current = true; setBusy(true); setError(false)
    const request = generation.current
    try {
      const next = await window.electron.knowledge.auditPage({ ...query(), cursor: page.nextCursor })
      if (request === generation.current) setPage({ ...next, items: [...page.items, ...next.items.filter(item => !page.items.some(old => old.id === item.id))] })
    } catch { if (request === generation.current) setError(true) }
    finally { if (request === generation.current) { moreLock.current = false; setBusy(false) } }
  }
  return <section className={styles.records} aria-label={t('knowledge:summary.auditRecords')}>
    <div className={styles.filters}>
      <label>{t('knowledge:auditView.workspace')}<select aria-label={t('knowledge:auditView.workspace')} value={workspace} onChange={event => setWorkspace(event.target.value)}>
        <option value="">{t('knowledge:summary.scope')}</option>
        {page?.workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        {workspace && !page?.workspaces.some(item => item.id === workspace) && <option value={workspace}>{workspace}</option>}
      </select></label>
      <label>{t('knowledge:auditView.action')}<select aria-label={t('knowledge:auditView.action')} value={actionFilter} onChange={event => setActionFilter(event.target.value)}>
        <option value="">{t('knowledge:auditView.allActions')}</option>
        {auditActions.map(value => <option key={value} value={value}>{action(value)}</option>)}
      </select></label>
      <button type="button" onClick={() => setRevision(value => value + 1)}>{t('knowledge:auditView.refresh')}</button>
    </div>
    {error && <p role="alert">{t('knowledge:auditView.loadFailed')}</p>}
    {busy && !page && <p role="status">{t('knowledge:auditView.loading')}</p>}
    {page && <>
      <p className={styles.muted}>{t('knowledge:auditView.loaded', { count: page.items.length, total: page.total })}</p>
      {!page.items.length && <p>{t('knowledge:audit.empty.title')}</p>}
      <div className={styles.list}>{page.items.map(event => <button type="button" key={event.id} data-audit-id={event.id} aria-pressed={selectedId === event.id} className={styles.event} onClick={() => onSelect(event)}>
        <span className={styles.heading}><strong>{action(event.action)}</strong><span title={title(event)}>{title(event)}</span></span>
        <span className={styles.meta}><span>{event.provenance?.workspaceName || event.provenance?.workspaceId || t('knowledge:auditView.unknownWorkspace')}</span><span>{event.provenance?.actor || t('knowledge:auditView.unknownActor')}</span><time>{time(event.provenance?.createdAt)}</time></span>
      </button>)}</div>
      {page.nextCursor && <button type="button" disabled={busy} onClick={() => void more()}>{t(busy ? 'knowledge:auditView.loading' : 'knowledge:auditView.more')}</button>}
    </>}
  </section>
}
