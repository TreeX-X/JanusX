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
  computeBlueprintLayout,
  computeBlueprintSubtreeLayout,
  createDefaultLayoutRecovery,
  deriveBlueprintFlow,
  deriveBlueprintCardData
} from './canvas-layout'

const GLOBAL_BLUEPRINT_SCOPE = '__global__'
const SAVE_DELAY_MS = 500
type Layout = Record<string, { x: number; y: number }>

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
  private inFlight: Promise<boolean> | null = null

  constructor(
    blueprintId: string,
    private readonly persist: (blueprintId: string, layout: Layout) => Promise<void>,
    private readonly onError: (message: string | null) => void,
    private readonly delay = SAVE_DELAY_MS,
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
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.delay)
  }

  saveNow(layout: Layout): Promise<boolean> {
    this.enqueue(layout)
    return this.flush()
  }

  switchBlueprint(blueprintId: string): Promise<boolean> {
    const flushed = this.flush()
    this.blueprintId = blueprintId
    return flushed
  }

  dispose(): Promise<boolean> {
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
    while (this.pending.length) {
      const entry = this.pending[0]
      try {
        await this.persist(entry.blueprintId, entry.layout)
        this.pending.shift()
        this.onError(null)
      } catch (error) {
        this.onError(`布局保存失败: ${error instanceof Error ? error.message : String(error)}`)
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
}

export function useBlueprintGraphController({
  blueprint,
  blueprintId,
  workspaceNameById,
  focusedNodeIds,
  focusActive,
  onSelectionChange,
  onError,
  collapsedNodeIds = new Set()
}: GraphControllerOptions) {
  const [nodes, setNodes] = useState<Node<BlueprintNodeData, 'blueprint'>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [restoreSnapshot, setRestoreSnapshot] = useState<Layout | null>(null)
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const blueprintIdRef = useRef(blueprintId)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const saveControllerRef = useRef<BlueprintLayoutSaveController | null>(null)
  if (!saveControllerRef.current) {
    saveControllerRef.current = new BlueprintLayoutSaveController(
      blueprintId,
      async (targetBlueprintId, layout) => {
        await updateBlueprint(GLOBAL_BLUEPRINT_SCOPE, targetBlueprintId, { canvasLayout: layout })
      },
      (message) => onErrorRef.current(message),
    )
  }

  const topologyKey = useMemo(() => {
    if (!blueprint) return ''
    return JSON.stringify({
      id: blueprint.id,
      nodeIds: blueprint.nodeIds,
      parents: blueprint.nodeIds.map((id) => [id, blueprint.nodes[id]?.parentId ?? null]),
      canvasLayout: blueprint.canvasLayout ?? {},
      collapsed: [...collapsedNodeIds]
    })
  }, [blueprint, collapsedNodeIds])

  const cardDataKey = useMemo(() => {
    if (!blueprint) return ''
    return JSON.stringify({
      id: blueprint.id,
      nodes: blueprint.nodeIds.map((id) => {
        const node = blueprint.nodes[id]
        return node ? [id, deriveBlueprintCardData(blueprint, node, workspaceNameById, focusedNodeIds.has(id), focusActive, collapsedNodeIds.has(id))] : null
      }),
      workspaceNameById,
      focused: [...focusedNodeIds],
      focusActive,
      collapsedNodeIds
    })
  }, [blueprint, focusActive, focusedNodeIds, workspaceNameById, collapsedNodeIds])

  const flushLayoutSave = useCallback(() => saveControllerRef.current!.flush(), [])

  useEffect(() => {
    const previousId = blueprintIdRef.current
    if (previousId !== blueprintId) {
      void saveControllerRef.current!.switchBlueprint(blueprintId)
      blueprintIdRef.current = blueprintId
      positionsRef.current = {}
      setRestoreSnapshot(null)
    }
  }, [blueprintId])

  useEffect(() => () => {
    void saveControllerRef.current!.dispose()
  }, [])

  useEffect(() => {
    if (!blueprint) {
      setNodes([])
      setEdges([])
      positionsRef.current = {}
      return
    }
    const flow = deriveBlueprintFlow(
      blueprint,
      positionsRef.current,
      workspaceNameById,
      focusedNodeIds,
      focusActive,
      collapsedNodeIds
    )
    positionsRef.current = Object.fromEntries(flow.nodes.map((node) => [node.id, node.position]))
    setNodes(flow.nodes)
    setEdges(flow.edges)
  }, [topologyKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!blueprint) return
    const dataById = new Map(
      deriveBlueprintFlow(blueprint, positionsRef.current, workspaceNameById, focusedNodeIds, focusActive, collapsedNodeIds)
        .nodes.map((node) => [node.id, node.data])
    )
    setNodes((current) => patchBlueprintCardNodes(current, dataById))
  }, [cardDataKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const onNodesChange = useCallback((changes: NodeChange<Node<BlueprintNodeData, 'blueprint'>>[]) => {
    let moved = false
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        positionsRef.current[change.id] = change.position
        moved = true
      } else if (change.type === 'select') {
        onSelectionChange(change.selected ? change.id : null)
      }
    }
    setNodes((current) => applyNodeChanges(changes, current))
    if (moved) saveControllerRef.current!.schedule(positionsRef.current)
  }, [onSelectionChange])

  const applyLayout = useCallback(async (layout: Record<string, { x: number; y: number }>) => {
    positionsRef.current = layout
    setNodes((current) => current.map((node) => ({
      ...node,
      position: layout[node.id] ?? node.position
    })))
    await saveControllerRef.current!.saveNow(layout)
  }, [])

  const autoLayout = useCallback(async () => {
    if (!blueprint) return
    await applyLayout(computeBlueprintLayout(blueprint.nodes, blueprint.rootNodeId, {}))
  }, [applyLayout, blueprint])

  const layoutSubtree = useCallback(async (nodeId: string) => {
    if (!blueprint?.nodes[nodeId]) return
    await applyLayout(computeBlueprintSubtreeLayout(blueprint, nodeId, positionsRef.current))
  }, [applyLayout, blueprint])

  const restoreDefaultLayout = useCallback(async () => {
    if (!blueprint) return
    const recovery = createDefaultLayoutRecovery(blueprint, positionsRef.current)
    setRestoreSnapshot(recovery.previous)
    await applyLayout(recovery.next)
  }, [applyLayout, blueprint])

  const undoRestoreDefaultLayout = useCallback(async () => {
    if (!restoreSnapshot) return
    const previous = restoreSnapshot
    setRestoreSnapshot(null)
    await applyLayout(previous)
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
