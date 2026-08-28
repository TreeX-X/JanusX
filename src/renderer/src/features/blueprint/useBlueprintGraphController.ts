import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange
} from '@xyflow/react'
import { updateBlueprint } from '@/services/blueprint'
import type { Blueprint } from '@/services/blueprint'
import type { BlueprintNodeData } from '@/components/blueprint/BlueprintNodeCard'
import {
  collectSubtreeIds,
  computeBlueprintSubtreeLayout,
  computeVisibleBlueprintLayout,
  deriveBlueprintFlow
} from './canvas-layout'

const GLOBAL_BLUEPRINT_SCOPE = '__global__'
const SAVE_DELAY_MS = 500
const RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000]
const NODE_BATCH_SIZE = 8
type Layout = Record<string, { x: number; y: number }>
export type BlueprintLayoutSaveStatus = 'clean' | 'pending' | 'saving' | 'saved' | 'failed'

export function splitNodeBatches<T>(items: readonly T[], size = NODE_BATCH_SIZE): T[][] {
  if (size <= 0) return [Array.from(items)]
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) batches.push(Array.from(items.slice(index, index + size)))
  return batches
}

function cardDataEqual(left: BlueprintNodeData, right: BlueprintNodeData): boolean {
  return Object.keys(left).every((key) => left[key as keyof BlueprintNodeData] === right[key as keyof BlueprintNodeData])
    && Object.keys(left).length === Object.keys(right).length
}

export function patchBlueprintCardNodes(
  current: Node<BlueprintNodeData, 'blueprint'>[],
  nextDataById: ReadonlyMap<string, BlueprintNodeData>,
): Node<BlueprintNodeData, 'blueprint'>[] {
  return current.map((node) => {
    const data = nextDataById.get(node.id)
    return data && !cardDataEqual(node.data, data) ? { ...node, data } : node
  })
}

interface PendingLayoutSave {
  blueprintId: string
  layout: Layout
}

export class BlueprintLayoutSaveController {
  private blueprintId: string
  private pending: PendingLayoutSave[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryAttempt = 0
  private inFlight: Promise<boolean> | null = null

  constructor(
    blueprintId: string,
    private readonly persist: (blueprintId: string, layout: Layout) => Promise<void>,
    private readonly onError: (message: string | null) => void,
    private readonly delay = SAVE_DELAY_MS,
    private readonly onPersisted?: (blueprintId: string, layout: Layout) => void,
    private readonly onStatus?: (status: BlueprintLayoutSaveStatus) => void,
  ) {
    this.blueprintId = blueprintId
  }

  private enqueue(layout: Layout): void {
    const pending = this.pending.find((entry) => entry.blueprintId === this.blueprintId)
    if (pending) pending.layout = { ...layout }
    else this.pending.push({ blueprintId: this.blueprintId, layout: { ...layout } })
  }

  schedule(layout: Layout): void {
    this.enqueue(layout)
    this.onStatus?.('pending')
    this.retryAttempt = 0
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null }
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.delay)
  }

  saveNow(layout: Layout): Promise<boolean> {
    this.enqueue(layout)
    this.onStatus?.('pending')
    return this.flush()
  }

  switchBlueprint(blueprintId: string): Promise<boolean> {
    const flushed = this.flush()
    this.blueprintId = blueprintId
    return flushed
  }

  dispose(): Promise<boolean> {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null }
    return this.flush()
  }

  flush(): Promise<boolean> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.inFlight) {
      return this.inFlight.then(() => this.pending.length ? this.flush() : true)
    }
    this.inFlight = this.drain().finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async drain(): Promise<boolean> {
    this.onStatus?.('saving')
    while (this.pending.length) {
      const entry = this.pending[0]
      try {
        await this.persist(entry.blueprintId, entry.layout)
        this.pending.shift()
        this.retryAttempt = 0
        this.onPersisted?.(entry.blueprintId, entry.layout)
        this.onStatus?.('saved')
        this.onError(null)
      } catch (error) {
        this.onError(`布局保存失败: ${error instanceof Error ? error.message : String(error)}`)
        this.onStatus?.('failed')
        if (!this.retryTimer && this.retryAttempt < RETRY_DELAYS_MS.length) {
          const delay = RETRY_DELAYS_MS[this.retryAttempt++]
          this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.flush() }, delay)
        }
        return false
      }
    }
    return true
  }
}

interface GraphControllerOptions {
  blueprint: Blueprint | null
  blueprintId: string
  workspaceNameById: Record<string, string>
  focusedNodeIds: Set<string>
  focusActive: boolean
  collapsedNodeIds?: Set<string>
  onSelectionChange: (nodeId: string | null) => void
  onError: (message: string | null) => void
  onLayoutPersisted?: (blueprintId: string, layout: Layout) => void
  onLayoutSaveStatus?: (status: BlueprintLayoutSaveStatus) => void
}

