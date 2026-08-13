import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, Check, ChevronDown, X } from 'lucide-react'
import { useBlueprintStore } from '@/stores/blueprint'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { useWorkspaceStore } from '@/stores/workspace'
import { useI18n } from '@/i18n/useI18n'
import type { TFunction } from 'i18next'
import type {
  BlueprintChangeSet,
  BlueprintMaintenanceAuditRecord,
  BlueprintOperation,
} from '@/services/blueprint'
import {
  auditOperationChanges,
  auditOperationEvidence,
  formatAuditValue,
  selectedAuditOperations,
} from './maintenanceAuditDetails'

interface BlueprintMaintenancePanelProps { onClose: () => void }

const EMPTY_AUDITS: BlueprintMaintenanceAuditRecord[] = []
const MESSAGE_SUMMARY_LIMIT = 220

export function splitMaintenanceReply(content: string): { summary: string; details: string | null } {
  const normalized = content.trim()
  const sections = normalized.split(/\n\s*\n/).map((section) => section.trim()).filter(Boolean)
  if (sections.length > 1) return { summary: sections[0], details: sections.slice(1).join('\n\n') }
  if (normalized.length <= MESSAGE_SUMMARY_LIMIT) return { summary: normalized, details: null }
  const sentenceEnd = normalized.slice(60, MESSAGE_SUMMARY_LIMIT).search(/[。！？.!?](?:\s|$)/)
  const summaryWindow = normalized.slice(0, MESSAGE_SUMMARY_LIMIT)
  const lastWhitespace = Math.max(summaryWindow.lastIndexOf(' '), summaryWindow.lastIndexOf('\n'))
  const splitAt = sentenceEnd >= 0
    ? 60 + sentenceEnd + 1
    : lastWhitespace > 80
      ? lastWhitespace
      : MESSAGE_SUMMARY_LIMIT
  return {
    summary: normalized.slice(0, splitAt).trim(),
    details: normalized.slice(splitAt).trim() || null,
  }
}

function relationTypeLabel(type: string, t: TFunction): string {
  const labels: Record<string, string> = {
    'depends-on': t('blueprint:maintenance.relationType.dependsOn'),
    blocks: t('blueprint:maintenance.relationType.blocks'),
    'related-to': t('blueprint:maintenance.relationType.relatedTo'),
    implements: t('blueprint:maintenance.relationType.implements'),
  }
  return labels[type] ?? type
}

function operationLabel(operation: BlueprintOperation, t: TFunction): string {
  switch (operation.type) {
    case 'create-node': return t('blueprint:maintenance.opCreate', { title: operation.after.title })
    case 'move-node': return t('blueprint:maintenance.opMove', { nodeId: operation.nodeId })
    case 'update-node': return t('blueprint:maintenance.opUpdate', { nodeId: operation.nodeId })
    case 'add-relation': return t('blueprint:maintenance.opAddRelation', {
      type: relationTypeLabel(operation.after.relationType, t),
      source: operation.after.sourceNodeId,
      target: operation.after.targetNodeId,
    })
    case 'update-relation': return t('blueprint:maintenance.opUpdateRelation', { relationId: operation.relationId })
    case 'remove-relation': return t('blueprint:maintenance.opRemoveRelation', { relationId: operation.relationId })
    case 'update-workspace-binding': return t('blueprint:maintenance.opBinding', { nodeId: operation.nodeId })
    case 'archive-node': return t('blueprint:maintenance.opArchive', { nodeId: operation.nodeId })
    case 'delete-node': return t('blueprint:maintenance.opDelete', { title: operation.impact.title })
    case 'restore-node': return t('blueprint:maintenance.opRestore', { title: operation.node.title })
  }
}

function riskLabel(risk: BlueprintOperation['risk'], t: TFunction): string {
  if (risk === 'high') return t('blueprint:maintenance.riskHigh')
  if (risk === 'medium') return t('blueprint:maintenance.riskMedium')
  return t('blueprint:maintenance.riskLow')
}

