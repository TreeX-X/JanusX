import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange
} from '@xyflow/react'
import { updateBlueprint } from '@/services/blueprint'
import type { Blueprint } from '@/services/blueprint'
import { useBlueprintStore } from '@/stores/blueprint'
import type { BlueprintNodeData } from '@/components/blueprint/BlueprintNodeCard'
import {
  collectSubtreeIds,
  computeBlueprintSubtreeLayout,
  computeVisibleBlueprintLayout,
  deriveBlueprintFlow
} from './canvas-layout'

const SAVE_DELAY_MS = 500
const RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000]
type Layout = Record<string, { x: number; y: number }>
export type BlueprintLayoutSaveStatus = 'clean' | 'pending' | 'saving' | 'saved' | 'failed'

/** Class applied while a blueprint's nodes are entering the canvas. */
export function blueprintNodeEntryClass(entering: boolean, index: number): string | undefined {
  return entering ? `bp-flow-node--enter bp-flow-node--enter-${Math.min(index, ENTRY_STAGGER_CAP)}` : undefined
}

/**
 * Entry stagger stays pure CSS but the delay variable is capped: without the
 * cap a 200-node graph parks its tail for ~14s behind the workbench reveal.
 */
// Note: capped stagger keeps large-graph entry readable — see .agents/notes/2026-09-26-blueprint-edge-partial-refresh--edge-refresh.md
export const ENTRY_STAGGER_CAP = 8

export function capEntryIndex(index: number): number {
  return Math.min(Math.max(0, index), ENTRY_STAGGER_CAP)
}

function relationSignature(blueprint: Blueprint): string {
  const relations = (blueprint.relations ?? [])
    .map((rel) => `${rel.sourceNodeId ?? ''}:${rel.type ?? ''}:${rel.targetNodeId ?? ''}`)
    .sort()
    .join('|')
  const interfaces = (blueprint.composition?.interfaces ?? [])
    .map((port) => `${port.nodeId}:${port.providerNodeId ?? ''}:${port.direction ?? ''}`)
    .sort()
    .join('|')
  return `${relations}::${interfaces}`
}

