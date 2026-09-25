/**
 * Shared JanusChat with checkout-scoped maintenance approval and audit controls.
 * @see .agents/notes/2026-09-25-blueprint-r5--7be391fd.md
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useBlueprintStore } from '@/stores/blueprint'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { useWorkspaceStore } from '@/stores/workspace'
import { sameCheckoutPath } from '@/features/blueprint/resolveNodeWorkspace'
import { useI18n } from '@/i18n/useI18n'
import { JanusChat } from '../janus/JanusChat'
import { useJanusChatRegistry } from '../janus/JanusChatProvider'
import { MaintenanceApproval, OperationDetails } from './MaintenanceApproval'
import { resolveMaintenanceContext, type MaintenanceContext } from './maintenanceContext'

interface BlueprintMaintenancePanelProps { onClose: () => void }

function PanelFrame({ onClose, children }: BlueprintMaintenancePanelProps & { children: ReactNode }) {
  const { t } = useI18n('blueprint')
  return <aside className="bp-maintenance-panel" aria-label={t('blueprint:maintenance.consoleAria')}>
    <header className="bp-maintenance-panel__header">
      <div className="bp-maintenance-janus-head"><span className="bp-maintenance-janus-dot" aria-hidden="true" /><strong>Janus</strong></div>
      <button type="button" className="bp-panel-close" onClick={onClose} aria-label={t('blueprint:maintenance.closeConsole')}><X size={16} /></button>
    </header>
    {children}
  </aside>
}

export function BlueprintMaintenancePanel({ onClose }: BlueprintMaintenancePanelProps) {
  const blueprint = useBlueprintStore(state => state.currentBlueprint)
  const { t } = useI18n('blueprint')
  return blueprint?.source === 'harness'
    ? <ProjectChatColumn key={blueprint.id} onClose={onClose} />
    : <PanelFrame onClose={onClose}><p>{t('blueprint:view.emptySelectHint')}</p></PanelFrame>
}

function ProjectChatColumn({ onClose }: BlueprintMaintenancePanelProps) {
  const { t } = useI18n('blueprint')
  const registry = useJanusChatRegistry()
  const blueprint = useBlueprintStore(state => state.currentBlueprint)!
  const session = useBlueprintStore(state => state.activeSession)
  const workspaces = useWorkspaceStore(state => state.workspaces)
  const maintenance = useBlueprintMaintenanceStore()
  const selection = maintenance.contextSelection
  const selectedId = selection?.blueprintId === blueprint.id ? selection.nodeId ?? blueprint.rootNodeId : blueprint.rootNodeId
  const selected = blueprint.nodes[selectedId]
  const [context, setContext] = useState<MaintenanceContext | null>(null)
  const [contextError, setContextError] = useState('')
  const [actionError, setActionError] = useState('')
  const [conversationId, setConversationId] = useState<string>()
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([])
  const [scope, setScope] = useState<'node' | 'subtree' | 'blueprint'>('node')
  const [goal, setGoal] = useState(t('blueprint:maintenance.goalDefault'))
  const [busy, setBusy] = useState(false)
  const bindingKey = useRef('')
  const actionLock = useRef(false)
  const contextGeneration = useRef(0)
  const { initialize, loadAudits, clearPendingUndo } = maintenance

  useEffect(() => { void initialize() }, [initialize])
  useEffect(() => {
    const generation = ++contextGeneration.current
    setContext(null)
    setContextError('')
    bindingKey.current = ''
    void resolveMaintenanceContext(blueprint, selectedId, session?.workspacePath ?? null).then(value => {
      if (generation === contextGeneration.current) setContext(value)
    }).catch(error => {
      if (generation === contextGeneration.current) setContextError(String(error))
    })
    return () => { ++contextGeneration.current }
  }, [blueprint, selectedId, session?.workspacePath])
  const graphId = context?.graphId
  const checkoutPath = context?.checkoutPath
  useEffect(() => {
    clearPendingUndo()
    if (graphId) void loadAudits(graphId)
    return clearPendingUndo
  }, [graphId, clearPendingUndo, loadAudits])
  const sourceWorkspace = workspaces.find(item => checkoutPath && sameCheckoutPath(item.path, checkoutPath))
  useEffect(() => {
    setWorkspaceIds(sourceWorkspace ? [sourceWorkspace.id] : [])
  }, [checkoutPath, sourceWorkspace?.id])

  const task = maintenance.tasks.find(item => item.blueprintId === graphId && !['completed', 'cancelled'].includes(item.status))
  useEffect(() => { if (task) setScope(task.nodeScope.type) }, [task?.id])
  const selectedWorkspaces = workspaces.filter(item => workspaceIds.includes(item.id))
  const authorizedIds = task ? (task.authorizedWorkspaces ?? [{ workspaceId: task.workspaceId }]).map(item => item.workspaceId) : workspaceIds
  const authorizedKey = [...authorizedIds].sort().join('|')
  const engineeringContext = context ? {
    domain: 'project' as const, intent: 'maintain' as const,
    scope: scope === 'blueprint' ? 'view' as const : scope === 'subtree' ? 'subtree' as const : 'selected' as const,
    repoIds: [context.repoId], viewRef: { ownerRepoId: context.repoId, viewId: context.graphId },
    noteRefs: [{ uri: context.uri, expectedHash: context.expectedHash, checkoutPath: context.checkoutPath }],
  } : null
  const engineeringKey = JSON.stringify(engineeringContext)
  useEffect(() => {
    if (!registry.persistenceReady || !engineeringContext) return
    const key = engineeringKey + authorizedKey
    if (bindingKey.current === key) return
    bindingKey.current = key
    const id = registry.bindProject(engineeringContext, authorizedIds, blueprint.name)
    const chat = registry.getController(id)
    chat.setEngineeringContext(engineeringContext)
    chat.setApprovalMode('plan')
    for (const resource of chat.resourceController.resources) {
      if (!authorizedIds.includes(resource.workspaceId)) chat.resourceController.detachWorkspace(resource.workspaceId)
    }
    for (const id of authorizedIds) chat.resourceController.attachWorkspace(id)
    setConversationId(id)
  }, [registry, engineeringKey, authorizedKey, blueprint.name])
  const chat = conversationId ? registry.getController(conversationId) : null
  const attachedIds = chat?.resourceController.resources.map(item => item.workspaceId).sort().join('|')
  const boundRef = chat?.engineeringContext?.noteRefs[0]
  const bound = !!context && chat?.conversationId === conversationId
    && chat?.engineeringContext?.viewRef?.viewId === graphId
    && chat?.engineeringContext?.scope === engineeringContext?.scope
    && boundRef?.uri === context.uri && boundRef?.expectedHash === context.expectedHash
    && boundRef?.checkoutPath === checkoutPath && attachedIds === authorizedKey
  const scopeMatches = !task || task.nodeScope.type === scope && (task.nodeScope.type === 'blueprint' || task.nodeScope.nodeId === context?.nodeId)
  const conversationMatches = !task || task.conversationId === conversationId
  const taskWorking = busy || !!chat?.isStreaming || task?.status === 'analyzing' || task?.status === 'applying'
  const canPropose = bound && !!sourceWorkspace && !context?.stale && !taskWorking && scopeMatches && conversationMatches && selectedWorkspaces.length > 0
  const audits = graphId ? maintenance.audits[graphId] ?? [] : []
  const pendingUndo = maintenance.pendingUndo?.changeSet.blueprintId === graphId ? maintenance.pendingUndo : null

  async function run(action: () => Promise<unknown>): Promise<void> {
    if (actionLock.current) return
    actionLock.current = true
    setBusy(true)
    setActionError('')
    try { await action() } catch (error) { setActionError(String(error)) }
    finally { actionLock.current = false; setBusy(false) }
  }
  async function propose(text: string): Promise<void> {
    if (!canPropose || !context || !sourceWorkspace || !chat || !text.trim()) return
    const generation = contextGeneration.current
    await run(async () => {
      const target = task ?? await maintenance.start({
        blueprintId: context.graphId, conversationId: chat.conversationId,
        workspaceId: sourceWorkspace.id, workspaceName: sourceWorkspace.name, workspacePath: sourceWorkspace.path,
        authorizedWorkspaces: selectedWorkspaces.map(item => ({ workspaceId: item.id, workspaceName: item.name, workspacePath: item.path })),
        nodeScope: scope === 'blueprint' ? { type: 'blueprint' } : { type: scope, nodeId: context.nodeId },
        goal: text.trim(), providerId: chat.activeModel?.providerId, modelId: chat.activeModel?.modelId,
      })
      if (target && generation === contextGeneration.current) registry.getController(chat.conversationId).proposeMaintenance(target.id, text.trim())
    })
  }
  const proposal = task?.changeSet?.status === 'ready' ? task.changeSet : null
  return <PanelFrame onClose={onClose}>
    <div className="bp-maintenance-controls">
      <div className="bp-maintenance-context" aria-live="polite">
        <strong>{selected?.title}</strong>
        <small>{context?.uri ?? selected?.sourceUri}</small>
        <small>{checkoutPath}</small>
      </div>
      {contextError && <p role="alert">{contextError}</p>}
      {context?.stale && <p role="alert">{t('blueprint:maintenance.staleSource')}</p>}
      {context && !sourceWorkspace && <p role="alert">{t('blueprint:maintenance.registerWorkspace')}</p>}
      {(!scopeMatches || !conversationMatches) && <p role="alert">{t('blueprint:maintenance.activeScopeMismatch')}</p>}
      {(actionError || maintenance.error || task?.error) && <p role="alert">{actionError || maintenance.error || task?.error}</p>}
      <details className="bp-maintenance-settings" open={!task}>
        <summary>{t('blueprint:maintenance.maintenanceTaskFold')}</summary>
        <fieldset disabled={taskWorking || !!task}>
          <label>{t('blueprint:maintenance.targetNode')}
            <select aria-label={t('blueprint:maintenance.targetNode')} value={selectedId} onChange={event => maintenance.selectContext({ blueprintId: blueprint.id, nodeId: event.target.value })}>
              {Object.values(blueprint.nodes).filter(node => node.sourceUri).map(node => <option key={node.id} value={node.id}>{node.title}</option>)}
            </select>
          </label>
          <label>{t('blueprint:maintenance.nodeScope')}
            <select aria-label={t('blueprint:maintenance.nodeScope')} value={scope} onChange={event => setScope(event.target.value as typeof scope)}>
              <option value="node">{t('blueprint:maintenance.scopeCurrentNode')}</option>
              <option value="subtree">{t('blueprint:maintenance.scopeSubtree')}</option>
              <option value="blueprint">{t('blueprint:maintenance.scopeBlueprint')}</option>
            </select>
          </label>
          <div className="bp-maintenance-workspace-picker" role="group" aria-label={t('blueprint:maintenance.authorizeWorkspace')}>
            <strong>{t('blueprint:maintenance.authorizeWorkspace')}</strong>
            {workspaces.map(item => <label key={item.id}><input type="checkbox" checked={authorizedIds.includes(item.id)} disabled={item.id === sourceWorkspace?.id}
              onChange={event => setWorkspaceIds(ids => event.target.checked ? [...new Set([...ids, item.id])] : ids.filter(id => id !== item.id))} />{item.name}<small>{item.path}</small></label>)}
          </div>
        </fieldset>
        <label>{t('blueprint:maintenance.maintenanceGoal')}<textarea rows={2} value={goal} disabled={taskWorking} onChange={event => setGoal(event.target.value)} /></label>
        <button type="button" disabled={!canPropose || !goal.trim()} onClick={() => void propose(goal)}>{t('blueprint:maintenance.composeProposal')}</button>
        <small>{t('blueprint:maintenance.policyHint')}</small>
      </details>
      {task && <section className="bp-maintenance-task-overview" aria-live="polite">
        <strong>{task.goal}</strong><small>{task.workspacePath} · {task.nodeScope.type}</small>
        <div className={taskWorking ? 'bp-maintenance-thinking' : undefined}>{task.status} · {task.phase} · {task.progress}%</div>
        <progress aria-label={t('blueprint:maintenance.maintenanceTaskFold')} max={100} value={task.progress} />
        <button type="button" disabled={taskWorking} onClick={() => void run(() => maintenance.complete(task.id))}>{t('blueprint:maintenance.completeMaintenance')}</button>
        <button type="button" disabled={busy || task.status === 'applying'} onClick={() => { chat?.stop(); void run(() => maintenance.cancel(task.id)) }}>{t('blueprint:maintenance.cancelTask')}</button>
      </section>}
      {proposal && <MaintenanceApproval key={JSON.stringify(proposal)} changeSet={proposal}
        busy={taskWorking || !bound || !scopeMatches || !conversationMatches || !!context?.stale || task?.status === 'stale' || task?.status === 'failed'}
        onApply={(ids, deletes) => run(() => maintenance.apply({ taskId: task!.id, changeSetId: proposal.id, operationIds: ids, confirmedDeleteOperationIds: deletes }))} />}
      {proposal && <button type="button" disabled={taskWorking} onClick={() => void run(() => maintenance.dismiss({ taskId: task!.id }))}>{t('blueprint:maintenance.dismissProposal')}</button>}
      {pendingUndo && <section>
        {pendingUndo.conflicts.length > 0 && <p role="alert">{t('blueprint:maintenance.undoConflicts')}: {pendingUndo.conflicts.join('; ')}</p>}
        <MaintenanceApproval key={JSON.stringify(pendingUndo.changeSet)} changeSet={pendingUndo.changeSet} undo busy={taskWorking || !!task || !bound}
          onApply={(ids, deletes) => run(() => maintenance.applyUndo({ blueprintId: graphId!, undoChangeSetId: pendingUndo.changeSet.id, operationIds: ids, confirmedDeleteOperationIds: deletes }))} />
        <button type="button" disabled={busy} onClick={clearPendingUndo}>{t('blueprint:maintenance.undoCancel')}</button>
      </section>}
      <details className="bp-maintenance-audits">
        <summary>{t('blueprint:maintenance.auditHistory')} ({audits.length})</summary>
        {!audits.length && <p>{t('blueprint:maintenance.auditEmpty')}</p>}
        {audits.map(audit => <article key={audit.id}>
          <strong>{audit.undoOfAuditId ? t('blueprint:maintenance.auditUndoBadge') : audit.changeSetSnapshot.reason}</strong>
          <small>{audit.harnessRoot ?? checkoutPath} · {audit.status}</small>
          <small>{t('blueprint:maintenance.auditRevision', { before: audit.beforeRevision, after: audit.afterRevision })}</small>
          <p>{t('blueprint:maintenance.appliedOperations')}: {audit.selectedOperationIds.join(', ') || '—'}</p>
          <p>{t('blueprint:maintenance.rejectedOperations')}: {audit.rejectedOperationIds.join(', ') || '—'}</p>
          {audit.changeSetSnapshot.operations.filter(op => audit.selectedOperationIds.includes(op.operationId)).map(op => <OperationDetails key={op.operationId} operation={op} />)}
          <button type="button" disabled={taskWorking || !!task || audit.status !== 'applied'} title={task ? t('blueprint:maintenance.undoBlockedActive') : undefined}
            onClick={() => void run(() => maintenance.prepareUndo(graphId!, audit.id))}>{t('blueprint:maintenance.undoAction')}</button>
        </article>)}
      </details>
    </div>
    {bound && chat && <div className="bp-maintenance-task">
      <JanusChat visible docked compactNavigation focused modeColor="#ff7830" messages={chat.messages}
        pendingContent={chat.pendingContent} isStreaming={chat.isStreaming} error={chat.error}
        modelOptions={chat.modelOptions} activeModel={chat.activeModel} modelNotice={chat.modelNotice}
        resourceController={chat.resourceController} toolTraces={chat.toolTraces} conversationController={chat}
        onSelectModel={chat.selectModel} onSend={text => {
          if (!task || chat.isStreaming) chat.send(text)
          else if (canPropose) void propose(text)
          else setActionError(t('blueprint:maintenance.activeScopeMismatch'))
        }} onRewrite={chat.rewrite}
        onStop={chat.stop} onRetry={chat.retry} onClear={chat.clear} minimalComposer />
    </div>}
  </PanelFrame>
}