function fieldLabel(field: string, t: TFunction): string {
  const labels: Record<string, string> = {
    title: t('blueprint:maintenance.auditField.title'),
    type: t('blueprint:maintenance.auditField.type'),
    status: t('blueprint:maintenance.auditField.status'),
    progress: t('blueprint:maintenance.auditField.progress'),
    positioning: t('blueprint:maintenance.auditField.positioning'),
    description: t('blueprint:maintenance.auditField.description'),
    features: t('blueprint:maintenance.auditField.features'),
    techSolution: t('blueprint:maintenance.auditField.techSolution'),
    notes: t('blueprint:maintenance.auditField.notes'),
    tags: t('blueprint:maintenance.auditField.tags'),
    parentId: t('blueprint:maintenance.auditField.parentId'),
    relationType: t('blueprint:maintenance.auditField.relationType'),
    sourceNodeId: t('blueprint:maintenance.auditField.sourceNodeId'),
    targetNodeId: t('blueprint:maintenance.auditField.targetNodeId'),
    primaryWorkspaceId: t('blueprint:maintenance.auditField.primaryWorkspaceId'),
    linkedWorkspaceIds: t('blueprint:maintenance.auditField.linkedWorkspaceIds'),
  }
  return labels[field] ?? field
}

const RELATION_OPERATION_TYPES = new Set(['add-relation', 'update-relation', 'remove-relation'])

interface OperationGroups {
  nodeOps: BlueprintOperation[]
  relationOps: BlueprintOperation[]
  deleteOps: BlueprintOperation[]
}

function groupOperations(operations: BlueprintOperation[]): OperationGroups {
  const groups: OperationGroups = { nodeOps: [], relationOps: [], deleteOps: [] }
  for (const operation of operations) {
    if (operation.type === 'delete-node') groups.deleteOps.push(operation)
    else if (RELATION_OPERATION_TYPES.has(operation.type)) groups.relationOps.push(operation)
    else groups.nodeOps.push(operation)
  }
  return groups
}

/** Selection helpers shared by proposal approval and undo approval. */
function useOperationSelection(changeSet: BlueprintChangeSet | null) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmedDeletes, setConfirmedDeletes] = useState<Set<string>>(new Set())
  useEffect(() => {
    // Deletions never join the default bulk selection (doc §9.3).
    setSelected(new Set(changeSet?.operations
      .filter((item) => item.type !== 'delete-node')
      .map((item) => item.operationId) ?? []))
    setConfirmedDeletes(new Set())
    // Keyed on changeSet.id only: every task event clones the operations array,
    // and depending on its identity would reset the user's selection on each
    // status update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeSet?.id])

  const operations = changeSet?.operations ?? []
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(operations.map((item) => [item.operationId, item])), [changeSet?.id])

  const cascadeRemove = (seed: string, selectedNext: Set<string>, deletesNext: Set<string>) => {
    const remove = new Set([seed])
    let changed = true
    while (changed) {
      changed = false
      for (const item of operations) {
        if (!remove.has(item.operationId) && item.dependsOn.some((id) => remove.has(id))) {
          remove.add(item.operationId)
          changed = true
        }
      }
    }
    remove.forEach((id) => { selectedNext.delete(id); deletesNext.delete(id) })
  }

  const includeDependencies = (seed: BlueprintOperation, selectedNext: Set<string>) => {
    const include = (id: string) => {
      const item = byId.get(id)
      if (!item || item.type === 'delete-node') return
      selectedNext.add(id)
      item.dependsOn.forEach(include)
    }
    seed.dependsOn.forEach(include)
  }

  const toggleNormal = (operation: BlueprintOperation) => {
    setSelected((current) => {
      const next = new Set(current)
      const deletesNext = new Set(confirmedDeletes)
      if (next.has(operation.operationId)) {
        cascadeRemove(operation.operationId, next, deletesNext)
        setConfirmedDeletes(deletesNext)
      } else {
        next.add(operation.operationId)
        includeDependencies(operation, next)
      }
      return next
    })
  }

  const toggleDelete = (operation: BlueprintOperation) => {
    setConfirmedDeletes((current) => {
      const next = new Set(current)
      if (next.has(operation.operationId)) {
        next.delete(operation.operationId)
      } else {
        next.add(operation.operationId)
        setSelected((selectedCurrent) => {
          const selectedNext = new Set(selectedCurrent)
          includeDependencies(operation, selectedNext)
          return selectedNext
        })
      }
      return next
    })
  }

  const selectionIds = [...selected, ...confirmedDeletes]
  return { selected, confirmedDeletes, toggleNormal, toggleDelete, selectionIds }
}

