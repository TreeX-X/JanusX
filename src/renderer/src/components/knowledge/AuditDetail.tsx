import { useEffect, useRef, useState } from 'react'
import type { AuditRecord } from '../../../../shared/ipc/knowledge'
import { auditCanResolve, auditFields, auditValue, resolveAuditObject, snapshotCount } from './auditPresentation'
import { useAuditLabels } from './AuditRecords'
import styles from './AuditRecords.module.css'

function Value({ value }: { value: unknown }) {
  const { t } = useAuditLabels()
  const text = value === undefined ? t('knowledge:auditView.notRecorded') : value === null ? t('knowledge:auditView.none') : auditValue(value)
  return text.length <= 600 ? <pre>{text}</pre> : <><pre>{text.slice(0, 600)}…</pre><details><summary>{t('knowledge:auditView.fullValue')}</summary><pre>{text}</pre></details></>
}

export function AuditDetail({ event, onClose }: { event: AuditRecord; onClose: () => void }) {
  const { t, action, type, title, time } = useAuditLabels()
  const root = useRef<HTMLElement>(null)
  const [current, setCurrent] = useState<{ state: 'idle' | 'loading' | 'ready' | 'unavailable'; value?: unknown }>({ state: 'idle' })
  const active = useRef(true)
  useEffect(() => { active.current = true; root.current?.focus(); return () => { active.current = false } }, [])
  const openCurrent = async () => {
    if (current.state === 'loading') return
    setCurrent({ state: 'loading' })
    try { const value = await resolveAuditObject(event); if (active.current) setCurrent(value ? { state: 'ready', value } : { state: 'unavailable' }) }
    catch { if (active.current) setCurrent({ state: 'unavailable' }) }
  }
  const before = event.before && typeof event.before === 'object' ? event.before : {}
  const after = event.after && typeof event.after === 'object' ? event.after : {}
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  const changed = fields.filter(key => auditValue(before[key]) !== auditValue(after[key]))
  const unchanged = fields.filter(key => !changed.includes(key))
  const label = (key: string) => auditFields.includes(key as typeof auditFields[number]) ? t(`knowledge:auditView.fields.${key as typeof auditFields[number]}`) : key
  const provenance = event.provenance
  const count = snapshotCount(event)
  return <section ref={root} tabIndex={-1} className={styles.detail} aria-label={t('knowledge:auditView.detail')} onKeyDown={key => {
    if (key.key === 'Escape') { key.preventDefault(); key.stopPropagation(); onClose() }
  }}>
    <header><strong>{t('knowledge:auditView.detail')}</strong><button type="button" onClick={onClose}>{t('knowledge:auditView.close')}</button></header>
    <div className={styles.reading}>
      <h3>{action(event.action)}</h3><p className={styles.title}>{title(event)}</p>
      <dl className={styles.metadata}>
        <dt>{t('knowledge:auditView.objectType')}</dt><dd>{type(event.targetType)}</dd>
        <dt>{t('knowledge:auditView.domain')}</dt><dd>{t(provenance?.workspaceId === 'user' ? 'knowledge:domains.personal' : provenance?.workspaceId && provenance.workspaceId !== 'global' ? 'knowledge:domains.engineering' : 'knowledge:auditView.unknownDomain')}</dd>
        <dt>{t('knowledge:auditView.workspace')}</dt><dd>{provenance?.workspaceName || provenance?.workspaceId || t('knowledge:auditView.unknownWorkspace')}</dd>
        <dt>{t('knowledge:auditView.actor')}</dt><dd>{provenance?.actor || t('knowledge:auditView.unknownActor')}</dd>
        <dt>{t('knowledge:auditView.time')}</dt><dd>{time(provenance?.createdAt)}</dd>
        <dt>{t('knowledge:auditView.source')}</dt><dd>{provenance?.source || t('knowledge:auditView.notRecorded')}</dd>
      </dl>
      <h4>{t('knowledge:auditView.changes')}</h4>
      {count !== undefined && <p>{t('knowledge:auditView.batchSnapshot', { count })}</p>}
      {!fields.length && <p>{t('knowledge:auditView.noSnapshot')}</p>}
      {fields.length > 0 && <>
        {event.before === null && <p className={styles.muted}>{t('knowledge:auditView.noBefore')}</p>}
        {event.before === undefined && <p className={styles.muted}>{t('knowledge:auditView.missingBefore')}</p>}
        {event.after === undefined && <p className={styles.muted}>{t('knowledge:auditView.missingAfter')}</p>}
        {changed.map(key => <section className={styles.change} key={key}><h5>{label(key)}</h5><div className={styles.values}>
          <div><span>{t('knowledge:auditView.before')}</span><Value value={event.before === null ? null : before[key]} /></div>
          <div><span>{t('knowledge:auditView.after')}</span><Value value={event.after === null ? null : after[key]} /></div>
        </div></section>)}
        {!changed.length && <p>{t('knowledge:auditView.noChanges')}</p>}
        {unchanged.length > 0 && <details><summary>{t('knowledge:auditView.unchanged')}</summary>{unchanged.map(key => <section key={key}><h5>{label(key)}</h5><Value value={before[key]} /></section>)}</details>}
      </>}
      <details><summary>{t('knowledge:auditView.sources')}</summary>
        <h5>{t('knowledge:auditView.observations')}</h5><Value value={provenance?.sourceObservationIds} />
        <h5>{t('knowledge:auditView.files')}</h5><Value value={provenance?.fileRefs} />
        {provenance?.sourceEvidence && <Value value={provenance.sourceEvidence} />}
      </details>
      {auditCanResolve(event) ? <section className={styles.current}>
        <button type="button" disabled={current.state === 'loading'} onClick={() => void openCurrent()}>{t('knowledge:auditView.openCurrent')}</button>
        <p className={styles.muted}>{t('knowledge:auditView.currentHint')}</p>
        {current.state === 'loading' && <p role="status">{t('knowledge:auditView.loading')}</p>}
        {current.state === 'unavailable' && <p role="status">{t('knowledge:auditView.objectUnavailable')}</p>}
        {current.state === 'ready' && <><h4>{t('knowledge:auditView.currentObject')}</h4><Value value={current.value} /></>}
      </section> : <p className={styles.muted}>{t('knowledge:auditView.noObjectLink')}</p>}
      <details><summary>{t('knowledge:reviewContent.diagnostics')}</summary>
        <dl className={styles.metadata}><dt>{t('knowledge:auditView.eventId')}</dt><dd>{event.id}</dd><dt>{t('knowledge:auditView.targetId')}</dt><dd>{event.targetId}</dd></dl>
        <Value value={event} />
      </details>
    </div>
  </section>
}
