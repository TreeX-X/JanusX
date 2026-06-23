/**
 * @file 蓝图画布（React Flow）— MVP
 * @description
 *  - 从 store 加载蓝图，把 Blueprint.nodes（Record）转成 React Flow nodes + edges。
 *  - 树形布局：根居中、子节点向下展开（简单递归，无 dagre）。
 *  - 交互：拖拽 / 选中 / 双击（onNodeOpen 回调）/ 右键菜单（加子节点 / 删除 / 状态标记）。
 *  - 工具栏：新建根节点 / 分析选中节点 / 适应画布。
 *
 *  canvasLayout 持久化方案（MVP）：见文末「交付说明」。当前为内存态——
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
import {
  createNode as createNodeIPC,
  analyze as analyzeIPC,
  type Blueprint,
  type BlueprintNode,
  type BlueprintNodeStatus
} from '@/services/blueprint'
import { BlueprintNodeCard, type BlueprintNodeData } from './BlueprintNodeCard'
import { STATUS_VISUALS, STATUS_ORDER } from './blueprintStatus'

/* ════════════════════════════════════════════════════════════
   树形布局
   ════════════════════════════════════════════════════════════ */
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
  existing: Record<string, { x: number; y: number }>
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

/* ════════════════════════════════════════════════════════════
   右键菜单
   ════════════════════════════════════════════════════════════ */
interface ContextMenu {
  x: number
  y: number
  nodeId: string
}

/* ════════════════════════════════════════════════════════════
   组件
   ════════════════════════════════════════════════════════════ */
export interface BlueprintCanvasProps {
  blueprintId: string
  workspacePath: string
  /** 双击节点回调（P3 节点详情入口），MVP 可不传 */
  onNodeOpen?: (nodeId: string) => void
}

export function BlueprintCanvas({ blueprintId, workspacePath, onNodeOpen }: BlueprintCanvasProps) {
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const loading = useBlueprintStore((s) => s.loading)
  const error = useBlueprintStore((s) => s.error)
  const loadBlueprint = useBlueprintStore((s) => s.loadBlueprint)
  const updateNode = useBlueprintStore((s) => s.updateNode)
  const deleteNode = useBlueprintStore((s) => s.deleteNode)
  const refreshAfterAnalysis = useBlueprintStore((s) => s.refreshAfterAnalysis)

  const [rfNodes, setRFNodes] = useState<Node<BlueprintNodeData, 'blueprint'>[]>([])
  const [rfEdges, setRFEdges] = useState<Edge[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  const rfInstanceRef = useRef<ReactFlowInstance<Node<BlueprintNodeData, 'blueprint'>, Edge> | null>(null)
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({})

  // 初次加载
  useEffect(() => {
    if (blueprintId) loadBlueprint(blueprintId)
  }, [blueprintId, loadBlueprint])

  // 当 currentBlueprint 的节点集合 / 字段变化时，重派生 RF nodes/edges（保留已拖拽位置）
  const signature = useMemo(() => {
    if (!currentBlueprint) return ''
    return JSON.stringify({
      id: currentBlueprint.id,
      ids: currentBlueprint.nodeIds,
      fields: currentBlueprint.nodeIds.map((id) => {
        const n = currentBlueprint.nodes[id]
        return n ? [n.title, n.status, n.progress, n.boundTerminalId, n.parentId] : null
      })
    })
  }, [currentBlueprint])

  useEffect(() => {
    if (!currentBlueprint) return
    const { nodes, edges } = deriveRF(currentBlueprint, positionsRef.current)
    // 记录最新位置（含自动布局）
    positionsRef.current = Object.fromEntries(nodes.map((n) => [n.id, n.position]))
    setRFNodes(nodes)
    setRFEdges(edges)
  }, [signature]) // eslint-disable-line react-hooks/exhaustive-deps

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
      if (onNodeOpen) onNodeOpen(node.id)
      else console.log('[BlueprintCanvas] open node', node.id)
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

  /* —— 操作 —— */
  const addChild = useCallback(
    async (parentId: string) => {
      const title = window.prompt('子节点标题：')?.trim()
      if (!title) return
      const created = await createNodeIPC(workspacePath, blueprintId, { title, type: 'task' }, parentId)
      if (!created) return
      await loadBlueprint(blueprintId)
    },
    [workspacePath, blueprintId, loadBlueprint]
  )

  const addRoot = useCallback(async () => {
    const title = window.prompt('根节点标题：')?.trim()
    if (!title) return
    await createNodeIPC(workspacePath, blueprintId, { title, type: 'task' }, null)
    await loadBlueprint(blueprintId)
  }, [workspacePath, blueprintId, loadBlueprint])

  const removeNode = useCallback(
    async (nodeId: string) => {
      await deleteNode(blueprintId, nodeId)
    },
    [blueprintId, deleteNode]
  )

  const markStatus = useCallback(
    async (nodeId: string, status: BlueprintNodeStatus) => {
      await updateNode(blueprintId, nodeId, { status, statusSource: 'manual' })
      setContextMenu(null)
    },
    [blueprintId, updateNode]
  )

  const analyzeSelected = useCallback(async () => {
    if (!selectedId) return
    setAnalyzing(true)
    try {
      const res = await analyzeIPC({ nodeId: selectedId, workspacePath, trigger: 'manual' })
      console.log('[BlueprintCanvas] analyze result', selectedId, res)
      await refreshAfterAnalysis()
    } finally {
      setAnalyzing(false)
    }
  }, [selectedId, workspacePath, refreshAfterAnalysis])

  const fitView = useCallback(() => {
    rfInstanceRef.current?.fitView({ padding: 0.2, duration: 200 })
  }, [])

  const nodeTypes = useMemo(() => ({ blueprint: BlueprintNodeCard }), [])

  return (
    <div className="blueprint-canvas-wrapper">
      {/* 画布操作工具栏 */}
      <div className="blueprint-toolbar">
        <span className="blueprint-toolbar__title">
          {currentBlueprint ? currentBlueprint.name : '加载中…'}
        </span>
        <button className="blueprint-btn" onClick={addRoot}>+ 新建根节点</button>
        <button className="blueprint-btn" onClick={analyzeSelected} disabled={!selectedId || analyzing}>
          {analyzing ? '分析中…' : '分析选中'}
        </button>
        <button className="blueprint-btn" onClick={fitView}>适应画布</button>
        <div className="blueprint-toolbar__spacer" />
        {loading ? <span className="blueprint-toolbar__loading">…</span> : null}
        {error ? <span className="blueprint-toolbar__error">{error}</span> : null}
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
          <button className="bp-context-menu__item" onClick={() => { addChild(contextMenu.nodeId); setContextMenu(null) }}>
            + 添加子节点
          </button>
          <button
            className="bp-context-menu__item bp-context-menu__item--danger"
            onClick={() => { removeNode(contextMenu.nodeId); setContextMenu(null) }}
          >
            删除节点
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
    </div>
  )
}
