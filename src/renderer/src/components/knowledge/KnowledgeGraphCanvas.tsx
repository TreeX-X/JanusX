import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Controls, Handle, Position, MarkerType, MiniMap, ReactFlow, useEdgesState, useNodesState,
  useNodesInitialized, useReactFlow, type Edge, type Node, type NodeProps, type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { KnowledgeWorkbenchSnapshot } from '../../services/knowledge'
import { useI18n } from '@/i18n/useI18n'
import { useReducedMotion } from '../shared/CardFrame'
import {
  buildKnowledgeGraphView, defaultGraphRoot, localKnowledgeGraph, GRAPH_CARD_WIDTH, GRAPH_CARD_HEIGHT,
  GRAPH_LOCAL_NEIGHBORS, graphLayoutStorageKey, layoutKnowledgeGraph, layoutLocalKnowledgeGraph, layoutWorkspaceFor,
  loadStoredLayout, mergeStoredLayout, recordForGraphEdge, recordForGraphNode,
  type GraphEvidence, type KnowledgeGraphEdge, type KnowledgeGraphNode,
} from './knowledgeGraph'
import type { InspectorRecord } from './KnowledgeWorkbench'
import { useThemeStore } from '@/stores/theme'
import { getThemeBase } from '../../../../shared/theme/registry'
import styles from './KnowledgeWorkbench.module.css'

interface Props {
  snapshot: KnowledgeWorkbenchSnapshot
  selectedId: string
  resolveRecord?: (node: KnowledgeGraphNode) => InspectorRecord | null
  onSelect: (id: string, record: InspectorRecord | null) => void
}

const KIND_FILTERS = ['fact', 'wiki', 'entity', 'observation'] as const
const KIND_DOT_COLORS: Record<KnowledgeGraphNode['kind'], string> = {
  fact: '#6ba6ff', proposal: '#ff995f', wiki: '#4ade80', entity: '#c084fc', observation: '#92929e',
}
const PLANCHE_KIND_DOT_COLORS: Record<KnowledgeGraphNode['kind'], string> = {
  fact: '#2F5D8A', proposal: '#D43D2A', wiki: '#2E6B5E', entity: '#6E5A9E', observation: 'rgba(28, 52, 59, 0.45)',
}
export function getKnowledgeKindColor(kind: KnowledgeGraphNode['kind'], theme: unknown = useThemeStore.getState().theme): string {
  return getThemeBase(theme) === 'light' ? PLANCHE_KIND_DOT_COLORS[kind] : KIND_DOT_COLORS[kind]
}

interface KgCardData extends Record<string, unknown> {
  label: string
  kind: KnowledgeGraphNode['kind']
  context: string
  color: string
}
function KgCardNode({ data, selected }: NodeProps<Node<KgCardData, 'kgCard'>>) {
  return <div className={`${styles.graphCard}${selected ? ` ${styles.graphCardSelected}` : ''}`}
    style={{ borderLeftColor: data.color }} title={data.label}>
    <Handle id="in-left" type="target" position={Position.Left} isConnectable={false} style={{ opacity: 0 }} />
    <Handle id="out-left" type="source" position={Position.Left} isConnectable={false} style={{ opacity: 0 }} />
    <Handle id="in-right" type="target" position={Position.Right} isConnectable={false} style={{ opacity: 0 }} />
    <Handle id="out-right" type="source" position={Position.Right} isConnectable={false} style={{ opacity: 0 }} />
    <strong>{data.label}</strong><small>{data.context}</small>
  </div>
}
const NODE_TYPES: NodeTypes = { kgCard: KgCardNode }

/** Refit on explicit navigation, filters or reset, never on detail selection or a drag. */
function FitGraph({ layoutKey, overview, reducedMotion }: { layoutKey: string; overview: boolean; reducedMotion: boolean }) {
  const initialized = useNodesInitialized()
  const { fitView } = useReactFlow()
  useEffect(() => {
    if (!initialized) return
    const frame = requestAnimationFrame(() => { void fitView({ duration: reducedMotion ? 0 : 180, padding: overview ? 0.22 : 0.12, minZoom: overview ? 0.1 : 0.85, maxZoom: 1 }) })
    return () => cancelAnimationFrame(frame)
  }, [initialized, layoutKey, overview, reducedMotion, fitView])
  return null
}

