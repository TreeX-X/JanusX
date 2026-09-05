/**
 * @file 蓝图画布（React Flow）— MVP
 * @description
 *  - 从 store 加载蓝图，把 Blueprint.nodes（Record）转成 React Flow nodes + edges。
 *  - 树形布局：根居中、子节点向下展开（简单递归，无 dagre）。
 *  - 交互：拖拽 / 选中 / 双击（onNodeOpen 回调）/ 右键菜单（加子节点 / 删除 / 状态标记）。
 *  - 工具栏：新建根节点 / 分析选中节点 / 适应画布。
 *  - canvasLayout：拖拽后防抖写回 Blueprint.canvasLayout。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type ReactFlowInstance,
  type NodeMouseHandler
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { X } from 'lucide-react'

import { useBlueprintStore } from '@/stores/blueprint'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'
import type { TerminalPreset } from '@/types'
import {
  createNode as createNodeIPC,
  bindTerminal as bindTerminalIPC,
  updateBlueprint as updateBlueprintIPC,
  type BlueprintFeatureItem,
  type BlueprintIssue,
  type BlueprintIssueSeverity,
  type BlueprintIssueStatus,
  type BlueprintNode,
  type BlueprintNodeType,
  type BlueprintNodeStatus
} from '@/services/blueprint'
import { BlueprintNodeCard, BlueprintCardActionsContext, type BlueprintNodeData } from './BlueprintNodeCard'
import { BlueprintAdaptiveEdge } from './BlueprintAdaptiveEdge'
import { STATUS_VISUALS, STATUS_ORDER, NODE_TYPE_LABEL_KEY } from './blueprintStatus'
import { PromptDialog } from './PromptDialog'
import { Select } from '../ui/Select'
import { useBlueprintSelectPortal } from './blueprintSelectPortal'
import { useBlueprintDetailPortal } from './blueprintDetailPortal'
import { useAnimatedOpen } from '@/components/shared/CardFrame'
import { getTerminalPresetMeta } from '../../../../shared/terminalLaunch'
import { launchTerminalPreset } from '@/lib/terminal-launch'
import { useBlueprintAnalysisActions } from '@/features/blueprint/useBlueprintAnalysisActions'
import { useBlueprintGraphController } from '@/features/blueprint/useBlueprintGraphController'
import type { BlueprintLayoutSaveStatus } from '@/features/blueprint/useBlueprintGraphController'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { collectLocalHierarchyIds, computeInitialCollapsedIds, stepMatchIndex, visibleNodeIds } from '@/features/blueprint/canvas-navigation'
import { useI18n } from '@/i18n/useI18n'

const GLOBAL_BLUEPRINT_SCOPE = '__global__'
const DEFAULT_NODE_TERMINAL_PRESET: TerminalPreset = 'codex'
const ANALYSIS_COMMIT_LIMIT_MIN = 1
const ANALYSIS_COMMIT_LIMIT_MAX = 50
const NODE_W = 240
const NODE_H = 110
const TERMINAL_PRESETS: {
  type: TerminalPreset
  label: string
  name: string
}[] = [
  createTerminalPreset('shell'),
  createTerminalPreset('claude'),
  createTerminalPreset('codex'),
  createTerminalPreset('opencode')
]

function createTerminalPreset(type: TerminalPreset): { type: TerminalPreset; label: string; name: string } {
  const meta = getTerminalPresetMeta(type)
  return { type, label: meta.label, name: meta.name }
}
type TextItemField = 'positioning' | 'techSolution'
type StatusFilter = BlueprintNodeStatus | 'all'
const NODE_TYPE_ORDER: BlueprintNodeType[] = ['epic', 'feature', 'task', 'issue']
const ISSUE_SEVERITY_VALUES = ['low', 'medium', 'high', 'critical'] as const
const ISSUE_STATUS_VALUES = ['open', 'resolved', 'wontfix'] as const
const ISSUE_SEVERITY_LABEL_KEY: Record<BlueprintIssueSeverity, string> = {
  low: 'blueprint:issueSeverity.low',
  medium: 'blueprint:issueSeverity.medium',
  high: 'blueprint:issueSeverity.high',
  critical: 'blueprint:issueSeverity.critical'
}
const ISSUE_STATUS_LABEL_KEY: Record<BlueprintIssueStatus, string> = {
  open: 'blueprint:issueStatus.open',
  resolved: 'blueprint:issueStatus.resolved',
  wontfix: 'blueprint:issueStatus.wontfix'
}
const FEATURE_STATUS_LABEL_KEY: Record<BlueprintFeatureItem['status'], string> = {
  planned: 'blueprint:featureStatus.planned',
  'in-progress': 'blueprint:featureStatus.inProgress',
  done: 'blueprint:featureStatus.done',
  blocked: 'blueprint:featureStatus.blocked'
}

const TRIGGER_LABEL_KEY: Record<string, string> = {
  'commit-threshold': 'blueprint:trigger.commitThreshold',
  manual: 'blueprint:trigger.manual',
  'terminal-close': 'blueprint:trigger.terminalClose',
  reconcile: 'blueprint:trigger.reconcile'
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function normalizeIssueSeverity(value: string): BlueprintNode['issues'][number]['severity'] {
  return ISSUE_SEVERITY_VALUES.includes(value as BlueprintNode['issues'][number]['severity'])
    ? (value as BlueprintNode['issues'][number]['severity'])
    : 'medium'
}

function normalizeIssueStatus(value: string): BlueprintNode['issues'][number]['status'] {
  return ISSUE_STATUS_VALUES.includes(value as BlueprintNode['issues'][number]['status'])
    ? (value as BlueprintNode['issues'][number]['status'])
    : 'open'
}

function serializeItems(items: string[]): string {
  return items.map((item) => item.trim()).filter(Boolean).join('\n')
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase()
}

function buildNodeSearchText(node: BlueprintNode): string {
  return [
    node.title,
    node.type,
    node.status,
    STATUS_VISUALS[node.status]?.label,
    node.positioning,
    node.techSolution,
    node.description,
    ...(node.tags ?? []),
    ...(node.features ?? []).flatMap((feature) => [
      feature.title,
      feature.description,
      feature.status,
      ...(feature.requirementNotes ?? [])
    ]),
    ...(node.issues ?? []).flatMap((issue) => [
      issue.title,
      issue.description,
      issue.severity,
      issue.status
    ])
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
}

function nodeMatchesFocus(node: BlueprintNode, query: string, statusFilter: StatusFilter): boolean {
  const statusMatches = statusFilter === 'all' || node.status === statusFilter
  const queryMatches = !query || buildNodeSearchText(node).includes(query)
  return statusMatches && queryMatches
}

function makeRequirementItem(input: {
  title: string
  description?: string
  progress?: number
  status?: BlueprintFeatureItem['status']
  note?: string
}): BlueprintFeatureItem {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description ?? '',
    progress: input.progress ?? 0,
    status: input.status ?? 'planned',
    requirementNotes: input.note ? [input.note] : [],
    createdAt: now,
    updatedAt: now
  }
}

function getTerminalPreset(preset: TerminalPreset) {
  return TERMINAL_PRESETS.find((item) => item.type === preset) ?? TERMINAL_PRESETS[2]
}

function collectDescendantIds(nodes: Record<string, BlueprintNode>, nodeId: string): Set<string> {
  const out = new Set<string>()
  const visit = (id: string) => {
    const node = nodes[id]
    if (!node) return
    for (const childId of node.children) {
      if (out.has(childId)) continue
      out.add(childId)
      visit(childId)
    }
  }
  visit(nodeId)
  return out
}

/* Context menu */
interface ContextMenu {
  x: number
  y: number
  nodeId: string
}

/* Component */
export interface BlueprintCanvasProps {
  blueprintId: string
  /** 双击节点回调（P3 节点详情入口），MVP 可不传 */
  onNodeOpen?: (nodeId: string) => void
  onDetailOpenChange?: (open: boolean) => void
  onRegisterFlush?: (flush: () => Promise<boolean>) => void
}

function BlueprintDetailMount({ target, children }: { target: HTMLDivElement | null; children: ReactNode }) {
  return target ? createPortal(children, target) : children
}

