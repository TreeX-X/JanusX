import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Controls,
  Handle,
  Position,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { KnowledgeWorkbenchSnapshot } from '../../services/knowledge'
import { useI18n } from '@/i18n/useI18n'
import { useReducedMotion } from '../shared/CardFrame'
import {
  buildKnowledgeGraphView,
  graphLayoutStorageKey,
  graphNodeCaption,
  graphNodeDotSize,
  layoutKnowledgeGraph,
  layoutWorkspaceFor,
  loadStoredLayout,
  mergeStoredLayout,
  recordForGraphEdge,
  recordForGraphNode,
  type GraphEvidence,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from './knowledgeGraph'
import type { InspectorRecord } from './KnowledgeWorkbench'
import { useThemeStore } from '@/stores/theme'
import { getThemeBase } from '../../../../shared/theme/registry'
import styles from './KnowledgeWorkbench.module.css'

interface Props {
  snapshot: KnowledgeWorkbenchSnapshot
  selectedId: string
  /**
   * Parent-first record resolution (settled nodes usually resolve here);
   * falls back to the adapter record when it returns null.
   */
  resolveRecord?: (node: KnowledgeGraphNode) => InspectorRecord | null
  onSelect: (id: string, record: InspectorRecord | null) => void
}

const KIND_FILTERS = ['fact', 'wiki', 'entity', 'observation'] as const

/** Obsidian dot palette (shared with the MiniMap). Dark snapshot; paper mapping below. */
const KIND_DOT_COLORS: Record<KnowledgeGraphNode['kind'], string> = {
  fact: '#6ba6ff',
  proposal: '#ff995f',
  wiki: '#4ade80',
  entity: '#c084fc',
  observation: '#71717a',
}

/** planche 纸面映射：墨蓝/朱红/深绿/黛紫 + 墨灰（纸上可读，色相与 dark 一一对应）。 */
const PLANCHE_KIND_DOT_COLORS: Record<KnowledgeGraphNode['kind'], string> = {
  fact: '#2F5D8A',
  proposal: '#D43D2A',
  wiki: '#2E6B5E',
  entity: '#6E5A9E',
  observation: 'rgba(28, 52, 59, 0.45)',
}

/** 主题感知读取：浅色基底走纸面映射（仿 getBlueprintStatusVisual，调用方零改动跟随）。 */
export function getKnowledgeKindColor(
  kind: KnowledgeGraphNode['kind'],
  theme: unknown = useThemeStore.getState().theme,
): string {
  if (getThemeBase(theme) === 'light') return PLANCHE_KIND_DOT_COLORS[kind] ?? PLANCHE_KIND_DOT_COLORS.observation
  return KIND_DOT_COLORS[kind] ?? KIND_DOT_COLORS.observation
}

interface KgDotData extends Record<string, unknown> {
  caption: string
  fullLabel: string
  kind: KnowledgeGraphNode['kind']
  size: number
}

const DOT_KIND_STYLES: Record<KnowledgeGraphNode['kind'], string> = {
  fact: styles.dotKindFact,
  proposal: styles.dotKindProposal,
  wiki: styles.dotKindWiki,
  entity: styles.dotKindEntity,
  observation: styles.dotKindObservation,
}

/**
 * Obsidian-style dot node: a small connection-sized circle with a short
 * caption floating underneath (overlay, so edges anchor to the dot itself).
 * Full label rides on `title` for hover; details live in the right pane.
 */
function KgDotNode({ data, selected }: NodeProps<Node<KgDotData, 'kgDot'>>) {
  return (
    <div
      className={`${styles.dot} ${DOT_KIND_STYLES[data.kind]}${selected ? ` ${styles.dotSelected}` : ''}`}
      style={{ width: data.size, height: data.size }}
      title={data.fullLabel}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} isConnectable={false} style={{ opacity: 0 }} />
      <span className={styles.dotCaption}>{data.caption}</span>
    </div>
  )
}

function edgeStyle(edge: KnowledgeGraphEdge): Edge['style'] {
  // 冲突红两边可读，沿用；中性/派生线吃令牌（明暗自动适配，虚实区分两者）。
  if (edge.type === 'conflicts_with') return { stroke: '#ff6b6b', strokeWidth: 1.6, strokeDasharray: '6 4' }
  if (edge.synthetic) return { stroke: 'var(--shell-muted)', strokeWidth: 1, strokeDasharray: '4 4' }
  return { stroke: 'var(--shell-muted)', strokeWidth: 1.1 }
}

/**
 * Phase 4 knowledge graph canvas (§10.1): React Flow over the adapter DTOs.
 * Graph interaction only changes view state (filters, focus, evidence
 * expansion, persisted layout) — never knowledge data.
 */