export function useBlueprintGraphController({
  blueprint,
  blueprintId,
  workspaceNameById,
  focusedNodeIds,
  focusActive,
  onSelectionChange,
  onError,
  onLayoutPersisted,
  onLayoutSaveStatus,
  collapsedNodeIds = new Set()
}: GraphControllerOptions) {
  const [nodes, setNodes] = useState<Node<BlueprintNodeData, 'blueprint'>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [restoreSnapshot, setRestoreSnapshot] = useState<Layout | null>(null)
  const batchFrameRef = useRef<number | null>(null)
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const dirtyPositionsRef = useRef<Set<string>>(new Set())
  const blueprintRef = useRef<Blueprint | null>(blueprint)
  blueprintRef.current = blueprint
  const enteredBlueprintRef = useRef<string | null>(null)
  /**
   * 持久化的"钉住"位置：仅包含用户拖拽过的节点（初始取自 canvasLayout）。
   * 未钉住的节点跟随自动布局，折叠/展开时可回流；null 表示尚未从当前蓝图初始化。
   */
  const pinnedRef = useRef<Layout | null>(null)
  const blueprintIdRef = useRef(blueprintId)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const saveControllerRef = useRef<BlueprintLayoutSaveController | null>(null)
  if (!saveControllerRef.current) {
    saveControllerRef.current = new BlueprintLayoutSaveController(
      blueprintId,
      async (targetBlueprintId, layout) => {
        const known = blueprintRef.current?.id === targetBlueprintId ? blueprintRef.current.nodeIds : null
        const filtered = known ? Object.fromEntries(Object.entries(layout).filter(([id]) => known.includes(id))) : layout
        await updateBlueprint(GLOBAL_BLUEPRINT_SCOPE, targetBlueprintId, { canvasLayout: filtered })
      },
      (message) => onErrorRef.current(message),
      SAVE_DELAY_MS,
      (targetBlueprintId, layout) => onLayoutPersisted?.(targetBlueprintId, layout),
      (status) => onLayoutSaveStatus?.(status),
    )
  }

  const topologyKey = useMemo(() => {
    if (!blueprint) return ''
    const topology = blueprint.nodeIds.map((id) => `${id}:${blueprint.nodes[id]?.parentId ?? ''}`).join('|')
    const layout = Object.entries(blueprint.canvasLayout ?? {}).map(([id, p]) => `${id}:${p.x},${p.y}`).join('|')
    return `${blueprint.id}|${topology}|${layout}|${[...collapsedNodeIds].sort().join(',')}`
  }, [blueprint, collapsedNodeIds])

  const cardDataKey = useMemo(() => {
    if (!blueprint) return ''
    return blueprint.nodeIds.map((id) => {
      const node = blueprint.nodes[id]
      return node ? `${id}:${node.updatedAt ?? ''}:${node.status}:${node.progress}:${focusedNodeIds.has(id)}:${collapsedNodeIds.has(id)}` : `${id}:missing`
    }).join('|') + `|${focusActive}|${Object.entries(workspaceNameById).map(([id, name]) => `${id}:${name}`).join(',')}`
  }, [blueprint, focusActive, focusedNodeIds, workspaceNameById, collapsedNodeIds])

  const flushLayoutSave = useCallback(() => saveControllerRef.current!.flush(), [])

  useEffect(() => {
    const previousId = blueprintIdRef.current
    if (previousId !== blueprintId) {
      void saveControllerRef.current!.switchBlueprint(blueprintId)
      blueprintIdRef.current = blueprintId
      positionsRef.current = {}
      dirtyPositionsRef.current.clear()
      pinnedRef.current = null
      setRestoreSnapshot(null)
    }
  }, [blueprintId])

  useEffect(() => () => {
    if (batchFrameRef.current !== null) cancelAnimationFrame(batchFrameRef.current)
    void saveControllerRef.current!.dispose()
  }, [])

  useEffect(() => {
    if (!blueprint) {
      setNodes([])
      setEdges([])
      positionsRef.current = {}
      dirtyPositionsRef.current.clear()
      pinnedRef.current = null
      return
    }
    if (pinnedRef.current === null) pinnedRef.current = { ...(blueprint.canvasLayout ?? {}) }
    const flow = deriveBlueprintFlow(
      blueprint,
      pinnedRef.current,
      workspaceNameById,
      focusedNodeIds,
      focusActive,
      collapsedNodeIds
    )
    const entering = enteredBlueprintRef.current !== blueprint.id
    enteredBlueprintRef.current = blueprint.id
    const allNodes = flow.nodes.map((node, index) => ({
      ...node,
      className: entering ? `bp-flow-node--enter bp-flow-node--enter-${Math.min(index, 8)}` : undefined,
    }))
    const computedPositions = Object.fromEntries(allNodes.map((node) => [node.id, node.position]))
    positionsRef.current = Object.fromEntries(allNodes.map((node) => [node.id, dirtyPositionsRef.current.has(node.id) ? positionsRef.current[node.id] ?? node.position : computedPositions[node.id]]))
    if (batchFrameRef.current !== null) cancelAnimationFrame(batchFrameRef.current)
    const batches = splitNodeBatches(allNodes)
    let batchIndex = 0
    const mountedNodeIds = new Set((batches[batchIndex++] ?? []).map((node) => node.id))
    const visibleEdges = () => flow.edges.filter((edge) => mountedNodeIds.has(edge.source) && mountedNodeIds.has(edge.target))
    setNodes(batches[0] ?? [])
    setEdges(visibleEdges())
    const appendBatch = () => {
      batchFrameRef.current = null
      const batch = batches[batchIndex++]
      if (!batch) return
      batch.forEach((node) => mountedNodeIds.add(node.id))
      setNodes((current) => [...current, ...batch])
      setEdges(visibleEdges())
      if (batchIndex < batches.length) batchFrameRef.current = requestAnimationFrame(appendBatch)
    }
    if (batchIndex < batches.length) batchFrameRef.current = requestAnimationFrame(appendBatch)
  }, [topologyKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!blueprint) return
    const dataById = new Map(
      deriveBlueprintFlow(blueprint, pinnedRef.current ?? undefined, workspaceNameById, focusedNodeIds, focusActive, collapsedNodeIds)
        .nodes.map((node) => [node.id, node.data])
    )
    setNodes((current) => patchBlueprintCardNodes(current, dataById))
  }, [cardDataKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const onNodesChange = useCallback((changes: NodeChange<Node<BlueprintNodeData, 'blueprint'>>[]) => {
    let moved = false
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        positionsRef.current[change.id] = change.position
        ;(pinnedRef.current ??= {})[change.id] = change.position
        dirtyPositionsRef.current.add(change.id)
        moved = true
      } else if (change.type === 'select') {
        onSelectionChange(change.selected ? change.id : null)
      }
    }
    setNodes((current) => applyNodeChanges(changes, current))
    if (moved) saveControllerRef.current!.schedule(pinnedRef.current!)
  }, [onSelectionChange])

  const applyLayout = useCallback(async (layout: Record<string, { x: number; y: number }>, pins: Layout) => {
    positionsRef.current = { ...positionsRef.current, ...layout }
    pinnedRef.current = pins
    setNodes((current) => current.map((node) => ({
      ...node,
      position: layout[node.id] ?? node.position
    })))
    await saveControllerRef.current!.saveNow(pins)
  }, [])

  const autoLayout = useCallback(async () => {
    if (!blueprint) return
    await applyLayout(computeVisibleBlueprintLayout(blueprint, collapsedNodeIds, {}), {})
  }, [applyLayout, blueprint, collapsedNodeIds])

  const layoutSubtree = useCallback(async (nodeId: string) => {
    if (!blueprint?.nodes[nodeId]) return
    const next = computeBlueprintSubtreeLayout(blueprint, nodeId, positionsRef.current)
    const pins = { ...(pinnedRef.current ?? {}) }
    for (const id of collectSubtreeIds(blueprint, nodeId)) {
      if (next[id]) pins[id] = next[id]
    }
    await applyLayout(next, pins)
  }, [applyLayout, blueprint])

  const restoreDefaultLayout = useCallback(async () => {
    if (!blueprint) return
    setRestoreSnapshot({ ...positionsRef.current })
    await applyLayout(computeVisibleBlueprintLayout(blueprint, collapsedNodeIds, {}), {})
  }, [applyLayout, blueprint, collapsedNodeIds])

  const undoRestoreDefaultLayout = useCallback(async () => {
    if (!restoreSnapshot) return
    const previous = restoreSnapshot
    setRestoreSnapshot(null)
    await applyLayout(previous, { ...previous })
  }, [applyLayout, restoreSnapshot])

  return {
    nodes,
    edges,
    onNodesChange,
    autoLayout,
    layoutSubtree,
    restoreDefaultLayout,
    undoRestoreDefaultLayout,
    canUndoRestoreDefaultLayout: restoreSnapshot !== null,
    flushLayoutSave
  }
}