export function BlueprintCanvas({ blueprintId, onNodeOpen, onDetailOpenChange, onRegisterFlush }: BlueprintCanvasProps) {
  const { t } = useI18n('blueprint')
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const loading = useBlueprintStore((s) => s.loading)
  const error = useBlueprintStore((s) => s.error)
  const loadBlueprint = useBlueprintStore((s) => s.loadBlueprint)
  const updateNode = useBlueprintStore((s) => s.updateNode)
  const mergeCanvasLayout = useBlueprintStore((s) => s.mergeCanvasLayout)
  const deleteNode = useBlueprintStore((s) => s.deleteNode)
  const focusNodeSession = useBlueprintStore((s) => s.focusNode)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)
  const setActiveTerminal = useWorkspaceStore((s) => s.setActiveTerminal)
  const setLoadState = useAppStore((s) => s.setLoadState)
  const setBlueprintMode = useAppStore((s) => s.setBlueprintMode)
  const requestMaintenanceOpen = useBlueprintMaintenanceStore((s) => s.requestOpen)

  // 工作台开启时由 BlueprintWorkbench 通过 Context 注入专属承载层节点；
  // embedded 模式下为 null，Select 回退到 document.body，行为不变。
  const selectPortal = useBlueprintSelectPortal()
  const getSelectPortalContainer = selectPortal ? () => selectPortal : undefined
  const detailPortal = useBlueprintDetailPortal()

  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null)
  const [terminalPreset, setTerminalPreset] = useState<TerminalPreset>(DEFAULT_NODE_TERMINAL_PRESET)
  const [toolbarExpanded, setToolbarExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [localFocusActive, setLocalFocusActive] = useState(false)
  const [descendantDepth, setDescendantDepth] = useState(2)
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set())
  const [matchIndex, setMatchIndex] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)
  const [layoutSaveStatus, setLayoutSaveStatus] = useState<BlueprintLayoutSaveStatus>('clean')
  const {
    analyzing,
    analysisCommitLimit,
    setAnalysisCommitLimit,
    analysisHistoryOpen,
    analysisHistory,
    selectedAnalysisId,
    setSelectedAnalysisId,
    analysisHistoryLoading,
    applyingAnalysisId,
    loadAnalysisHistory,
    toggleAnalysisHistory,
    reapplyAnalysis,
    analyzeSelected,
    normalizeAnalysisCommitLimit,
  } = useBlueprintAnalysisActions({ blueprintId, selectedId, detailNodeId, setActionError })
  const [promptState, setPromptState] = useState<
    | { kind: 'child'; parentId: string }
    | { kind: 'root' }
    | null
  >(null)
  const [deleteTarget, setDeleteTarget] = useState<{ nodeId: string; message: string } | null>(null)
  const [restoreLayoutConfirmOpen, setRestoreLayoutConfirmOpen] = useState(false)

  const rfInstanceRef = useRef<ReactFlowInstance<Node<BlueprintNodeData, 'blueprint'>, Edge> | null>(null)
  const canvasMainRef = useRef<HTMLDivElement | null>(null)
  const fitFrameRef = useRef<number | null>(null)
  const initialFitBlueprintRef = useRef<string | null>(null)
  const detailOpenRef = useRef<boolean | null>(null)
  const collapseInitRef = useRef<string | null>(null)

  const workspaceNameById = useMemo(
    () => Object.fromEntries(workspaces.map((w) => [w.id, w.name])),
    [workspaces]
  )
  const activeDetailNode = currentBlueprint && detailNodeId ? currentBlueprint.nodes[detailNodeId] ?? null : null
  // Detail exit keeps the last node rendered while the slide-out plays; the
  // slot track / open signal follow the display value so the layout collapses
  // right after the content is gone (sequential, no pop).
  const detailAnim = useAnimatedOpen(Boolean(activeDetailNode))
  const leavingNodeRef = useRef<typeof activeDetailNode>(null)
  if (activeDetailNode) leavingNodeRef.current = activeDetailNode
  const detailNode = activeDetailNode ?? (detailAnim.rendered ? leavingNodeRef.current : null)
  const detailInCanvas = Boolean(detailNode && !detailPortal)
  const selectedNode = currentBlueprint && selectedId ? currentBlueprint.nodes[selectedId] ?? null : null
  const initialCollapsedNodeIds = useMemo(
    () => {
      if (currentBlueprint?.id !== blueprintId) return new Set<string>()
      if (currentBlueprint.collapsedNodeIds !== null && currentBlueprint.collapsedNodeIds !== undefined) {
        return new Set(currentBlueprint.collapsedNodeIds)
      }
      return computeInitialCollapsedIds(currentBlueprint.nodes, currentBlueprint.nodeIds)
    },
    [blueprintId, currentBlueprint],
  )
  const canvasLoadPlan = useMemo(() => {
    if (!currentBlueprint || currentBlueprint.id !== blueprintId) return null
    return {
      blueprintId: currentBlueprint.id,
      collapsedNodeIds: collapseInitRef.current === currentBlueprint.id
        ? collapsedNodeIds
        : initialCollapsedNodeIds,
    }
  }, [blueprintId, collapsedNodeIds, currentBlueprint, initialCollapsedNodeIds])
  const emptyCollapsedNodeIds = useMemo(() => new Set<string>(), [])
  const effectiveCollapsedNodeIds = useMemo(
    () => canvasLoadPlan?.collapsedNodeIds ?? emptyCollapsedNodeIds,
    [canvasLoadPlan, emptyCollapsedNodeIds],
  )
  const normalizedSearchQuery = useMemo(() => normalizeSearchText(searchQuery), [searchQuery])
  const searchFilterActive = normalizedSearchQuery.length > 0 || statusFilter !== 'all'
  const allSearchMatchIds = useMemo(() => currentBlueprint?.nodeIds.filter((id) => {
    const node = currentBlueprint.nodes[id]
    return node ? nodeMatchesFocus(node, normalizedSearchQuery, statusFilter) : false
  }) ?? [], [currentBlueprint, normalizedSearchQuery, statusFilter])
  const searchMatchIds = useMemo(() => currentBlueprint
    ? visibleNodeIds(currentBlueprint.nodes, allSearchMatchIds, effectiveCollapsedNodeIds)
    : [], [allSearchMatchIds, currentBlueprint, effectiveCollapsedNodeIds])
  const searchMatchKey = searchMatchIds.join('\u0000')
  const focusActive = searchFilterActive || (localFocusActive && !!selectedId)
  const focusedNodeIds = useMemo(() => {
    if (!currentBlueprint || !focusActive) return new Set<string>()
    if (localFocusActive && selectedId) return collectLocalHierarchyIds(currentBlueprint.nodes, selectedId, descendantDepth)
    return new Set(searchMatchIds)
  }, [currentBlueprint, descendantDepth, focusActive, localFocusActive, searchMatchIds, selectedId])
  const focusedNodeCount = focusedNodeIds.size
  useEffect(() => setMatchIndex(0), [searchMatchKey])
  const detailWorkspaceMissing = !!detailNode?.workspaceId && !workspaceNameById[detailNode.workspaceId]
  const latestAnalysis = detailNode?.analyses?.length
    ? detailNode.analyses[detailNode.analyses.length - 1]
    : null
  const selectedAnalysis = useMemo(() => {
    if (!analysisHistory.length) return null
    if (selectedAnalysisId) {
      return analysisHistory.find((analysis) => analysis.id === selectedAnalysisId) ?? analysisHistory[0]
    }
    return analysisHistory[0]
  }, [analysisHistory, selectedAnalysisId])
  const detailNodeParentOptions = useMemo(() => {
    if (!currentBlueprint || !detailNode) return []
    const descendants = collectDescendantIds(currentBlueprint.nodes, detailNode.id)
    return [
      { value: '', label: t('blueprint:detailPanel.asRoot') },
      ...currentBlueprint.nodeIds
        .filter((id) => id !== detailNode.id && !descendants.has(id))
        .map((id) => ({
          value: id,
          label: currentBlueprint.nodes[id]?.title || id
        }))
    ]
  }, [currentBlueprint, detailNode, t])

  const fitViewWhenReady = useCallback((duration = 180) => {
    if (fitFrameRef.current !== null) cancelAnimationFrame(fitFrameRef.current)
    let attempts = 0
    const settle = () => {
      fitFrameRef.current = null
      const container = canvasMainRef.current
      const instance = rfInstanceRef.current
      const rect = container?.getBoundingClientRect()
      if (!instance || !rect || rect.width < 80 || rect.height < 80) {
        if (attempts < 12) {
          attempts += 1
          fitFrameRef.current = requestAnimationFrame(settle)
        }
        return
      }
      instance.fitView({ padding: 0.2, duration })
    }
    fitFrameRef.current = requestAnimationFrame(() => {
      fitFrameRef.current = requestAnimationFrame(settle)
    })
  }, [])

  const persistCollapsedNodeIds = useCallback(async (nodeIds: Set<string>) => {
    const updated = await updateBlueprintIPC(GLOBAL_BLUEPRINT_SCOPE, blueprintId, {
      collapsedNodeIds: [...nodeIds]
    })
    if (!updated) throw new Error('Failed to persist blueprint collapse state')
  }, [blueprintId])

  // 没有历史状态时才按层级预折叠；保存空数组代表用户选择全部展开。
  useEffect(() => {
    if (!currentBlueprint || currentBlueprint.id !== blueprintId) return
    if (collapseInitRef.current === currentBlueprint.id) return
    collapseInitRef.current = currentBlueprint.id
    const persistedCollapsedNodeIds = currentBlueprint.collapsedNodeIds
    const nextCollapsedNodeIds = persistedCollapsedNodeIds === null || persistedCollapsedNodeIds === undefined
      ? initialCollapsedNodeIds
      : new Set(persistedCollapsedNodeIds)
    setCollapsedNodeIds(nextCollapsedNodeIds)
    if (persistedCollapsedNodeIds === null || persistedCollapsedNodeIds === undefined) {
      void persistCollapsedNodeIds(nextCollapsedNodeIds).catch((error: unknown) => {
        setActionError(error instanceof Error ? error.message : String(error))
      })
    }
  }, [currentBlueprint, blueprintId, initialCollapsedNodeIds, persistCollapsedNodeIds])

  useEffect(() => () => {
    if (fitFrameRef.current !== null) cancelAnimationFrame(fitFrameRef.current)
  }, [])

  const {
    nodes: rfNodes,
    edges: rfEdges,
    onNodesChange,
    autoLayout,
    layoutSubtree,
    restoreDefaultLayout,
    undoRestoreDefaultLayout,
    canUndoRestoreDefaultLayout,
    flushLayoutSave
  } = useBlueprintGraphController({
    blueprint: currentBlueprint,
    blueprintId,
    workspaceNameById,
    focusedNodeIds,
    focusActive,
    collapsedNodeIds: effectiveCollapsedNodeIds,
    onSelectionChange: setSelectedId,
    onError: setActionError,
    onLayoutPersisted: (savedBlueprintId, layout) => mergeCanvasLayout(savedBlueprintId, layout),
    onLayoutSaveStatus: setLayoutSaveStatus
  })
  useEffect(() => {
    const flush = () => { void flushLayoutSave() }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [flushLayoutSave])
  useEffect(() => window.electron.system.onPrepareQuit(async () => { await flushLayoutSave() }), [flushLayoutSave])
  useEffect(() => {
    onRegisterFlush?.(flushLayoutSave)
    return () => onRegisterFlush?.(() => Promise.resolve(true))
  }, [flushLayoutSave, onRegisterFlush])
  const graphReady = !currentBlueprint || currentBlueprint.nodeIds.length === 0 || rfNodes.length > 0

  useEffect(() => {
    if (!canvasLoadPlan || !rfInstanceRef.current || !rfNodes.length) return
    if (initialFitBlueprintRef.current === canvasLoadPlan.blueprintId) return
    initialFitBlueprintRef.current = canvasLoadPlan.blueprintId
    fitViewWhenReady(0)
  }, [canvasLoadPlan, fitViewWhenReady, rfNodes.length])

  useEffect(() => {
    const isDetailOpen = Boolean(activeDetailNode)
    if (detailOpenRef.current === null) {
      detailOpenRef.current = isDetailOpen
      return
    }
    if (detailOpenRef.current === isDetailOpen) return
    detailOpenRef.current = isDetailOpen
    const timer = window.setTimeout(() => fitViewWhenReady(180), 220)
    return () => window.clearTimeout(timer)
  }, [activeDetailNode, fitViewWhenReady])

  useEffect(() => {
    onDetailOpenChange?.(Boolean(detailNode))
  }, [detailNode, onDetailOpenChange])

  useEffect(() => {
    if (!detailAnim.rendered) leavingNodeRef.current = null
  }, [detailAnim.rendered])

  useEffect(() => () => onDetailOpenChange?.(false), [onDetailOpenChange])

  const toggleCollapse = useCallback((nodeId: string) => {
    const next = new Set(effectiveCollapsedNodeIds)
    if (!next.delete(nodeId)) next.add(nodeId)
    setCollapsedNodeIds(next)
    void persistCollapsedNodeIds(next).catch((error: unknown) => {
      setActionError(error instanceof Error ? error.message : String(error))
    })
  }, [effectiveCollapsedNodeIds, persistCollapsedNodeIds])
  const cardActions = useMemo(() => ({ toggleCollapse }), [toggleCollapse])

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      setSelectedId(node.id)
      setDetailNodeId(node.id)
      if (onNodeOpen) onNodeOpen(node.id)
    },
    [onNodeOpen]
  )

  const onNodeContextMenu: NodeMouseHandler = useCallback(
    (e, node) => {
      e.preventDefault()
      setSelectedId(node.id)
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id })
    },
    []
  )

  // 关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [contextMenu])

  /* 操作 */
  const addChild = useCallback((parentId: string) => {
    setPromptState({ kind: 'child', parentId })
  }, [])

  const addRoot = useCallback(() => {
    setPromptState({ kind: 'root' })
  }, [])

  const handlePromptConfirm = useCallback(
    async (title: string) => {
      if (!promptState) return
      if (promptState.kind === 'child') {
        const parent = currentBlueprint?.nodes[promptState.parentId]
        const created = await createNodeIPC(
          GLOBAL_BLUEPRINT_SCOPE,
          blueprintId,
          { title, type: 'task', workspaceId: parent?.workspaceId ?? null, workspaceSnapshot: parent?.workspaceSnapshot ?? null },
          promptState.parentId
        )
        setPromptState(null)
        if (!created) return
        await loadBlueprint(blueprintId)
      } else {
        setPromptState(null)
        await createNodeIPC(GLOBAL_BLUEPRINT_SCOPE, blueprintId, { title, type: 'task', workspaceId: null }, null)
        await loadBlueprint(blueprintId)
      }
    },
    [promptState, currentBlueprint, blueprintId, loadBlueprint]
  )

  const removeNode = useCallback(
    async (nodeId: string) => {
      const node = currentBlueprint?.nodes[nodeId]
      if (!node) return
      const isPrimaryRoot = currentBlueprint?.rootNodeId === nodeId
      const isRoot = !node.parentId
      const message = isPrimaryRoot
        ? t('blueprint:confirm.deletePrimaryRoot', { name: node.title || nodeId })
        : isRoot
          ? t('blueprint:confirm.deleteRoot', { name: node.title || nodeId })
          : t('blueprint:confirm.deleteNode', { name: node.title || nodeId })
      setContextMenu(null)
      setDeleteTarget({ nodeId, message })
    },
    [currentBlueprint, t]
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    const { nodeId } = deleteTarget
    const ok = await deleteNode(blueprintId, nodeId)
    setDeleteTarget(null)
      if (ok) {
        setSelectedId((current) => (current === nodeId ? null : current))
        setDetailNodeId((current) => (current === nodeId ? null : current))
        setActionError(null)
      } else {
        setActionError(t('blueprint:error.cannotDeleteLast'))
      }
    },
    [blueprintId, deleteNode, deleteTarget, t]
  )

  const markStatus = useCallback(
    async (nodeId: string, status: BlueprintNodeStatus) => {
      await updateNode(blueprintId, nodeId, { status, statusSource: 'manual' })
      setContextMenu(null)
    },
    [blueprintId, updateNode]
  )

  const activateWorkSession = useCallback(
    async (node: BlueprintNode) => {
      setActionError(null)
      if (!node.workspaceId) {
        setActionError(t('blueprint:error.bindWorkspaceFirst'))
        return
      }
      const workspace = workspaces.find((w) => w.id === node.workspaceId)
      if (!workspace) {
        setActionError(t('blueprint:error.workspaceMissing'))
        return
      }

      setActiveWorkspace(workspace.id)
      const focused = await focusNodeSession({
        blueprintId,
        nodeId: node.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspacePath: workspace.path
      })
      if (focused) {
        setSelectedId(node.id)
      }
    },
    [blueprintId, focusNodeSession, setActiveWorkspace, workspaces, t]
  )

  const focusOrCreateTerminal = useCallback(
    async (node: BlueprintNode, requestedPreset: TerminalPreset = terminalPreset) => {
      setActionError(null)
      if (!node.workspaceId) {
        setActionError(t('blueprint:error.bindWorkspaceFirst'))
        return
      }
      const workspace = workspaces.find((w) => w.id === node.workspaceId)
      if (!workspace) {
        setActionError(t('blueprint:error.workspaceMissing'))
        return
      }

      setActiveWorkspace(workspace.id)
      const afterSwitch = useWorkspaceStore.getState()
      const existing = node.boundTerminalId
        ? afterSwitch.terminals.find((t) => t.id === node.boundTerminalId)
        : null

      setBlueprintMode(false)
      setLoadState(existing ? 'terminal-active' : afterSwitch.terminals.length > 0 ? 'terminal-active' : 'no-terminal')

      if (existing) {
        setActiveTerminal(existing.id)
        await bindTerminalIPC(workspace.path, node.id, existing.id)
        await loadBlueprint(blueprintId)
        return
      }

      const preset = getTerminalPreset(requestedPreset)
      const launched = await launchTerminalPreset({
        preset: preset.type,
        workspaceId: workspace.id,
        workspacePath: workspace.path,
        name: preset.name,
      })

      if (!launched) {
        setActionError(t('blueprint:error.terminalCreateFailed'))
        return
      }

      if (!launched.ok) {
        setActionError(t('blueprint:error.terminalCreateFailedReason', { error: launched.error }))
        return
      }

      try {
        await bindTerminalIPC(workspace.path, node.id, launched.terminalId)
        await loadBlueprint(blueprintId)
      } catch (err) {
        setActionError(t('blueprint:error.terminalBindFailed', { message: (err as Error).message }))
      }
    },
    [
      workspaces,
      setActiveWorkspace,
      setBlueprintMode,
      setLoadState,
      setActiveTerminal,
      loadBlueprint,
      blueprintId,
      terminalPreset,
      t
    ]
  )

  const bindNodeWorkspace = useCallback(
    async (nodeId: string, workspaceId: string) => {
      const nextWorkspaceId = workspaceId || null
      const workspace = nextWorkspaceId ? workspaces.find((item) => item.id === nextWorkspaceId) : null
      await updateNode(blueprintId, nodeId, {
        workspaceId: nextWorkspaceId,
        workspaceSnapshot: workspace ? { name: workspace.name, path: workspace.path } : null,
        boundTerminalId: null
      })
      setActionError(null)
    },
    [blueprintId, updateNode, workspaces]
  )

  const bindNodeParent = useCallback(
    async (nodeId: string, parentId: string) => {
      await updateNode(blueprintId, nodeId, {
        parentId: parentId || null
      })
      setActionError(null)
    },
    [blueprintId, updateNode]
  )

  const persistNodePatch = useCallback(
    async (nodeId: string, patch: Partial<BlueprintNode>) => {
      await updateNode(blueprintId, nodeId, patch)
      setActionError(null)
    },
    [blueprintId, updateNode]
  )

  const addTextItem = useCallback(
    async (node: BlueprintNode, field: TextItemField, defaultValue: string) => {
      await persistNodePatch(node.id, {
        [field]: serializeItems([...splitLines(node[field] ?? ''), defaultValue])
      } as Partial<BlueprintNode>)
    },
    [persistNodePatch]
  )

  const updateTextItem = useCallback(
    async (node: BlueprintNode, field: TextItemField, index: number, value: string) => {
      const items = splitLines(node[field] ?? '')
      items[index] = value
      await persistNodePatch(node.id, { [field]: serializeItems(items) } as Partial<BlueprintNode>)
    },
    [persistNodePatch]
  )

  const removeTextItem = useCallback(
    async (node: BlueprintNode, field: TextItemField, index: number) => {
      const items = splitLines(node[field] ?? '').filter((_, itemIndex) => itemIndex !== index)
      await persistNodePatch(node.id, { [field]: serializeItems(items) } as Partial<BlueprintNode>)
    },
    [persistNodePatch]
  )

  const addFeature = useCallback(
    async (node: BlueprintNode) => {
      const feature = makeRequirementItem({ title: t('blueprint:feature.newItem') })
      await persistNodePatch(node.id, { features: [...(node.features ?? []), feature] })
    },
    [persistNodePatch, t]
  )

  const updateFeature = useCallback(
    async (node: BlueprintNode, featureId: string, patch: Partial<Pick<BlueprintFeatureItem, 'title' | 'description'>>) => {
      const features = (node.features ?? []).map((feature) =>
        feature.id === featureId ? { ...feature, ...patch, updatedAt: new Date().toISOString() } : feature
      )
      await persistNodePatch(node.id, { features })
    },
    [persistNodePatch]
  )

  const removeFeature = useCallback(
    async (node: BlueprintNode, featureId: string) => {
      await persistNodePatch(node.id, { features: (node.features ?? []).filter((feature) => feature.id !== featureId) })
    },
    [persistNodePatch]
  )

  const addIssue = useCallback(
    async (node: BlueprintNode) => {
      const now = new Date().toISOString()
      const issue: BlueprintIssue = {
        id: crypto.randomUUID(),
        title: t('blueprint:issue.newItem'),
        description: '',
        severity: 'medium',
        status: 'open',
        createdAt: now
      }
      await persistNodePatch(node.id, { issues: [...(node.issues ?? []), issue] })
    },
    [persistNodePatch, t]
  )

  const updateIssue = useCallback(
    async (node: BlueprintNode, issueId: string, patch: Partial<BlueprintIssue>) => {
      const issues = (node.issues ?? []).map((issue) => {
        if (issue.id !== issueId) return issue
        const nextStatus = patch.status ? normalizeIssueStatus(patch.status) : issue.status
        return {
          ...issue,
          ...patch,
          severity: patch.severity ? normalizeIssueSeverity(patch.severity) : issue.severity,
          status: nextStatus,
          resolvedAt: nextStatus === 'resolved' ? issue.resolvedAt ?? new Date().toISOString() : undefined
        }
      })
      await persistNodePatch(node.id, { issues })
    },
    [persistNodePatch]
  )

  const removeIssue = useCallback(
    async (node: BlueprintNode, issueId: string) => {
      await persistNodePatch(node.id, { issues: (node.issues ?? []).filter((issue) => issue.id !== issueId) })
    },
    [persistNodePatch]
  )

  const fitView = useCallback(() => {
    fitViewWhenReady(200)
  }, [fitViewWhenReady])

  const focusMatch = useCallback((step: number) => {
    if (!searchMatchIds.length) return
    const nextIndex = stepMatchIndex(matchIndex, step, searchMatchIds.length)
    const nodeId = searchMatchIds[nextIndex]
    setMatchIndex(nextIndex)
    setSelectedId(nodeId)
    const rfNode = rfInstanceRef.current?.getNode(nodeId)
    if (rfNode) {
      rfInstanceRef.current?.setCenter(rfNode.position.x + NODE_W / 2, rfNode.position.y + NODE_H / 2, {
        zoom: 1,
        duration: 220
      })
    }
  }, [matchIndex, searchMatchIds])

  const nodeTypes = useMemo(() => ({ blueprint: BlueprintNodeCard }), [])
  const edgeTypes = useMemo(() => ({ blueprintAdaptive: BlueprintAdaptiveEdge }), [])
  const statusFilterOptions = useMemo(
    () => [
      { value: 'all', label: t('blueprint:search.statusAll') },
      ...STATUS_ORDER.map((status) => ({ value: status, label: t(STATUS_VISUALS[status].labelKey) }))
    ],
    [t]
  )
  const featureActionLabel = t('blueprint:action.addFeature')
  const featureActionHint = t('blueprint:feature.actionHint')

  return (
    <div className={`blueprint-canvas-wrapper${detailInCanvas ? ' blueprint-canvas-wrapper--detail-open' : ''}`}>
      <div ref={canvasMainRef} className="blueprint-canvas-main" data-graph-ready={graphReady ? 'true' : 'false'}>
      {/* 画布操作工具栏 */}
      <div className="blueprint-toolbar blueprint-toolbar--canvas">
        <div className="blueprint-toolbar__main">
          <div className="blueprint-toolbar__identity">
            <span className="blueprint-toolbar__title">
              {currentBlueprint ? currentBlueprint.name : t('blueprint:toolbar.loading')}
            </span>
            {selectedNode ? (
              <span className="blueprint-toolbar__hint">
                {selectedNode.workspaceId ? workspaceNameById[selectedNode.workspaceId] ?? selectedNode.workspaceSnapshot?.name ?? t('blueprint:detailPanel.warningWorkspaceInvalid') : t('blueprint:detailPanel.workspaceUnbound')}
              </span>
            ) : null}
          </div>

          <div className="blueprint-toolbar__actions">
            <div className="blueprint-toolbar__group blueprint-toolbar__group--focus" role="group" aria-label={t('blueprint:ariaLabel.focus')}>
              <div className="blueprint-toolbar__search-wrap">
                <input
                  className="blueprint-toolbar__search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.currentTarget.value)}
                  placeholder={t('blueprint:search.placeholder')}
                  aria-label={t('blueprint:ariaLabel.search')}
                />
                {focusActive ? (
                  <span className="blueprint-toolbar__match-count">{t('blueprint:toolbar.matchCount', { count: focusedNodeCount })}</span>
                ) : null}
              </div>
              <Select
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
                options={statusFilterOptions}
                className="blueprint-select blueprint-select--status-filter"
                getPortalContainer={getSelectPortalContainer}
              />
              <button className="blueprint-btn" onClick={() => focusMatch(-1)} disabled={!searchMatchIds.length} title={t('blueprint:action.prevMatch')} aria-label={t('blueprint:ariaLabel.prevMatch')}>‹</button>
              <button className="blueprint-btn" onClick={() => focusMatch(1)} disabled={!searchMatchIds.length} title={t('blueprint:action.nextMatch')} aria-label={t('blueprint:ariaLabel.nextMatch')}>›</button>
              <button
                className="blueprint-btn"
                onClick={() => {
                  setSearchQuery('')
                  setStatusFilter('all')
                }}
                disabled={!searchFilterActive}
              >
                {t('blueprint:action.clear')}
              </button>
            </div>

            <div
              className="blueprint-toolbar__group blueprint-toolbar__group--node"
              role="group"
              aria-label={t('blueprint:ariaLabel.nodeActions')}
              data-active={selectedId ? 'true' : 'false'}
            >
              <button className="blueprint-btn" onClick={() => selectedId && addChild(selectedId)} disabled={!selectedId}>
                {t('blueprint:action.childNode')}
              </button>
              <button className="blueprint-btn" onClick={() => selectedId && setDetailNodeId(selectedId)} disabled={!selectedId}>
                {t('blueprint:action.nodeDetail')}
              </button>
              <button className="blueprint-btn" onClick={() => selectedNode && void activateWorkSession(selectedNode)} disabled={!selectedNode} aria-label={t('blueprint:ariaLabel.enterWorkSession')}>
                {t('blueprint:action.startWork')}
              </button>
              <button className={`blueprint-btn${localFocusActive ? ' blueprint-btn--active' : ''}`} onClick={() => setLocalFocusActive((value) => !value)} disabled={!selectedId} aria-pressed={localFocusActive}>
                {localFocusActive ? t('blueprint:action.exitLocalFocus') : t('blueprint:action.focusHierarchy')}
              </button>
            </div>

            <div className="blueprint-toolbar__group blueprint-toolbar__group--utility" role="group" aria-label={t('blueprint:ariaLabel.utility')}>
              <button className="blueprint-btn blueprint-btn--primary" onClick={addRoot}>{t('blueprint:action.addRoot')}</button>
              <button
                className={`blueprint-btn blueprint-toolbar__toggle${toolbarExpanded ? ' blueprint-toolbar__toggle--active' : ''}`}
                onClick={() => setToolbarExpanded((current) => !current)}
                aria-expanded={toolbarExpanded}
                aria-controls="blueprint-toolbar-panel"
                aria-label={toolbarExpanded ? t('blueprint:ariaLabel.collapseMore') : t('blueprint:ariaLabel.expandMore')}
              >
                {toolbarExpanded ? t('blueprint:action.collapse') : t('blueprint:action.more')}
              </button>
            </div>
          </div>
        </div>

        <div
          id="blueprint-toolbar-panel"
          className={`blueprint-toolbar__panel-wrap${toolbarExpanded ? ' blueprint-toolbar__panel-wrap--expanded' : ''}`}
          aria-hidden={!toolbarExpanded}
        >
          <div className="blueprint-toolbar__panel">
            <div className="blueprint-toolbar__zone" role="group" aria-label={t('blueprint:toolbar.zoneNode')}>
              <span className="blueprint-toolbar__zone-title">{t('blueprint:toolbar.zoneNode')}</span>
              <div className="blueprint-toolbar__zone-body">
                <label className="blueprint-toolbar__commit-limit">
                  <span>{t('blueprint:toolbar.recent')}</span>
                  <input
                    type="number"
                    min={ANALYSIS_COMMIT_LIMIT_MIN}
                    max={ANALYSIS_COMMIT_LIMIT_MAX}
                    value={analysisCommitLimit}
                    onChange={(event) => setAnalysisCommitLimit(event.target.value)}
                    onBlur={() => setAnalysisCommitLimit(String(normalizeAnalysisCommitLimit(analysisCommitLimit)))}
                  />
                  <span>{t('blueprint:toolbar.times')}</span>
                </label>
                <button className="blueprint-btn" onClick={analyzeSelected} disabled={!selectedId || analyzing}>
                  {analyzing ? t('blueprint:action.analyzing') : t('blueprint:action.analyzeSelected')}
                </button>
                <button
                  className="blueprint-btn"
                  onClick={() => selectedId && void layoutSubtree(selectedId)}
                  disabled={!selectedId}
                >
                  {t('blueprint:action.layoutSubtree')}
                </button>
                <button className="blueprint-btn" onClick={() => selectedId && toggleCollapse(selectedId)} disabled={!selectedId} aria-label={t('blueprint:ariaLabel.toggleSubtree')}>
                  {selectedId && effectiveCollapsedNodeIds.has(selectedId) ? t('blueprint:action.expandSubtree') : t('blueprint:action.collapseSubtree')}
                </button>
              </div>
            </div>

            <div className="blueprint-toolbar__zone" role="group" aria-label={t('blueprint:toolbar.zoneFocus')}>
              <span className="blueprint-toolbar__zone-title">{t('blueprint:toolbar.zoneFocus')}</span>
              <div className="blueprint-toolbar__zone-body">
                <label className="blueprint-toolbar__commit-limit"><span>{t('blueprint:toolbar.descendantLevel')}</span><input type="number" min={0} max={8} value={descendantDepth} onChange={(event) => setDescendantDepth(Math.max(0, Math.min(8, Number(event.target.value) || 0)))} /></label>
                <button className="blueprint-btn" onClick={() => focusMatch(0)} disabled={!searchMatchIds.length}>{t('blueprint:action.locateMatch')}</button>
              </div>
            </div>

            <div className="blueprint-toolbar__zone" role="group" aria-label={t('blueprint:toolbar.zoneCanvas')}>
              <span className="blueprint-toolbar__zone-title">{t('blueprint:toolbar.zoneCanvas')}</span>
              <div className="blueprint-toolbar__zone-body">
                <button className="blueprint-btn" onClick={fitView}>{t('blueprint:action.fitCanvas')}</button>
                <button className="blueprint-btn" onClick={() => void autoLayout()}>{t('blueprint:action.autoLayout')}</button>
                <button
                  className="blueprint-btn"
                  onClick={() => setRestoreLayoutConfirmOpen(true)}
                >
                  {t('blueprint:action.restoreDefaultLayout')}
                </button>
                <button className="blueprint-btn" onClick={() => void undoRestoreDefaultLayout()} disabled={!canUndoRestoreDefaultLayout}>
                  {t('blueprint:action.undoRestore')}
                </button>
              </div>
            </div>

            <div className="blueprint-toolbar__zone blueprint-toolbar__zone--danger" role="group" aria-label={t('blueprint:toolbar.zoneDanger')}>
              <span className="blueprint-toolbar__zone-title">{t('blueprint:toolbar.zoneDanger')}</span>
              <div className="blueprint-toolbar__zone-body">
                <button className="blueprint-btn blueprint-btn--danger" onClick={() => selectedId && removeNode(selectedId)} disabled={!selectedId}>
                  {t('blueprint:action.deleteSelected')}
                </button>
              </div>
            </div>
            {loading ? <span className="blueprint-toolbar__loading">{t('blueprint:toolbar.loading')}</span> : null}
            {layoutSaveStatus !== 'clean' ? <span className={`blueprint-toolbar__save-status blueprint-toolbar__save-status--${layoutSaveStatus}`}>{layoutSaveStatus === 'saving' ? '保存中…' : layoutSaveStatus === 'pending' ? '待保存' : layoutSaveStatus === 'failed' ? '保存失败' : '已保存'}</span> : null}
          </div>
        </div>

        {actionError || error ? <span className="blueprint-toolbar__error">{actionError ?? error}</span> : null}
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {!graphReady ? <div className="blueprint-canvas-loading" aria-live="polite" aria-label={t('blueprint:toolbar.loading')} /> : null}
      <BlueprintCardActionsContext.Provider value={cardActions}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={() => { void flushLayoutSave() }}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onInit={(inst) => {
          rfInstanceRef.current = inst
          if (canvasLoadPlan && rfNodes.length && initialFitBlueprintRef.current !== canvasLoadPlan.blueprintId) {
            initialFitBlueprintRef.current = canvasLoadPlan.blueprintId
            fitViewWhenReady(0)
          }
        }}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
        style={{ background: 'transparent' }}
      >
        <Background color="rgba(255,255,255,0.05)" gap={24} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            const d = n.data as BlueprintNodeData | undefined
            return d ? STATUS_VISUALS[d.status].color : '#555'
          }}
          style={{ background: 'rgba(12,12,12,0.9)' }}
        />
      </ReactFlow>
      </BlueprintCardActionsContext.Provider>
      </div>

      {/* 右键菜单 */}
      {contextMenu ? (
        <div
          className="bp-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button className="bp-context-menu__item" onClick={() => { setDetailNodeId(contextMenu.nodeId); setContextMenu(null) }}>
            {t('blueprint:contextMenu.nodeDetail')}
          </button>
          <button
            className="bp-context-menu__item"
            onClick={() => {
              const node = currentBlueprint?.nodes[contextMenu.nodeId]
              if (node) void activateWorkSession(node)
              setContextMenu(null)
            }}
          >
            {t('blueprint:contextMenu.startWork')}
          </button>
          <button
            className="bp-context-menu__item"
            onClick={() => {
              const node = currentBlueprint?.nodes[contextMenu.nodeId]
              if (node) focusOrCreateTerminal(node)
              setContextMenu(null)
            }}
          >
            {t('blueprint:contextMenu.enterTerminal')}
          </button>
          <button className="bp-context-menu__item" onClick={() => { addChild(contextMenu.nodeId); setContextMenu(null) }}>
            {t('blueprint:contextMenu.addChild')}
          </button>
          <button
            className="bp-context-menu__item bp-context-menu__item--danger"
            onClick={() => { removeNode(contextMenu.nodeId); setContextMenu(null) }}
          >
            {currentBlueprint?.rootNodeId === contextMenu.nodeId ? t('blueprint:contextMenu.deletePrimaryRoot') : t('blueprint:contextMenu.deleteNode')}
          </button>
          <div className="bp-context-menu__sep" />
          <div className="bp-context-menu__label">{t('blueprint:contextMenu.markStatus')}</div>
          <div className="bp-context-menu__status-grid">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                className="bp-context-menu__status"
                onClick={() => markStatus(contextMenu.nodeId, s)}
              >
                <span
                  className="bp-context-menu__status-dot"
                  style={{ background: STATUS_VISUALS[s].color }}
                />
                {t(STATUS_VISUALS[s].labelKey)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      </div>

      {detailNode ? (
        <BlueprintDetailMount target={detailPortal}>
        <aside
          className="bp-node-detail"
          key={detailNode.id}
          data-visible={detailAnim.visible ? 'true' : 'false'}
          aria-hidden={detailAnim.visible ? undefined : 'true'}
        >
          <div className="bp-node-detail__header">
            <div>
              <div className="bp-node-detail__eyebrow">{t('blueprint:detailPanel.eyebrow')}</div>
              <div className="bp-node-detail__title">{detailNode.title || <span className="bp-node-detail__title--empty">{t('blueprint:detailPanel.untitled')}</span>}</div>
              <div className="bp-node-detail__summary">
                <span>{t(NODE_TYPE_LABEL_KEY[detailNode.type] ?? `blueprint:nodeType.${detailNode.type}`)}</span>
                <span>{t(STATUS_VISUALS[detailNode.status]?.labelKey ?? `blueprint:status.${detailNode.status}`)}</span>
                <span>{Math.max(0, Math.min(100, detailNode.progress))}%</span>
              </div>
            </div>
            <button className="bp-panel-close" onClick={() => setDetailNodeId(null)} aria-label={t('blueprint:ariaLabel.closeNodeDetail')} title={t('common:action.close')}>
              <X size={16} aria-hidden="true" />
            </button>
            <div className="bp-node-detail__actions">
              <button
                className="blueprint-btn blueprint-btn--primary"
                onClick={() => requestMaintenanceOpen({ blueprintId, nodeId: detailNode.id })}
              >
                {t('blueprint:action.maintainNode')}
              </button>
              <button
                className="blueprint-btn"
                onClick={() => activateWorkSession(detailNode)}
                disabled={!detailNode.workspaceId || detailWorkspaceMissing}
              >
                {t('blueprint:action.startWork')}
              </button>
              <button
                className="blueprint-btn"
                onClick={() => focusOrCreateTerminal(detailNode, terminalPreset)}
                disabled={!detailNode.workspaceId || detailWorkspaceMissing}
              >
                {t('blueprint:action.enterTerminal')}
              </button>
            </div>
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--identity">
            <label className="bp-node-detail__label">{t('blueprint:detailPanel.title')}</label>
            <input
              className="bp-node-detail__input"
              defaultValue={detailNode.title}
              onBlur={(event) => persistNodePatch(detailNode.id, { title: event.currentTarget.value.trim() || detailNode.title })}
            />
          </div>

          <div className="bp-node-detail__grid bp-node-detail__grid--meta">
            <div className="bp-node-detail__section">
              <label className="bp-node-detail__label">{t('blueprint:detailPanel.type')}</label>
              <Select
                value={detailNode.type}
                onChange={(value) => persistNodePatch(detailNode.id, { type: value as BlueprintNodeType })}
                options={NODE_TYPE_ORDER.map((type) => ({ value: type, label: t(NODE_TYPE_LABEL_KEY[type] ?? `blueprint:nodeType.${type}`) }))}
                className="blueprint-select bp-node-detail__select"
                dropdownClassName="bp-node-detail__dropdown"
                getPortalContainer={getSelectPortalContainer}
              />
            </div>
            <div className="bp-node-detail__section">
              <label className="bp-node-detail__label">{t('blueprint:detailPanel.status')}</label>
              <Select
                value={detailNode.status}
                onChange={(value) =>
                  persistNodePatch(detailNode.id, {
                    status: value as BlueprintNodeStatus,
                    statusSource: 'manual'
                  })
                }
                options={STATUS_ORDER.map((status) => ({ value: status, label: t(STATUS_VISUALS[status].labelKey) }))}
                className="blueprint-select bp-node-detail__select"
                dropdownClassName="bp-node-detail__dropdown"
                getPortalContainer={getSelectPortalContainer}
              />
            </div>
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--content">
            <label className="bp-node-detail__label">{t('blueprint:detailPanel.description')}</label>
            <textarea
              key={`${detailNode.id}-${detailNode.updatedAt}-description`}
              className="bp-node-detail__textarea"
              defaultValue={detailNode.description}
              placeholder={t('blueprint:detailPanel.descriptionPlaceholder')}
              onBlur={(event) => persistNodePatch(detailNode.id, { description: event.currentTarget.value.trim() })}
            />
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--content">
            <div className="bp-node-detail__section-head">
              <label className="bp-node-detail__label">{t('blueprint:detailPanel.positioning')}</label>
              <button className="bp-node-detail__feature-add" onClick={() => addTextItem(detailNode, 'positioning', t('blueprint:detailPanel.newPositioning'))}>
                <span className="bp-node-detail__feature-add-icon">+</span>
                <span>{t('blueprint:action.addPositioning')}</span>
              </button>
            </div>
            <div className="bp-item-list">
              {splitLines(detailNode.positioning).map((item, index) => (
                <div className="bp-item-card" key={`${detailNode.id}-positioning-${index}`}>
                  <input
                    className="bp-feature-card__input"
                    defaultValue={item}
                    onBlur={(event) => updateTextItem(detailNode, 'positioning', index, event.currentTarget.value)}
                  />
                  <button className="bp-feature-card__delete" onClick={() => removeTextItem(detailNode, 'positioning', index)}>
                    {t('blueprint:action.delete')}
                  </button>
                </div>
              ))}
              {splitLines(detailNode.positioning).length === 0 ? <div className="bp-feature-empty">{t('blueprint:detailPanel.noPositioning')}</div> : null}
            </div>
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--content">
            <div className="bp-node-detail__section-head">
              <label className="bp-node-detail__label">{t('blueprint:detailPanel.techSolution')}</label>
              <button className="bp-node-detail__feature-add" onClick={() => addTextItem(detailNode, 'techSolution', t('blueprint:detailPanel.newTechSolution'))}>
                <span className="bp-node-detail__feature-add-icon">+</span>
                <span>{t('blueprint:action.addSolution')}</span>
              </button>
            </div>
            <div className="bp-item-list">
              {splitLines(detailNode.techSolution).map((item, index) => (
                <div className="bp-item-card" key={`${detailNode.id}-tech-${index}`}>
                  <input
                    className="bp-feature-card__input bp-feature-card__input--mono"
                    defaultValue={item}
                    onBlur={(event) => updateTextItem(detailNode, 'techSolution', index, event.currentTarget.value)}
                  />
                  <button className="bp-feature-card__delete" onClick={() => removeTextItem(detailNode, 'techSolution', index)}>
                    {t('blueprint:action.delete')}
                  </button>
                </div>
              ))}
              {splitLines(detailNode.techSolution).length === 0 ? <div className="bp-feature-empty">{t('blueprint:detailPanel.noTechSolution')}</div> : null}
            </div>
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--content">
            <div className="bp-node-detail__section-head">
              <label className="bp-node-detail__label">{t('blueprint:detailPanel.requirementDesc')}</label>
              <button
                className="bp-node-detail__feature-add"
                onClick={() => addFeature(detailNode)}
                title={featureActionHint}
              >
                <span className="bp-node-detail__feature-add-icon">+</span>
                <span>{featureActionLabel}</span>
              </button>
            </div>
            <div className="bp-feature-list">
              {(detailNode.features ?? []).map((feature) => (
                <div className="bp-feature-card" key={feature.id}>
                  <div className="bp-feature-card__row">
                    <input
                      className="bp-feature-card__input"
                      defaultValue={feature.title}
                      onBlur={(event) => updateFeature(detailNode, feature.id, { title: event.currentTarget.value.trim() || feature.title })}
                    />
                    <button className="bp-feature-card__delete" onClick={() => removeFeature(detailNode, feature.id)}>
                      {t('blueprint:action.delete')}
                    </button>
                  </div>
                  <input
                    className="bp-feature-card__input"
                    defaultValue={feature.description}
                    placeholder={t('blueprint:detailPanel.featurePlaceholder')}
                    onBlur={(event) => updateFeature(detailNode, feature.id, { description: event.currentTarget.value })}
                  />
                  <div className="bp-feature-card__readonly">
                    <span>
                      {t('blueprint:detailPanel.janusProgress')} <strong>{Math.max(0, Math.min(100, feature.progress))}%</strong>
                    </span>
                    <span>{t(FEATURE_STATUS_LABEL_KEY[feature.status] ?? `blueprint:featureStatus.${feature.status}`)}</span>
                  </div>
                  <div className="bp-feature-card__notes">
                    {feature.requirementNotes?.length ? feature.requirementNotes.map((note) => <span key={note}>{note}</span>) : <span>{t('blueprint:detailPanel.noJanusNote')}</span>}
                  </div>
                </div>
              ))}
              {(detailNode.features ?? []).length === 0 ? <div className="bp-feature-empty">{t('blueprint:detailPanel.noFeature')}</div> : null}
            </div>
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--content">
            <div className="bp-node-detail__section-head">
              <label className="bp-node-detail__label">{t('blueprint:detailPanel.issueLog')}</label>
              <button className="bp-node-detail__feature-add" onClick={() => addIssue(detailNode)}>
                <span className="bp-node-detail__feature-add-icon">+</span>
                <span>{t('blueprint:action.addIssue')}</span>
              </button>
            </div>
            <div className="bp-feature-list">
              {(detailNode.issues ?? []).map((issue) => (
                <div className="bp-feature-card" key={issue.id}>
                  <div className="bp-feature-card__row">
                    <input
                      className="bp-feature-card__input"
                      defaultValue={issue.title}
                      onBlur={(event) => updateIssue(detailNode, issue.id, { title: event.currentTarget.value.trim() || issue.title })}
                    />
                    <button className="bp-feature-card__delete" onClick={() => removeIssue(detailNode, issue.id)}>
                      {t('blueprint:action.delete')}
                    </button>
                  </div>
                  <div className="bp-feature-card__grid">
                    <Select
                      value={issue.severity}
                      onChange={(value) => updateIssue(detailNode, issue.id, { severity: value as BlueprintIssueSeverity })}
                      options={ISSUE_SEVERITY_VALUES.map((severity) => ({ value: severity, label: t(ISSUE_SEVERITY_LABEL_KEY[severity]) }))}
                      className="blueprint-select bp-node-detail__select"
                      getPortalContainer={getSelectPortalContainer}
                    />
                    <Select
                      value={issue.status}
                      onChange={(value) => updateIssue(detailNode, issue.id, { status: value as BlueprintIssueStatus })}
                      options={ISSUE_STATUS_VALUES.map((status) => ({ value: status, label: t(ISSUE_STATUS_LABEL_KEY[status]) }))}
                      className="blueprint-select bp-node-detail__select"
                      getPortalContainer={getSelectPortalContainer}
                    />
                  </div>
                  <input
                    className="bp-feature-card__input"
                    defaultValue={issue.description}
                    placeholder={t('blueprint:detailPanel.issuePlaceholder')}
                    onBlur={(event) => updateIssue(detailNode, issue.id, { description: event.currentTarget.value })}
                  />
                </div>
              ))}
              {(detailNode.issues ?? []).length === 0 ? <div className="bp-feature-empty">{t('blueprint:detailPanel.noIssue')}</div> : null}
            </div>
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--system">
            <div className="bp-node-detail__section-head">
              <label className="bp-node-detail__label">{t('blueprint:detailPanel.bindWorkspace')}</label>
              <button
                className="bp-node-detail__feature-add"
                onClick={() => bindNodeWorkspace(detailNode.id, '')}
                disabled={!detailNode.workspaceId}
              >
                {t('blueprint:action.unbindWorkspace')}
              </button>
            </div>
            <Select
              value={detailNode.workspaceId ?? ''}
              onChange={(value) => bindNodeWorkspace(detailNode.id, value)}
              placeholder={t('blueprint:detailPanel.selectWorkspace')}
              options={[
                { value: '', label: t('blueprint:detailPanel.unbindWorkspace') },
                ...workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))
              ]}
              className="blueprint-select bp-node-detail__select"
              dropdownClassName="bp-node-detail__dropdown"
              getPortalContainer={getSelectPortalContainer}
            />
            {detailWorkspaceMissing ? (
              <div className="bp-node-detail__warning">
                {t('blueprint:detailPanel.workspaceMissing')}
                {detailNode.workspaceSnapshot ? ` ${t('blueprint:detailPanel.workspaceSnapshot', { name: detailNode.workspaceSnapshot.name, path: detailNode.workspaceSnapshot.path })}` : ''}
              </div>
            ) : null}
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--system">
            <label className="bp-node-detail__label">{t('blueprint:detailPanel.mountPosition')}</label>
            <Select
              value={detailNode.parentId ?? ''}
              onChange={(value) => bindNodeParent(detailNode.id, value)}
              options={detailNodeParentOptions}
              disabled={currentBlueprint?.rootNodeId === detailNode.id}
              className="blueprint-select bp-node-detail__select"
              dropdownClassName="bp-node-detail__dropdown"
              getPortalContainer={getSelectPortalContainer}
            />
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--system">
            <label className="bp-node-detail__label">{t('blueprint:detailPanel.newTerminalType')}</label>
            <Select
              value={terminalPreset}
              onChange={(value) => setTerminalPreset(value as TerminalPreset)}
              options={TERMINAL_PRESETS.map((preset) => ({ value: preset.type, label: preset.label }))}
              className="blueprint-select bp-node-detail__select"
              dropdownClassName="bp-node-detail__dropdown"
              getPortalContainer={getSelectPortalContainer}
            />
          </div>

          <div className="bp-node-detail__meta">
            <div>
              <span>{t('blueprint:detailPanel.status')}</span>
              <strong>{t(STATUS_VISUALS[detailNode.status]?.labelKey ?? `blueprint:status.${detailNode.status}`)}</strong>
            </div>
            <div>
              <span>{t('blueprint:detailPanel.source')}</span>
              <strong>{detailNode.statusSource === 'janus' ? t('blueprint:statusSource.janus') : t('blueprint:statusSource.manual')}</strong>
            </div>
            <div>
              <span>{t('blueprint:detailPanel.terminal')}</span>
              <strong>{detailNode.boundTerminalId ? detailNode.boundTerminalId.slice(0, 8) : '—'}</strong>
            </div>
            <div>
              <span>{t('blueprint:detailPanel.analysisCursor')}</span>
              <strong>{detailNode.lastAnalyzedCommitSha ? detailNode.lastAnalyzedCommitSha.slice(0, 8) : '—'}</strong>
            </div>
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--analysis">
            <div className="bp-node-detail__section-head">
              <label className="bp-node-detail__label">{t('blueprint:detailPanel.janusAnalysis')}</label>
              <span className="bp-node-detail__count">{detailNode.analyses?.length ?? 0}</span>
            </div>
            {latestAnalysis ? (
              <div className="bp-history-card">
                <div className="bp-history-card__title">{latestAnalysis.result.summary || latestAnalysis.error || t('blueprint:detailPanel.noSummary')}</div>
                <div className="bp-history-card__meta">
                  {t('blueprint:detailPanel.analysisMeta', {
                    date: new Date(latestAnalysis.createdAt).toLocaleString(),
                    trigger: t(TRIGGER_LABEL_KEY[latestAnalysis.trigger] ?? `blueprint:trigger.${latestAnalysis.trigger}`),
                    applied: latestAnalysis.applied ? t('blueprint:applied.yes') : t('blueprint:applied.no'),
                    confidence: t('blueprint:detailPanel.confidence', { percent: Math.round((latestAnalysis.result.confidence ?? 0) * 100) })
                  })}
                </div>
                {latestAnalysis.result.evidence?.length ? (
                  <ul className="bp-history-card__list">
                    {latestAnalysis.result.evidence.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : null}
                {latestAnalysis.result.unresolved?.length ? (
                  <ul className="bp-history-card__list bp-history-card__list--warn">
                    {latestAnalysis.result.unresolved.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : null}
                <div className="bp-history-card__actions">
                  <button className="blueprint-btn" onClick={() => toggleAnalysisHistory(detailNode)}>
                    {analysisHistoryOpen ? t('blueprint:action.collapseHistory') : t('blueprint:action.viewHistory')}
                  </button>
                  {analysisHistoryOpen ? (
                    <button className="blueprint-btn" onClick={() => loadAnalysisHistory(detailNode)} disabled={analysisHistoryLoading}>
                      {analysisHistoryLoading ? t('blueprint:action.refreshing') : t('blueprint:action.refresh')}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="bp-node-detail__empty">{t('blueprint:detailPanel.noAnalysis')}</div>
            )}
            {analysisHistoryOpen ? (
              <div className="bp-analysis-history">
                <div className="bp-analysis-history__list">
                  {analysisHistoryLoading ? <div className="bp-node-detail__empty">{t('blueprint:detailPanel.loadingHistory')}</div> : null}
                  {!analysisHistoryLoading && analysisHistory.length === 0 ? <div className="bp-node-detail__empty">{t('blueprint:detailPanel.noHistory')}</div> : null}
                  {analysisHistory.map((analysis) => (
                    <button
                      key={analysis.id}
                      className={`bp-analysis-history__item${selectedAnalysis?.id === analysis.id ? ' bp-analysis-history__item--active' : ''}`}
                      onClick={() => setSelectedAnalysisId(analysis.id)}
                    >
                      <span>{new Date(analysis.createdAt).toLocaleString()}</span>
                      <strong>{analysis.result.summary || analysis.error || t('blueprint:detailPanel.noSummary')}</strong>
                      <em>
                        {t(TRIGGER_LABEL_KEY[analysis.trigger] ?? `blueprint:trigger.${analysis.trigger}`)} · {t(STATUS_VISUALS[analysis.result.status]?.labelKey ?? `blueprint:status.${analysis.result.status}`)} · {analysis.result.progress}%
                      </em>
                    </button>
                  ))}
                </div>

                {selectedAnalysis ? (
                  <div className="bp-analysis-detail">
                    <div className="bp-analysis-detail__head">
                      <div>
                        <strong>{selectedAnalysis.result.summary || selectedAnalysis.error || t('blueprint:detailPanel.noSummary')}</strong>
                        <span>
                          {selectedAnalysis.applied ? t('blueprint:applied.yes') : t('blueprint:applied.no')} · {t('blueprint:detailPanel.confidence', { percent: Math.round((selectedAnalysis.result.confidence ?? 0) * 100) })}
                        </span>
                      </div>
                      <button
                        className="blueprint-btn"
                        onClick={() => reapplyAnalysis(detailNode, selectedAnalysis)}
                        disabled={!selectedAnalysis.applied || applyingAnalysisId === selectedAnalysis.id}
                      >
                        {applyingAnalysisId === selectedAnalysis.id ? t('blueprint:action.applying') : t('blueprint:action.reapply')}
                      </button>
                    </div>

                    <div className="bp-analysis-detail__grid">
                      <div><span>{t('blueprint:detailPanel.status')}</span><strong>{t(STATUS_VISUALS[selectedAnalysis.result.status]?.labelKey ?? `blueprint:status.${selectedAnalysis.result.status}`)}</strong></div>
                      <div><span>{t('blueprint:detailPanel.progress')}</span><strong>{selectedAnalysis.result.progress}%</strong></div>
                      <div><span>{t('blueprint:detailPanel.trigger')}</span><strong>{t(TRIGGER_LABEL_KEY[selectedAnalysis.trigger] ?? `blueprint:trigger.${selectedAnalysis.trigger}`)}</strong></div>
                      <div><span>{t('blueprint:detailPanel.time')}</span><strong>{new Date(selectedAnalysis.createdAt).toLocaleString()}</strong></div>
                    </div>

                    {selectedAnalysis.error ? <div className="bp-analysis-detail__error">{selectedAnalysis.error}</div> : null}

                    <div className="bp-analysis-detail__section">
                      <label>{t('blueprint:detailPanel.inputSummary')}</label>
                      <pre>{`${t('blueprint:detailPanel.blueprintExpected')}\n${selectedAnalysis.inputSummary.blueprint || t('blueprint:detailPanel.none')}\n\n${t('blueprint:detailPanel.actualChangesLabel')}\n${selectedAnalysis.inputSummary.actual || t('blueprint:detailPanel.none')}`}</pre>
                    </div>

                    {selectedAnalysis.result.evidence?.length ? (
                      <div className="bp-analysis-detail__section">
                        <label>{t('blueprint:detailPanel.evidence')}</label>
                        <ul>{selectedAnalysis.result.evidence.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
                      </div>
                    ) : null}

                    {selectedAnalysis.result.unresolved?.length ? (
                      <div className="bp-analysis-detail__section bp-analysis-detail__section--warn">
                        <label>{t('blueprint:detailPanel.unresolved')}</label>
                        <ul>{selectedAnalysis.result.unresolved.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
                      </div>
                    ) : null}

                    {selectedAnalysis.result.featureUpdates?.length ? (
                      <div className="bp-analysis-detail__section">
                        <label>{t('blueprint:detailPanel.featureUpdates')}</label>
                        <ul>
                          {selectedAnalysis.result.featureUpdates.map((item, index) => (
                            <li key={`${item.featureId}-${index}`}>
                              {item.featureId} · {item.status ? t(FEATURE_STATUS_LABEL_KEY[item.status] ?? `blueprint:featureStatus.${item.status}`) : t('blueprint:detailPanel.statusUnchanged')} · {item.progress ?? t('blueprint:detailPanel.progressUnchanged')}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {selectedAnalysis.result.discoveredRequirements?.length ? (
                      <div className="bp-analysis-detail__section">
                        <label>{t('blueprint:detailPanel.newRequirementProposal')}</label>
                        <ul>
                          {selectedAnalysis.result.discoveredRequirements.map((item, index) => (
                            <li key={`${item.title}-${index}`}>{item.title} · {Math.round(item.confidence * 100)}%</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="bp-node-detail__section">
            <div className="bp-node-detail__section-head">
              <label className="bp-node-detail__label">{t('blueprint:detailPanel.activityLog')}</label>
              <span className="bp-node-detail__count">{detailNode.activities?.length ?? 0}</span>
            </div>
            <div className="bp-activity-list">
              {(detailNode.activities ?? []).slice(-6).reverse().map((activity) => (
                <div className="bp-activity-item" key={activity.id}>
                  <span>{activity.type}</span>
                  <strong>{activity.content}</strong>
                  <em>{new Date(activity.createdAt).toLocaleString()}</em>
                </div>
              ))}
              {(detailNode.activities ?? []).length === 0 ? <div className="bp-node-detail__empty">{t('blueprint:detailPanel.noActivity')}</div> : null}
            </div>
          </div>
        </aside>
        </BlueprintDetailMount>
      ) : null}
      <PromptDialog
        open={promptState !== null}
        title={promptState?.kind === 'child' ? t('blueprint:prompt.newChild') : t('blueprint:prompt.newRoot')}
        label={promptState?.kind === 'child' ? t('blueprint:prompt.childTitle') : t('blueprint:prompt.rootTitle')}
        placeholder={t('blueprint:prompt.inputTitle')}
        onConfirm={handlePromptConfirm}
        onCancel={() => setPromptState(null)}
      />
      <PromptDialog
        open={deleteTarget !== null}
        title={t('blueprint:confirm.deleteTitle')}
        description={deleteTarget?.message}
        confirmOnly
        confirmText={t('blueprint:confirm.deleteConfirm')}
        tone="danger"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />
      <PromptDialog
        open={restoreLayoutConfirmOpen}
        title={t('blueprint:confirm.restoreLayoutTitle')}
        description={t('blueprint:confirm.restoreLayoutDesc')}
        confirmOnly
        confirmText={t('blueprint:confirm.restoreConfirm')}
        onConfirm={() => {
          setRestoreLayoutConfirmOpen(false)
          void restoreDefaultLayout()
        }}
        onCancel={() => setRestoreLayoutConfirmOpen(false)}
      />
    </div>
  )
}
