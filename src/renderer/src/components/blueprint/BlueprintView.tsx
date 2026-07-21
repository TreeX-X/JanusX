/**
 * @file 蓝图视图容器
 * @description
 *  组合「蓝图选择 / 新建」+ 画布。
 *  onMount 拉取应用级全局蓝图列表；节点再单独绑定工作区。
 *  样式见 ./blueprint.css。
 */

import { useCallback, useEffect, useState } from 'react'
import './blueprint.css'
import { useBlueprintStore } from '@/stores/blueprint'
import { useWorkspaceStore } from '@/stores/workspace'
import {
  acceptRequirementCandidate,
  listRequirementCandidates,
  onAnalysisResult,
  onDiscovered,
  rejectRequirementCandidate,
  type BlueprintRequirementCandidate,
  type BlueprintRequirementCandidateStatus,
  type IslandAnalysisEvent,
  type IslandDiscoveredEvent
} from '@/services/blueprint'
import { BlueprintCanvas } from './BlueprintCanvas'
import { PromptDialog } from './PromptDialog'
import { RefreshIconButton } from '../ui/RefreshIconButton'
import { Select } from '../ui/Select'
import { useBlueprintSelectPortal } from './blueprintSelectPortal'

const GLOBAL_BLUEPRINT_SCOPE = '__global__'

const CANDIDATE_STATUS_LABEL: Record<BlueprintRequirementCandidateStatus, string> = {
  pending: '待确认',
  accepted: '已接受',
  rejected: '已拒绝'
}

interface CandidateDraft {
  title: string
  description: string
  parentId: string
}

interface BlueprintViewProps {
  density?: 'embedded' | 'workbench'
}

