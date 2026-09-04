import type {
  CandidateFact,
  CandidateGraphEdge,
  CandidateWikiPatch,
  Derivation,
  FactKind,
  GraphRelationType,
  MemoryFact,
} from '../../../../shared/knowledge'
import type { InspectorRecord } from './KnowledgeWorkbench'
import type { KnowledgeWorkbenchSnapshot } from '../../services/knowledge'

/**
 * Graph data-adapter layer (Phase 4, §10.1).
 * Pure and unit-tested: turns a workbench snapshot into nodes/edges DTOs with
 * synthetic edges (`derived_from` / `supersedes` / `conflicts_with`) composed
 * from already-stored fields — never computed out of thin air in the view.
 * Observations stay out of the graph by default and expand one hop on demand.
 */

export type KnowledgeGraphNodeKind = 'fact' | 'proposal' | 'wiki' | 'entity' | 'observation'

export interface KnowledgeGraphNode {
  id: string
  kind: KnowledgeGraphNodeKind
  label: string
  sublabel?: string
  workspaceId: string
  status?: string
  factKind?: FactKind
  derivation?: Derivation
  confidence?: number
  /** Evidence observation ids kept for one-hop expansion + inspector. */
  evidenceIds: string[]
  fileRefs: string[]
  createdAt?: string
}

export interface KnowledgeGraphEdge {
  id: string
  from: string
  to: string
  type: GraphRelationType
  /** True when composed from provenance/evidence fields rather than stored. */
  synthetic: boolean
  confidence?: number
}

export interface KnowledgeGraphView {
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
  /** True when entity aggregation / node cap dropped records. */
  truncated: boolean
  totalNodes: number
}

export const KNOWLEDGE_GRAPH_NODE_LIMIT = 500
const LABEL_MAX_LENGTH = 80

export interface GraphBuildOptions {
  /** Observation node ids to expand one hop (evidence demand-loading). */
  expandedEvidence?: string[]
  nodeLimit?: number
}

function truncateLabel(value: string): string {
  const line = value.split('\n').map((entry) => entry.trim()).find((entry) => entry.length > 0) ?? ''
  return line.length <= LABEL_MAX_LENGTH ? line : `${line.slice(0, LABEL_MAX_LENGTH - 1)}…`
}

function candidateProvenance(candidate: CandidateFact | CandidateWikiPatch | CandidateGraphEdge) {
  if (candidate.type === 'fact') return candidate.fact.provenance
  if (candidate.type === 'wiki-patch') return candidate.provenance
  return null
}

function candidateEvidenceIds(candidate: CandidateFact | CandidateWikiPatch | CandidateGraphEdge): string[] {
  if (candidate.evidence?.observationIds?.length) return [...candidate.evidence.observationIds]
  const provenance = candidateProvenance(candidate)
  return provenance ? [...provenance.sourceObservationIds] : []
}

/**
 * Builds the default graph: active truth facts, proposed candidates, wiki
 * pages, stored edges, and entity nodes for concepts/files cited by ≥ 2 facts.
 */
