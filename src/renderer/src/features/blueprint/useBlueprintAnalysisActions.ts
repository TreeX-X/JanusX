import { useCallback, useEffect, useState } from 'react'
import { useBlueprintStore } from '@/stores/blueprint'
import { useWorkspaceStore } from '@/stores/workspace'
import {
  analyze,
  applyAnalysis,
  listAnalyses,
  type BlueprintAnalysis,
  type BlueprintNode,
} from '@/services/blueprint'

const GLOBAL_BLUEPRINT_SCOPE = '__global__'
const DEFAULT_COMMIT_LIMIT = 5

function normalizeCommitLimit(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(50, parsed)) : DEFAULT_COMMIT_LIMIT
}

export function useBlueprintAnalysisActions(options: {
  blueprintId: string
  selectedId: string | null
  detailNodeId: string | null
  setActionError: (error: string | null) => void
}) {
  const { blueprintId, selectedId, detailNodeId, setActionError } = options
  const currentBlueprint = useBlueprintStore((state) => state.currentBlueprint)
  const loadBlueprint = useBlueprintStore((state) => state.loadBlueprint)
  const refreshAfterAnalysis = useBlueprintStore((state) => state.refreshAfterAnalysis)
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const [analyzing, setAnalyzing] = useState(false)
  const [commitLimit, setCommitLimit] = useState(String(DEFAULT_COMMIT_LIMIT))
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<BlueprintAnalysis[]>([])
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [applyingAnalysisId, setApplyingAnalysisId] = useState<string | null>(null)

  useEffect(() => {
    setHistoryOpen(false)
    setHistory([])
    setSelectedAnalysisId(null)
    setHistoryLoading(false)
    setApplyingAnalysisId(null)
  }, [detailNodeId])

  const workspacePathFor = useCallback((node: BlueprintNode) => {
    return workspaces.find((workspace) => workspace.id === node.workspaceId)?.path ?? GLOBAL_BLUEPRINT_SCOPE
  }, [workspaces])

  const loadHistory = useCallback(async (node: BlueprintNode) => {
    setHistoryLoading(true)
    setActionError(null)
    const fallback = [...(node.analyses ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    try {
      const items = await listAnalyses({ workspacePath: workspacePathFor(node), blueprintId, nodeId: node.id })
      const next = items.length ? items : fallback
      setHistory(next)
      setSelectedAnalysisId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null)
    } catch (error) {
      setHistory(fallback)
      setSelectedAnalysisId(fallback[0]?.id ?? null)
      setActionError(`分析历史加载失败: ${(error as Error).message}`)
    } finally {
      setHistoryLoading(false)
    }
  }, [blueprintId, setActionError, workspacePathFor])

  const toggleHistory = useCallback(async (node: BlueprintNode) => {
    const nextOpen = !historyOpen
    setHistoryOpen(nextOpen)
    if (nextOpen) await loadHistory(node)
  }, [historyOpen, loadHistory])

  const reapply = useCallback(async (node: BlueprintNode, analysis: BlueprintAnalysis) => {
    if (!analysis.applied) {
      setActionError('失败或未应用的分析不能重新应用')
      return
    }
    setApplyingAnalysisId(analysis.id)
    setActionError(null)
    try {
      const updated = await applyAnalysis({
        workspacePath: workspacePathFor(node), blueprintId, nodeId: node.id, analysisId: analysis.id,
      })
      if (!updated) {
        setActionError('无法重新应用该分析')
        return
      }
      await loadBlueprint(blueprintId)
      await loadHistory(updated)
    } catch (error) {
      setActionError(`重新应用分析失败: ${(error as Error).message}`)
    } finally {
      setApplyingAnalysisId(null)
    }
  }, [blueprintId, loadBlueprint, loadHistory, setActionError, workspacePathFor])

  const analyzeSelected = useCallback(async () => {
    if (!selectedId) return
    const node = currentBlueprint?.nodes[selectedId]
    const workspace = workspaces.find((item) => item.id === node?.workspaceId)
    if (!node || !workspace) {
      setActionError('请先为选中节点绑定可用工作区')
      return
    }
    setAnalyzing(true)
    setActionError(null)
    try {
      const normalizedLimit = normalizeCommitLimit(commitLimit)
      setCommitLimit(String(normalizedLimit))
      const result = await analyze({ nodeId: selectedId, workspacePath: workspace.path, trigger: 'manual', commitLimit: normalizedLimit })
      if (result?.error) setActionError(result.error)
      await refreshAfterAnalysis()
    } catch (error) {
      setActionError(`分析失败: ${(error as Error).message}`)
    } finally {
      setAnalyzing(false)
    }
  }, [commitLimit, currentBlueprint, refreshAfterAnalysis, selectedId, setActionError, workspaces])

  return {
    analyzing,
    analysisCommitLimit: commitLimit,
    setAnalysisCommitLimit: setCommitLimit,
    analysisHistoryOpen: historyOpen,
    analysisHistory: history,
    selectedAnalysisId,
    setSelectedAnalysisId,
    analysisHistoryLoading: historyLoading,
    applyingAnalysisId,
    loadAnalysisHistory: loadHistory,
    toggleAnalysisHistory: toggleHistory,
    reapplyAnalysis: reapply,
    analyzeSelected,
    normalizeAnalysisCommitLimit: normalizeCommitLimit,
  }
}
