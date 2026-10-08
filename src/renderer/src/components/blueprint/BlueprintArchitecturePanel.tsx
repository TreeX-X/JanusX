import type { Blueprint } from '@/services/blueprint'
import type { ArchitectureProjection } from '@/features/blueprint/architecture-view'
import { useI18n } from '@/i18n/useI18n'
import { BlueprintCompositionPanel } from './BlueprintCompositionPanel'

// Note: unified module browsing — see .agents/notes/blueprint/navigation/requirements/module-browsing.md
export function BlueprintArchitecturePanel({ source, projection, nodeId, onSelect }: { source: Blueprint; projection: ArchitectureProjection; nodeId?: string; onSelect: (id: string) => void }) {
  const { t } = useI18n('blueprint')
  const relationLabels: Record<string, string> = {
    'depends-on': t('blueprint:maintenance.relationType.dependsOn'), implements: t('blueprint:maintenance.relationType.implements'),
    'governed-by': t('blueprint:architecture.governedBy'), 'derived-from': t('blueprint:architecture.derivedFrom'),
    supersedes: t('blueprint:architecture.supersedes'), 'related-to': t('blueprint:maintenance.relationType.relatedTo'),
    acceptance: t('blueprint:architecture.acceptance'), reference: t('blueprint:architecture.reference'),
    module: t('blueprint:architecture.ownership'), parent: t('blueprint:architecture.ownership'),
  }
  const related = nodeId ? projection.related[nodeId] ?? [] : []
  const snapshots = [source.noteSnapshot, ...(source.composition?.checkouts.map(row => row.snapshot) ?? [])].filter(value => !!value)
  return <div className="bp-architecture-panel">
    {!nodeId && <details className="bp-composition">
      <summary>{t('blueprint:architecture.info')}</summary>
      <section>
        <p>{t('blueprint:architecture.module')} · {projection.graph.nodeIds.length} · {t('blueprint:architecture.coverage')}</p>
        <p>{t('blueprint:browse.moduleHint')}</p>
        {snapshots.map((snapshot, index) => <p key={index}>{snapshot.coverage.checkoutRoot} · {snapshot.coverage.status}</p>)}
        {source.invalidNotes?.map((note, index) => <p className="bp-note-warning" key={index}>{note.relPath}: {note.diagnostics.map(item => item.message).join('; ')}</p>)}
        {snapshots.flatMap(snapshot => snapshot.diagnostics.map((item, index) => <p className="bp-note-warning" key={snapshot.coverage.checkoutRoot + index}>{item.code}: {item.message}</p>))}
      </section>
    </details>}
    <BlueprintCompositionPanel blueprint={projection.graph} nodeId={nodeId} onSelect={onSelect} />
    {nodeId && <section className="bp-composition" aria-label={t('blueprint:architecture.related')}>
      <strong>{t('blueprint:architecture.related')}</strong>
      {!related.length && <p>{t('blueprint:architecture.noRelated')}</p>}
      {related.map(row => <div className="bp-note-relation" key={row.nodeId ?? row.uri}>
        <button type="button" disabled={!row.nodeId} title={row.uri} onClick={() => row.nodeId && onSelect(row.nodeId)}>{row.nodeId ? source.nodes[row.nodeId]?.title : row.uri}</button>
        <small>{row.nodeId ? source.nodes[row.nodeId]?.kind : t('blueprint:architecture.unresolved')}{!row.links?.length && <> · {relationLabels[row.via] ?? row.via}</>}</small>
        {row.links?.map((link, index) => <small key={index} className="bp-note-relation-source" title={[link.sourceUri, link.type, link.targetUri, link.reason].filter(Boolean).join(' → ')}>
          {relationLabels[link.type] ?? link.type} {link.criteria?.join(', ')} · {source.nodes[link.sourceNodeId]?.title ?? link.sourceUri} → {(link.targetNodeId && source.nodes[link.targetNodeId]?.title) || link.targetUri}
        </small>)}
      </div>)}
    </section>}
  </div>
}