export function buildKnowledgeGraphView(
  snapshot: KnowledgeWorkbenchSnapshot,
  options: GraphBuildOptions = {},
): KnowledgeGraphView {
  const nodeLimit = options.nodeLimit ?? KNOWLEDGE_GRAPH_NODE_LIMIT
  const nodes: KnowledgeGraphNode[] = []
  const edges: KnowledgeGraphEdge[] = []
  const nodeIds = new Set<string>()

  const addNode = (node: KnowledgeGraphNode) => {
    if (nodeIds.has(node.id)) return
    nodeIds.add(node.id)
    nodes.push(node)
  }
  const addEdge = (edge: KnowledgeGraphEdge) => {
    if (edges.some((entry) => entry.id === edge.id)) return
    edges.push(edge)
  }

  const facts: MemoryFact[] = snapshot.truthFacts ?? []
  for (const fact of facts) {
    const id = `fact:${fact.id}`
    addNode({
      id,
      kind: 'fact',
      label: truncateLabel(fact.content),
      sublabel: fact.kind,
      workspaceId: fact.provenance.workspaceId,
      status: fact.status,
      factKind: fact.kind,
      confidence: fact.confidence,
      evidenceIds: [...fact.provenance.sourceObservationIds],
      fileRefs: [...fact.files, ...fact.provenance.fileRefs],
      createdAt: fact.provenance.createdAt,
    })
    // Synthetic supersedes: MemoryFact.supersedes composed as a solid edge.
    if (fact.supersedes && nodeIds.has(`fact:${fact.supersedes}`)) {
      addEdge({ id: `supersedes:${fact.id}`, from: id, to: `fact:${fact.supersedes}`, type: 'supersedes', synthetic: true })
    }
  }

  const proposed = [
    ...snapshot.factCandidates.filter((candidate) => candidate.status === 'proposed'),
    ...snapshot.wikiPatches.filter((candidate) => candidate.status === 'proposed'),
    ...snapshot.graphCandidates.filter((candidate) => candidate.status === 'proposed'),
  ]
  for (const candidate of proposed) {
    const id = `proposal:${candidate.id}`
    if (candidate.type === 'fact') {
      addNode({
        id,
        kind: 'proposal',
        label: truncateLabel(candidate.fact.content),
        sublabel: candidate.fact.kind,
        workspaceId: candidate.fact.provenance.workspaceId,
        status: candidate.status,
        factKind: candidate.fact.kind,
        derivation: candidate.derivation,
        confidence: candidate.fact.confidence,
        evidenceIds: candidateEvidenceIds(candidate),
        fileRefs: [...candidate.fact.files, ...candidate.fact.provenance.fileRefs],
        createdAt: candidate.fact.provenance.createdAt,
      })
    } else if (candidate.type === 'wiki-patch') {
      addNode({
        id,
        kind: 'proposal',
        label: truncateLabel(candidate.title),
        sublabel: candidate.pageSlug,
        workspaceId: candidate.provenance.workspaceId,
        status: candidate.status,
        derivation: candidate.derivation,
        confidence: candidate.confidence,
        evidenceIds: candidateEvidenceIds(candidate),
        fileRefs: [...candidate.provenance.fileRefs],
        createdAt: candidate.provenance.createdAt,
      })
    } else {
      addNode({
        id,
        kind: 'proposal',
        label: `${candidate.edge.from} → ${candidate.edge.to}`,
        sublabel: candidate.edge.type,
        workspaceId: candidate.edge.workspaceId,
        status: candidate.status,
        derivation: candidate.derivation,
        confidence: candidate.edge.confidence,
        evidenceIds: candidateEvidenceIds(candidate),
        fileRefs: [],
        createdAt: candidate.edge.createdAt,
      })
    }
    // Synthetic conflicts_with: candidate-stage conflict marks (§4.5).
    for (const targetId of candidate.conflicts ?? []) {
      const target = `fact:${targetId}`
      if (!nodeIds.has(target)) continue
      addEdge({ id: `conflicts:${candidate.id}:${targetId}`, from: id, to: target, type: 'conflicts_with', synthetic: true })
    }
  }

  // Wiki pages ride along in libraryCards (rawType 'wiki-page').
  for (const card of snapshot.libraryCards) {
    if (card.kind !== 'wiki' || card.rawType !== 'wiki-page') continue
    addNode({
      id: `wiki:${card.id}`,
      kind: 'wiki',
      label: truncateLabel(card.title),
      workspaceId: card.workspaceId ?? '',
      status: card.status,
      evidenceIds: [...card.sourceRefs.observationIds],
      fileRefs: [...card.sourceRefs.fileRefs],
      createdAt: card.createdAt,
    })
  }

  // Stored truth edges; endpoints resolve to fact/wiki/entity nodes when present.
  for (const edge of snapshot.truthEdges ?? []) {
    const from = resolveNodeId(edge.from, nodeIds)
    const to = resolveNodeId(edge.to, nodeIds)
    if (!from || !to) continue
    addEdge({ id: `stored:${edge.id}`, from, to, type: edge.type, synthetic: false, confidence: edge.confidence })
  }

  // Entity nodes: concepts/files cited by ≥ 2 facts (truth + proposed).
  const entityOwners = new Map<string, { facts: string[]; files: string[] }>()
  const cite = (nodeId: string, name: string, isFile: boolean) => {
    const key = name.trim()
    if (!key) return
    const entry = entityOwners.get(key) ?? { facts: [], files: [] }
    if (!entry.facts.includes(nodeId)) entry.facts.push(nodeId)
    if (isFile && !entry.files.includes(key)) entry.files.push(key)
    entityOwners.set(key, entry)
  }
  for (const node of nodes) {
    if (node.kind !== 'fact' && node.kind !== 'proposal') continue
    for (const ref of node.fileRefs) cite(node.id, ref, true)
  }
  // Concepts live on facts/candidates; re-read them from the snapshot.
  for (const fact of facts) {
    for (const concept of fact.concepts) cite(`fact:${fact.id}`, concept, false)
  }
  for (const candidate of snapshot.factCandidates) {
    if (candidate.status !== 'proposed') continue
    for (const concept of candidate.fact.concepts) cite(`proposal:${candidate.id}`, concept, false)
  }
  for (const [name, owners] of [...entityOwners.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (owners.facts.length < 2 || !nodeIds.has(owners.facts[0]!)) continue
    const id = `entity:${name}`
    const workspaceId = nodes.find((node) => node.id === owners.facts[0])?.workspaceId ?? ''
    addNode({ id, kind: 'entity', label: truncateLabel(name), workspaceId, evidenceIds: [], fileRefs: [...owners.files] })
    for (const owner of owners.facts) {
      if (!nodeIds.has(owner)) continue
      addEdge({ id: `mentions:${owner}:${name}`, from: owner, to: id, type: 'mentions', synthetic: true })
    }
  }

  // One-hop evidence expansion for explicitly expanded nodes.
  const expanded = new Set(options.expandedEvidence ?? [])
  if (expanded.size > 0) {
    const byId = new Map(snapshot.observations.map((observation) => [observation.id, observation]))
    for (const node of [...nodes]) {
      if (!expanded.has(node.id)) continue
      for (const observationId of node.evidenceIds) {
        const observation = byId.get(observationId)
        if (!observation) continue
        const id = `observation:${observation.id}`
        addNode({
          id,
          kind: 'observation',
          label: truncateLabel(observation.summary ?? observation.contentPreview ?? observation.content),
          workspaceId: observation.workspaceId,
          status: 'active',
          evidenceIds: [],
          fileRefs: [...observation.fileRefs],
          createdAt: observation.createdAt,
        })
        addEdge({ id: `derived:${node.id}:${observation.id}`, from: node.id, to: id, type: 'derived_from', synthetic: true })
      }
    }
  }

  const totalNodes = nodes.length
  const truncated = totalNodes > nodeLimit
  const kept = truncated ? prioritizeNodes(nodes, nodeLimit) : nodes
  const keptIds = new Set(kept.map((node) => node.id))
  return {
    nodes: kept,
    edges: edges.filter((edge) => keptIds.has(edge.from) && keptIds.has(edge.to)),
    truncated,
    totalNodes,
  }
}

function resolveNodeId(ref: string, nodeIds: Set<string>): string | null {
  for (const candidate of [`fact:${ref}`, `wiki:${ref}`, `entity:${ref}`, ref]) {
    if (nodeIds.has(candidate)) return candidate
  }
  return null
}

const NODE_KIND_PRIORITY: Record<KnowledgeGraphNode['kind'], number> = {
  fact: 0,
  proposal: 1,
  wiki: 2,
  entity: 3,
  observation: 4,
}

/** Over-limit: keep facts/proposals first, drop entities, keep edge endpoints. */
function prioritizeNodes(nodes: KnowledgeGraphNode[], limit: number): KnowledgeGraphNode[] {
  return [...nodes]
    .sort((a, b) => NODE_KIND_PRIORITY[a.kind] - NODE_KIND_PRIORITY[b.kind] || (a.id < b.id ? -1 : 1))
    .slice(0, Math.max(0, limit))
}

/** Deterministic layered layout: BFS depth from indegree-0 roots, id-sorted. */
export interface GraphPosition {
  x: number
  y: number
}

export const GRAPH_LAYOUT_DX = 280
export const GRAPH_LAYOUT_DY = 130

export function layoutKnowledgeGraph(
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
): Map<string, GraphPosition> {
  const ids = nodes.map((node) => node.id).sort()
  const incoming = new Map<string, number>(ids.map((id) => [id, 0]))
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    if (!incoming.has(edge.from) || !incoming.has(edge.to)) continue
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
    const list = outgoing.get(edge.from) ?? []
    list.push(edge.to)
    outgoing.set(edge.from, list)
  }
  const depth = new Map<string, number>()
  const queue: string[] = ids.filter((id) => (incoming.get(id) ?? 0) === 0)
  for (const id of queue) depth.set(id, 0)
  // Cycles / unreachable: seed remaining ids in sorted order at depth 0.
  for (const id of ids) {
    if (depth.has(id)) continue
    depth.set(id, 0)
    queue.push(id)
  }
  while (queue.length > 0) {
    const current = queue.shift()!
    const next = (depth.get(current) ?? 0) + 1
    for (const child of [...(outgoing.get(current) ?? [])].sort()) {
      if ((depth.get(child) ?? -1) < next) {
        depth.set(child, next)
        queue.push(child)
      }
    }
  }
  const layers = new Map<number, string[]>()
  for (const id of ids) {
    const layer = depth.get(id) ?? 0
    const list = layers.get(layer) ?? []
    list.push(id)
    layers.set(layer, list)
  }
  const positions = new Map<string, GraphPosition>()
  for (const [layer, members] of [...layers.entries()].sort(([a], [b]) => a - b)) {
    members.sort().forEach((id, index) => {
      positions.set(id, { x: layer * GRAPH_LAYOUT_DX, y: index * GRAPH_LAYOUT_DY })
    })
  }
  return positions
}

