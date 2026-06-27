/**
 * @file 蓝图画布（React Flow）— MVP
 * @description
 *  - 从 store 加载蓝图，把 Blueprint.nodes（Record）转成 React Flow nodes + edges。
 *  - 树形布局：根居中、子节点向下展开（简单递归，无 dagre）。
 *  - 交互：拖拽 / 选中 / 双击（onNodeOpen 回调）/ 右键菜单（加子节点 / 删除 / 状态标记）。
 *  - 工具栏：新建根节点 / 分析选中节点 / 适应画布。
 *  - canvasLayout：拖拽后防抖写回 Blueprint.canvasLayout。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type ReactFlowInstance,
  type NodeMouseHandler
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useBlueprintStore } from '@/stores/blueprint'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'
import type { Terminal, TerminalPreset } from '@/types'
import {
  createNode as createNodeIPC,
  updateBlueprint as updateBlueprintIPC,
  analyze as analyzeIPC,
  bindTerminal as bindTerminalIPC,
  listAnalyses as listAnalysesIPC,
  applyAnalysis as applyAnalysisIPC,
  type Blueprint,
  type BlueprintAnalysis,
  type BlueprintFeatureItem,
  type BlueprintIssue,
  type BlueprintIssueSeverity,
  type BlueprintIssueStatus,
  type BlueprintNode,
  type BlueprintNodeType,
  type BlueprintNodeStatus
} from '@/services/blueprint'
import { BlueprintNodeCard, type BlueprintNodeData } from './BlueprintNodeCard'
import { STATUS_VISUALS, STATUS_ORDER, NODE_TYPE_LABEL } from './blueprintStatus'
import { PromptDialog } from './PromptDialog'
import { Select } from '../ui/Select'
import { getTerminalPresetMeta, resolveTerminalLaunchCommand } from '../../../../shared/terminalLaunch'

const GLOBAL_BLUEPRINT_SCOPE = '__global__'
const DEFAULT_NODE_TERMINAL_PRESET: TerminalPreset = 'codex'
const ANALYSIS_COMMIT_LIMIT_DEFAULT = 5
const ANALYSIS_COMMIT_LIMIT_MIN = 1
const ANALYSIS_COMMIT_LIMIT_MAX = 50
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
const ISSUE_SEVERITY_LABEL: Record<BlueprintIssueSeverity, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重'
}
const ISSUE_STATUS_LABEL: Record<BlueprintIssueStatus, string> = {
  open: '未解决',
  resolved: '已解决',
  wontfix: '暂不处理'
}
const FEATURE_STATUS_LABEL: Record<BlueprintFeatureItem['status'], string> = {
  planned: '待规划',
  'in-progress': '进行中',
  done: '已完成',
  blocked: '阻塞'
}

const TRIGGER_LABEL: Record<string, string> = {
  'commit-threshold': '提交触发',
  manual: '手动分析',
  'terminal-close': '终端关闭',
  reconcile: '补漏对账'
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

function normalizeAnalysisCommitLimit(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return ANALYSIS_COMMIT_LIMIT_DEFAULT
  return Math.max(ANALYSIS_COMMIT_LIMIT_MIN, Math.min(ANALYSIS_COMMIT_LIMIT_MAX, parsed))
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

function collectLegacyRequirements(node: BlueprintNode): BlueprintFeatureItem[] {
  const existingTitles = new Set((node.features ?? []).map((feature) => feature.title.trim().toLowerCase()).filter(Boolean))
  const out: BlueprintFeatureItem[] = []
  const pushOnce = (item: BlueprintFeatureItem) => {
    const key = item.title.trim().toLowerCase()
    if (!key || existingTitles.has(key)) return
    existingTitles.add(key)
    out.push(item)
  }

  const description = node.description?.trim()
  if (description) {
    pushOnce(
      makeRequirementItem({
        title: description.split(/\r?\n/)[0].slice(0, 48),
        description,
        note: '由旧版节点描述迁移'
      })
    )
  }

  for (const item of node.completedItems ?? []) {
    const title = item.trim()
    if (!title) continue
    pushOnce(makeRequirementItem({ title, progress: 100, status: 'done', note: '由旧版已完成事项迁移' }))
  }

  for (const todo of node.todos ?? []) {
    const title = todo.text.trim()
    if (!title) continue
    pushOnce(
      makeRequirementItem({
        title,
        progress: todo.done ? 100 : 0,
        status: todo.done ? 'done' : 'planned',
        note: '由旧版待办迁移'
      })
    )
  }

  return out
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

function waitForTerminalMount(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

/* Tree layout */
const NODE_W = 240
const NODE_H = 110
const X_GAP = 32
const Y_GAP = 64

/** 计算所有节点位置：树形递归 + canvasLayout 覆盖 */
function computeLayout(
  nodes: Record<string, BlueprintNode>,
  rootNodeId: string,
  canvasLayout: Blueprint['canvasLayout']
): Record<string, { x: number; y: number }> {
  const childrenOf: Record<string, string[]> = {}
  const roots: string[] = []
  for (const id of Object.keys(nodes)) {
    const n = nodes[id]
    const p = n.parentId
    if (p && nodes[p]) {
      ;(childrenOf[p] ??= []).push(id)
    } else {
      roots.push(id)
    }
  }
  // 主根优先
  roots.sort((a, b) => (a === rootNodeId ? -1 : b === rootNodeId ? 1 : 0))

  const positions: Record<string, { x: number; y: number }> = {}
  let cursor = 0
  const place = (id: string, depth: number): number => {
    const kids = childrenOf[id] ?? []
    if (kids.length === 0) {
      const x = cursor * (NODE_W + X_GAP)
      cursor++
      positions[id] = { x, y: depth * (NODE_H + Y_GAP) }
      return x
    }
    const childXs = kids.map((k) => place(k, depth + 1))
    const x = childXs.reduce((a, b) => a + b, 0) / childXs.length
    positions[id] = { x, y: depth * (NODE_H + Y_GAP) }
    return x
  }
  for (const r of roots) {
    place(r, 0)
    cursor += 0.5
  }
  // 显式保存的画布坐标覆盖自动布局
  for (const id of Object.keys(canvasLayout)) {
    if (nodes[id] && canvasLayout[id]) positions[id] = canvasLayout[id]
  }
  return positions
}