function OperationList({ operations, checkedIds, onToggle, t }: {
  operations: BlueprintOperation[]
  checkedIds: Set<string>
  onToggle: (operation: BlueprintOperation) => void
  t: TFunction
}) {
  return (
    <>
      {operations.map((operation) => (
        <label key={operation.operationId} className="bp-maintenance-operation">
          <input type="checkbox" checked={checkedIds.has(operation.operationId)} onChange={() => onToggle(operation)} />
          <div>
            <strong>{operationLabel(operation, t)}</strong>
            <p>{operation.reason}</p>
            <span>{riskLabel(operation.risk, t)} · {t('blueprint:maintenance.evidenceCount', { count: operation.evidenceRefs.length })}</span>
          </div>
        </label>
      ))}
    </>
  )
}

function DeleteOperationList({ operations, confirmedDeletes, onToggle, t }: {
  operations: BlueprintOperation[]
  confirmedDeletes: Set<string>
  onToggle: (operation: BlueprintOperation) => void
  t: TFunction
}) {
  return (
    <>
      {operations.map((operation) => operation.type === 'delete-node' ? (
        <div key={operation.operationId} className="bp-maintenance-operation bp-maintenance-operation--delete">
          <div>
            <strong>{operationLabel(operation, t)}</strong>
            <p>{operation.reason}</p>
            <span>
              {t('blueprint:maintenance.deleteImpact', {
                children: operation.impact.childIds.length,
                incoming: operation.impact.incomingRelationIds.length,
                outgoing: operation.impact.outgoingRelationIds.length,
              })}
            </span>
            <label className="bp-maintenance-operation__confirm">
              <input
                type="checkbox"
                checked={confirmedDeletes.has(operation.operationId)}
                onChange={() => onToggle(operation)}
              />
              {t('blueprint:maintenance.deleteConfirm')}
            </label>
          </div>
        </div>
      ) : null)}
    </>
  )
}

