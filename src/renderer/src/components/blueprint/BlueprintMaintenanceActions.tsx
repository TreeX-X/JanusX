// Note: discussion becomes a host proposal before any Note write — see .agents/notes/2026-09-29-blueprint-maintenance-approval-gap--a1b2c3d4.md
import { useEffect, useRef, useState } from 'react'
import type { Blueprint } from '@/services/blueprint'
import type { Workspace } from '@/types'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { useWorkspaceStore } from '@/stores/workspace'
import { useBlueprintStore } from '@/stores/blueprint'
import { projectGraph } from '@/services/harness'
import { sameCheckoutPath } from '@/features/blueprint/resolveNodeWorkspace'
import { useI18n } from '@/i18n/useI18n'
import type { UseJanusChatReturn } from '../janus/useJanusChat'
import type { BlueprintMaintenanceScope } from '../../../../shared/janus/maintenance-types'
import { MaintenanceApproval } from './MaintenanceApproval'
import { resolveMaintenanceContext } from './maintenanceContext'
import styles from './BlueprintMaintenanceActions.module.css'

interface Props {
  chat: UseJanusChatReturn
  blueprint: Blueprint
  workspace: Workspace
  ownerPath: string | null
  nodeId?: string
}

const closed = (status: string) => status === 'completed' || status === 'cancelled'