/** Inspector record for a graph node (reuses the Detail pane contract). */
export function recordForGraphNode(node: KnowledgeGraphNode): InspectorRecord {
  return {
    id: node.id,
    title: node.label,
    body: node.sublabel ?? node.kind,
    confidence: node.confidence,
    tags: node.kind === 'entity' ? [] : node.fileRefs.slice(0, 5),
    sourceIds: node.evidenceIds,
    fileRefs: node.fileRefs,
    createdAt: node.createdAt,
    status: (node.status as InspectorRecord['status']) ?? 'active',
    // Only truth-backed nodes (fact/wiki) carry a revocable kind: proposal
    // nodes resolve to reviewable candidates in the parent, and firing revoke
    // with a `proposal:<id>` would address a non-existent truth record.
    kind: node.kind === 'fact' || node.kind === 'wiki' ? node.kind : undefined,
    workspaceId: node.workspaceId || undefined,
    derivation: node.derivation,
    factKind: node.factKind,
  }
}

/** Inspector record for a graph edge; conflict edges carry both endpoint labels. */
export function recordForGraphEdge(
  edge: KnowledgeGraphEdge,
  nodes: KnowledgeGraphNode[],
): InspectorRecord {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const from = byId.get(edge.from)
  const to = byId.get(edge.to)
  return {
    id: edge.id,
    title: `${from?.label ?? edge.from} — ${edge.type} → ${to?.label ?? edge.to}`,
    body: edge.synthetic ? `synthetic ${edge.type}` : `stored ${edge.type}`,
    confidence: edge.confidence,
    tags: [edge.type],
    sourceIds: [...(from?.evidenceIds ?? []), ...(to?.evidenceIds ?? [])],
    fileRefs: [...(from?.fileRefs ?? []), ...(to?.fileRefs ?? [])],
    status: 'active',
    kind: undefined,
    workspaceId: from?.workspaceId || to?.workspaceId || undefined,
  }
}

