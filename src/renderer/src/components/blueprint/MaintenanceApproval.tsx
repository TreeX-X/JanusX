import { useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import type { BlueprintChangeSet, BlueprintOperation } from '../../../../shared/janus/maintenance-types'
import { maintenanceSelection } from './maintenanceSelection'

export function OperationDetails({ operation }: { operation: BlueprintOperation }) {
  const { t } = useI18n('blueprint')
  const title = operation.type === 'delete-node' ? operation.impact.title
    : operation.type === 'create-node' ? operation.after.title
    : operation.type === 'restore-node' ? operation.node.title
    : 'nodeId' in operation ? operation.nodeId : 'relationId' in operation ? operation.relationId : operation.tempRelationId
  return <details className="bp-maintenance-operation-details">
    <summary>{operation.type} · {title}</summary>
    <p>{operation.reason}</p>
    {'before' in operation && <div>{t('blueprint:maintenance.auditBefore')}<pre>{JSON.stringify(operation.before, null, 2)}</pre></div>}
    {'after' in operation && <div>{t('blueprint:maintenance.auditAfter')}<pre>{JSON.stringify(operation.after, null, 2)}</pre></div>}
    {operation.type === 'move-node' && <p>{operation.beforeParentId} → {operation.afterParentId}</p>}
    {operation.type === 'archive-node' && <p>{operation.beforeStatus} → archived</p>}
    {operation.type === 'restore-node' && <pre>{JSON.stringify(operation.node, null, 2)}</pre>}
    {operation.type === 'delete-node' && <p>{t('blueprint:maintenance.deleteImpact', { children: operation.impact.childIds.length, incoming: operation.impact.incomingRelationIds.length, outgoing: operation.impact.outgoingRelationIds.length })}</p>}
    <small>{operation.risk} · {operation.operationId}</small>
    <p>{t('blueprint:maintenance.auditEvidence')}: {operation.evidenceRefs.join(', ') || t('blueprint:maintenance.auditNoEvidence')}</p>
    {operation.dependsOn.length > 0 && <p>{t('blueprint:maintenance.dependencies')}: {operation.dependsOn.join(', ')}</p>}
  </details>
}

/** The parent keys this component by the complete proposal content. */
export function MaintenanceApproval({ changeSet, busy, onApply, undo = false }: {
  changeSet: BlueprintChangeSet; busy: boolean; undo?: boolean
  onApply: (operationIds: string[], confirmedDeleteOperationIds: string[]) => Promise<void>
}) {
  const { t } = useI18n('blueprint')
  const [requested, setRequested] = useState<string[]>([])
  const [confirmed, setConfirmed] = useState<string[]>([])
  let selected: BlueprintOperation[] = []
  let error = ''
  try { selected = maintenanceSelection(changeSet, requested) } catch (reason) { error = String(reason) }
  const selectedIds = new Set(selected.map(op => op.operationId))
  const groups = changeSet.groups?.length ? changeSet.groups : changeSet.operations.map(op => ({ id: op.operationId, title: op.reason, operationIds: [op.operationId] }))
  const change = (ids: string[], checked: boolean) => {
    setRequested(current => checked ? [...new Set([...current, ...ids])] : current.filter(id => !ids.includes(id)))
    setConfirmed([])
  }
  const bulkIds = changeSet.operations.filter(op => op.type !== 'delete-node').map(op => op.operationId)
  const unconfirmed = selected.some(op => op.type === 'delete-node' && !confirmed.includes(op.operationId))
  return <section className="bp-maintenance-approval" aria-label={undo ? t('blueprint:maintenance.undoTitle') : t('blueprint:maintenance.pendingProposal', { version: changeSet.version })}>
    <p>{changeSet.reason}</p>
    <small>{t('blueprint:maintenance.proposalSelection', { selected: selected.length, total: changeSet.operations.length })}</small>
    <fieldset disabled={busy}>
      <label><input type="checkbox" checked={bulkIds.length > 0 && bulkIds.every(id => requested.includes(id))} onChange={event => change(bulkIds, event.target.checked)} />{t('blueprint:maintenance.selectAll')}</label>
      <p>{t('blueprint:maintenance.deleteBulkExcluded')}</p>
      {groups.map(group => <div className="bp-maintenance-approval-group" key={group.id}>
        <label><input type="checkbox" aria-label={group.title} checked={group.operationIds.every(id => selectedIds.has(id))}
          ref={element => { if (element) element.indeterminate = group.operationIds.some(id => selectedIds.has(id)) && !group.operationIds.every(id => selectedIds.has(id)) }}
          onChange={event => change(group.operationIds, event.target.checked)} />{group.title}</label>
        {group.operationIds.map(id => {
          const op = changeSet.operations.find(item => item.operationId === id)
          if (!op) return null
          const dependency = selectedIds.has(id) && !requested.includes(id)
          return <div key={id} className="bp-maintenance-approval-operation">
            <label><input type="checkbox" aria-label={t('blueprint:maintenance.selectOperation', { id })} checked={selectedIds.has(id)} disabled={dependency}
              onChange={event => change([id], event.target.checked)} />{id}{dependency ? ' · ' + t('blueprint:maintenance.dependencies') : ''}</label>
            <OperationDetails operation={op} />
          </div>
        })}
      </div>)}
      {selected.filter(op => op.type === 'delete-node').map(op => <label className="bp-maintenance-delete-confirm" key={op.operationId}>
        <input type="checkbox" checked={confirmed.includes(op.operationId)} onChange={event => setConfirmed(current => event.target.checked ? [...current, op.operationId] : current.filter(id => id !== op.operationId))} />
        {t('blueprint:maintenance.deleteConfirm')} · {op.operationId}
      </label>)}
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy || !!error || !selected.length || unconfirmed} onClick={() => void onApply(selected.map(op => op.operationId), confirmed)}>
      {t(undo ? 'blueprint:maintenance.undoApply' : 'blueprint:maintenance.approveSelected')}
    </button>
  </section>
}