/** Topology identity for full re-derives: structure + visibility only, never coordinates. */
export function buildBlueprintTopologyKey(
  blueprint: Blueprint,
  collapsedNodeIds: ReadonlySet<string>,
  hiddenNodeIds: ReadonlySet<string>,
): string {
  const topology = blueprint.nodeIds.map((id) => `${id}:${blueprint.nodes[id]?.parentId ?? ''}`).join('|')
  const layoutKeys = Object.keys(blueprint.canvasLayout ?? {}).sort().join(',')
  return `${blueprint.id}|${topology}|${layoutKeys}|${[...collapsedNodeIds].sort().join(',')}|${[...hiddenNodeIds].sort().join(',')}|${relationSignature(blueprint)}`
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
  /** 孤立折叠等视图级隐藏（与折叠语义合并，不写入布局与 Note） */
  hiddenNodeIds?: ReadonlySet<string>
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
  collapsedNodeIds = new Set(),
  hiddenNodeIds = new Set<string>(),
}: GraphControllerOptions) {
  const [nodes, setNodes] = useState<Node<BlueprintNodeData, 'blueprint'>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [restoreSnapshot, setRestoreSnapshot] = useState<Layout | null>(null)
  const entryMarkFrameRef = useRef<number | null>(null)
  /** Last derived flow keyed by topologyKey; the card-data effect reuses it. */
  const flowRef = useRef<{ key: string; nodes: Node<BlueprintNodeData, 'blueprint'>[] } | null>(null)
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
        // Overlay 写回必须命中投影所属 checkout；GLOBAL  scope 在 dev 下会漂到仓库自身。
        const cwd = useBlueprintStore.getState().workspacePathFor(targetBlueprintId)
        if (!cwd) throw new Error('找不到该图谱所属的工作区')
        await updateBlueprint(cwd, targetBlueprintId, { canvasLayout: filtered })
      },
      (message) => onErrorRef.current(message),
      SAVE_DELAY_MS,
      (targetBlueprintId, layout) => onLayoutPersisted?.(targetBlueprintId, layout),
      (status) => onLayoutSaveStatus?.(status),
    )
  }

  const topologyKey = useMemo(() => {
    if (!blueprint) return ''
    // Note: coordinates stay out of the key so layout-save echoes reuse the
    // pinned flow instead of rebuilding all nodes/edges — see .agents/notes/2026-09-26-blueprint-edge-partial-refresh--edge-refresh.md
    return buildBlueprintTopologyKey(blueprint, collapsedNodeIds, hiddenNodeIds)
  }, [blueprint, collapsedNodeIds, hiddenNodeIds])

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
    void saveControllerRef.current!.dispose()
  }, [])

  useEffect(() => {
    // Keep the entry marker unset until the first paint.  During the initial
    // mount React may replay effects (StrictMode) or the blueprint can be
    // normalized immediately after loading.  Marking it synchronously caused
    // the replay/normalization pass to rebuild nodes without the enter class,
    // so the first opening appeared without animation.
    if (entryMarkFrameRef.current !== null) {
      cancelAnimationFrame(entryMarkFrameRef.current)
      entryMarkFrameRef.current = null
    }
    if (!blueprint) {
      enteredBlueprintRef.current = null
      flowRef.current = null
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
      collapsedNodeIds,
      { extraHidden: hiddenNodeIds }
    )
    const entering = enteredBlueprintRef.current !== blueprint.id
    const allNodes = flow.nodes.map((node, index) => ({
      ...node,
      className: blueprintNodeEntryClass(entering, index),
      style: entering
        ? { ...node.style, '--bp-entry-index': capEntryIndex(index) } as typeof node.style
        : node.style,
    }))
    flowRef.current = { key: topologyKey, nodes: allNodes }
    const computedPositions = Object.fromEntries(allNodes.map((node) => [node.id, node.position]))
    positionsRef.current = Object.fromEntries(allNodes.map((node) => [node.id, dirtyPositionsRef.current.has(node.id) ? positionsRef.current[node.id] ?? node.position : computedPositions[node.id]]))
    const nodeIndexById = new Map(allNodes.map((node, index) => [node.id, index]))
    // Note: single-commit mount. Nodes used to arrive 8 per animation frame
    // (25 commits for 200 nodes, each reconciling the growing array); the
    // entry animation is pure CSS stagger on --bp-entry-index and needs no JS
    // batching. One commit also keeps edges and nodes in the same paint.
    setNodes(allNodes)
    setEdges(flow.edges.map((edge) => {
      const className = [edge.className, entering ? 'bp-flow-edge--enter' : '']
        .filter(Boolean)
        .join(' ') || undefined
      return {
        ...edge,
        className,
        style: entering
          ? { ...edge.style, '--bp-edge-entry-index': capEntryIndex(nodeIndexById.get(edge.target) ?? 0) } as typeof edge.style
          : edge.style,
      }
    }))
    if (entering) {
      entryMarkFrameRef.current = requestAnimationFrame(() => {
        entryMarkFrameRef.current = null
        // Only mark the blueprint that is still active; a fast switch must
        // not suppress the next blueprint's entry animation.
        if (enteredBlueprintRef.current === null || enteredBlueprintRef.current !== blueprint.id) {
          enteredBlueprintRef.current = blueprint.id
        }
      })
    }
    return () => {
      if (entryMarkFrameRef.current !== null) {
        cancelAnimationFrame(entryMarkFrameRef.current)
        entryMarkFrameRef.current = null
      }
    }
  }, [topologyKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!blueprint) return
    const cached = flowRef.current
    const nodes = cached && cached.key === topologyKey
      ? cached.nodes
      : deriveBlueprintFlow(blueprint, pinnedRef.current ?? undefined, workspaceNameById, focusedNodeIds, focusActive, collapsedNodeIds, { extraHidden: hiddenNodeIds }).nodes
    const dataById = new Map(nodes.map((node) => [node.id, node.data]))
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
    await applyLayout(computeVisibleBlueprintLayout(blueprint, collapsedNodeIds, {}, undefined, hiddenNodeIds), {})
  }, [applyLayout, blueprint, collapsedNodeIds, hiddenNodeIds])

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
    await applyLayout(computeVisibleBlueprintLayout(blueprint, collapsedNodeIds, {}, undefined, hiddenNodeIds), {})
  }, [applyLayout, blueprint, collapsedNodeIds, hiddenNodeIds])

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
