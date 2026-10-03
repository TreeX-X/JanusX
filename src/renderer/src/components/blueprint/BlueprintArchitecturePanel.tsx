import type { Blueprint } from '@/services/blueprint'
import type { ArchitectureProjection, BlueprintViewMode } from '@/features/blueprint/architecture-view'
import { useI18n } from '@/i18n/useI18n'
import { BlueprintCompositionPanel } from './BlueprintCompositionPanel'

export function BlueprintViewSelector({ value, available, onChange }: { value: BlueprintViewMode; available: boolean; onChange: (value: BlueprintViewMode) => void }) {
  const { t } = useI18n('blueprint')
  return <div className="bp-view-selector" role="group" aria-label={t('blueprint:architecture.view')}>
    <button className="blueprint-btn" aria-pressed={value === 'structure'} disabled={!available && value !== 'structure'} onClick={() => onChange('structure')}>{t('blueprint:architecture.structure')}</button>
    <button className="blueprint-btn" aria-pressed={value === 'notes'} onClick={() => onChange('notes')}>{t('blueprint:architecture.notes')}</button>
  </div>
}

export function BlueprintArchitecturePanel({ source, projection, nodeId, onSelect }: { source: Blueprint; projection: ArchitectureProjection; nodeId?: string; onSelect: (id: string) => void }) {
  const { t } = useI18n('blueprint')
  const related = nodeId ? projection.related[nodeId] ?? [] : []
  const snapshots = [source.noteSnapshot, ...(source.composition?.checkouts.map(row => row.snapshot) ?? [])].filter(value => !!value)
  return <div className="bp-architecture-panel">
    {!nodeId && <details className="bp-composition">
      <summary>{t('blueprint:architecture.structure')} · {projection.graph.nodeIds.length} · {t('blueprint:architecture.coverage')}</summary>
      <section>
        <p>{t('blueprint:architecture.currentOnly')}</p>
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
        <small>{row.nodeId ? source.nodes[row.nodeId]?.kind : t('blueprint:architecture.unresolved')} · {row.via}</small>
      </div>)}
    </section>}
  </div>
}
