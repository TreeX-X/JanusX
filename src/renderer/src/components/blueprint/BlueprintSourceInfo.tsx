import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Database, X } from 'lucide-react'
import type { Blueprint } from '@/services/blueprint'
import type { ArchitectureProjection } from '@/features/blueprint/architecture-view'
import { blueprintSourceInfo } from '@/features/blueprint/source-info'
import { useI18n } from '@/i18n/useI18n'
import { BlueprintCompositionPanel } from './BlueprintCompositionPanel'
import './source-info.css'

type Props = { source: Blueprint; projection: ArchitectureProjection; onSelect: (id: string) => void }

// Note: source details open on demand in both surfaces — see .agents/notes/blueprint/navigation/requirements/module-browsing.md
export function BlueprintSourceInfo({ source, projection, onSelect }: Props) {
  const { t } = useI18n('blueprint')
  const [open, setOpen] = useState(false)
  const info = useMemo(() => blueprintSourceInfo(source, projection), [source, projection])
  return <>
    <button type="button" className="blueprint-btn bp-source-trigger" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <Database size={14} aria-hidden="true" />{t('blueprint:sourceInfo.title')}
      {info.hasAttention && <span className="bp-source-attention"><AlertCircle size={13} aria-hidden="true" />{t('blueprint:sourceInfo.attention')}</span>}
    </button>
    {open && <SourceDialog source={source} info={info} onClose={() => setOpen(false)} onSelect={id => { setOpen(false); onSelect(id) }} />}
  </>
}

function SourceDialog({ source, info, onSelect, onClose }: { source: Blueprint; info: ReturnType<typeof blueprintSourceInfo>; onSelect: (id: string) => void; onClose: () => void }) {
  const { t } = useI18n('blueprint')
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  const close = () => { ref.current?.close(); onClose() }
  const select = (id: string) => { ref.current?.close(); onSelect(id) }
  const statusLabels = { bound: t('blueprint:sourceInfo.bound'), unbound: t('blueprint:sourceInfo.unbound'), stale: t('blueprint:sourceInfo.stale') }
  return createPortal(<dialog ref={ref} className="bp-source-dialog" aria-label={t('blueprint:sourceInfo.title')}
    onCancel={event => { event.preventDefault(); close() }}
    onKeyDown={event => event.stopPropagation()}
    onClick={event => { if (event.target === event.currentTarget) close() }}>
    <header><h2>{t('blueprint:sourceInfo.title')}</h2><button type="button" onClick={close} aria-label={t('common:action.close')}><X size={18} /></button></header>
    <div className="bp-source-body">
      <p className="bp-source-summary">{t('blueprint:sourceInfo.description')}</p>
      {info.hasAttention && <p className="bp-source-notice" role="status">{t('blueprint:sourceInfo.attentionDescription')}</p>}
      <section aria-label={t('blueprint:sourceInfo.repositories')}>
        <h3>{t('blueprint:sourceInfo.repositories')}</h3>
        {!info.snapshots.length && !source.composition?.checkouts.length && <p>{t('blueprint:sourceInfo.noSources')}</p>}
        {info.snapshots.filter(snapshot => !source.composition?.checkouts.some(row => row.path === snapshot.coverage.checkoutRoot)).map(snapshot => <article className="bp-source-row" key={snapshot.coverage.checkoutRoot}>
          <strong>{source.name}</strong><span>{t(snapshot.coverage.status === 'complete' ? 'blueprint:sourceInfo.complete' : 'blueprint:sourceInfo.incomplete')}</span>
          <code>{snapshot.coverage.checkoutRoot}</code>
        </article>)}
        {source.composition?.checkouts.map(row => <article className="bp-source-row" key={row.repoId + ':' + row.checkoutId}>
          <strong>{row.name ?? row.path.split(/[\\/]/).filter(Boolean).at(-1) ?? row.checkoutId}</strong><span>{statusLabels[row.status]}</span>
          <code>{row.path}</code>
          <small>{t('blueprint:sourceInfo.revision', { value: row.revision ?? t('blueprint:sourceInfo.unknown') })}{row.selected ? ' · ' + t('blueprint:sourceInfo.selected') : ''}{row.dirty ? ' · ' + t('blueprint:sourceInfo.dirty') : ''}</small>
          {row.snapshot && <small>{t(row.snapshot.coverage.status === 'complete' ? 'blueprint:sourceInfo.complete' : 'blueprint:sourceInfo.incomplete')}</small>}
          {row.diagnostic && <p>{row.diagnostic}</p>}
        </article>)}
      </section>
      <section aria-label={t('blueprint:sourceInfo.diagnostics')}>
        <h3>{t('blueprint:sourceInfo.diagnostics')}</h3>
        {!info.issues.length && <p>{t('blueprint:sourceInfo.noDiagnostics')}</p>}
        {info.issues.map((item, index) => <article className="bp-source-issue" key={index}>
          <strong>{t(`blueprint:sourceInfo.issue.${item.category}`)}</strong>
          {item.nodeId && source.nodes[item.nodeId] && <button type="button" onClick={() => select(item.nodeId!)}>{source.nodes[item.nodeId].title}</button>}
          {item.path && <code>{item.path}</code>}
          {(item.code || item.message) && <details><summary>{t('blueprint:sourceInfo.technical')}</summary><p>{item.code}{item.code && item.message ? ': ' : ''}{item.message}</p></details>}
        </article>)}
      </section>
      <BlueprintCompositionPanel blueprint={info.graph} onSelect={select} />
    </div>
  </dialog>, document.body)
}
