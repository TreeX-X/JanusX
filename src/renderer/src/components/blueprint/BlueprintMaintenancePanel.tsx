import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useBlueprintStore } from '@/stores/blueprint'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { useWorkspaceStore } from '@/stores/workspace'
import { Select } from '../ui/Select'
import type { BlueprintMaintenanceScope, BlueprintOperation } from '@/services/blueprint'

interface BlueprintMaintenancePanelProps { onClose: () => void }

function operationLabel(operation: BlueprintOperation): string {
  if (operation.type === 'create-node') return `新建：${operation.after.title}`
  if (operation.type === 'move-node') return `调整层级：${operation.nodeId}`
  return `更新：${operation.nodeId}`
}

export function BlueprintMaintenancePanel({ onClose }: BlueprintMaintenancePanelProps) {
  const blueprint = useBlueprintStore((state) => state.currentBlueprint)
  const reloadBlueprint = useBlueprintStore((state) => state.loadBlueprint)
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId)
  const tasks = useBlueprintMaintenanceStore((state) => state.tasks)
  const openRequest = useBlueprintMaintenanceStore((state) => state.openRequest)
  const error = useBlueprintMaintenanceStore((state) => state.error)
  const initialize = useBlueprintMaintenanceStore((state) => state.initialize)
  const clearOpenRequest = useBlueprintMaintenanceStore((state) => state.clearOpenRequest)
  const start = useBlueprintMaintenanceStore((state) => state.start)
  const message = useBlueprintMaintenanceStore((state) => state.message)
  const propose = useBlueprintMaintenanceStore((state) => state.propose)
  const apply = useBlueprintMaintenanceStore((state) => state.apply)
  const cancel = useBlueprintMaintenanceStore((state) => state.cancel)
  const complete = useBlueprintMaintenanceStore((state) => state.complete)
  const task = tasks.find((item) => item.blueprintId === blueprint?.id && !['completed', 'cancelled'].includes(item.status)) ?? null
  const [workspaceId, setWorkspaceId] = useState(activeWorkspaceId ?? workspaces[0]?.id ?? '')
  const [scopeType, setScopeType] = useState<'node' | 'subtree' | 'blueprint'>(openRequest?.nodeId ? 'node' : 'blueprint')
  const [scopeNodeId, setScopeNodeId] = useState(openRequest?.nodeId ?? blueprint?.rootNodeId ?? '')
  const [goal, setGoal] = useState('根据当前工作区实现情况整理蓝图节点内容和层级')
  const [draft, setDraft] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => { void initialize() }, [initialize])
  useEffect(() => {
    if (!openRequest || openRequest.blueprintId !== blueprint?.id) return
    if (openRequest.nodeId) { setScopeType('node'); setScopeNodeId(openRequest.nodeId) }
    clearOpenRequest()
  }, [blueprint?.id, clearOpenRequest, openRequest])
  useEffect(() => {
    setSelected(new Set(task?.changeSet?.operations.map((item) => item.operationId) ?? []))
  }, [task?.changeSet?.id])

  const workspace = workspaces.find((item) => item.id === workspaceId)
  const nodeOptions = blueprint?.nodeIds.map((id) => ({ value: id, label: blueprint.nodes[id]?.title ?? id })) ?? []
  const selectedOperations = useMemo(() => task?.changeSet?.operations.filter((item) => selected.has(item.operationId)) ?? [], [selected, task?.changeSet])

  const toggleOperation = (operation: BlueprintOperation) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(operation.operationId)) {
        const remove = new Set([operation.operationId])
        let changed = true
        while (changed) {
          changed = false
          for (const item of task?.changeSet?.operations ?? []) {
            if (!remove.has(item.operationId) && item.dependsOn.some((id) => remove.has(id))) { remove.add(item.operationId); changed = true }
          }
        }
        remove.forEach((id) => next.delete(id))
      } else {
        next.add(operation.operationId)
        const include = (id: string) => {
          const item = task?.changeSet?.operations.find((candidate) => candidate.operationId === id)
          if (!item) return
          next.add(id); item.dependsOn.forEach(include)
        }
        operation.dependsOn.forEach(include)
      }
      return next
    })
  }

  const handleStart = async () => {
    if (!blueprint || !workspace) return
    const nodeScope: BlueprintMaintenanceScope = scopeType === 'blueprint'
      ? { type: 'blueprint' }
      : { type: scopeType, nodeId: scopeNodeId }
    await start({ blueprintId: blueprint.id, workspaceId: workspace.id, workspaceName: workspace.name, workspacePath: workspace.path, nodeScope, goal })
  }
  const handleApply = async () => {
    if (!task?.changeSet || !blueprint) return
    const ok = await apply({ taskId: task.id, changeSetId: task.changeSet.id, operationIds: selectedOperations.map((item) => item.operationId) })
    if (ok) await reloadBlueprint(blueprint.id)
  }

  return (
    <aside className="bp-maintenance-panel" aria-label="Janus Copilot 控制台">
      <header className="bp-maintenance-panel__header">
        <div className="bp-maintenance-panel__identity">
          <div><span>JANUS // BLUEPRINT ENGINE</span><strong>COPILOT CONTROL</strong></div>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭控制台" title="关闭">
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      {!task ? (
        <div className="bp-maintenance-start">
          <label>授权工作区<Select value={workspaceId} onChange={setWorkspaceId} options={workspaces.map((item) => ({ value: item.id, label: item.name }))} /></label>
          <label>节点范围<Select value={scopeType} onChange={(value) => setScopeType(value as typeof scopeType)} options={[{ value: 'node', label: '当前节点' }, { value: 'subtree', label: '当前节点及子树' }, { value: 'blueprint', label: '整张蓝图' }]} /></label>
          {scopeType !== 'blueprint' ? <label>目标节点<Select value={scopeNodeId} onChange={setScopeNodeId} options={nodeOptions} /></label> : null}
          <label>维护目标<textarea value={goal} onChange={(event) => setGoal(event.target.value)} /></label>
          <p>Janus 可在本次授权范围内自由讨论；只有显式生成并批准提案后才会修改蓝图。</p>
          <button className="blueprint-btn blueprint-btn--primary" type="button" onClick={() => void handleStart()} disabled={!blueprint || !workspace || !goal.trim()}>开始对话</button>
        </div>
      ) : (
        <div className="bp-maintenance-task">
          <div className="bp-maintenance-status" data-status={task.status}>
            <div><strong>{task.phase}</strong><span>{task.workspaceName} · Revision {task.baseRevision}</span></div>
            <em>{task.progress}%</em>
          </div>
          <div className="bp-maintenance-progress"><span style={{ width: `${task.progress}%` }} /></div>
          <div className="bp-maintenance-messages">
            {task.messages.map((item) => <div key={item.id} data-role={item.role}><span>{item.role === 'user' ? '你' : 'Janus'}</span><p>{item.content}</p></div>)}
            {task.error ? <div className="bp-maintenance-error">{task.error}</div> : null}
          </div>
          {task.changeSet ? (
            <section className="bp-maintenance-proposal">
              <header><strong>待审批提案 v{task.changeSet.version}</strong><span>{selected.size}/{task.changeSet.operations.length}</span></header>
              {task.changeSet.operations.map((operation) => (
                <label key={operation.operationId} className="bp-maintenance-operation">
                  <input type="checkbox" checked={selected.has(operation.operationId)} onChange={() => toggleOperation(operation)} />
                  <div><strong>{operationLabel(operation)}</strong><p>{operation.reason}</p><span>{operation.risk === 'medium' ? '中风险' : '低风险'} · {operation.evidenceRefs.length} 条证据</span></div>
                </label>
              ))}
              <button className="blueprint-btn blueprint-btn--primary" type="button" onClick={() => void handleApply()} disabled={!selected.size}>批准并应用所选项</button>
            </section>
          ) : null}
          {(task.status === 'active' || task.status === 'proposal-ready' || task.status === 'failed') ? (
            <div className="bp-maintenance-compose">
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="讨论需求、想法或节点调整方向" />
              <div className="bp-maintenance-compose__actions">
                <button type="button" disabled={!draft.trim()} onClick={() => { if (draft.trim()) { void message({ taskId: task.id, content: draft }); setDraft('') } }}>发送消息</button>
                <button type="button" className="bp-maintenance-compose__proposal" onClick={() => void propose({ taskId: task.id })}>{task.changeSet ? '根据对话修订提案' : '整理为提案'}</button>
              </div>
            </div>
          ) : null}
          <footer>
            {!['cancelled', 'completed'].includes(task.status) ? <button className="blueprint-btn" type="button" onClick={() => void cancel(task.id)}>取消任务</button> : null}
            {task.status === 'active' ? <button className="blueprint-btn" type="button" onClick={() => void complete(task.id)}>完成维护</button> : null}
          </footer>
        </div>
      )}
      {error ? <div className="bp-maintenance-error">{error}</div> : null}
    </aside>
  )
}