export function BlueprintMaintenancePanel({ onClose }: BlueprintMaintenancePanelProps) {
  const { t } = useI18n('blueprint')
  const blueprint = useBlueprintStore((state) => state.currentBlueprint)
  const reloadBlueprint = useBlueprintStore((state) => state.loadBlueprint)
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId)
  const setWorkspaces = useWorkspaceStore((state) => state.setWorkspaces)
  const tasks = useBlueprintMaintenanceStore((state) => state.tasks)
  const openRequest = useBlueprintMaintenanceStore((state) => state.openRequest)
  const error = useBlueprintMaintenanceStore((state) => state.error)
  const initialize = useBlueprintMaintenanceStore((state) => state.initialize)
  const audits = useBlueprintMaintenanceStore((state) => (
    blueprint ? state.audits[blueprint.id] ?? EMPTY_AUDITS : EMPTY_AUDITS
  ))
  const loadAudits = useBlueprintMaintenanceStore((state) => state.loadAudits)
  const clearOpenRequest = useBlueprintMaintenanceStore((state) => state.clearOpenRequest)
  const start = useBlueprintMaintenanceStore((state) => state.start)
  const message = useBlueprintMaintenanceStore((state) => state.message)
  const propose = useBlueprintMaintenanceStore((state) => state.propose)
  const apply = useBlueprintMaintenanceStore((state) => state.apply)
  const cancel = useBlueprintMaintenanceStore((state) => state.cancel)
  const complete = useBlueprintMaintenanceStore((state) => state.complete)
  const pendingUndo = useBlueprintMaintenanceStore((state) => state.pendingUndo)
  const prepareUndo = useBlueprintMaintenanceStore((state) => state.prepareUndo)
  const clearPendingUndo = useBlueprintMaintenanceStore((state) => state.clearPendingUndo)
  const applyUndo = useBlueprintMaintenanceStore((state) => state.applyUndo)
  const task = tasks.find((item) => item.blueprintId === blueprint?.id && !['completed', 'cancelled'].includes(item.status)) ?? null
  const [workspaceIds, setWorkspaceIds] = useState<string[]>(() => activeWorkspaceId ? [activeWorkspaceId] : workspaces[0]?.id ? [workspaces[0].id] : [])
  const [scopeNodeId, setScopeNodeId] = useState(openRequest?.nodeId ?? blueprint?.rootNodeId ?? '')
  const [goal, setGoal] = useState(() => t('blueprint:maintenance.goalDefault'))
  const [draft, setDraft] = useState('')
  const [panelView, setPanelView] = useState<'conversation' | 'history'>('conversation')
  const taskScrollRef = useRef<HTMLDivElement>(null)
  const conversationBottomRef = useRef<HTMLDivElement>(null)
  const followsConversationRef = useRef(true)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)

  const proposalSelection = useOperationSelection(task?.changeSet ?? null)
  const undoSelection = useOperationSelection(pendingUndo?.changeSet ?? null)

  useEffect(() => { void initialize() }, [initialize])
  useEffect(() => {
    void window.electron.workspace.list().then((items) => {
      setWorkspaces(items)
      setWorkspaceIds((current) => {
        const valid = current.filter((id) => items.some((item) => item.id === id))
        if (valid.length) return valid
        const fallback = items.find((item) => item.id === activeWorkspaceId) ?? items[0]
        return fallback ? [fallback.id] : []
      })
    }).catch(() => undefined)
  }, [activeWorkspaceId, setWorkspaces])
  useEffect(() => { if (blueprint?.id) void loadAudits(blueprint.id) }, [blueprint?.id, loadAudits])
  useEffect(() => {
    if (!openRequest || openRequest.blueprintId !== blueprint?.id) return
    if (openRequest.nodeId) setScopeNodeId(openRequest.nodeId)
    clearOpenRequest()
  }, [blueprint?.id, clearOpenRequest, openRequest])

  const scrollConversationToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = taskScrollRef.current
    const target = conversationBottomRef.current
    if (!container || !target) return
    container.scrollTo({ top: Math.max(0, target.offsetTop - container.clientHeight + 24), behavior })
    followsConversationRef.current = true
    setShowScrollToBottom(false)
  }, [])

  const handleTaskScroll = useCallback(() => {
    const container = taskScrollRef.current
    const target = conversationBottomRef.current
    if (!container || !target) return
    const awayFromBottom = target.offsetTop - container.scrollTop - container.clientHeight > 96
    followsConversationRef.current = !awayFromBottom
    setShowScrollToBottom(awayFromBottom)
  }, [])

  useEffect(() => {
    if (!task || !followsConversationRef.current) return
    const frame = window.requestAnimationFrame(() => scrollConversationToBottom('auto'))
    return () => window.cancelAnimationFrame(frame)
  }, [scrollConversationToBottom, task?.changeSet?.id, task?.messages.length])

  const selectedWorkspaces = workspaces.filter((item) => workspaceIds.includes(item.id))
  const nodeOptions = blueprint?.nodeIds.map((id) => ({ value: id, label: blueprint.nodes[id]?.title ?? id })) ?? []
  const proposalGroups = useMemo(() => groupOperations(task?.changeSet?.operations ?? []), [task?.changeSet])
  const undoGroups = useMemo(() => groupOperations(pendingUndo?.changeSet.operations ?? []), [pendingUndo?.changeSet])
  const appliedAudits = audits.filter((record) => record.status === 'applied')
  const taskWorking = task?.status === 'analyzing' || task?.status === 'applying'
  const taskNeedsNotice = taskWorking || task?.status === 'failed' || task?.status === 'stale'

  const handleStart = async () => {
    const primaryWorkspace = selectedWorkspaces[0]
    if (!blueprint || !primaryWorkspace || !scopeNodeId) return
    await start({
      blueprintId: blueprint.id,
      workspaceId: primaryWorkspace.id,
      workspaceName: primaryWorkspace.name,
      workspacePath: primaryWorkspace.path,
      authorizedWorkspaces: selectedWorkspaces.map((workspace) => ({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspacePath: workspace.path,
      })),
      nodeScope: { type: 'node', nodeId: scopeNodeId },
      goal,
    })
  }
  const handleApply = async () => {
    if (!task?.changeSet || !blueprint) return
    const ok = await apply({
      taskId: task.id,
      changeSetId: task.changeSet.id,
      operationIds: proposalSelection.selectionIds,
      confirmedDeleteOperationIds: [...proposalSelection.confirmedDeletes],
    })
    if (ok) await reloadBlueprint(blueprint.id)
  }
  const handlePrepareUndo = async (auditId: string) => {
    if (!blueprint) return
    await prepareUndo(blueprint.id, auditId)
  }
  const handleApplyUndo = async () => {
    if (!blueprint || !pendingUndo) return
    const ok = await applyUndo({
      blueprintId: blueprint.id,
      undoChangeSetId: pendingUndo.changeSet.id,
      operationIds: undoSelection.selectionIds,
      confirmedDeleteOperationIds: [...undoSelection.confirmedDeletes],
    })
    if (ok) await reloadBlueprint(blueprint.id)
  }

  const renderGroups = (groups: OperationGroups, selection: ReturnType<typeof useOperationSelection>) => (
    <>
      {groups.nodeOps.length ? (
        <div className="bp-maintenance-group">
          <span className="bp-maintenance-group__title">{t('blueprint:maintenance.groupNodes')}</span>
          <OperationList operations={groups.nodeOps} checkedIds={selection.selected} onToggle={selection.toggleNormal} t={t} />
        </div>
      ) : null}
      {groups.relationOps.length ? (
        <div className="bp-maintenance-group">
          <span className="bp-maintenance-group__title">{t('blueprint:maintenance.groupRelations')}</span>
          <OperationList operations={groups.relationOps} checkedIds={selection.selected} onToggle={selection.toggleNormal} t={t} />
        </div>
      ) : null}
      {groups.deleteOps.length ? (
        <div className="bp-maintenance-group bp-maintenance-group--delete">
          <span className="bp-maintenance-group__title">{t('blueprint:maintenance.groupDeletes')}</span>
          <p className="bp-maintenance-group__hint">{t('blueprint:maintenance.deleteBulkExcluded')}</p>
          <DeleteOperationList operations={groups.deleteOps} confirmedDeletes={selection.confirmedDeletes} onToggle={selection.toggleDelete} t={t} />
        </div>
      ) : null}
    </>
  )

  const auditHistory = (
    <section className="bp-maintenance-history">
      <header><strong>{t('blueprint:maintenance.auditHistory')}</strong><span>{appliedAudits.length}</span></header>
      {appliedAudits.length ? appliedAudits.map((record) => (
        <details key={record.id} className="bp-maintenance-history__item">
          <summary>
            <div>
              <time dateTime={record.appliedAt ?? record.createdAt}>{new Date(record.appliedAt ?? record.createdAt).toLocaleString()}</time>
              <strong>{t('blueprint:maintenance.auditRevision', { before: record.beforeRevision, after: record.afterRevision })}</strong>
              <span>{t('blueprint:maintenance.auditOperations', { count: record.selectedOperationIds.length })}</span>
              {record.undoOfAuditId ? <span className="bp-maintenance-history__badge">{t('blueprint:maintenance.auditUndoBadge')}</span> : null}
            </div>
          </summary>
          <div className="bp-maintenance-history__details">
            {selectedAuditOperations(record).map((operation) => {
              const evidence = auditOperationEvidence(record, operation)
              return (
                <section key={operation.operationId} className="bp-maintenance-history__operation">
                  <header><strong>{operationLabel(operation, t)}</strong><span>{operation.reason}</span></header>
                  <div className="bp-maintenance-history__diff">
                    <span>{t('blueprint:maintenance.auditFieldLabel')}</span>
                    <span>{t('blueprint:maintenance.auditBefore')}</span>
                    <span>{t('blueprint:maintenance.auditAfter')}</span>
                    {auditOperationChanges(operation).map((change) => (
                      <div key={change.field} className="bp-maintenance-history__change">
                        <strong>{fieldLabel(change.field, t)}</strong>
                        <code>{formatAuditValue(change.before, t('blueprint:maintenance.auditEmptyValue'))}</code>
                        <code>{formatAuditValue(change.after, t('blueprint:maintenance.auditEmptyValue'))}</code>
                      </div>
                    ))}
                  </div>
                  <div className="bp-maintenance-history__evidence">
                    <strong>{t('blueprint:maintenance.auditEvidence')}</strong>
                    {evidence.length ? <ul>{evidence.map((item) => <li key={item}>{item}</li>)}</ul> : <span>{t('blueprint:maintenance.auditNoEvidence')}</span>}
                  </div>
                </section>
              )
            })}
            <div className="bp-maintenance-history__actions">
              <button
                className="blueprint-btn"
                type="button"
                disabled={!!task}
                title={task ? t('blueprint:maintenance.undoBlockedActive') : undefined}
                onClick={() => void handlePrepareUndo(record.id)}
              >
                {t('blueprint:maintenance.undoAction')}
              </button>
            </div>
          </div>
        </details>
      )) : <p>{t('blueprint:maintenance.auditEmpty')}</p>}
    </section>
  )

  const undoPanel = pendingUndo ? (
    <section className="bp-maintenance-proposal bp-maintenance-proposal--undo">
      <header>
        <strong>{t('blueprint:maintenance.undoTitle')}</strong>
        <span>{t('blueprint:maintenance.proposalSelection', { selected: undoSelection.selectionIds.length, total: pendingUndo.changeSet.operations.length })}</span>
      </header>
      {pendingUndo.conflicts.length ? (
        <div className="bp-maintenance-undo__conflicts">
          <strong>{t('blueprint:maintenance.undoConflicts')}</strong>
          <ul>{pendingUndo.conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}</ul>
        </div>
      ) : null}
      {renderGroups(undoGroups, undoSelection)}
      <div className="bp-maintenance-compose__actions">
        <button className="blueprint-btn blueprint-btn--primary" type="button" onClick={() => void handleApplyUndo()} disabled={!undoSelection.selectionIds.length}>{t('blueprint:maintenance.undoApply')}</button>
        <button className="blueprint-btn" type="button" onClick={clearPendingUndo}>{t('blueprint:maintenance.undoCancel')}</button>
      </div>
    </section>
  ) : null

  return (
    <aside className="bp-maintenance-panel" aria-label={t('blueprint:maintenance.consoleAria')}>
      <header className="bp-maintenance-panel__header">
        <div className="bp-maintenance-panel__identity">
          <div><span>{t('blueprint:maintenance.engineLabel')}</span><strong>{t('blueprint:maintenance.controlLabel')}</strong></div>
        </div>
        <button type="button" className="bp-panel-close" onClick={onClose} aria-label={t('blueprint:maintenance.closeConsole')} title={t('common:action.close')}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <nav className="bp-maintenance-panel__tabs" aria-label={t('blueprint:maintenance.viewAria')}>
        <button type="button" className={panelView === 'conversation' ? 'is-active' : ''} onClick={() => setPanelView('conversation')} aria-pressed={panelView === 'conversation'}>
          {t('blueprint:maintenance.viewConversation')}
        </button>
        <button type="button" className={panelView === 'history' ? 'is-active' : ''} onClick={() => setPanelView('history')} aria-pressed={panelView === 'history'}>
          {t('blueprint:maintenance.viewHistory')}
          {appliedAudits.length ? <span>{appliedAudits.length}</span> : null}
        </button>
      </nav>
      {panelView === 'history' ? (
        <div className="bp-maintenance-history-view">
          {undoPanel}
          {auditHistory}
        </div>
      ) : !task ? (
        <div className="bp-maintenance-start">
          <label>{t('blueprint:maintenance.authorizeWorkspace')}
            <details className="bp-maintenance-workspace-picker">
              <summary>
                <span>{selectedWorkspaces.length ? t('blueprint:maintenance.workspaceSelected', { count: selectedWorkspaces.length }) : t('blueprint:maintenance.workspaceSelectPlaceholder')}</span>
                <ChevronDown size={13} aria-hidden="true" />
              </summary>
              <div role="group" aria-label={t('blueprint:maintenance.authorizeWorkspace')}>
                {workspaces.length ? workspaces.map((workspace) => {
                  const selected = workspaceIds.includes(workspace.id)
                  return <button key={workspace.id} type="button" className={selected ? 'is-selected' : ''} aria-pressed={selected} onClick={() => setWorkspaceIds((current) => selected ? current.filter((id) => id !== workspace.id) : [...current, workspace.id])}>
                    <span><strong>{workspace.name}</strong><small>{workspace.path}</small></span>
                    {selected ? <Check size={14} aria-hidden="true" /> : null}
                  </button>
                }) : <p>{t('blueprint:maintenance.workspaceEmpty')}</p>}
              </div>
            </details>
          </label>
          <label>{t('blueprint:maintenance.targetNode')}<select value={scopeNodeId} onChange={(event) => setScopeNodeId(event.target.value)}>{nodeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>{t('blueprint:maintenance.maintenanceGoal')}<textarea value={goal} onChange={(event) => setGoal(event.target.value)} /></label>
          <p>{t('blueprint:maintenance.policyHint')}</p>
          <button className="blueprint-btn blueprint-btn--primary" type="button" onClick={() => void handleStart()} disabled={!blueprint || !selectedWorkspaces.length || !scopeNodeId || !goal.trim()}>{t('blueprint:maintenance.startConversation')}</button>
        </div>
      ) : (
        <div className="bp-maintenance-task" ref={taskScrollRef} onScroll={handleTaskScroll}>
          {taskNeedsNotice ? <div className="bp-maintenance-task-overview" role="status" aria-live="polite">
            <div className="bp-maintenance-status" data-status={task.status}>
              <div><strong>{task.phase}</strong><span>{t('blueprint:maintenance.taskRevision', { workspace: task.workspaceName, revision: task.baseRevision })}</span></div>
              <em>{task.progress}%</em>
            </div>
            <div className="bp-maintenance-progress"><span style={{ width: `${task.progress}%` }} /></div>
          </div> : null}
          <div className="bp-maintenance-messages">
            {task.messages.map((item) => {
              const reply = item.role === 'assistant' ? splitMaintenanceReply(item.content) : null
              return (
                <div key={item.id} data-role={item.role}>
                  <span>{item.role === 'user' ? t('blueprint:maintenance.roleUser') : t('blueprint:maintenance.roleJanus')}</span>
                  <p>{reply?.summary ?? item.content}</p>
                  {reply?.details ? (
                    <details className="bp-maintenance-message-details">
                      <summary>{t('blueprint:maintenance.expandReply')}</summary>
                      <div>{reply.details}</div>
                    </details>
                  ) : null}
                </div>
              )
            })}
            {taskWorking ? (
              <div className="bp-maintenance-thinking" role="status" aria-live="polite">
                <span>{t('blueprint:maintenance.roleJanus')}</span>
                <div><i /><i /><i /><em>{task.phase}</em></div>
              </div>
            ) : null}
            {task.error ? <div className="bp-maintenance-error">{task.error}</div> : null}
          </div>
          {task.changeSet ? (
            <section className="bp-maintenance-proposal">
              <header><strong>{t('blueprint:maintenance.pendingProposal', { version: task.changeSet.version })}</strong><span>{t('blueprint:maintenance.proposalSelection', { selected: proposalSelection.selectionIds.length, total: task.changeSet.operations.length })}</span></header>
              {renderGroups(proposalGroups, proposalSelection)}
              <button className="blueprint-btn blueprint-btn--primary" type="button" onClick={() => void handleApply()} disabled={!proposalSelection.selectionIds.length}>{t('blueprint:maintenance.approveSelected')}</button>
            </section>
          ) : null}
          {(task.status === 'active' || task.status === 'proposal-ready' || task.status === 'failed') ? (
            <div className="bp-maintenance-compose">
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t('blueprint:maintenance.composePlaceholder')} />
              <div className="bp-maintenance-compose__actions">
                <button type="button" disabled={!draft.trim()} onClick={() => { if (draft.trim()) { void message({ taskId: task.id, content: draft }); setDraft('') } }}>{t('blueprint:maintenance.sendMessage')}</button>
                <button type="button" className="bp-maintenance-compose__proposal" onClick={() => void propose({ taskId: task.id })}>{task.changeSet ? t('blueprint:maintenance.reviseProposal') : t('blueprint:maintenance.composeProposal')}</button>
              </div>
            </div>
          ) : null}
          <div ref={conversationBottomRef} className="bp-maintenance-conversation-bottom" aria-hidden="true" />
          {showScrollToBottom ? (
            <button
              type="button"
              className="bp-maintenance-scroll-bottom"
              onClick={() => scrollConversationToBottom()}
              aria-label={t('blueprint:maintenance.scrollToBottom')}
              title={t('blueprint:maintenance.scrollToBottom')}
            >
              <ArrowDownToLine size={15} aria-hidden="true" />
            </button>
          ) : null}
          <footer>
            {!['cancelled', 'completed'].includes(task.status) ? <button className="blueprint-btn" type="button" onClick={() => void cancel(task.id)}>{t('blueprint:maintenance.cancelTask')}</button> : null}
            {task.status === 'active' ? <button className="blueprint-btn" type="button" onClick={() => void complete(task.id)}>{t('blueprint:maintenance.completeMaintenance')}</button> : null}
          </footer>
        </div>
      )}
      {error ? <div className="bp-maintenance-error">{error}</div> : null}
    </aside>
  )
}
