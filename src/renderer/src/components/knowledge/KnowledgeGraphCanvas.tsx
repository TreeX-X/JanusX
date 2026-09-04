import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { KnowledgeWorkbenchSnapshot } from '../../services/knowledge'
import { useI18n } from '@/i18n/useI18n'
import { useReducedMotion } from '../shared/CardFrame'
import {
  buildKnowledgeGraphView,
  graphLayoutStorageKey,
  layoutKnowledgeGraph,
  layoutWorkspaceFor,
  loadStoredLayout,
  mergeStoredLayout,
  recordForGraphEdge,
  recordForGraphNode,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from './knowledgeGraph'
import type { InspectorRecord } from './KnowledgeWorkbench'
import styles from './KnowledgeWorkbench.module.css'

interface Props {
  snapshot: KnowledgeWorkbenchSnapshot
  selectedId: string
  /**
   * Parent-first record resolution (e.g. proposal nodes map back to reviewable
   * candidates); falls back to the adapter record when it returns null.
   */
  resolveRecord?: (node: KnowledgeGraphNode) => InspectorRecord | null
  onSelect: (id: string, record: InspectorRecord | null) => void
}

const KIND_FILTERS = ['fact', 'proposal', 'wiki', 'entity', 'observation'] as const

function edgeStyle(edge: KnowledgeGraphEdge): Edge['style'] {
  if (edge.type === 'conflicts_with') return { stroke: '#ff6b6b', strokeWidth: 2, strokeDasharray: '6 4' }
  if (edge.synthetic) return { stroke: '#71717a', strokeWidth: 1.2, strokeDasharray: '4 4' }
  return { stroke: '#8b8b93', strokeWidth: 1.4 }
}

/**
 * Phase 4 knowledge graph canvas (§10.1): React Flow over the adapter DTOs.
 * Graph interaction only changes view state (filters, focus, evidence
 * expansion, persisted layout) — never knowledge data.
 */
export function KnowledgeGraphCanvas({ snapshot, selectedId, resolveRecord, onSelect }: Props) {
  const { t } = useI18n('knowledge')
  const reducedMotion = useReducedMotion()
  const instanceRef = useRef<ReactFlowInstance | null>(null)
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const [focusId, setFocusId] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<string>('all')
  const [edgeFilter, setEdgeFilter] = useState<string>('all')
  const [locate, setLocate] = useState('')
  const [persisted, setPersisted] = useState(false)

  const view = useMemo(
    () => buildKnowledgeGraphView(snapshot, { expandedEvidence: expandedIds }),
    [snapshot, expandedIds],
  )
  const nodeIdsKey = useMemo(() => view.nodes.map((node) => node.id).sort().join('\u0000'), [view])

  // Layout: deterministic computed positions overlaid with the stored
  // per-workspace layout (renderer-side localStorage; truth untouched).
  const workspaceId = useMemo(() => layoutWorkspaceFor(view.nodes), [view]);
  const positions = useMemo(() => {
    const computed = layoutKnowledgeGraph(view.nodes, view.edges)
    if (typeof localStorage === 'undefined') return computed
    return mergeStoredLayout(computed, loadStoredLayout(workspaceId))
  }, [view, workspaceId])

  const locateTerm = locate.trim().toLowerCase()
  const visibleNodeIds = useMemo(() => {
    let ids = new Set(view.nodes.map((node) => node.id))
    if (kindFilter !== 'all') ids = new Set(view.nodes.filter((node) => node.kind === kindFilter).map((node) => node.id))
    if (focusId) {
      const neighbors = new Set<string>([focusId])
      for (const edge of view.edges) {
        if (edge.from === focusId) neighbors.add(edge.to)
        if (edge.to === focusId) neighbors.add(edge.from)
      }
      ids = new Set([...ids].filter((id) => neighbors.has(id)))
    }
    return ids
  }, [view, kindFilter, focusId])

  const baseNodes: Node[] = useMemo(() => view.nodes.map((node) => {
    const position = positions.get(node.id) ?? { x: 0, y: 0 }
    const matchesLocate = !locateTerm
      || node.label.toLowerCase().includes(locateTerm)
      || node.id.toLowerCase().includes(locateTerm)
    return {
      id: node.id,
      position,
      data: { label: node.label },
      className: `kg-node kg-node--${node.kind}`,
      selected: node.id === selectedId,
      hidden: !visibleNodeIds.has(node.id),
      style: { opacity: matchesLocate ? 1 : 0.3 },
    }
  }), [view, positions, selectedId, visibleNodeIds, locateTerm])

  const baseEdges: Edge[] = useMemo(() => view.edges
    .filter((edge) => (edgeFilter === 'all' || edge.type === edgeFilter)
      && visibleNodeIds.has(edge.from)
      && visibleNodeIds.has(edge.to))
    .map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.type === 'conflicts_with' ? edge.type : undefined,
      style: edgeStyle(edge),
      selected: edge.id === selectedId,
    })), [view, edgeFilter, visibleNodeIds, selectedId])

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(baseNodes)
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(baseEdges)

  // Full reset only when the node set changes; otherwise merge view flags so
  // in-progress drags survive typing in the locate box.
  const lastNodeIdsKey = useRef(nodeIdsKey)
  useEffect(() => {
    if (lastNodeIdsKey.current !== nodeIdsKey) {
      lastNodeIdsKey.current = nodeIdsKey
      setRfNodes(baseNodes)
      setRfEdges(baseEdges)
      return
    }
    setRfNodes((current) => {
      const base = new Map(baseNodes.map((node) => [node.id, node]))
      return current.map((node) => ({ ...node, ...(base.get(node.id) ?? {}) }))
    })
    setRfEdges(baseEdges)
  }, [baseNodes, baseEdges, nodeIdsKey, setRfNodes, setRfEdges])

  // Restore persisted selection once (refresh/reopen recovers select + layout).
  useEffect(() => {
    if (persisted || typeof localStorage === 'undefined') return
    setPersisted(true)
    try {
      const raw = localStorage.getItem(`${graphLayoutStorageKey(workspaceId)}:selected`)
      if (raw && view.nodes.some((node) => node.id === raw)) {
        const node = view.nodes.find((entry) => entry.id === raw)
        onSelect(raw, node ? (resolveRecord?.(node) ?? recordForGraphNode(node)) : null)
      }
    } catch {
      // Selection restore is best-effort.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persisted, workspaceId, view])

  const persistLayout = useCallback((nodes: Node[]) => {
    if (typeof localStorage === 'undefined') return
    try {
      const stored: Record<string, { x: number; y: number }> = {}
      for (const node of nodes) stored[node.id] = { x: node.position.x, y: node.position.y }
      localStorage.setItem(graphLayoutStorageKey(workspaceId), JSON.stringify(stored))
    } catch {
      // Layout persistence is best-effort.
    }
  }, [workspaceId])

  const persistSelection = useCallback((id: string) => {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(`${graphLayoutStorageKey(workspaceId)}:selected`, id)
    } catch {
      // Selection persistence is best-effort.
    }
  }, [workspaceId])

  const handleNodeClick = useCallback((_event: unknown, node: Node) => {
    const graphNode = view.nodes.find((entry) => entry.id === node.id)
    if (!graphNode) return
    persistSelection(node.id)
    onSelect(node.id, resolveRecord?.(graphNode) ?? recordForGraphNode(graphNode))
  }, [view, resolveRecord, onSelect, persistSelection])

  const handleEdgeClick = useCallback((_event: unknown, edge: Edge) => {
    const graphEdge = view.edges.find((entry) => entry.id === edge.id)
    if (!graphEdge) return
    persistSelection(edge.id)
    onSelect(edge.id, recordForGraphEdge(graphEdge, view.nodes))
  }, [view, onSelect, persistSelection])

  const handlePaneClick = useCallback(() => {
    setFocusId(null)
    onSelect('', null)
  }, [onSelect])

  const handleNodeDoubleClick = useCallback((_event: unknown, node: Node) => {
    setFocusId((current) => {
      const next = current === node.id ? null : node.id
      if (next && instanceRef.current) {
        const neighborhood = new Set<string>([next])
        for (const edge of view.edges) {
          if (edge.from === next) neighborhood.add(edge.to)
          if (edge.to === next) neighborhood.add(edge.from)
        }
        void instanceRef.current.fitView({
          nodes: [...neighborhood].map((id) => ({ id })),
          duration: reducedMotion ? 0 : 220,
          maxZoom: 1.1,
        })
      }
      return next
    })
  }, [view, reducedMotion])

  const selectedNode = view.nodes.find((node) => node.id === selectedId) ?? null
  const canExpand = selectedNode !== null
    && selectedNode.kind !== 'observation'
    && selectedNode.evidenceIds.length > 0
    && !expandedIds.includes(selectedNode.id)

  const matchCount = locateTerm
    ? view.nodes.filter((node) => visibleNodeIds.has(node.id)
      && (node.label.toLowerCase().includes(locateTerm) || node.id.toLowerCase().includes(locateTerm))).length
    : visibleNodeIds.size

  if (view.nodes.length === 0) {
    return (
      <div className={styles.graphNotice}>
        <strong>{t('knowledge:graph.empty.title')}</strong>
        <span>{t('knowledge:graph.empty.detail')}</span>
      </div>
    )
  }

  return (
    <div className={styles.graphWrap}>
      <div className={styles.graphToolbar}>
        <input
          className={styles.graphSearch}
          value={locate}
          onChange={(event) => setLocate(event.target.value)}
          placeholder={t('knowledge:graph.canvas.searchPlaceholder')}
          aria-label={t('knowledge:graph.canvas.searchPlaceholder')}
        />
        <label className={styles.graphFilter}>
          {t('knowledge:graph.canvas.kindFilter')}
          <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
            <option value="all">{t('knowledge:graph.canvas.all')}</option>
            {KIND_FILTERS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
        </label>
        <label className={styles.graphFilter}>
          {t('knowledge:graph.canvas.edgeFilter')}
          <select value={edgeFilter} onChange={(event) => setEdgeFilter(event.target.value)}>
            <option value="all">{t('knowledge:graph.canvas.all')}</option>
            {Array.from(new Set(view.edges.map((edge) => edge.type))).sort().map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        {canExpand && (
          <button type="button" className={styles.graphButton} onClick={() => setExpandedIds((ids) => [...ids, selectedNode.id])}>
            {t('knowledge:graph.canvas.expandEvidence')}
          </button>
        )}
        {expandedIds.length > 0 && (
          <button type="button" className={styles.graphButton} onClick={() => setExpandedIds([])}>
            {t('knowledge:graph.canvas.collapseEvidence')}
          </button>
        )}
        {focusId && (
          <button type="button" className={styles.graphButton} onClick={() => setFocusId(null)}>
            {focusId}
          </button>
        )}
        <span className={styles.graphCount}>
          {view.truncated
            ? t('knowledge:graph.canvas.capped', { shown: view.nodes.length, total: view.totalNodes })
            : `${matchCount}`}
        </span>
      </div>
      {visibleNodeIds.size === 0 && (
        <div className={styles.graphNotice}><span>{t('knowledge:graph.canvas.noMatch')}</span></div>
      )}
      <div className={styles.graphCanvas} data-reduced-motion={reducedMotion ? 'true' : undefined}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={(instance) => { instanceRef.current = instance }}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeDragStop={(_event, _node, nodes) => persistLayout(nodes)}
          fitView
          fitViewOptions={{ duration: reducedMotion ? 0 : 220, maxZoom: 1 }}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
      <div className={styles.graphHint}>{t('knowledge:graph.canvas.hint')}</div>
    </div>
  )
}