/** 从 Blueprint 派生 RF nodes / edges（保留已有位置） */
function deriveRF(
  bp: Blueprint,
  existing: Record<string, { x: number; y: number }>,
  workspaceNameById: Record<string, string>,
  focusedNodeIds: Set<string>,
  focusActive: boolean
): { nodes: Node<BlueprintNodeData, 'blueprint'>[]; edges: Edge[] } {
  const layout = computeLayout(bp.nodes, bp.rootNodeId, bp.canvasLayout ?? {})
  const nodes: Node<BlueprintNodeData, 'blueprint'>[] = bp.nodeIds
    .filter((id) => bp.nodes[id])
    .map((id) => {
      const n = bp.nodes[id]
      const isFocused = focusedNodeIds.has(id)
      return {
        id,
        type: 'blueprint',
        position: existing[id] ?? layout[id] ?? { x: 0, y: 0 },
        data: {
          title: n.title,
          status: n.status,
          nodeType: n.type,
          progress: n.progress,
          workspaceName: n.workspaceId ? workspaceNameById[n.workspaceId] ?? n.workspaceSnapshot?.name ?? null : null,
          boundTerminalId: n.boundTerminalId,
          searchMatched: focusActive && isFocused,
          searchDimmed: focusActive && !isFocused
        }
      }
    })
  const edges: Edge[] = bp.nodeIds
    .filter((id) => {
      const n = bp.nodes[id]
      return n && n.parentId && bp.nodes[n.parentId]
    })
    .map((id) => ({
      id: `e-${bp.nodes[id].parentId}->${id}`,
      source: bp.nodes[id].parentId as string,
      target: id,
      type: 'smoothstep',
      style: { stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1.5 }
    }))
  return { nodes, edges }
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
}

