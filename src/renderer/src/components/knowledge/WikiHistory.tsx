import { useEffect, useRef, useState } from 'react'
import { ChevronDown, History, Pin, RefreshCw } from 'lucide-react'
import type { WikiHistoryPage, WikiRevision } from '../../../../shared/wiki-history'
import { useI18n } from '@/i18n/useI18n'
import styles from './NoteWikiLinks.module.css'

export function WikiHistory({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const { t } = useI18n('knowledge')
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<WikiHistoryPage | null>(null)
  const [revision, setRevision] = useState<WikiRevision | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  useEffect(() => () => { generation.current++ }, [workspaceId, slug])
  const act = async (work: (request: number) => Promise<void>) => {
    const request = ++generation.current
    setBusy(true); setError('')
    try { await work(request) } catch { if (request === generation.current) setError(t('knowledge:wikiHistory.failed')) }
    finally { if (request === generation.current) setBusy(false) }
  }
  const load = (offset = 0) => act(async request => {
    setRevision(null)
    const result = await window.electron.knowledge.wikiHistory({ workspaceId, slug, offset })
    if (request === generation.current) setHistory(result)
  })
  const select = (version: number) => act(async request => {
    setRevision(null)
    const result = await window.electron.knowledge.wikiRevision({ workspaceId, slug, version })
    if (request === generation.current) setRevision(result)
  })
  const pin = () => act(async request => {
    if (!revision) return
    await window.electron.knowledge.pinWikiRevision({ workspaceId, slug, version: revision.version, contentHash: revision.contentHash, pinned: !revision.pinned })
    const result = await window.electron.knowledge.wikiHistory({ workspaceId, slug })
    if (request === generation.current) { setHistory(result); setRevision(null) }
  })
  return <section className={`${styles.detail} ${styles.history}`} aria-label={t('knowledge:wikiHistory.title')}>
    <button className={styles.historyToggle} type="button" aria-expanded={open} onClick={() => {
      if (open) { generation.current++; setOpen(false); setBusy(false); setRevision(null) }
      else { setOpen(true); void load() }
    }}><History size={14} aria-hidden /><span>{t('knowledge:wikiHistory.title')}</span><ChevronDown size={12} aria-hidden /></button>
    {open && <>
      <p className={styles.meta}>{t('knowledge:wikiHistory.hint')}</p>
      {busy && <p role="status">{t('knowledge:state.loading.title')}</p>}
      {error && <p role="alert">{error}</p>}
      <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void load()}><RefreshCw size={12} aria-hidden />{t('knowledge:action.refresh')}</button></div>
      {!busy && !error && history?.total === 0 && <p>{t('knowledge:wikiHistory.empty')}</p>}
      {history && !error && <>
        <ul className={styles.revisionList}>{history.items.map(item => <li key={item.version}>
          <button className={styles.revisionButton} type="button" disabled={busy} aria-pressed={revision?.version === item.version} onClick={() => void select(item.version)}>
            <span>{t('knowledge:wikiHistory.version', { version: item.version })}</span>
            <time dateTime={item.publishedAt}>{new Date(item.publishedAt).toLocaleString()}</time>
            {item.pinned && <span className={styles.pinBadge}><Pin size={11} aria-hidden />{t('knowledge:wikiHistory.pinned')}</span>}
          </button>
        </li>)}</ul>
        <div className={styles.actions}>
          <button type="button" disabled={busy || history.offset === 0} onClick={() => void load(Math.max(0, history.offset - history.limit))}>{t('knowledge:wikiHistory.previous')}</button>
          <button type="button" disabled={busy || history.offset + history.limit >= history.total} onClick={() => void load(history.offset + history.limit)}>{t('knowledge:wikiHistory.next')}</button>
        </div>
      </>}
      {revision && !error && <article className={styles.revisionPreview}>
        <h4>{t('knowledge:wikiHistory.version', { version: revision.version })} · {revision.title}</h4>
        <p>{revision.legacy ? t('knowledge:wikiHistory.legacy') : `${revision.actor ?? ''} · ${revision.reason ?? ''}`}</p>
        <pre>{revision.page.markdown}</pre>
        <p>{t('knowledge:wikiHistory.sources')}</p>
        <ul className={styles.sources}>
          {revision.page.sourceFactIds.map(id => <li key={id}>{id}</li>)}
          {revision.page.sourceNoteRefs?.map(ref => <li key={ref.uri}>{ref.uri}<small>{ref.sourceHash}</small></li>)}
        </ul>
        <button type="button" disabled={busy} onClick={() => void pin()}>{t(revision.pinned ? 'knowledge:wikiHistory.unpin' : 'knowledge:wikiHistory.pin')}</button>
      </article>}
    </>}
  </section>
}
