import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Database, X } from 'lucide-react'
import type { Blueprint } from '@/services/blueprint'
import type { ArchitectureProjection } from '@/features/blueprint/architecture-view'
import { blueprintSourceInfo } from '@/features/blueprint/source-info'
import { useBlueprintReview, useBlueprintReviewStore } from '@/stores/blueprint-review'
import { useEditorStore } from '@/stores/editor'
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
  const root = info.snapshots[0]?.coverage.checkoutRoot ?? ''
  const review = useBlueprintReview(root)
  const readError = useBlueprintReviewStore(state => state.errors[root])
  const [openError, setOpenError] = useState('')
  const hasStructureIssues = !!readError || !!review?.structure && (!review.structure.complete || review.structure.issues.length > 0)
  const openIssue = (path: string) => {
    setOpenError('')
    void useEditorStore.getState().openFile(root.replace(/[\\/]$/, '') + '/' + path, root).catch(reason => setOpenError(String(reason)))
  }
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  const close = () => { ref.current?.close(); onClose() }
  const select = (id: string) => { ref.current?.close(); onSelect(id) }
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
        <p>{t('sourceInfo.noteCount', { count: info.snapshots[0]?.entries.filter(entry => entry.classification === 'valid').length ?? 0 })}</p>
        {!info.snapshots.length && <p>{t('blueprint:sourceInfo.noSources')}</p>}
        {info.snapshots.map(snapshot => <article className="bp-source-row" key={snapshot.coverage.checkoutRoot}>
          <strong>{source.name}</strong><span>{t(snapshot.coverage.status === 'complete' ? 'blueprint:sourceInfo.complete' : 'blueprint:sourceInfo.incomplete')}</span>
          <code>{snapshot.coverage.checkoutRoot}</code>
        </article>)}
      </section>
      {hasStructureIssues && <section aria-label={t('review.structure.title')}>
        <h3>{t('review.structure.title')}</h3>
        <p role="status">{t(readError ? 'review.structure.incomplete' : !review?.structure ? 'review.structure.checking' : !review.structure.complete ? 'review.structure.incomplete' : review.structure.issues.length ? 'review.structure.invalid' : 'review.structure.passed')}</p>
        {(readError || openError) && <p role="alert">{openError || readError}</p>}
        {review?.structure?.issues.map((issue, index) => <article key={index} className="bp-source-issue">
          <button type="button" disabled={!issue.path.startsWith('.agents/notes/') || issue.path.split('/').includes('..')} onClick={() => openIssue(issue.path)}>{issue.path}</button>
          <p>{issue.field ? issue.field + ': ' : ''}{issue.message}</p><small>{issue.code}</small>
        </article>)}
      </section>}
      {info.issues.length > 0 && <section aria-label={t('blueprint:sourceInfo.diagnostics')}>
        <h3>{t('blueprint:sourceInfo.diagnostics')}</h3>
        {info.issues.map((item, index) => <article className="bp-source-issue" key={index}>
          <strong>{t(`blueprint:sourceInfo.issue.${item.category}`)}</strong>
          <p className="bp-source-explanation">{t(`blueprint:sourceInfo.explanation.${item.category}`)}</p>
          {item.nodeId && source.nodes[item.nodeId] ? <button type="button" onClick={() => select(item.nodeId!)}>{t('blueprint:sourceInfo.openSource', { title: item.sourceTitle ?? source.nodes[item.nodeId].title })}</button>
            : item.sourceTitle && <span>{item.sourceTitle}</span>}
          {item.path && !item.path.startsWith('note://') && <code>{item.path}</code>}
          {(item.code || item.message || item.path) && <details><summary>{t('blueprint:sourceInfo.technical')}</summary>
            {item.path && <code>{item.path}</code>}
            {(item.code || item.message) && <p>{item.code}{item.code && item.message ? ': ' : ''}{item.message}</p>}
          </details>}
        </article>)}
      </section>}
      <BlueprintCompositionPanel blueprint={info.graph} onSelect={select} />
    </div>
  </dialog>, document.body)
}
