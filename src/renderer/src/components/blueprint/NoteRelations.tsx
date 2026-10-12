import { useEffect, useId, useState } from 'react'
import { ArrowUpRight, ChevronRight } from 'lucide-react'
import type { Components } from 'react-markdown'
import type { NoteReadSnapshot, NoteSourceRead } from '../../../../shared/notes'
import { noteWikiView } from '../../../../shared/note-wiki'
import { useI18n } from '@/i18n/useI18n'
import { noteSourceKey, useNoteSourceStore } from '@/stores/note-source'
import { NoteMarkdown } from './NoteMarkdown'

type Relation = { target?: string; title: string; type: string; incoming: boolean; status: string; readable?: boolean; anchor?: string; anchorStatus?: string; criteria?: string[]; scope?: string; reason?: string }
type Props = { snapshot: NoteReadSnapshot; uri: string; rootPath: string; canNavigate?: (uri: string) => boolean; onOpen: (uri: string, anchor?: string) => void; renderLink: (source: NoteSourceRead) => Components['a'] }

// Note: direction, metadata and prose mentions remain distinct — see .agents/notes/blueprint/documents/module.md
export function NoteRelations({ snapshot, uri, ...props }: Props) {
  const { t } = useI18n('blueprint')
  const view = noteWikiView(snapshot, uri)
  const rows: Relation[] = [
    ...view.outgoing.map(edge => ({ ...edge, target: edge.targetUri, incoming: false, status: edge.resolution.status })),
    ...view.backlinks.map(edge => ({ ...edge, target: edge.sourceUri, incoming: true, status: edge.resolution.status })),
    ...view.mentions.map(edge => ({ ...edge, type: 'mention', target: edge.targetUri, incoming: false, status: edge.resolution.status, anchorStatus: edge.resolution.anchorStatus, title: edge.destinations.join(', ') })),
    ...view.mentionedBy.map(edge => ({ ...edge, type: 'mention', target: edge.sourceUri, incoming: true, status: 'resolved' })),
  ].map(row => ({ ...row, readable: !!row.target && view.entries.has(row.target), title: row.target ? view.entries.get(row.target)?.doc?.title ?? t('reader.untitledRelation') : 'title' in row ? row.title : t('reader.untitledRelation') }))
  // harness-note/2 membership lives in module, rather than an authored parent edge.
  const parent = view.entry?.doc?.module
  if (parent && !rows.some(row => row.type === 'parent' && !row.incoming && row.target === parent)) rows.unshift({ type: 'parent', target: parent, title: view.entries.get(parent)?.doc?.title ?? t('reader.untitledRelation'), incoming: false, readable: view.entries.has(parent), status: view.entries.has(parent) ? 'resolved' : 'unavailable' })
  for (const entry of view.entries.values()) {
    if (entry.doc?.module !== uri || rows.some(row => row.type === 'parent' && row.incoming && row.target === entry.uri)) continue
    rows.push({ type: 'parent', target: entry.uri!, title: entry.doc.title, incoming: true, readable: true, status: 'resolved' })
  }
  const groups = new Map<string, Relation[]>()
  for (const row of rows) {
    const group = row.type + (row.incoming ? 'In' : 'Out')
    groups.set(group, [...(groups.get(group) ?? []), row])
  }
  return <div className="bp-note-relations">
    {!rows.length && <p className="bp-note-relations__empty">{t('reader.noRelations')}</p>}
    {[...groups].map(([group, items]) => <section key={group} aria-label={t(`reader.relations.${group}`)}>
      <h3>{t(`reader.relations.${group}`)} <span>{items.length}</span></h3>
      {items.map((row, index) => <RelationCard key={`${row.target}:${row.anchor}:${index}`} row={row} {...props} />)}
    </section>)}
  </div>
}

function RelationCard({ row, rootPath, canNavigate, onOpen, renderLink }: Omit<Props, 'snapshot' | 'uri'> & { row: Relation }) {
  const { t } = useI18n('blueprint')
  const [expanded, setExpanded] = useState(false)
  const [loaded, setLoaded] = useState<NoteSourceRead | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const previewId = useId()
  const delivered = useNoteSourceStore(state => row.target ? state.sources[noteSourceKey(rootPath, row.target)] : undefined)
  const navigable = !!row.target && (row.readable || !!canNavigate?.(row.target))
  useEffect(() => {
    if (!expanded || !row.target) return
    let active = true
    setLoaded(null); setError('')
    void useNoteSourceStore.getState().refresh(rootPath, row.target).then(source => { if (active) setLoaded(source) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { active = false }
  }, [expanded, row.target, rootPath, retry])
  const current = loaded ? delivered ?? loaded : null
  const previewLabel = t(expanded ? 'reader.hidePreview' : 'reader.previewNote')
  return <article className="bp-note-relation-card bp-reader-card">
    <div className="bp-reader-card__header">
      <div className="bp-reader-card__title-row">
        <button type="button" className="bp-reader-card__toggle" disabled={!row.readable} aria-expanded={expanded} aria-controls={previewId} aria-label={`${previewLabel} · ${row.title}`} title={previewLabel} onClick={() => setExpanded(value => !value)}><ChevronRight className="bp-disclosure-chevron" size={14} aria-hidden="true" /><strong>{row.title}</strong></button>
        <button type="button" className="bp-reader-card__icon" disabled={!navigable} title={t('reader.openNote', { title: row.title })} aria-label={t('reader.openNote', { title: row.title })} onClick={() => row.target && onOpen(row.target, row.incoming ? undefined : row.anchor)}><ArrowUpRight size={15} aria-hidden="true" /></button>
      </div>
      <p className="bp-reader-card__description">{t(`reader.explanations.${row.type}${row.incoming ? 'In' : 'Out'}`)}</p>
      {row.status !== 'resolved' && <p className="bp-note-relation-card__warning">{t(`reader.resolution.${row.status}`)}</p>}
      {row.anchorStatus && row.anchorStatus !== 'resolved' && <p className="bp-note-relation-card__warning">{t('reader.anchorMissing', { anchor: row.anchor ?? '' })}</p>}
    </div>
    <div id={previewId} className="bp-note-related-preview bp-reader-card__body" hidden={!expanded}>
      {error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>{t('reader.retry')}</button></p>
        : !current ? <p role="status">{t('attention.loadingBody')}</p>
          : <NoteMarkdown source={current} link={renderLink(current)} />}
    </div>
    <details className="bp-note-relation-card__reference"><summary>{t('reader.referenceDetails')}</summary>
      <code>{row.target ?? row.title}{row.anchor ? '#' + row.anchor : ''}</code>
      {row.reason && <p>{row.reason}</p>}
      {!!row.criteria?.length && <p>{t('reader.criteria', { criteria: row.criteria.join(', ') })}</p>}
      {row.scope && <p>{t('reader.scope', { scope: row.scope })}</p>}
    </details>
  </article>
}