export function BlueprintMaintenanceActions({ chat, blueprint, workspace, ownerPath, nodeId }: Props) {
  const { t } = useI18n('blueprint')
  const store = useBlueprintMaintenanceStore()
  const workspaces = useWorkspaceStore(state => state.workspaces)
  const [target, setTarget] = useState<{ graphId: string; scope: BlueprintMaintenanceScope } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const actionLock = useRef(false)
  const alive = useRef(true)
  const latestChat = useRef(chat)
  latestChat.current = chat
  const sourcePath = (nodeId ? blueprint.composition?.nodes[nodeId]?.path : null) || ownerPath
  const sourceWorkspace = sourcePath ? workspaces.find(item => sameCheckoutPath(item.path, sourcePath)) : undefined
  const wrongWorkspace = !!sourcePath && !sameCheckoutPath(workspace.path, sourcePath)
  const initialize = store.initialize
  const loadAudits = store.loadAudits
  const task = store.tasks.find(item => item.conversationId === chat.conversationId
    && item.workspaceId === workspace.id && !closed(item.status))
    ?? store.tasks.find(item => item.blueprintId === target?.graphId && !closed(item.status))
  const working = busy || chat.isStreaming || task?.status === 'analyzing' || task?.status === 'applying'
  const proposal = task?.status === 'proposal-ready' ? task.changeSet : null
  const pendingUndo = store.pendingUndo?.changeSet.blueprintId === target?.graphId ? store.pendingUndo : null
  const audits = target ? store.audits[target.graphId] ?? [] : []
  const taskMatches = !!target && (!task || (task.conversationId === chat.conversationId && task.blueprintId === target.graphId
    && JSON.stringify(task.nodeScope) === JSON.stringify(target.scope)))

  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    let current = true
    setTarget(null)
    setError(null)
    if (wrongWorkspace) return
    void (async () => {
      await initialize()
      const failure = useBlueprintMaintenanceStore.getState().error
      if (failure) throw new Error(failure)
      if (nodeId) {
        const context = await resolveMaintenanceContext(blueprint, nodeId, ownerPath)
        if (context.stale) throw new Error(t('blueprint:maintenance.sourceChanged'))
        if (!sameCheckoutPath(context.checkoutPath, workspace.path)) throw new Error(t('blueprint:maintenance.sourceUnavailable'))
        return { graphId: context.graphId, scope: { type: 'node', nodeId: context.nodeId } as BlueprintMaintenanceScope }
      }
      const view = await projectGraph(workspace.path)
      if (!view || view.blueprint.id !== blueprint.id) throw new Error(t('blueprint:maintenance.sourceUnavailable'))
      return { graphId: view.blueprint.id, scope: { type: 'blueprint' } as BlueprintMaintenanceScope }
    })().then(result => {
      if (!current || !result) return
      setTarget(result)
      void loadAudits(result.graphId)
    }).catch(reason => { if (current) setError(String(reason instanceof Error ? reason.message : reason)) })
    return () => { current = false }
    // A new displayed source or explicit refresh must resolve its checkout again.
  }, [blueprint, nodeId, ownerPath, workspace.path, wrongWorkspace, refresh, t, initialize, loadAudits])

  async function run(action: () => Promise<void>) {
    if (actionLock.current || working) return
    actionLock.current = true
    setBusy(true)
    setError(null)
    try { await action() }
    catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { actionLock.current = false; if (alive.current) setBusy(false) }
  }

  function checkResult(ok: boolean | void) {
    const failure = useBlueprintMaintenanceStore.getState().error
    if (ok === false || failure) throw new Error(failure ?? t('blueprint:maintenance.operationFailed'))
  }

  async function propose() {
    if (!target || !taskMatches) return
    const goal = [...chat.messages].reverse().find(message => message.role === 'user')?.content.trim()
    if (!goal || !chat.activeModel) return
    let current = task
    const history = chat.messages
    if (!current) {
      current = await store.start({ blueprintId: target.graphId, conversationId: chat.conversationId,
        workspaceId: workspace.id, workspaceName: workspace.name, workspacePath: workspace.path,
        nodeScope: target.scope, goal }) ?? undefined
      if (!current) { checkResult(false); return }
      if (!alive.current || latestChat.current.messages !== history || latestChat.current.isStreaming) {
        await store.cancel(current.id)
        if (alive.current) throw new Error(t('blueprint:maintenance.conversationChanged'))
        return
      }
    }
    if (alive.current) chat.proposeMaintenance(current.id, t('blueprint:maintenance.proposalPrompt'))
  }

  return <section className={styles.actions} aria-label={t('blueprint:maintenance.proposalActions')}>
    <p className={styles.target}>{nodeId ? blueprint.nodes[nodeId]?.title : blueprint.name}</p>
    {wrongWorkspace ? <p>{sourceWorkspace
      ? <button type="button" disabled={working} onClick={() => useWorkspaceStore.getState().setActiveWorkspace(sourceWorkspace.id)}>{t('blueprint:maintenance.switchToSource', { name: sourceWorkspace.name })}</button>
      : t('blueprint:maintenance.sourceUnavailable')}</p> : <>
      {(error || task?.error || store.error) && <p role="alert">{error || task?.error || store.error}</p>}
      {!task && <p>{t('blueprint:maintenance.policyHint')}</p>}
      {(!target || error || store.error) && <button type="button" disabled={working} onClick={() => void run(async () => {
        await useBlueprintStore.getState().refreshAfterAnalysis()
        const failure = useBlueprintStore.getState().error
        if (failure) throw new Error(failure)
        if (alive.current) setRefresh(value => value + 1)
      })}>{t('blueprint:action.refresh')}</button>}
      {task && <p role="status">{task.phase}</p>}
      {target && !taskMatches && task && <p>{t('blueprint:maintenance.finishOtherTarget')}</p>}
      <div className={styles.buttons}>
        <button type="button" disabled={working || !target || !taskMatches || !!pendingUndo || !chat.activeModel || !chat.messages.some(message => message.role === 'user') || task?.status === 'stale'}
          onClick={() => void run(propose)}>{t('blueprint:maintenance.composeProposal')}</button>
        {task && <button type="button" disabled={working} onClick={() => void run(async () => {
          if (proposal || task.status === 'stale' || task.status === 'failed') await store.cancel(task.id)
          else await store.complete(task.id)
          checkResult()
          if (alive.current) setRefresh(value => value + 1)
        })}>
          {t(proposal ? 'blueprint:maintenance.cancelTask' : 'blueprint:maintenance.completeMaintenance')}</button>}
      </div>
      {proposal && taskMatches && <>
        <h4>{t('blueprint:maintenance.pendingProposal', { version: proposal.version })}</h4>
        <MaintenanceApproval key={JSON.stringify(proposal)} changeSet={proposal} busy={!!working}
          onApply={(operationIds, confirmedDeleteOperationIds) => run(async () => {
            checkResult(await store.apply({ taskId: task!.id, changeSetId: proposal.id, operationIds, confirmedDeleteOperationIds }))
          })} />
        <button type="button" disabled={working} onClick={() => void run(async () => { checkResult(await store.dismiss({ taskId: task!.id })) })}>{t('blueprint:maintenance.dismissProposal')}</button>
      </>}
      <details><summary>{t('blueprint:maintenance.auditHistory')}{store.error ? '' : ` · ${audits.length}`}</summary>
        {audits.length === 0 && !store.error && <p>{t('blueprint:maintenance.auditEmpty')}</p>}
        {audits.map(audit => <div key={audit.id}>
          <p>{audit.changeSetSnapshot.reason} · {t('blueprint:maintenance.auditOperations', { count: audit.selectedOperationIds.length })}</p>
          <p>{t('blueprint:maintenance.auditRevision', { before: audit.beforeRevision, after: audit.afterRevision })}</p>
          <button type="button" disabled={working || !!task || audit.status !== 'applied'} onClick={() => void run(async () => { checkResult(await store.prepareUndo(audit.blueprintId, audit.id)) })}>{t('blueprint:maintenance.undoAction')}</button>
        </div>)}
        {task && audits.length > 0 && <p>{t('blueprint:maintenance.undoBlockedActive')}</p>}
      </details>
      {pendingUndo && <>
        {pendingUndo.conflicts.map(conflict => <p key={conflict}>{conflict}</p>)}
        <MaintenanceApproval key={JSON.stringify(pendingUndo.changeSet)} changeSet={pendingUndo.changeSet} busy={!!working || !!task} undo
          onApply={(operationIds, confirmedDeleteOperationIds) => run(async () => {
            checkResult(await store.applyUndo({ blueprintId: pendingUndo.changeSet.blueprintId, undoChangeSetId: pendingUndo.changeSet.id, operationIds, confirmedDeleteOperationIds }))
          })} />
        <button type="button" disabled={working} onClick={store.clearPendingUndo}>{t('blueprint:maintenance.undoCancel')}</button>
      </>}
    </>}
  </section>
}
