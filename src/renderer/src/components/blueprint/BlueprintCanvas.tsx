/**
 * @file 蓝图画布（React Flow）— MVP
 * @description
 *  - 从 store 加载蓝图，把 Blueprint.nodes（Record）转成 React Flow nodes + edges。
 *  - 树形布局：根居中、子节点向下展开（简单递归，无 dagre）。
 *  - 交互：拖拽 / 选中 / 双击（onNodeOpen 回调）/ 右键菜单（加子节点 / 删除 / 状态标记）。
 *  - 工具栏：新建根节点 / 分析选中节点 / 适应画布。
 *
 *  canvasLayout 持久化方案（MVP）：见文末「交付说明」。当前为内存态：
 *  节点拖拽仅更新本地 nodes 状态，不写回 main；蓝图自带 canvasLayout 作为初始位置。
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
  analyze as analyzeIPC,
  bindTerminal as bindTerminalIPC,
  addNodeFeature as addNodeFeatureIPC,
  updateNodeFeature as updateNodeFeatureIPC,
  deleteNodeFeature as deleteNodeFeatureIPC,
  type Blueprint,
  type BlueprintFeatureItem,
  type BlueprintNode,
  type BlueprintNodeStatus
} from '@/services/blueprint'
import { BlueprintNodeCard, type BlueprintNodeData } from './BlueprintNodeCard'
import { STATUS_VISUALS, STATUS_ORDER } from './blueprintStatus'
import { PromptDialog } from './PromptDialog'
import { Select } from '../ui/Select'

const GLOBAL_BLUEPRINT_SCOPE = '__global__'
const DEFAULT_NODE_TERMINAL_PRESET: TerminalPreset = 'codex'
const TERMINAL_PRESETS: {
  type: TerminalPreset
  label: string
  name: string
  autoCommand?: string
}[] = [
  { type: 'shell', label: 'Shell', name: 'bash' },
  { type: 'claude', label: 'Claude', name: 'claude', autoCommand: 'claude' },
  { type: 'codex', label: 'Codex', name: 'codex', autoCommand: 'codex' },
  { type: 'opencode', label: 'OpenCode', name: 'opencode', autoCommand: 'opencode' }
]

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
  workspaceNameById: Record<string, string>
): { nodes: Node<BlueprintNodeData, 'blueprint'>[]; edges: Edge[] } {
  const layout = computeLayout(bp.nodes, bp.rootNodeId, bp.canvasLayout ?? {})
  const nodes: Node<BlueprintNodeData, 'blueprint'>[] = bp.nodeIds
    .filter((id) => bp.nodes[id])
    .map((id) => {
      const n = bp.nodes[id]
      return {
        id,
        type: 'blueprint',
        position: existing[id] ?? layout[id] ?? { x: 0, y: 0 },
        data: {
          title: n.title,
          status: n.status,
          nodeType: n.type,
          progress: n.progress,
          workspaceName: n.workspaceId ? workspaceNameById[n.workspaceId] ?? null : null,
          boundTerminalId: n.boundTerminalId
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
  const [actionError, setActionError] = useState<string | null>(null)
  const [promptState, setPromptState] = useState<
    | { kind: 'child'; parentId: string }
    | { kind: 'root' }
    | null
  >(null)

  const rfInstanceRef = useRef<ReactFlowInstance<Node<BlueprintNodeData, 'blueprint'>, Edge> | null>(null)
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({})

  const workspaceNameById = useMemo(
    () => Object.fromEntries(workspaces.map((w) => [w.id, w.name])),
    [workspaces]
  )
  const detailNode = currentBlueprint && detailNodeId ? currentBlueprint.nodes[detailNodeId] ?? null : null
  const selectedNode = currentBlueprint && selectedId ? currentBlueprint.nodes[selectedId] ?? null : null
  const detailWorkspaceMissing = !!detailNode?.workspaceId && !workspaceNameById[detailNode.workspaceId]
  const featureActionDisabled = !detailNode?.workspaceId || detailWorkspaceMissing
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

  // 当 currentBlueprint 的节点集或关键字段变化时，重新派生 React Flow nodes/edges，保留已拖拽位置
  const signature = useMemo(() => {
    if (!currentBlueprint) return ''
    return JSON.stringify({
      id: currentBlueprint.id,
      ids: currentBlueprint.nodeIds,
      fields: currentBlueprint.nodeIds.map((id) => {
        const n = currentBlueprint.nodes[id]
        return n ? [n.title, n.status, n.progress, n.workspaceId, n.boundTerminalId, n.parentId] : null
      })
    })
  }, [currentBlueprint])

  useEffect(() => {
    if (!currentBlueprint) return
    const { nodes, edges } = deriveRF(currentBlueprint, positionsRef.current, workspaceNameById)
    // 记录最新位置（含自动布局）
    positionsRef.current = Object.fromEntries(nodes.map((n) => [n.id, n.position]))
    setRFNodes(nodes)
    setRFEdges(edges)
  }, [signature, workspaceNameById]) // eslint-disable-line react-hooks/exhaustive-deps

  // 节点变更（拖拽 / 选中）
  const onNodesChange = useCallback(
    (changes: NodeChange<Node<BlueprintNodeData, 'blueprint'>>[]) => {
      setRFNodes((nds) => {
        const next = applyNodeChanges(changes, nds)
        // 同步拖拽结束后的位置到 ref
        for (const c of changes) {
          if (c.type === 'position' && c.position) {
            positionsRef.current[c.id] = c.position
          }
        }
        return next
      })
      // 选中态
      for (const c of changes) {
        if (c.type === 'select') {
          setSelectedId(c.selected ? c.id : null)
        }
      }
    },
    []
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
          { title, type: 'task', workspaceId: parent?.workspaceId ?? null },
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
      const terminal: Terminal = {
        id: terminalId,
        workspaceId: workspace.id,
        name: preset.name,
        preset: preset.type,
        cwd: workspace.path,
        shell: defaultShell,
        autoCommand: preset.autoCommand,
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
          autoCommand: preset.autoCommand,
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
      await updateNode(blueprintId, nodeId, {
        workspaceId: nextWorkspaceId,
        boundTerminalId: null
      })
      setActionError(null)
    },
    [blueprintId, updateNode]
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

  const addFeature = useCallback(
    async (node: BlueprintNode) => {
      const workspace = node.workspaceId ? workspaces.find((item) => item.id === node.workspaceId) : null
      if (!workspace) {
        setActionError('请先为节点绑定可用工作区')
        return
      }
      await addNodeFeatureIPC(workspace.path, blueprintId, node.id, {
        title: '',
        description: '',
        progress: 0,
        status: 'planned',
        requirementNotes: []
      })
      await loadBlueprint(blueprintId)
    },
    [blueprintId, loadBlueprint, workspaces]
  )

  const updateFeature = useCallback(
    async (nodeId: string, feature: BlueprintFeatureItem) => {
      const node = currentBlueprint?.nodes[nodeId]
      const workspace = node?.workspaceId ? workspaces.find((item) => item.id === node.workspaceId) : null
      if (!workspace) {
        setActionError('请先为节点绑定可用工作区')
        return
      }
      await updateNodeFeatureIPC(workspace.path, blueprintId, nodeId, feature.id, feature)
      await loadBlueprint(blueprintId)
    },
    [blueprintId, currentBlueprint, loadBlueprint, workspaces]
  )

  const removeFeature = useCallback(
    async (nodeId: string, featureId: string) => {
      const node = currentBlueprint?.nodes[nodeId]
      const workspace = node?.workspaceId ? workspaces.find((item) => item.id === node.workspaceId) : null
      if (!workspace) {
        setActionError('请先为节点绑定可用工作区')
        return
      }
      await deleteNodeFeatureIPC(workspace.path, blueprintId, nodeId, featureId)
      await loadBlueprint(blueprintId)
    },
    [blueprintId, currentBlueprint, loadBlueprint, workspaces]
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
      const res = await analyzeIPC({ nodeId: selectedId, workspacePath: workspace.path, trigger: 'manual' })
      console.log('[BlueprintCanvas] analyze result', selectedId, res)
      await refreshAfterAnalysis()
    } finally {
      setAnalyzing(false)
    }
  }, [selectedId, currentBlueprint, workspaces, refreshAfterAnalysis])

  const fitView = useCallback(() => {
    rfInstanceRef.current?.fitView({ padding: 0.2, duration: 200 })
  }, [])

  const nodeTypes = useMemo(() => ({ blueprint: BlueprintNodeCard }), [])
  const featureActionLabel = featureActionDisabled ? '先绑定工作区' : '添加功能点'
  const featureActionHint = detailWorkspaceMissing
    ? '当前工作区已失效，请先重新绑定后再管理功能点。'
    : !detailNode?.workspaceId
      ? '功能点会写入节点绑定的工作区，先选择一个工作区。'
      : '功能点将写入当前绑定的工作区。'

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
                {selectedNode.workspaceId ? workspaceNameById[selectedNode.workspaceId] ?? '工作区失效' : '未绑定工作区'}
              </span>
            ) : null}
          </div>

          <div className="blueprint-toolbar__actions">
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
              <button className="blueprint-btn" onClick={analyzeSelected} disabled={!selectedId || analyzing}>
                {analyzing ? '分析中…' : '分析选中'}
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
        <aside className="bp-node-detail">
          <div className="bp-node-detail__header">
            <div>
              <div className="bp-node-detail__eyebrow">节点详情</div>
              <div className="bp-node-detail__title">{detailNode.title || <span className="bp-node-detail__title--empty">未命名</span>}</div>
            </div>
            <button className="bp-node-detail__close" onClick={() => setDetailNodeId(null)} aria-label="关闭节点详情">
              ×
            </button>
          </div>

          <div className="bp-node-detail__section">
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

          <div className="bp-node-detail__section">
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

          <div className="bp-node-detail__section">
            <label className="bp-node-detail__label">新建终端类型</label>
            <Select
              value={terminalPreset}
              onChange={(value) => setTerminalPreset(value as TerminalPreset)}
              options={TERMINAL_PRESETS.map((preset) => ({ value: preset.type, label: preset.label }))}
              className="blueprint-select bp-node-detail__select"
              dropdownClassName="bp-node-detail__dropdown"
            />
          </div>

          <div className="bp-node-detail__section">
            <div className="bp-node-detail__section-head">
              <label className="bp-node-detail__label">功能点</label>
              <button
                className={`bp-node-detail__feature-add${featureActionDisabled ? ' bp-node-detail__feature-add--disabled' : ''}`}
                onClick={() => addFeature(detailNode)}
                disabled={featureActionDisabled}
                title={featureActionHint}
              >
                <span className="bp-node-detail__feature-add-icon">+</span>
                <span>{featureActionLabel}</span>
              </button>
            </div>
            <div className="bp-feature-hint">{featureActionHint}</div>
            <div className="bp-feature-list">
              {(detailNode.features ?? []).map((feature) => (
                <div className="bp-feature-card" key={feature.id}>
                  <div className="bp-feature-card__row">
                    <input
                      className="bp-feature-card__input"
                      value={feature.title}
                      onChange={(event) =>
                        updateFeature(detailNode.id, {
                          ...feature,
                          title: event.target.value
                        })
                      }
                    />
                    <button className="bp-feature-card__delete" onClick={() => removeFeature(detailNode.id, feature.id)}>
                      删除
                    </button>
                  </div>
                  <div className="bp-feature-card__grid">
                    <Select
                      value={feature.status}
                      onChange={(value) =>
                        updateFeature(detailNode.id, {
                          ...feature,
                          status: value as BlueprintFeatureItem['status']
                        })
                      }
                      options={[
                        { value: 'planned', label: '待规划' },
                        { value: 'in-progress', label: '进行中' },
                        { value: 'done', label: '已完成' },
                        { value: 'blocked', label: '阻塞' }
                      ]}
                      className="blueprint-select bp-node-detail__select"
                    />
                    <input
                      className="bp-feature-card__input"
                      type="number"
                      min={0}
                      max={100}
                      value={feature.progress}
                      onChange={(event) =>
                        updateFeature(detailNode.id, {
                          ...feature,
                          progress: Number(event.target.value || 0)
                        })
                      }
                    />
                  </div>
                  <div className="bp-feature-card__notes">
                    {feature.requirementNotes?.length ? feature.requirementNotes.map((note) => <span key={note}>{note}</span>) : <span>无补充需求</span>}
                  </div>
                </div>
              ))}
              {(detailNode.features ?? []).length === 0 ? <div className="bp-feature-empty">还没有功能点，从这里开始补充。</div> : null}
            </div>
          </div>

          <div className="bp-node-detail__meta">
            <div>
              <span>状态</span>
              <strong>{STATUS_VISUALS[detailNode.status]?.label ?? detailNode.status}</strong>
            </div>
            <div>
              <span>终端</span>
              <strong>{detailNode.boundTerminalId ? detailNode.boundTerminalId.slice(0, 8) : '—'}</strong>
            </div>
          </div>

          <div className="bp-node-detail__actions">
            <button
              className="blueprint-btn blueprint-btn--primary"
              onClick={() => focusOrCreateTerminal(detailNode, terminalPreset)}
              disabled={!detailNode.workspaceId}
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
            <div className="bp-node-detail__warning">绑定的工作区已不存在，请重新选择。</div>
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