export function BlueprintView({ density = 'embedded' }: BlueprintViewProps) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const blueprints = useBlueprintStore((s) => s.blueprints)
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const loading = useBlueprintStore((s) => s.loading)
  const error = useBlueprintStore((s) => s.error)
  const loadBlueprints = useBlueprintStore((s) => s.loadBlueprints)
  const loadBlueprint = useBlueprintStore((s) => s.loadBlueprint)
  const createBlueprint = useBlueprintStore((s) => s.createBlueprint)
  const deleteBlueprint = useBlueprintStore((s) => s.deleteBlueprint)
  const renameBlueprint = useBlueprintStore((s) => s.renameBlueprint)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [analysisNotice, setAnalysisNotice] = useState<IslandAnalysisEvent | null>(null)
  const [discoveredNotice, setDiscoveredNotice] = useState<IslandDiscoveredEvent | null>(null)
  const [candidateStatus, setCandidateStatus] = useState<BlueprintRequirementCandidateStatus>('pending')
  const [candidates, setCandidates] = useState<BlueprintRequirementCandidate[]>([])
  const [candidateDrafts, setCandidateDrafts] = useState<Record<string, CandidateDraft>>({})
  const [candidateLoading, setCandidateLoading] = useState(false)
  const [noticeError, setNoticeError] = useState<string | null>(null)
  const [inboxExpanded, setInboxExpanded] = useState(false)

  // 工作台模式下由 BlueprintWorkbench 注入承载层；embedded 模式下为 null，
  // Select 回退到 document.body，行为与引入 Context 之前一致。
  const selectPortal = useBlueprintSelectPortal()
  const getSelectPortalContainer = selectPortal ? () => selectPortal : undefined

  const loadCandidates = useCallback(
    async (
      blueprintId = selectedId,
      status = candidateStatus,
      workspacePath = activeWorkspace?.path ?? GLOBAL_BLUEPRINT_SCOPE
    ) => {
      if (!blueprintId) {
        setCandidates([])
        return
      }
      setCandidateLoading(true)
      setNoticeError(null)
      try {
        const list = await listRequirementCandidates({ workspacePath, blueprintId, status })
        setCandidates(list)
        setCandidateDrafts((current) => {
          const next = { ...current }
          for (const candidate of list) {
            if (!next[candidate.id]) {
              next[candidate.id] = {
                title: candidate.title,
                description: candidate.description,
                parentId: candidate.suggestedParentId ?? ''
              }
            }
          }
          return next
        })
      } catch (err) {
        setNoticeError(err instanceof Error ? err.message : String(err))
      } finally {
        setCandidateLoading(false)
      }
    },
    [activeWorkspace?.path, candidateStatus, selectedId]
  )

  const updateCandidateDraft = useCallback((candidateId: string, patch: Partial<CandidateDraft>) => {
    setCandidateDrafts((current) => {
      const previous = current[candidateId] ?? { title: '', description: '', parentId: '' }
      return {
        ...current,
        [candidateId]: {
          ...previous,
          ...patch
        }
      }
    })
  }, [])

  const getCandidateWorkspacePath = useCallback(
    (candidate: BlueprintRequirementCandidate): string => {
      const sourceNode = currentBlueprint?.nodes[candidate.sourceNodeId]
      const workspace = sourceNode?.workspaceId
        ? workspaces.find((item) => item.id === sourceNode.workspaceId)
        : null
      return workspace?.path ?? activeWorkspace?.path ?? GLOBAL_BLUEPRINT_SCOPE
    },
    [activeWorkspace?.path, currentBlueprint, workspaces]
  )

  // 拉取全局蓝图列表
  useEffect(() => {
    loadBlueprints(activeWorkspace?.path)
  }, [activeWorkspace?.path, loadBlueprints])

  useEffect(() => {
    const unsubscribeAnalysis = onAnalysisResult((event) => {
      setAnalysisNotice(event)
      const current = useBlueprintStore.getState().currentBlueprint
      if (current?.id === event.blueprintId) {
        useBlueprintStore.getState().refreshAfterAnalysis()
      }
    })
    const unsubscribeDiscovered = onDiscovered((event) => {
      setDiscoveredNotice(event)
      setNoticeError(null)
      setCandidateStatus('pending')
      setInboxExpanded(true)
      void loadCandidates(event.blueprintId, 'pending', event.workspacePath)
    })
    return () => {
      unsubscribeAnalysis()
      unsubscribeDiscovered()
    }
  }, [loadCandidates])

  // 列表到达后默认选中第一个
  useEffect(() => {
    if (!selectedId && blueprints.length > 0) {
      const first = blueprints[0]
      setSelectedId(first.id)
      loadBlueprint(first.id)
    }
    if (selectedId && !blueprints.some((b) => b.id === selectedId)) {
      const next = blueprints[0]
      setSelectedId(next?.id ?? null)
      if (next) loadBlueprint(next.id)
    }
  }, [blueprints, selectedId, loadBlueprint])

  useEffect(() => {
    void loadCandidates()
  }, [loadCandidates])

  const handleSelect = (id: string) => {
    setSelectedId(id)
    loadBlueprint(id)
  }

  const handleCreate = () => setCreateDialogOpen(true)

  const handleCreateConfirm = async (name: string) => {
    setCreateDialogOpen(false)
    const bp = await createBlueprint({ name, rootTitle: '根任务', rootType: 'epic' })
    if (bp) {
      setSelectedId(bp.id)
      loadBlueprint(bp.id)
    }
  }

  const handleDelete = () => {
    if (!selectedId) return
    const target = blueprints.find((b) => b.id === selectedId)
    setDeleteTarget({ id: selectedId, name: target?.name ?? selectedId })
  }

  const handleRename = () => {
    if (!selectedId) return
    setRenameDialogOpen(true)
  }

  const handleRenameConfirm = async (name: string) => {
    const id = selectedId
    setRenameDialogOpen(false)
    if (!id) return
    const ok = await renameBlueprint(id, name)
    if (ok) loadBlueprint(id)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    const deleted = await deleteBlueprint(deleteTarget.id)
    setDeleteTarget(null)
    if (!deleted) return
    const next = useBlueprintStore.getState().blueprints[0]
    setSelectedId(next?.id ?? null)
    if (next) loadBlueprint(next.id)
  }

  const pendingCandidateCount =
    currentBlueprint?.requirementCandidates?.filter((c) => c.status === 'pending').length ?? 0

  const handleAcceptCandidate = async (candidate: BlueprintRequirementCandidate) => {
    const draft = candidateDrafts[candidate.id] ?? {
      title: candidate.title,
      description: candidate.description,
      parentId: candidate.suggestedParentId ?? ''
    }
    const workspacePath = getCandidateWorkspacePath(candidate)
    setNoticeError(null)
    try {
      const created = await acceptRequirementCandidate({
        workspacePath,
        blueprintId: candidate.blueprintId,
        candidateId: candidate.id,
        title: draft.title,
        description: draft.description,
        parentId: draft.parentId || undefined
      })
      if (!created) {
        setNoticeError('接受失败：候选需求不存在或目标父节点无效')
        return
      }
      await loadBlueprint(candidate.blueprintId)
      await loadCandidates(candidate.blueprintId, candidateStatus, workspacePath)
    } catch (err) {
      setNoticeError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleRejectCandidate = async (candidate: BlueprintRequirementCandidate) => {
    const workspacePath = getCandidateWorkspacePath(candidate)
    setNoticeError(null)
    try {
      const rejected = await rejectRequirementCandidate({
        workspacePath,
        blueprintId: candidate.blueprintId,
        candidateId: candidate.id
      })
      if (!rejected) {
        setNoticeError('拒绝失败：候选需求不存在')
        return
      }
      await loadCandidates(candidate.blueprintId, candidateStatus, workspacePath)
    } catch (err) {
      setNoticeError(err instanceof Error ? err.message : String(err))
    }
  }

  const candidateStatusOptions = (['pending', 'accepted', 'rejected'] as BlueprintRequirementCandidateStatus[]).map((status) => ({
    value: status,
    label: CANDIDATE_STATUS_LABEL[status]
  }))

  const candidateParentOptions = currentBlueprint
    ? [
        { value: '', label: '按建议父节点' },
        ...currentBlueprint.nodeIds.map((nodeId) => ({
          value: nodeId,
          label: currentBlueprint.nodes[nodeId]?.title ?? nodeId
        }))
      ]
    : [{ value: '', label: '按建议父节点' }]
  const isBlueprintEmpty = !currentBlueprint || currentBlueprint.nodeIds.length === 0

  return (
    <div className={`blueprint-view blueprint-view--${density}${isBlueprintEmpty ? ' blueprint-view--empty' : ''}`}>
      {/* 顶部：蓝图选择 / 新建 / 删除 */}
      <div className="blueprint-toolbar">
        <div className="blueprint-toolbar__group blueprint-toolbar__group--manager">
          <Select
            value={selectedId ?? ''}
            onChange={handleSelect}
            disabled={blueprints.length === 0}
            placeholder="（暂无蓝图）"
            options={
              blueprints.length === 0
                ? [{ value: '', label: '（暂无蓝图）' }]
                : blueprints.map((b) => ({ value: b.id, label: b.name }))
            }
            className="blueprint-select blueprint-select--toolbar"
            getPortalContainer={getSelectPortalContainer}
          />
          <button className="blueprint-btn blueprint-btn--primary" onClick={handleCreate}>+ 新建</button>
          <button className="blueprint-btn" onClick={handleRename} disabled={!selectedId}>
            重命名
          </button>
          <button className="blueprint-btn blueprint-btn--danger" onClick={handleDelete} disabled={!selectedId}>
            删除
          </button>
        </div>
        <div className="blueprint-toolbar__spacer" />
        {loading ? <span className="blueprint-toolbar__loading">加载中…</span> : null}
        {error ? <span className="blueprint-toolbar__error">{error}</span> : null}
      </div>

      {(analysisNotice || discoveredNotice) ? (
        <div className="bp-janus-notices" aria-live="polite">
          {analysisNotice ? (
            <div className="bp-janus-notice">
              <div>
                <div className="bp-janus-notice__title">
                  {analysisNotice.applied ? 'Janus 分析完成' : 'Janus 分析未应用'}
                </div>
                <div className="bp-janus-notice__body">
                  {analysisNotice.nodeTitle} · {analysisNotice.result.summary || analysisNotice.error || '无摘要'}
                </div>
              </div>
              <button className="bp-janus-notice__close" onClick={() => setAnalysisNotice(null)}>关闭</button>
            </div>
          ) : null}

          {discoveredNotice ? (
            <div className="bp-janus-notice bp-janus-notice--discovered">
              <div>
                <div className="bp-janus-notice__title">候选需求已入库 · {discoveredNotice.nodeTitle}</div>
                <div className="bp-janus-notice__body">
                  {discoveredNotice.candidateIds?.length ?? discoveredNotice.discovered.length} 条候选已写入 Inbox
                </div>
              </div>
              <button className="bp-janus-notice__close" onClick={() => setDiscoveredNotice(null)}>关闭</button>
              {noticeError ? <div className="bp-janus-notice__error">{noticeError}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {currentBlueprint ? (
        <div className="bp-candidate-inbox" data-expanded={inboxExpanded ? 'true' : 'false'}>
          <div className="bp-candidate-inbox__head">
            <button
              type="button"
              className="bp-candidate-inbox__toggle"
              onClick={() => setInboxExpanded((v) => !v)}
              aria-expanded={inboxExpanded}
              data-attention={pendingCandidateCount > 0 ? 'true' : 'false'}
              aria-label={inboxExpanded ? '收起候选需求列表' : '展开候选需求列表'}
            >
              <span className={`bp-candidate-inbox__chevron${inboxExpanded ? ' bp-candidate-inbox__chevron--open' : ''}`} aria-hidden="true" />
              <strong>候选需求 Inbox</strong>
              {pendingCandidateCount > 0 ? <span className="bp-candidate-inbox__dot" aria-hidden="true" /> : null}
            </button>
            <span className="bp-candidate-inbox__count">
              {candidateLoading ? '刷新中...' : `${candidates.length} 条${CANDIDATE_STATUS_LABEL[candidateStatus]}`}
            </span>
            <div className="bp-candidate-inbox__tools">
              <Select
                value={candidateStatus}
                onChange={(value) => setCandidateStatus(value as BlueprintRequirementCandidateStatus)}
                options={candidateStatusOptions}
                className="blueprint-select bp-candidate-inbox__select"
                getPortalContainer={getSelectPortalContainer}
              />
              <RefreshIconButton
                accent="orange"
                label="刷新候选需求"
                loading={candidateLoading}
                onClick={() => void loadCandidates()}
              />
            </div>
          </div>

          {inboxExpanded ? (
            <>
              {!candidateLoading && candidates.length === 0 ? (
                <div className="bp-candidate-inbox__empty">暂无{CANDIDATE_STATUS_LABEL[candidateStatus]}候选</div>
              ) : null}
              {noticeError ? <div className="bp-candidate-inbox__error">{noticeError}</div> : null}

              {candidates.length > 0 ? (
                <div className="bp-candidate-list">
                  {candidates.map((candidate) => {
                    const draft = candidateDrafts[candidate.id] ?? {
                      title: candidate.title,
                      description: candidate.description,
                      parentId: candidate.suggestedParentId ?? ''
                    }
                    const editable = candidate.status === 'pending'
                    const sourceNode = currentBlueprint.nodes[candidate.sourceNodeId]
                    return (
                      <div className="bp-candidate-card" key={candidate.id}>
                        <div className="bp-candidate-card__meta">
                          <span>{CANDIDATE_STATUS_LABEL[candidate.status]}</span>
                          <span>{Math.round(candidate.confidence * 100)}%</span>
                          <span>来源：{sourceNode?.title ?? candidate.sourceNodeId}</span>
                        </div>

                        {editable ? (
                          <input
                            className="bp-candidate-card__input"
                            value={draft.title}
                            onChange={(event) => updateCandidateDraft(candidate.id, { title: event.currentTarget.value })}
                          />
                        ) : (
                          <strong className="bp-candidate-card__title">{candidate.title}</strong>
                        )}

                        {editable ? (
                          <textarea
                            className="bp-candidate-card__textarea"
                            value={draft.description}
                            onChange={(event) => updateCandidateDraft(candidate.id, { description: event.currentTarget.value })}
                          />
                        ) : (
                          <p>{candidate.description}</p>
                        )}

                        <div className="bp-candidate-card__footer">
                          <Select
                            value={editable ? draft.parentId : candidate.suggestedParentId ?? ''}
                            onChange={(value) => updateCandidateDraft(candidate.id, { parentId: value })}
                            options={candidateParentOptions}
                            disabled={!editable}
                            className="blueprint-select bp-candidate-card__parent"
                            getPortalContainer={getSelectPortalContainer}
                          />
                          {editable ? (
                            <div className="bp-candidate-card__actions">
                              <button className="blueprint-btn blueprint-btn--primary" onClick={() => handleAcceptCandidate(candidate)}>
                                接受
                              </button>
                              <button className="blueprint-btn" onClick={() => handleRejectCandidate(candidate)}>
                                拒绝
                              </button>
                            </div>
                          ) : (
                            <span className="bp-candidate-card__decision">
                              {candidate.acceptedNodeId ? `节点 ${candidate.acceptedNodeId.slice(0, 8)}` : candidate.decisionNote || '已留痕'}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {/* 画布 */}
      {currentBlueprint ? (
        <BlueprintCanvas
          key={currentBlueprint.id}
          blueprintId={currentBlueprint.id}
        />
      ) : (
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 13 }}>
          {blueprints.length === 0 ? '点击「+ 新建蓝图」开始' : '请选择一个蓝图'}
        </div>
      )}

      <PromptDialog
        open={createDialogOpen}
        title="新建蓝图"
        label="蓝图名称"
        placeholder="输入蓝图名称"
        defaultValue={`蓝图-${new Date().toLocaleDateString()}`}
        onConfirm={handleCreateConfirm}
        onCancel={() => setCreateDialogOpen(false)}
      />
      <PromptDialog
        open={renameDialogOpen}
        title="重命名蓝图"
        label="蓝图名称"
        placeholder="输入蓝图名称"
        defaultValue={blueprints.find((b) => b.id === selectedId)?.name ?? ''}
        validate={(v) => (v.trim() ? null : '名称不能为空')}
        onConfirm={(value) => void handleRenameConfirm(value)}
        onCancel={() => setRenameDialogOpen(false)}
      />
      <PromptDialog
        open={deleteTarget !== null}
        title="删除蓝图"
        description={<>确认删除蓝图「<strong className="prompt-dialog__emphasis">{deleteTarget?.name}</strong>」吗？此操作不可恢复。</>}
        confirmOnly
        confirmText="删除"
        tone="danger"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