export function KnowledgeGraphCanvas({ snapshot, selectedId, resolveRecord, onSelect }: Props) {
  const { t } = useI18n('knowledge')
  const reducedMotion = useReducedMotion()
  const plancheCanvas = useThemeStore((s) => s.theme) === 'planche'
  const instanceRef = useRef<ReactFlowInstance | null>(null)
  const [traceWikiId, setTraceWikiId] = useState<string | undefined>()
  const [evidence, setEvidence] = useState<GraphEvidence[]>([])
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const evidenceGeneration = useRef(0)
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const [focusId, setFocusId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<string>('all')
  const [edgeFilter, setEdgeFilter] = useState<string>('all')
  const [locate, setLocate] = useState('')
  const [persisted, setPersisted] = useState(false)
  // Bumped by "reset layout": skips stored coordinates once and falls back
  // to the freshly computed spread.
  const [layoutEpoch, setLayoutEpoch] = useState(0)

  const view = useMemo(
    () => buildKnowledgeGraphView(snapshot, { traceWikiId, expandedEvidence: expandedIds, evidence }),
    [snapshot, traceWikiId, expandedIds, evidence],
  )

  useEffect(() => {
    ++evidenceGeneration.current
    setExpandedIds([])
    setEvidence([])
    setEvidenceLoading(false)
    setFocusId(null)
    setKindFilter('all')
    setEdgeFilter('all')
    const requests = evidenceGeneration
    return () => { ++requests.current }
  }, [snapshot, traceWikiId])

  const expandEvidence = async (node: KnowledgeGraphNode) => {
    const generation = evidenceGeneration.current
    setExpandedIds(ids => [...new Set([...ids, node.id])])
    setEvidenceLoading(true)
    const ids = [...new Set(node.evidenceIds)]
    const loaded: GraphEvidence[] = []
    // Bound concurrent host reads, and discard results after refresh, navigation or close.
    for (let offset = 0; offset < ids.length; offset += 4) {
      if (generation !== evidenceGeneration.current) return
      const batch = await Promise.all(ids.slice(offset, offset + 4).map(async id => {
        try {
          const result = await window.electron.knowledge.observationRevocationContext({ id, workspaceId: node.workspaceId })
          return { id, workspaceId: node.workspaceId, content: result.content,
            status: result.revoked ? 'revoked' as const : 'available' as const }
        } catch { return { id, workspaceId: node.workspaceId, status: 'unavailable' as const } }
      }))
      loaded.push(...batch)
    }
    if (generation !== evidenceGeneration.current) return
    setEvidence(current => [...current.filter(item => !loaded.some(next => item.workspaceId === next.workspaceId && item.id === next.id)), ...loaded])
    setEvidenceLoading(false)
  }
  const nodeIdsKey = useMemo(() => view.nodes.map((node) => node.id).sort().join('\u0000'), [view])

  // Layout: deterministic computed positions overlaid with the stored
  // per-workspace layout (renderer-side localStorage; truth untouched).
  // layoutEpoch only busts the memo so "reset layout" recomputes in place.
  const workspaceId = useMemo(() => layoutWorkspaceFor(view.nodes), [view]);
  const positions = useMemo(() => {
    // Referenced so "reset layout" busts this memo and recomputes in place.
    void layoutEpoch
    const computed = layoutKnowledgeGraph(view.nodes, view.edges)
    if (typeof localStorage === 'undefined') return computed
    return mergeStoredLayout(computed, loadStoredLayout(workspaceId))
  }, [view, workspaceId, layoutEpoch])

  /** Clears every stored layout generation (v1 layered + v2 spread) and
   * reverts to the freshly computed arrangement. */
  const resetLayout = useCallback(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(graphLayoutStorageKey(workspaceId))
        localStorage.removeItem(`janusx:knowledge-graph-layout:${workspaceId || 'global'}`)
      } catch {
        // Best-effort.
      }
    }
    setLayoutEpoch((epoch) => epoch + 1)
  }, [workspaceId])

  const locateTerm = locate.trim().toLowerCase()
  const visibleNodeIds = useMemo(() => {    let ids = new Set(view.nodes.map((node) => node.id))
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

  const nodeTypes = useMemo<NodeTypes>(() => ({ kgDot: KgDotNode }), [])

  // Undirected connection degree drives the Obsidian-style dot size.
  const degrees = useMemo(() => {
    const map = new Map<string, number>()
    for (const edge of view.edges) {
      map.set(edge.from, (map.get(edge.from) ?? 0) + 1)
      map.set(edge.to, (map.get(edge.to) ?? 0) + 1)
    }
    return map
  }, [view])

  const nodeColor = useCallback(
    (node: Node) => getKnowledgeKindColor((node.data as Partial<KgDotData>)?.kind ?? 'observation'),
    [],
  )

  // Obsidian-style hover: the hovered dot plus its one-hop neighborhood
  // stays lit, everything else dims (nodes and edges alike).
  const hoverSet = useMemo(() => {
    if (!hoverId) return null
    const neighbors = new Set<string>([hoverId])
    for (const edge of view.edges) {
      if (edge.from === hoverId) neighbors.add(edge.to)
      if (edge.to === hoverId) neighbors.add(edge.from)
    }
    return neighbors
  }, [view, hoverId])

  const baseNodes: Node[] = useMemo(() => view.nodes.map((node) => {
    const position = positions.get(node.id) ?? { x: 0, y: 0 }
    const matchesLocate = !locateTerm
      || node.label.toLowerCase().includes(locateTerm)
      || node.id.toLowerCase().includes(locateTerm)
    const size = graphNodeDotSize(degrees.get(node.id) ?? 0)
    const dimmed = !matchesLocate || (hoverSet !== null && !hoverSet.has(node.id))
    return {
      id: node.id,
      type: 'kgDot',
      position,
      data: {
        caption: graphNodeCaption(node.label),
        fullLabel: node.label,
        kind: node.kind,
        size,
      } satisfies KgDotData,
      className: styles.dotNode,
      selected: node.id === selectedId,
      hidden: !visibleNodeIds.has(node.id),
      style: { width: size, height: size, opacity: dimmed ? 0.15 : 1 },
    }
  }), [view, positions, selectedId, visibleNodeIds, locateTerm, degrees, hoverSet])

  const baseEdges: Edge[] = useMemo(() => view.edges
    .filter((edge) => (edgeFilter === 'all' || edge.type === edgeFilter)
      && visibleNodeIds.has(edge.from)
      && visibleNodeIds.has(edge.to))
    .map((edge) => {
      const touched = hoverSet !== null
        && (edge.from === hoverId || edge.to === hoverId)
      const base = edgeStyle(edge) ?? {}
      const baseWidth = typeof base.strokeWidth === 'number' ? base.strokeWidth : 1
      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        markerEnd: { type: MarkerType.ArrowClosed, color: edge.type === 'conflicts_with' ? '#ff6b6b' : 'var(--shell-muted)' },
        label: undefined,
        style: {
          ...base,
          opacity: hoverSet !== null && !touched ? 0.12 : 1,
          strokeWidth: touched ? baseWidth + 0.8 : baseWidth,
        },
        selected: edge.id === selectedId,
      }
    }), [view, edgeFilter, visibleNodeIds, selectedId, hoverSet, hoverId])

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
  const focusNode = focusId ? view.nodes.find((node) => node.id === focusId) ?? null : null
  const canExpand = selectedNode !== null
    && selectedNode.kind !== 'observation'
    && selectedNode.evidenceIds.length > 0
    && (evidenceLoading || !expandedIds.includes(selectedNode.id) || evidence.some(item => item.workspaceId === selectedNode.workspaceId && selectedNode.evidenceIds.includes(item.id) && item.status === 'unavailable'))

  const matchCount = locateTerm
    ? view.nodes.filter((node) => visibleNodeIds.has(node.id)
      && (node.label.toLowerCase().includes(locateTerm) || node.id.toLowerCase().includes(locateTerm))).length
    : visibleNodeIds.size

  if (view.nodes.length === 0) {
    return (
      <div className={styles.graphNotice}>
        {traceWikiId && <button type='button' onClick={() => { setTraceWikiId(undefined); onSelect('', null) }}>{t('knowledge:graph.canvas.backToWiki')}</button>}
        {view.diagnostics.map((item, index) => <p key={index}>{t(`knowledge:graph.diagnostics.${item.status}`)} · {item.target}</p>)}
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
        {traceWikiId && <label className={styles.graphFilter}>
          {t('knowledge:graph.canvas.kindFilter')}
          <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
            <option value="all">{t('knowledge:graph.canvas.all')}</option>
            {KIND_FILTERS.map((kind) => <option key={kind} value={kind}>{t(`knowledge:graph.kinds.${kind}`)}</option>)}
          </select>
        </label>}
        <label className={styles.graphFilter}>
          {t('knowledge:graph.canvas.edgeFilter')}
          <select value={edgeFilter} onChange={(event) => setEdgeFilter(event.target.value)}>
            <option value="all">{t('knowledge:graph.canvas.all')}</option>
            {Array.from(new Set(view.edges.map((edge) => edge.type))).sort().map((type) => (
              <option key={type} value={type}>{t(`knowledge:graph.relations.${type}`)}</option>
            ))}
          </select>
        </label>

        {!traceWikiId && selectedNode?.kind === 'wiki' && (
          <button type="button" className={styles.graphButton} onClick={() => setTraceWikiId(selectedNode.id)}>
            {t('knowledge:graph.canvas.traceWiki')}
          </button>
        )}
        {traceWikiId && (
          <button type="button" className={styles.graphButton} onClick={() => { setTraceWikiId(undefined); onSelect('', null) }}>
            {t('knowledge:graph.canvas.backToWiki')}
          </button>
        )}
        {canExpand && (
          <button type="button" className={styles.graphButton} disabled={evidenceLoading} onClick={() => void expandEvidence(selectedNode)}>
            {t(evidenceLoading ? 'knowledge:graph.canvas.loadingEvidence' : 'knowledge:graph.canvas.expandEvidence')}
          </button>
        )}
        {expandedIds.length > 0 && (
          <button type="button" className={styles.graphButton} onClick={() => { ++evidenceGeneration.current; setExpandedIds([]); setEvidence([]); setEvidenceLoading(false) }}>
            {t('knowledge:graph.canvas.collapseEvidence')}
          </button>
        )}
        <button type="button" className={styles.graphButton} onClick={resetLayout}>
          {t('knowledge:graph.canvas.resetLayout')}
        </button>
        {focusNode && (
          <button type="button" className={styles.graphButton} onClick={() => setFocusId(null)} title={focusNode.id}>
            ✕ {graphNodeCaption(focusNode.label)}
          </button>
        )}
        <span className={styles.graphCount}>
          {view.truncated
            ? t('knowledge:graph.canvas.capped', { shown: view.nodes.length, total: view.totalNodes })
            : t(traceWikiId ? 'knowledge:graph.canvas.evidenceCount' : 'knowledge:graph.canvas.pageCount', { count: matchCount, edges: baseEdges.length })}
        </span>
      </div>
      <div className={styles.graphCanvas} data-reduced-motion={reducedMotion ? 'true' : undefined}>
        {visibleNodeIds.size === 0 && (
          <div className={styles.graphNoticeFloat}><span>{t('knowledge:graph.canvas.noMatch')}</span></div>
        )}
        {visibleNodeIds.size > 0 && baseEdges.length === 0 && (
          <div className={styles.graphNoticeFloat}><span>{t(traceWikiId ? 'knowledge:graph.canvas.noEvidenceEdges' : 'knowledge:graph.canvas.noEdges')}</span></div>
        )}
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={(instance) => { instanceRef.current = instance }}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeMouseEnter={(_event, node) => setHoverId(node.id)}
          onNodeMouseLeave={() => setHoverId(null)}
          onNodeDragStop={(_event, _node, nodes) => persistLayout(nodes)}
          fitView
          fitViewOptions={{ duration: reducedMotion ? 0 : 220, maxZoom: 1, padding: 0.3 }}
          minZoom={0.1}
          colorMode={plancheCanvas ? 'light' : 'dark'}
          proOptions={{ hideAttribution: true }}
        >
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={nodeColor}
            maskColor={plancheCanvas ? 'rgba(220, 207, 168, 0.72)' : 'rgba(5, 5, 7, 0.72)'}
            bgColor={plancheCanvas ? '#DCCFA8' : 'rgba(10, 10, 13, 0.92)'}
          />
        </ReactFlow>
      </div>

      <div className={styles.graphHint}>
        <span>{t(traceWikiId ? 'knowledge:graph.canvas.traceHint' : 'knowledge:graph.canvas.hint')}</span>
        {view.diagnostics.length > 0 && <details>
          <summary>{t('knowledge:graph.canvas.diagnostics', { count: view.diagnostics.length })}</summary>
          <ul>{view.diagnostics.map((item, index) => <li key={index}>{t(`knowledge:graph.diagnostics.${item.status}`)} · {item.target}</li>)}</ul>
        </details>}
      </div>
      <div className={styles.graphLegend} aria-hidden="true">
        <span><i style={{ borderTop: '2px solid var(--shell-muted)' }} />{t('knowledge:graph.canvas.legend.stored')}</span>
        {traceWikiId && <span><i style={{ borderTop: '2px dashed var(--shell-muted)' }} />{t('knowledge:graph.canvas.legend.derived')}</span>}
        <span><i style={{ borderTop: '2px dashed #ff6b6b' }} />{t('knowledge:graph.canvas.legend.conflict')}</span>
      </div>
    </div>
  )
}