/** Layout persistence workspace: shared id or 'global' for mixed graphs. */
export function layoutWorkspaceFor(nodes: KnowledgeGraphNode[]): string {
  const workspaces = new Set(nodes.map((node) => node.workspaceId).filter(Boolean))
  return workspaces.size === 1 ? [...workspaces][0]! : 'global'
}

export function graphLayoutStorageKey(workspaceId: string): string {
  return `janusx:knowledge-graph-layout:${workspaceId || 'global'}`
}

export type StoredGraphLayout = Record<string, GraphPosition>

export function loadStoredLayout(workspaceId: string): StoredGraphLayout | null {
  try {
    const raw = localStorage.getItem(graphLayoutStorageKey(workspaceId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as StoredGraphLayout
  } catch {
    return null
  }
}

export function mergeStoredLayout(
  computed: Map<string, GraphPosition>,
  stored: StoredGraphLayout | null,
): Map<string, GraphPosition> {
  if (!stored) return computed
  const merged = new Map(computed)
  for (const [id, position] of Object.entries(stored)) {
    if (
      merged.has(id)
      && typeof position?.x === 'number'
      && typeof position?.y === 'number'
      && Number.isFinite(position.x)
      && Number.isFinite(position.y)
    ) {
      merged.set(id, { x: position.x, y: position.y })
    }
  }
  return merged
}