export function BlueprintCanvas({ blueprintId, onNodeOpen }: BlueprintCanvasProps) {
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const loading = useBlueprintStore((s) => s.loading)
  const error = useBlueprintStore((s) => s.error)
  const loadBlueprint = useBlueprintStore((s) => s.loadBlueprint)
  const updateNode = useBlueprintStore((s) => s.updateNode)
  const deleteNode = useBlueprintStore((s) => s.deleteNode)
  const focusNodeSession = useBlueprintStore((s) => s.focusNode)
  const refreshAfterAnalysis = useBlueprintStore((s) => s.refreshAfterAnalysis)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)
  const addTerminal = useWorkspaceStore((s) => s.addTerminal)
  const removeTerminal = useWorkspaceStore((s) => s.removeTerminal)
  const setActiveTerminal = useWorkspaceStore((s) => s.setActiveTerminal)
  const addLog = useWorkspaceStore((s) => s.addLog)
  const setLoadState = useAppStore((s) => s.setLoadState)
  const setBlueprintMode = useAppStore((s) => s.setBlueprintMode)

  const [rfNodes, setRFNodes] = useState<Node<BlueprintNodeData, 'blueprint'>[]>([])
  const [rfEdges, setRFEdges] = useState<Edge[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null)
  const [terminalPreset, setTerminalPreset] = useState<TerminalPreset>(DEFAULT_NODE_TERMINAL_PRESET)
  const [toolbarExpanded, setToolbarExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [analysisCommitLimit, setAnalysisCommitLimit] = useState(String(ANALYSIS_COMMIT_LIMIT_DEFAULT))
  const [actionError, setActionError] = useState<string | null>(null)
  const [analysisHistoryOpen, setAnalysisHistoryOpen] = useState(false)
  const [analysisHistory, setAnalysisHistory] = useState<BlueprintAnalysis[]>([])
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null)
  const [analysisHistoryLoading, setAnalysisHistoryLoading] = useState(false)
  const [applyingAnalysisId, setApplyingAnalysisId] = useState<string | null>(null)
  const [promptState, setPromptState] = useState<
    | { kind: 'child'; parentId: string }
    | { kind: 'root' }
    | null
  >(null)

  const rfInstanceRef = useRef<ReactFlowInstance<Node<BlueprintNodeData, 'blueprint'>, Edge> | null>(null)
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const layoutSaveTimerRef = useRef<number | null>(null)

  const workspaceNameById = useMemo(
    () => Object.fromEntries(workspaces.map((w) => [w.id, w.name])),
    [workspaces]
  )
  const detailNode = currentBlueprint && detailNodeId ? currentBlueprint.nodes[detailNodeId] ?? null : null
  const selectedNode = currentBlueprint && selectedId ? currentBlueprint.nodes[selectedId] ?? null : null
  const normalizedSearchQuery = useMemo(() => normalizeSearchText(searchQuery), [searchQuery])
  const focusActive = normalizedSearchQuery.length > 0 || statusFilter !== 'all'
  const focusedNodeIds = useMemo(() => {
    if (!currentBlueprint || !focusActive) return new Set<string>()
    return new Set(
      currentBlueprint.nodeIds.filter((id) => {
        const node = currentBlueprint.nodes[id]
        return node ? nodeMatchesFocus(node, normalizedSearchQuery, statusFilter) : false
      })
    )
  }, [currentBlueprint, focusActive, normalizedSearchQuery, statusFilter])
  const focusedNodeCount = focusedNodeIds.size
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
      { value: '', label: '作为根节点' },
      ...currentBlueprint.nodeIds
        .filter((id) => id !== detailNode.id && !descendants.has(id))
        .map((id) => ({
          value: id,
          label: currentBlueprint.nodes[id]?.title || id
        }))
    ]
  }, [currentBlueprint, detailNode])

  // 初次加载
  useEffect(() => {
    if (blueprintId) loadBlueprint(blueprintId)
  }, [blueprintId, loadBlueprint])

  useEffect(() => {
    return () => {
      if (layoutSaveTimerRef.current !== null) {
        window.clearTimeout(layoutSaveTimerRef.current)
      }
    }
  }, [])

  // 当 currentBlueprint 的节点集或关键字段变化时，重新派生 React Flow nodes/edges，保留已拖拽位置
  const signature = useMemo(() => {
    if (!currentBlueprint) return ''
    return JSON.stringify({
      id: currentBlueprint.id,
      ids: currentBlueprint.nodeIds,
      fields: currentBlueprint.nodeIds.map((id) => {
        const n = currentBlueprint.nodes[id]
        return n
          ? [
              n.title,
              n.status,
              n.progress,
              n.workspaceId,
              n.workspaceSnapshot?.name,
              n.workspaceSnapshot?.path,
              n.boundTerminalId,
              n.parentId,
              n.positioning,
              n.techSolution,
              n.description,
              n.tags,
              n.features?.map((feature) => [feature.title, feature.description, feature.status, feature.requirementNotes]),
              n.issues?.map((issue) => [issue.title, issue.description, issue.severity, issue.status])
            ]
          : null
      }),
      search: normalizedSearchQuery,
      statusFilter
    })
  }, [currentBlueprint, normalizedSearchQuery, statusFilter])

  useEffect(() => {
    if (!currentBlueprint) return
    const { nodes, edges } = deriveRF(currentBlueprint, positionsRef.current, workspaceNameById, focusedNodeIds, focusActive)
    // 记录最新位置（含自动布局）
    positionsRef.current = Object.fromEntries(nodes.map((n) => [n.id, n.position]))
    setRFNodes(nodes)
    setRFEdges(edges)
  }, [signature, workspaceNameById, focusedNodeIds, focusActive]) // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleLayoutSave = useCallback(() => {
    if (layoutSaveTimerRef.current !== null) {
      window.clearTimeout(layoutSaveTimerRef.current)
    }
    layoutSaveTimerRef.current = window.setTimeout(async () => {
      layoutSaveTimerRef.current = null
      try {
        await updateBlueprintIPC(GLOBAL_BLUEPRINT_SCOPE, blueprintId, {
          canvasLayout: { ...positionsRef.current }
        })
        setActionError(null)
      } catch (err) {
        setActionError(`布局保存失败: ${(err as Error).message}`)
      }
    }, 500)
  }, [blueprintId])

  // 节点变更（拖拽 / 选中）
  const onNodesChange = useCallback(
    (changes: NodeChange<Node<BlueprintNodeData, 'blueprint'>>[]) => {
      let hasPositionChange = false
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          positionsRef.current[c.id] = c.position
          hasPositionChange = true
        }
      }
      setRFNodes((nds) => {
        return applyNodeChanges(changes, nds)
      })
      // 选中态
      for (const c of changes) {
        if (c.type === 'select') {
          setSelectedId(c.selected ? c.id : null)
        }
      }
      if (hasPositionChange) {
        scheduleLayoutSave()
      }
    },
    [scheduleLayoutSave]
  )

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_e, node) => {
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
        ? `确认删除主根节点“${node.title || nodeId}”？其子节点会提升为根节点，并自动选择新的主根。`
        : isRoot
          ? `确认删除根节点“${node.title || nodeId}”？其子节点会提升为根节点。`
          : `确认删除节点“${node.title || nodeId}”？其子节点会挂载到上级节点。`
      if (!window.confirm(message)) return
      const ok = await deleteNode(blueprintId, nodeId)
      if (ok) {
        setSelectedId((current) => (current === nodeId ? null : current))
        setDetailNodeId((current) => (current === nodeId ? null : current))
        setActionError(null)
      } else {
        setActionError('无法删除最后一个节点，请直接删除蓝图')
      }
    },
    [blueprintId, currentBlueprint, deleteNode]
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
        setActionError('请先为节点绑定工作区')
        return
      }
      const workspace = workspaces.find((w) => w.id === node.workspaceId)
      if (!workspace) {
        setActionError('节点绑定的工作区不存在，请重新绑定')
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
    [blueprintId, focusNodeSession, setActiveWorkspace, workspaces]
  )

  const focusOrCreateTerminal = useCallback(
    async (node: BlueprintNode, requestedPreset: TerminalPreset = terminalPreset) => {
      setActionError(null)
      if (!node.workspaceId) {
        setActionError('请先为节点绑定工作区')
        return
      }
      const workspace = workspaces.find((w) => w.id === node.workspaceId)
      if (!workspace) {
        setActionError('节点绑定的工作区不存在，请重新绑定')
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
      const terminalId = crypto.randomUUID()
      const defaultShell = (await window.electron.invoke('system:getDefaultShell')) as string
      const autoCommand = resolveTerminalLaunchCommand(preset.type)
      const terminal: Terminal = {
        id: terminalId,
        workspaceId: workspace.id,
        name: preset.name,
        preset: preset.type,
        cwd: workspace.path,
        shell: defaultShell,
        autoCommand,
        pid: null,
        status: 'idle'
      }

      addTerminal(terminal)
      addLog('info', `[蓝图] 为节点创建 ${preset.label} 终端 (${terminalId.slice(0, 8)})`)
      setLoadState('terminal-active')
      await waitForTerminalMount()

      try {
        const result = (await window.electron.invoke('terminal:create', {
          id: terminalId,
          workspaceId: workspace.id,
          cwd: workspace.path,
          shell: defaultShell,
          autoCommand,
          preset: preset.type
        })) as { pid: number }

        useWorkspaceStore.setState((s) => ({
          terminals: s.terminals.map((t) =>
            t.id === terminalId ? { ...t, pid: result.pid, status: 'running' as const } : t
          )
        }))
        await bindTerminalIPC(workspace.path, node.id, terminalId)
        await loadBlueprint(blueprintId)
      } catch (err) {
        removeTerminal(terminalId)
        setActionError(`终端创建失败: ${(err as Error).message}`)
      }
    },
    [
      workspaces,
      setActiveWorkspace,
      setBlueprintMode,
      setLoadState,
      setActiveTerminal,
      addTerminal,
      addLog,
      removeTerminal,
      loadBlueprint,
      blueprintId,
      terminalPreset
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
      const feature = makeRequirementItem({ title: '新需求项' })
      await persistNodePatch(node.id, { features: [...(node.features ?? []), feature] })
    },
    [persistNodePatch]
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
        title: '新问题',
        description: '',
        severity: 'medium',
        status: 'open',
        createdAt: now
      }
      await persistNodePatch(node.id, { issues: [...(node.issues ?? []), issue] })
    },
    [persistNodePatch]
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

  useEffect(() => {
    if (!detailNode) return
    const legacyRequirements = collectLegacyRequirements(detailNode)
    if (!legacyRequirements.length) return
    void persistNodePatch(detailNode.id, {
      features: [...(detailNode.features ?? []), ...legacyRequirements],
      description: '',
      completedItems: [],
      todos: []
    })
  }, [detailNode, persistNodePatch])

  useEffect(() => {
    setAnalysisHistoryOpen(false)
    setAnalysisHistory([])
    setSelectedAnalysisId(null)
    setAnalysisHistoryLoading(false)
    setApplyingAnalysisId(null)
  }, [detailNodeId])

  const getAnalysisWorkspacePath = useCallback(
    (node: BlueprintNode): string => {
      const workspace = node.workspaceId ? workspaces.find((item) => item.id === node.workspaceId) : null
      return workspace?.path ?? GLOBAL_BLUEPRINT_SCOPE
    },
    [workspaces]
  )

  const loadAnalysisHistory = useCallback(
    async (node: BlueprintNode) => {
      setAnalysisHistoryLoading(true)
      setActionError(null)
      try {
        const items = await listAnalysesIPC({
          workspacePath: getAnalysisWorkspacePath(node),
          blueprintId,
          nodeId: node.id
        })
        const fallback = [...(node.analyses ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        const next = items.length ? items : fallback
        setAnalysisHistory(next)
        setSelectedAnalysisId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null)
      } catch (err) {
        const fallback = [...(node.analyses ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        setAnalysisHistory(fallback)
        setSelectedAnalysisId(fallback[0]?.id ?? null)
        setActionError(`分析历史加载失败: ${(err as Error).message}`)
      } finally {
        setAnalysisHistoryLoading(false)
      }
    },
    [blueprintId, getAnalysisWorkspacePath]
  )

  const toggleAnalysisHistory = useCallback(
    async (node: BlueprintNode) => {
      const nextOpen = !analysisHistoryOpen
      setAnalysisHistoryOpen(nextOpen)
      if (nextOpen) {
        await loadAnalysisHistory(node)
      }
    },
    [analysisHistoryOpen, loadAnalysisHistory]
  )

  const reapplyAnalysis = useCallback(
    async (node: BlueprintNode, analysis: BlueprintAnalysis) => {
      if (!analysis.applied) {
        setActionError('失败或未应用的分析不能重新应用')
        return
      }
      setApplyingAnalysisId(analysis.id)
      setActionError(null)
      try {
        const updated = await applyAnalysisIPC({
          workspacePath: getAnalysisWorkspacePath(node),
          blueprintId,
          nodeId: node.id,
          analysisId: analysis.id
        })
        if (!updated) {
          setActionError('无法重新应用该分析')
          return
        }
        await loadBlueprint(blueprintId)
        await loadAnalysisHistory(updated)
      } catch (err) {
        setActionError(`重新应用分析失败: ${(err as Error).message}`)
      } finally {
        setApplyingAnalysisId(null)
      }
    },
    [blueprintId, getAnalysisWorkspacePath, loadAnalysisHistory, loadBlueprint]
  )

  const applyAnalysisPatch = useCallback(
    async (nodeId: string, patch: { progress?: number; status?: BlueprintNodeStatus }) => {
      const node = currentBlueprint?.nodes[nodeId]
      const workspace = node?.workspaceId ? workspaces.find((item) => item.id === node.workspaceId) : null
      if (!workspace) {
        setActionError('请先为节点绑定可用工作区')
        return
      }
      await window.electron.invoke('janus:analyzer:apply-patch', {
        workspacePath: workspace.path,
        blueprintId,
        nodeId,
        patch
      })
      await loadBlueprint(blueprintId)
    },
    [blueprintId, currentBlueprint, loadBlueprint, workspaces]
  )

  const analyzeSelected = useCallback(async () => {
    if (!selectedId) return
    const node = currentBlueprint?.nodes[selectedId]
    const workspace = node?.workspaceId ? workspaces.find((w) => w.id === node.workspaceId) : null
    if (!node || !workspace) {
      setActionError('请先为选中节点绑定可用工作区')
      return
    }
    setAnalyzing(true)
    setActionError(null)
    try {
      const commitLimit = normalizeAnalysisCommitLimit(analysisCommitLimit)
      setAnalysisCommitLimit(String(commitLimit))
      const res = await analyzeIPC({
        nodeId: selectedId,
        workspacePath: workspace.path,
        trigger: 'manual',
        commitLimit
      })
      console.log('[BlueprintCanvas] analyze result', selectedId, res)
      if (res?.error) {
        setActionError(res.error)
      }
      await refreshAfterAnalysis()
    } catch (err) {
      setActionError(`分析失败: ${(err as Error).message}`)
    } finally {
      setAnalyzing(false)
    }
  }, [selectedId, currentBlueprint, workspaces, analysisCommitLimit, refreshAfterAnalysis])

  const fitView = useCallback(() => {
    rfInstanceRef.current?.fitView({ padding: 0.2, duration: 200 })
  }, [])

  const focusFirstMatch = useCallback(() => {
    if (!currentBlueprint || focusedNodeCount === 0) return
    const firstId = currentBlueprint.nodeIds.find((id) => focusedNodeIds.has(id))
    if (!firstId) return
    setSelectedId(firstId)
    const rfNode = rfInstanceRef.current?.getNode(firstId)
    if (rfNode) {
      rfInstanceRef.current?.setCenter(rfNode.position.x + NODE_W / 2, rfNode.position.y + NODE_H / 2, {
        zoom: 1,
        duration: 220
      })
    }
  }, [currentBlueprint, focusedNodeCount, focusedNodeIds])

  const nodeTypes = useMemo(() => ({ blueprint: BlueprintNodeCard }), [])
  const statusFilterOptions = useMemo(
    () => [
      { value: 'all', label: '全部状态' },
      ...STATUS_ORDER.map((status) => ({ value: status, label: STATUS_VISUALS[status].label }))
    ],
    []
  )
  const featureActionLabel = '添加需求项'
  const featureActionHint = '需求项保存在应用级蓝图中，Janus 后续只维护参考完成度、状态和评估备注。'

  return (
    <div className="blueprint-canvas-wrapper">
      {/* 画布操作工具栏 */}
      <div className="blueprint-toolbar blueprint-toolbar--canvas">
        <div className="blueprint-toolbar__main">
          <div className="blueprint-toolbar__identity">
            <span className="blueprint-toolbar__title">
              {currentBlueprint ? currentBlueprint.name : '加载中…'}
            </span>
            {selectedNode ? (
              <span className="blueprint-toolbar__hint">
                {selectedNode.workspaceId ? workspaceNameById[selectedNode.workspaceId] ?? selectedNode.workspaceSnapshot?.name ?? '工作区失效' : '未绑定工作区'}
              </span>
            ) : null}
          </div>

          <div className="blueprint-toolbar__actions">
            <div className="blueprint-toolbar__group blueprint-toolbar__group--focus">
              <input
                className="blueprint-toolbar__search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder="搜索节点"
                aria-label="搜索蓝图节点"
              />
              <Select
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
                options={statusFilterOptions}
                className="blueprint-select blueprint-select--status-filter"
              />
              {focusActive ? (
                <span className="blueprint-toolbar__match-count">{focusedNodeCount} 个匹配</span>
              ) : null}
              {focusActive ? (
                <button
                  className="blueprint-btn"
                  onClick={() => {
                    setSearchQuery('')
                    setStatusFilter('all')
                  }}
                >
                  清除
                </button>
              ) : null}
            </div>

            <div className="blueprint-toolbar__group blueprint-toolbar__group--primary">
              <button className="blueprint-btn blueprint-btn--primary" onClick={addRoot}>+ 新建根节点</button>
              <button className="blueprint-btn" onClick={() => selectedId && addChild(selectedId)} disabled={!selectedId}>
                + 子节点
              </button>
              <button className="blueprint-btn" onClick={() => selectedId && setDetailNodeId(selectedId)} disabled={!selectedId}>
                节点详情
              </button>
            </div>

            <div className="blueprint-toolbar__group blueprint-toolbar__group--utility">
              <button
                className={`blueprint-btn blueprint-toolbar__toggle${toolbarExpanded ? ' blueprint-toolbar__toggle--active' : ''}`}
                onClick={() => setToolbarExpanded((current) => !current)}
                aria-expanded={toolbarExpanded}
                aria-controls="blueprint-toolbar-panel"
                aria-label={toolbarExpanded ? '收起更多操作' : '展开更多操作'}
              >
                {toolbarExpanded ? '收起' : '更多'}
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
            <div className="blueprint-toolbar__panel-actions">
              <label className="blueprint-toolbar__commit-limit">
                <span>最近</span>
                <input
                  type="number"
                  min={ANALYSIS_COMMIT_LIMIT_MIN}
                  max={ANALYSIS_COMMIT_LIMIT_MAX}
                  value={analysisCommitLimit}
                  onChange={(event) => setAnalysisCommitLimit(event.target.value)}
                  onBlur={() => setAnalysisCommitLimit(String(normalizeAnalysisCommitLimit(analysisCommitLimit)))}
                />
                <span>次</span>
              </label>
              <button className="blueprint-btn" onClick={analyzeSelected} disabled={!selectedId || analyzing}>
                {analyzing ? '分析中…' : '分析选中'}
              </button>
              <button className="blueprint-btn" onClick={focusFirstMatch} disabled={!focusActive || focusedNodeCount === 0}>
                定位匹配
              </button>
              <button className="blueprint-btn" onClick={fitView}>适应画布</button>
              <button className="blueprint-btn blueprint-btn--danger" onClick={() => selectedId && removeNode(selectedId)} disabled={!selectedId}>
                删除选中
              </button>
            </div>
            {loading ? <span className="blueprint-toolbar__loading">加载中…</span> : null}
          </div>
        </div>

        {actionError || error ? <span className="blueprint-toolbar__error">{actionError ?? error}</span> : null}
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onInit={(inst) => {
          rfInstanceRef.current = inst
          inst.fitView({ padding: 0.2 })
        }}
        fitView
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
            节点详情
          </button>
          <button
            className="bp-context-menu__item"
            onClick={() => {
              const node = currentBlueprint?.nodes[contextMenu.nodeId]
              if (node) void activateWorkSession(node)
              setContextMenu(null)
            }}
          >
            开始工作
          </button>
          <button
            className="bp-context-menu__item"
            onClick={() => {
              const node = currentBlueprint?.nodes[contextMenu.nodeId]
              if (node) focusOrCreateTerminal(node)
              setContextMenu(null)
            }}
          >
            进入终端
          </button>
          <button className="bp-context-menu__item" onClick={() => { addChild(contextMenu.nodeId); setContextMenu(null) }}>
            + 添加子节点
          </button>
          <button
            className="bp-context-menu__item bp-context-menu__item--danger"
            onClick={() => { removeNode(contextMenu.nodeId); setContextMenu(null) }}
          >
            {currentBlueprint?.rootNodeId === contextMenu.nodeId ? '删除主根节点' : '删除节点'}
          </button>
          <div className="bp-context-menu__sep" />
          <div className="bp-context-menu__label">标记状态</div>
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
                {STATUS_VISUALS[s].label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {detailNode ? (
        <aside className="bp-node-detail" key={detailNode.id}>
          <div className="bp-node-detail__header">
            <div>
              <div className="bp-node-detail__eyebrow">Blueprint Node</div>
              <div className="bp-node-detail__title">{detailNode.title || <span className="bp-node-detail__title--empty">未命名</span>}</div>
              <div className="bp-node-detail__summary">
                <span>{NODE_TYPE_LABEL[detailNode.type] ?? detailNode.type}</span>
                <span>{STATUS_VISUALS[detailNode.status]?.label ?? detailNode.status}</span>
                <span>{Math.max(0, Math.min(100, detailNode.progress))}%</span>
              </div>
            </div>
            <button className="bp-node-detail__close" onClick={() => setDetailNodeId(null)} aria-label="关闭节点详情">
              ×
            </button>
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--identity">
            <label className="bp-node-detail__label">标题</label>
            <input
              className="bp-node-detail__input"
              defaultValue={detailNode.title}
              onBlur={(event) => persistNodePatch(detailNode.id, { title: event.currentTarget.value.trim() || detailNode.title })}
            />
          </div>

          <div className="bp-node-detail__grid bp-node-detail__grid--meta">
            <div className="bp-node-detail__section">
              <label className="bp-node-detail__label">类型</label>
              <Select
                value={detailNode.type}
                onChange={(value) => persistNodePatch(detailNode.id, { type: value as BlueprintNodeType })}
                options={NODE_TYPE_ORDER.map((type) => ({ value: type, label: NODE_TYPE_LABEL[type] ?? type }))}
                className="blueprint-select bp-node-detail__select"
                dropdownClassName="bp-node-detail__dropdown"
              />
            </div>
            <div className="bp-node-detail__section">
              <label className="bp-node-detail__label">状态</label>
              <Select
                value={detailNode.status}
                onChange={(value) =>
                  persistNodePatch(detailNode.id, {
                    status: value as BlueprintNodeStatus,
                    statusSource: 'manual'
                  })
                }
                options={STATUS_ORDER.map((status) => ({ value: status, label: STATUS_VISUALS[status].label }))}
                className="blueprint-select bp-node-detail__select"
                dropdownClassName="bp-node-detail__dropdown"
              />
            </div>
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--content">
            <div className="bp-node-detail__section-head">
              <label className="bp-node-detail__label">定位</label>
              <button className="bp-node-detail__feature-add" onClick={() => addTextItem(detailNode, 'positioning', '新定位')}>
                <span className="bp-node-detail__feature-add-icon">+</span>
                <span>添加定位</span>
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
                    删除
                  </button>
                </div>
              ))}
              {splitLines(detailNode.positioning).length === 0 ? <div className="bp-feature-empty">还没有定位 item。</div> : null}
            </div>
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--content">
            <div className="bp-node-detail__section-head">
              <label className="bp-node-detail__label">技术方案</label>
              <button className="bp-node-detail__feature-add" onClick={() => addTextItem(detailNode, 'techSolution', '新技术方案')}>
                <span className="bp-node-detail__feature-add-icon">+</span>
                <span>添加方案</span>
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
                    删除
                  </button>
                </div>
              ))}
              {splitLines(detailNode.techSolution).length === 0 ? <div className="bp-feature-empty">还没有技术方案 item。</div> : null}
            </div>
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--content">
            <div className="bp-node-detail__section-head">
              <label className="bp-node-detail__label">需求描述</label>
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
                      删除
                    </button>
                  </div>
                  <input
                    className="bp-feature-card__input"
                    defaultValue={feature.description}
                    placeholder="需求 item 描述"
                    onBlur={(event) => updateFeature(detailNode, feature.id, { description: event.currentTarget.value })}
                  />
                  <div className="bp-feature-card__readonly">
                    <span>
                      Janus 完成度 <strong>{Math.max(0, Math.min(100, feature.progress))}%</strong>
                    </span>
                    <span>{FEATURE_STATUS_LABEL[feature.status] ?? feature.status}</span>
                  </div>
                  <div className="bp-feature-card__notes">
                    {feature.requirementNotes?.length ? feature.requirementNotes.map((note) => <span key={note}>{note}</span>) : <span>暂无 Janus 评估备注</span>}
                  </div>
                </div>
              ))}
              {(detailNode.features ?? []).length === 0 ? <div className="bp-feature-empty">还没有需求项，从这里开始补充。</div> : null}
            </div>
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--content">
            <div className="bp-node-detail__section-head">
              <label className="bp-node-detail__label">问题记录</label>
              <button className="bp-node-detail__feature-add" onClick={() => addIssue(detailNode)}>
                <span className="bp-node-detail__feature-add-icon">+</span>
                <span>添加问题</span>
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
                      删除
                    </button>
                  </div>
                  <div className="bp-feature-card__grid">
                    <Select
                      value={issue.severity}
                      onChange={(value) => updateIssue(detailNode, issue.id, { severity: value as BlueprintIssueSeverity })}
                      options={ISSUE_SEVERITY_VALUES.map((severity) => ({ value: severity, label: ISSUE_SEVERITY_LABEL[severity] }))}
                      className="blueprint-select bp-node-detail__select"
                    />
                    <Select
                      value={issue.status}
                      onChange={(value) => updateIssue(detailNode, issue.id, { status: value as BlueprintIssueStatus })}
                      options={ISSUE_STATUS_VALUES.map((status) => ({ value: status, label: ISSUE_STATUS_LABEL[status] }))}
                      className="blueprint-select bp-node-detail__select"
                    />
                  </div>
                  <input
                    className="bp-feature-card__input"
                    defaultValue={issue.description}
                    placeholder="问题描述"
                    onBlur={(event) => updateIssue(detailNode, issue.id, { description: event.currentTarget.value })}
                  />
                </div>
              ))}
              {(detailNode.issues ?? []).length === 0 ? <div className="bp-feature-empty">还没有问题记录。</div> : null}
            </div>
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--system">
            <label className="bp-node-detail__label">绑定工作区</label>
            <Select
              value={detailNode.workspaceId ?? ''}
              onChange={(value) => bindNodeWorkspace(detailNode.id, value)}
              placeholder="选择工作区"
              options={[
                { value: '', label: '未绑定工作区' },
                ...workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))
              ]}
              className="blueprint-select bp-node-detail__select"
              dropdownClassName="bp-node-detail__dropdown"
            />
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--system">
            <label className="bp-node-detail__label">挂载位置</label>
            <Select
              value={detailNode.parentId ?? ''}
              onChange={(value) => bindNodeParent(detailNode.id, value)}
              options={detailNodeParentOptions}
              disabled={currentBlueprint?.rootNodeId === detailNode.id}
              className="blueprint-select bp-node-detail__select"
              dropdownClassName="bp-node-detail__dropdown"
            />
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--system">
            <label className="bp-node-detail__label">新建终端类型</label>
            <Select
              value={terminalPreset}
              onChange={(value) => setTerminalPreset(value as TerminalPreset)}
              options={TERMINAL_PRESETS.map((preset) => ({ value: preset.type, label: preset.label }))}
              className="blueprint-select bp-node-detail__select"
              dropdownClassName="bp-node-detail__dropdown"
            />
          </div>

          <div className="bp-node-detail__meta">
            <div>
              <span>状态</span>
              <strong>{STATUS_VISUALS[detailNode.status]?.label ?? detailNode.status}</strong>
            </div>
            <div>
              <span>来源</span>
              <strong>{detailNode.statusSource === 'janus' ? 'Janus' : '手动'}</strong>
            </div>
            <div>
              <span>终端</span>
              <strong>{detailNode.boundTerminalId ? detailNode.boundTerminalId.slice(0, 8) : '—'}</strong>
            </div>
            <div>
              <span>分析游标</span>
              <strong>{detailNode.lastAnalyzedCommitSha ? detailNode.lastAnalyzedCommitSha.slice(0, 8) : '—'}</strong>
            </div>
          </div>

          <div className="bp-node-detail__section bp-node-detail__section--analysis">
            <div className="bp-node-detail__section-head">
              <label className="bp-node-detail__label">Janus 分析</label>
              <span className="bp-node-detail__count">{detailNode.analyses?.length ?? 0}</span>
            </div>
            {latestAnalysis ? (
              <div className="bp-history-card">
                <div className="bp-history-card__title">{latestAnalysis.result.summary || latestAnalysis.error || '无摘要'}</div>
                <div className="bp-history-card__meta">
                  {new Date(latestAnalysis.createdAt).toLocaleString()} · {TRIGGER_LABEL[latestAnalysis.trigger] ?? latestAnalysis.trigger} · {latestAnalysis.applied ? '已应用' : '未应用'} · 置信度 {Math.round((latestAnalysis.result.confidence ?? 0) * 100)}%
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
                    {analysisHistoryOpen ? '收起历史' : '查看历史'}
                  </button>
                  {analysisHistoryOpen ? (
                    <button className="blueprint-btn" onClick={() => loadAnalysisHistory(detailNode)} disabled={analysisHistoryLoading}>
                      {analysisHistoryLoading ? '刷新中...' : '刷新'}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="bp-node-detail__empty">暂无分析记录</div>
            )}
            {analysisHistoryOpen ? (
              <div className="bp-analysis-history">
                <div className="bp-analysis-history__list">
                  {analysisHistoryLoading ? <div className="bp-node-detail__empty">加载分析历史...</div> : null}
                  {!analysisHistoryLoading && analysisHistory.length === 0 ? <div className="bp-node-detail__empty">暂无历史</div> : null}
                  {analysisHistory.map((analysis) => (
                    <button
                      key={analysis.id}
                      className={`bp-analysis-history__item${selectedAnalysis?.id === analysis.id ? ' bp-analysis-history__item--active' : ''}`}
                      onClick={() => setSelectedAnalysisId(analysis.id)}
                    >
                      <span>{new Date(analysis.createdAt).toLocaleString()}</span>
                      <strong>{analysis.result.summary || analysis.error || '无摘要'}</strong>
                      <em>
                        {TRIGGER_LABEL[analysis.trigger] ?? analysis.trigger} · {STATUS_VISUALS[analysis.result.status]?.label ?? analysis.result.status} · {analysis.result.progress}%
                      </em>
                    </button>
                  ))}
                </div>

                {selectedAnalysis ? (
                  <div className="bp-analysis-detail">
                    <div className="bp-analysis-detail__head">
                      <div>
                        <strong>{selectedAnalysis.result.summary || selectedAnalysis.error || '无摘要'}</strong>
                        <span>
                          {selectedAnalysis.applied ? '已应用' : '未应用'} · 置信度 {Math.round((selectedAnalysis.result.confidence ?? 0) * 100)}%
                        </span>
                      </div>
                      <button
                        className="blueprint-btn"
                        onClick={() => reapplyAnalysis(detailNode, selectedAnalysis)}
                        disabled={!selectedAnalysis.applied || applyingAnalysisId === selectedAnalysis.id}
                      >
                        {applyingAnalysisId === selectedAnalysis.id ? '应用中...' : '重新应用'}
                      </button>
                    </div>

                    <div className="bp-analysis-detail__grid">
                      <div><span>状态</span><strong>{STATUS_VISUALS[selectedAnalysis.result.status]?.label ?? selectedAnalysis.result.status}</strong></div>
                      <div><span>进度</span><strong>{selectedAnalysis.result.progress}%</strong></div>
                      <div><span>触发</span><strong>{TRIGGER_LABEL[selectedAnalysis.trigger] ?? selectedAnalysis.trigger}</strong></div>
                      <div><span>时间</span><strong>{new Date(selectedAnalysis.createdAt).toLocaleString()}</strong></div>
                    </div>

                    {selectedAnalysis.error ? <div className="bp-analysis-detail__error">{selectedAnalysis.error}</div> : null}

                    <div className="bp-analysis-detail__section">
                      <label>输入摘要</label>
                      <pre>{`蓝图预期：\n${selectedAnalysis.inputSummary.blueprint || '无'}\n\n实际变更：\n${selectedAnalysis.inputSummary.actual || '无'}`}</pre>
                    </div>

                    {selectedAnalysis.result.evidence?.length ? (
                      <div className="bp-analysis-detail__section">
                        <label>证据</label>
                        <ul>{selectedAnalysis.result.evidence.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
                      </div>
                    ) : null}

                    {selectedAnalysis.result.unresolved?.length ? (
                      <div className="bp-analysis-detail__section bp-analysis-detail__section--warn">
                        <label>未解决事项</label>
                        <ul>{selectedAnalysis.result.unresolved.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
                      </div>
                    ) : null}

                    {selectedAnalysis.result.featureUpdates?.length ? (
                      <div className="bp-analysis-detail__section">
                        <label>需求项更新</label>
                        <ul>
                          {selectedAnalysis.result.featureUpdates.map((item, index) => (
                            <li key={`${item.featureId}-${index}`}>
                              {item.featureId} · {item.status ? FEATURE_STATUS_LABEL[item.status] ?? item.status : '状态未变'} · {item.progress ?? '进度未变'}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {selectedAnalysis.result.discoveredRequirements?.length ? (
                      <div className="bp-analysis-detail__section">
                        <label>新需求提议</label>
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
              <label className="bp-node-detail__label">活动记录</label>
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
              {(detailNode.activities ?? []).length === 0 ? <div className="bp-node-detail__empty">暂无活动</div> : null}
            </div>
          </div>

          <div className="bp-node-detail__actions">
            <button
              className="blueprint-btn blueprint-btn--primary"
              onClick={() => activateWorkSession(detailNode)}
              disabled={!detailNode.workspaceId || detailWorkspaceMissing}
            >
              开始工作
            </button>
            <button
              className="blueprint-btn"
              onClick={() => focusOrCreateTerminal(detailNode, terminalPreset)}
              disabled={!detailNode.workspaceId || detailWorkspaceMissing}
            >
              进入终端
            </button>
            <button
              className="blueprint-btn"
              onClick={() => bindNodeWorkspace(detailNode.id, '')}
              disabled={!detailNode.workspaceId}
            >
              解绑工作区
            </button>

          </div>
          {detailWorkspaceMissing ? (
            <div className="bp-node-detail__warning">
              绑定的工作区已不存在，请重新选择。
              {detailNode.workspaceSnapshot ? ` 上次绑定：${detailNode.workspaceSnapshot.name} · ${detailNode.workspaceSnapshot.path}` : ''}
            </div>
          ) : null}
        </aside>
      ) : null}
      <PromptDialog
        open={promptState !== null}
        title={promptState?.kind === 'child' ? '新建子节点' : '新建根节点'}
        label={promptState?.kind === 'child' ? '子节点标题' : '根节点标题'}
        placeholder="输入标题"
        onConfirm={handlePromptConfirm}
        onCancel={() => setPromptState(null)}
      />
    </div>
  )
}