function edgeStyle(edge: KnowledgeGraphEdge): Edge['style'] {
  if (edge.type === 'conflicts_with') return { stroke: 'var(--shell-diff-del, #d95757)', strokeWidth: 1.8, strokeDasharray: '6 4' }
  return { stroke: 'var(--shell-muted)', strokeWidth: 1.5, ...(edge.synthetic ? { strokeDasharray: '4 4' } : {}) }
}

// Note: explicit Wiki reading scopes and card layouts keep detail clicks stable — see .agents/notes/2026-10-06-knowledge-review-status-audit-plan--76ef32d1.md
export function KnowledgeGraphCanvas({ snapshot, selectedId, resolveRecord, onSelect }: Props) {
  const { t } = useI18n('knowledge')
  const reducedMotion = useReducedMotion()
  const theme = useThemeStore(s => s.theme)
  const plancheCanvas = theme === 'planche'
  const [traceWikiId, setTraceWikiId] = useState<string | undefined>()
  const [evidence, setEvidence] = useState<GraphEvidence[]>([])
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const evidenceGeneration = useRef(0)
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  // undefined picks an initial page; null is the explicit full overview.
  const [focusId, setFocusId] = useState<string | null | undefined>()
  const [kindFilter, setKindFilter] = useState('all')
  const [edgeFilter, setEdgeFilter] = useState('all')
  const [locate, setLocate] = useState('')
  const [layoutEpoch, setLayoutEpoch] = useState(0)
  const [dragEpoch, setDragEpoch] = useState(0)
  const view = useMemo(() => buildKnowledgeGraphView(snapshot, { traceWikiId, expandedEvidence: expandedIds, evidence }), [snapshot, traceWikiId, expandedIds, evidence])

  useEffect(() => {
    ++evidenceGeneration.current
    setExpandedIds([]); setEvidence([]); setEvidenceLoading(false)
    setKindFilter('all'); setEdgeFilter('all'); setLocate('')
    const requests = evidenceGeneration
    return () => { ++requests.current }
  }, [snapshot, traceWikiId])

  const expandEvidence = async (node: KnowledgeGraphNode) => {
    const generation = evidenceGeneration.current
    setExpandedIds(ids => [...new Set([...ids, node.id])])
    setEvidenceLoading(true)
    const ids = [...new Set(node.evidenceIds)]
    const loaded: GraphEvidence[] = []
    // Bound host reads and discard late results after refresh, navigation or close.
    for (let offset = 0; offset < ids.length; offset += 4) {
      if (generation !== evidenceGeneration.current) return
      const batch = await Promise.all(ids.slice(offset, offset + 4).map(async id => {
        try {
          const result = await window.electron.knowledge.observationRevocationContext({ id, workspaceId: node.workspaceId })
          return { id, workspaceId: node.workspaceId, content: result.content, status: result.revoked ? 'revoked' as const : 'available' as const }
        } catch { return { id, workspaceId: node.workspaceId, status: 'unavailable' as const } }
      }))
      loaded.push(...batch)
    }
    if (generation !== evidenceGeneration.current) return
    setEvidence(current => [...current.filter(item => !loaded.some(next => item.workspaceId === next.workspaceId && item.id === next.id)), ...loaded])
    setEvidenceLoading(false)
  }

  const rootId = traceWikiId || (focusId === null ? null : view.nodes.some(node => node.id === focusId) ? focusId : defaultGraphRoot(view.nodes, view.edges))
  const local = useMemo(() => rootId && !traceWikiId ? localKnowledgeGraph(view.nodes, view.edges, rootId) : null, [view, rootId, traceWikiId])
  const scopedNodes = local?.nodes ?? view.nodes
  const term = locate.trim().toLowerCase()
  const filteredNodes = useMemo(() => scopedNodes.filter(node => (kindFilter === 'all' || node.kind === kindFilter)
    && (!term || node.label.toLowerCase().includes(term) || node.id.toLowerCase().includes(term))), [scopedNodes, kindFilter, term])
  const filteredEdges = useMemo(() => {
    const ids = new Set(filteredNodes.map(node => node.id))
    return view.edges.filter(edge => (edgeFilter === 'all' || edge.type === edgeFilter) && ids.has(edge.from) && ids.has(edge.to))
  }, [view.edges, filteredNodes, edgeFilter])
  const workspaceId = layoutWorkspaceFor(view.nodes)
  const scope = traceWikiId ? `trace:${traceWikiId}` : rootId ? `local:${rootId}` : 'overview'
  const positions = useMemo(() => {
    void layoutEpoch; void dragEpoch
    const computed = local && rootId ? layoutLocalKnowledgeGraph(filteredNodes, rootId) : layoutKnowledgeGraph(filteredNodes, filteredEdges)
    return mergeStoredLayout(computed, loadStoredLayout(workspaceId, scope))
  }, [filteredNodes, filteredEdges, local, rootId, workspaceId, scope, layoutEpoch, dragEpoch])
  const layoutKey = JSON.stringify([scope, filteredNodes.map(node => node.id), edgeFilter, layoutEpoch])

  const resetLayout = () => {
    try { localStorage.removeItem(graphLayoutStorageKey(workspaceId, scope)) } catch { /* best effort */ }
    setLayoutEpoch(epoch => epoch + 1)
  }
  const baseNodes: Node[] = useMemo(() => filteredNodes.map(node => ({
    id: node.id, type: 'kgCard', position: positions.get(node.id) ?? { x: 0, y: 0 },
    width: GRAPH_CARD_WIDTH, height: GRAPH_CARD_HEIGHT,
    // Fixed card geometry also supplies endpoints before browser measurement.
    handles: [
      { id: 'in-left', type: 'target', position: Position.Left, x: 0, y: GRAPH_CARD_HEIGHT / 2, width: 0, height: 0 },
      { id: 'out-left', type: 'source', position: Position.Left, x: 0, y: GRAPH_CARD_HEIGHT / 2, width: 0, height: 0 },
      { id: 'in-right', type: 'target', position: Position.Right, x: GRAPH_CARD_WIDTH, y: GRAPH_CARD_HEIGHT / 2, width: 0, height: 0 },
      { id: 'out-right', type: 'source', position: Position.Right, x: GRAPH_CARD_WIDTH, y: GRAPH_CARD_HEIGHT / 2, width: 0, height: 0 },
    ],
    data: { label: node.label, kind: node.kind, color: getKnowledgeKindColor(node.kind, theme),
      context: `${t(`knowledge:graph.kinds.${node.kind}`)} · ${node.workspaceId}` } satisfies KgCardData,
    selected: node.id === selectedId, style: { width: GRAPH_CARD_WIDTH, height: GRAPH_CARD_HEIGHT },
    ariaLabel: node.label,
  })), [filteredNodes, positions, selectedId, theme, t])
  const baseEdges: Edge[] = useMemo(() => filteredEdges.map(edge => ({
    id: edge.id, source: edge.from, target: edge.to, type: 'default',
    sourceHandle: (positions.get(edge.from)?.x ?? 0) <= (positions.get(edge.to)?.x ?? 0) ? 'out-right' : 'out-left',
    targetHandle: (positions.get(edge.from)?.x ?? 0) <= (positions.get(edge.to)?.x ?? 0) ? 'in-left' : 'in-right',
    markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyle(edge)?.stroke, width: 18, height: 18 },
    label: t(`knowledge:graph.relations.${edge.type}`),
    labelStyle: { fill: 'var(--shell-text)', fontSize: 12 },
    labelBgStyle: { fill: 'var(--shell-card, #18181c)', fillOpacity: 1 },
    labelBgPadding: [7, 4] as [number, number], labelBgBorderRadius: 3,
    style: edgeStyle(edge), selected: edge.id === selectedId,
    ariaLabel: `${view.nodes.find(node => node.id === edge.from)?.label} → ${t(`knowledge:graph.relations.${edge.type}`)} → ${view.nodes.find(node => node.id === edge.to)?.label}`,
  })), [filteredEdges, view.nodes, positions, selectedId, t])
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(baseNodes)
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(baseEdges)
  useEffect(() => {
    // Preserve React Flow measurements; replacing them after a view update can
    // drop handle bounds without triggering another ResizeObserver event.
    setRfNodes(current => {
      const previous = new Map(current.map(node => [node.id, node]))
      return baseNodes.map(node => ({ ...previous.get(node.id), ...node }))
    })
  }, [baseNodes, setRfNodes])
  useEffect(() => { setRfEdges(baseEdges) }, [baseEdges, setRfEdges])

  const persistLayout = useCallback((nodes: Node[]) => {
    try {
      const stored = loadStoredLayout(workspaceId, scope) ?? {}
      for (const node of nodes) stored[node.id] = { ...node.position }
      localStorage.setItem(graphLayoutStorageKey(workspaceId, scope), JSON.stringify(stored))
      setDragEpoch(epoch => epoch + 1)
    } catch { /* Local view persistence is best effort. */ }
  }, [workspaceId, scope])
  const selectNode = (_event: unknown, node: Node) => {
    const record = view.nodes.find(entry => entry.id === node.id)
    if (record) onSelect(node.id, resolveRecord?.(record) ?? recordForGraphNode(record))
  }
  const selectEdge = (_event: unknown, edge: Edge) => {
    const record = view.edges.find(entry => entry.id === edge.id)
    if (record) onSelect(edge.id, recordForGraphEdge(record, view.nodes))
  }
  const navigate = (id: string | null) => { setFocusId(id); setLocate(''); setEdgeFilter('all') }
  const selectedNode = view.nodes.find(node => node.id === selectedId) ?? null
  const canExpand = Boolean(traceWikiId) && selectedNode !== null && selectedNode.kind !== 'observation'
    && selectedNode.evidenceIds.length > 0
    && (evidenceLoading || !expandedIds.includes(selectedNode.id) || evidence.some(item => item.workspaceId === selectedNode.workspaceId && selectedNode.evidenceIds.includes(item.id) && item.status === 'unavailable'))
  const filtered = Boolean(term) || kindFilter !== 'all' || edgeFilter !== 'all'

  if (view.nodes.length === 0) return <div className={styles.graphNotice}>
    {traceWikiId && <button type="button" onClick={() => { setTraceWikiId(undefined); onSelect('', null) }}>{t('knowledge:graph.canvas.backToWiki')}</button>}
    {view.diagnostics.map((item, index) => <p key={index}>{t(`knowledge:graph.diagnostics.${item.status}`)} · {item.target}</p>)}
    <strong>{t('knowledge:graph.empty.title')}</strong><p>{t('knowledge:graph.empty.detail')}</p>
  </div>

  return <div className={styles.graphWrap}>
    <div className={styles.graphToolbar}>
      {!traceWikiId && <>
        <label className={styles.graphFilter}>{t('knowledge:graph.canvas.localPage')}
          <select value={rootId ?? ''} onChange={event => navigate(event.target.value || null)}>
            <option value="">{t('knowledge:graph.canvas.overview')}</option>
            {view.nodes.map(node => <option key={node.id} value={node.id}>{node.label} · {node.workspaceId}</option>)}
          </select>
        </label>
        {rootId && <button type="button" className={styles.graphButton} onClick={() => navigate(null)}>{t('knowledge:graph.canvas.overview')}</button>}
        {selectedNode?.kind === 'wiki' && <>
          <button type="button" className={styles.graphButton} onClick={() => navigate(selectedNode.id)}>{t('knowledge:graph.canvas.focusSelected')}</button>
          <button type="button" className={styles.graphButton} onClick={() => setTraceWikiId(selectedNode.id)}>{t('knowledge:graph.canvas.traceWiki')}</button>
        </>}
      </>}
      {traceWikiId && <button type="button" className={styles.graphButton} onClick={() => { setTraceWikiId(undefined); onSelect('', null) }}>{t('knowledge:graph.canvas.backToWiki')}</button>}
      <input className={styles.graphSearch} value={locate} onChange={event => setLocate(event.target.value)} placeholder={t('knowledge:graph.canvas.searchPlaceholder')} aria-label={t('knowledge:graph.canvas.searchPlaceholder')} />
      {traceWikiId && <label className={styles.graphFilter}>{t('knowledge:graph.canvas.kindFilter')}
        <select value={kindFilter} onChange={event => setKindFilter(event.target.value)}>
          <option value="all">{t('knowledge:graph.canvas.all')}</option>
          {KIND_FILTERS.map(kind => <option key={kind} value={kind}>{t(`knowledge:graph.kinds.${kind}`)}</option>)}
        </select>
      </label>}
      <label className={styles.graphFilter}>{t('knowledge:graph.canvas.edgeFilter')}
        <select value={edgeFilter} onChange={event => setEdgeFilter(event.target.value)}>
          <option value="all">{t('knowledge:graph.canvas.all')}</option>
          {Array.from(new Set(view.edges.map(edge => edge.type))).sort().map(type => <option key={type} value={type}>{t(`knowledge:graph.relations.${type}`)}</option>)}
        </select>
      </label>
      {canExpand && selectedNode && <button type="button" className={styles.graphButton} disabled={evidenceLoading} onClick={() => void expandEvidence(selectedNode)}>{t(evidenceLoading ? 'knowledge:graph.canvas.loadingEvidence' : 'knowledge:graph.canvas.expandEvidence')}</button>}
      {expandedIds.length > 0 && <button type="button" className={styles.graphButton} onClick={() => { ++evidenceGeneration.current; setExpandedIds([]); setEvidence([]); setEvidenceLoading(false) }}>{t('knowledge:graph.canvas.collapseEvidence')}</button>}
      <button type="button" className={styles.graphButton} onClick={resetLayout}>{t('knowledge:graph.canvas.resetLayout')}</button>
      <span className={styles.graphCount} role="status">{t(traceWikiId ? 'knowledge:graph.canvas.evidenceCount' : 'knowledge:graph.canvas.pageCount', { count: filteredNodes.length, edges: filteredEdges.length })}</span>
    </div>
    <div className={styles.graphCanvas} data-reduced-motion={reducedMotion ? 'true' : undefined}>
      {(filteredNodes.length === 0 || filteredEdges.length === 0) && <div className={styles.graphNoticeFloat}>
        {t(filteredNodes.length === 0 ? 'knowledge:graph.canvas.noMatch' : filtered ? 'knowledge:graph.canvas.noMatchingEdges' : traceWikiId ? 'knowledge:graph.canvas.noEvidenceEdges' : 'knowledge:graph.canvas.noEdges')}
      </div>}
      <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={NODE_TYPES} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeClick={selectNode} onEdgeClick={selectEdge} onPaneClick={() => onSelect('', null)}
        onNodeDragStop={(_event, _node, nodes) => persistLayout(nodes)} nodesConnectable={false}
        fitView fitViewOptions={{ maxZoom: 1, padding: 0.22 }} minZoom={0.1} maxZoom={1.6}
        colorMode={plancheCanvas ? 'light' : 'dark'} proOptions={{ hideAttribution: true }}>
        <FitGraph layoutKey={layoutKey} overview={!rootId} reducedMotion={reducedMotion} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={node => getKnowledgeKindColor((node.data as KgCardData).kind, theme)}
          maskColor={plancheCanvas ? 'rgba(220, 207, 168, 0.72)' : 'rgba(5, 5, 7, 0.72)'}
          bgColor={plancheCanvas ? '#DCCFA8' : 'rgba(10, 10, 13, 0.92)'} />
      </ReactFlow>
    </div>
    <div className={styles.graphHint}>
      <span>{t(traceWikiId ? 'knowledge:graph.canvas.traceHint' : 'knowledge:graph.canvas.hint')}</span>
      {view.truncated && <p>{t('knowledge:graph.canvas.capped', { shown: view.nodes.length, total: view.totalNodes })}</p>}
      {local && local.totalNeighbors > GRAPH_LOCAL_NEIGHBORS && <p>{t('knowledge:graph.canvas.localCapped', { shown: GRAPH_LOCAL_NEIGHBORS, total: local.totalNeighbors })}</p>}
      {view.diagnostics.length > 0 && <details><summary>{t('knowledge:graph.canvas.diagnostics', { count: view.diagnostics.length })}</summary>
        <ul>{view.diagnostics.map((item, index) => <li key={index}>{t(`knowledge:graph.diagnostics.${item.status}`)} · {item.target}</li>)}</ul>
      </details>}
    </div>
    <div className={styles.graphLegend} aria-hidden="true">
      <span><i style={{ borderTop: '2px solid var(--shell-muted)' }} />{t('knowledge:graph.canvas.legend.stored')}</span>
      {traceWikiId && <span><i style={{ borderTop: '2px dashed var(--shell-muted)' }} />{t('knowledge:graph.canvas.legend.derived')}</span>}
      <span><i style={{ borderTop: '2px dashed var(--shell-diff-del, #d95757)' }} />{t('knowledge:graph.canvas.legend.conflict')}</span>
    </div>
  </div>
}
