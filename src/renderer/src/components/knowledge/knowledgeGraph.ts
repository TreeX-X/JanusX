import type {
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

/** Obsidian-style dot caption: short first-line label shown under the dot. */
export const GRAPH_NODE_CAPTION_LENGTH = 24

export function graphNodeCaption(label: string, max: number = GRAPH_NODE_CAPTION_LENGTH): string {
  const line = label.split('\n').map((entry) => entry.trim()).find((entry) => entry.length > 0) ?? ''
  return line.length <= max ? line : `${line.slice(0, Math.max(0, max - 1))}…`
}

/** Obsidian-style dot diameter (px): grows with connection degree, capped. */
export const GRAPH_DOT_BASE_SIZE = 10
export const GRAPH_DOT_SIZE_PER_DEGREE = 2
export const GRAPH_DOT_MAX_SIZE = 22

export function graphNodeDotSize(degree: number): number {
  return Math.min(GRAPH_DOT_MAX_SIZE, GRAPH_DOT_BASE_SIZE + Math.max(0, Math.floor(degree)) * GRAPH_DOT_SIZE_PER_DEGREE)
}

export interface GraphBuildOptions {
  /** Observation node ids to expand one hop (evidence demand-loading). */
  expandedEvidence?: string[]
  nodeLimit?: number
}

function truncateLabel(value: string): string {
  const line = value.split('\n').map((entry) => entry.trim()).find((entry) => entry.length > 0) ?? ''
  return line.length <= LABEL_MAX_LENGTH ? line : `${line.slice(0, LABEL_MAX_LENGTH - 1)}…`
}

/**
 * Builds the settled-knowledge graph: active truth facts, wiki pages, stored
 * edges, and entity nodes for concepts/files cited by ≥ 2 facts.
 * Review-stage proposals intentionally stay out — the graph is the settled
 * map, the Inbox is the gate.
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

  // Entity nodes: concepts/files cited by ≥ 2 settled facts.
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
    if (node.kind !== 'fact') continue
    for (const ref of node.fileRefs) cite(node.id, ref, true)
  }
  // Concepts live on settled facts; re-read them from the snapshot.
  for (const fact of facts) {
    for (const concept of fact.concepts) cite(`fact:${fact.id}`, concept, false)
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

/** Over-limit: keep settled facts first, then wiki/entities, observations last. */
function prioritizeNodes(nodes: KnowledgeGraphNode[], limit: number): KnowledgeGraphNode[] {
  return [...nodes]
    .sort((a, b) => NODE_KIND_PRIORITY[a.kind] - NODE_KIND_PRIORITY[b.kind] || (a.id < b.id ? -1 : 1))
    .slice(0, Math.max(0, limit))
}

/** Obsidian-style spread layout: deterministic force relaxation per connected
 * component (circular seed, fixed-iteration repulsion + springs + gravity).
 * No randomness anywhere, so the same snapshot always yields the same map;
 * renderer-side stored positions still overlay on top (user drags win). */
export interface GraphPosition {
  x: number
  y: number
}

export const GRAPH_SPREAD_ITERATIONS = 60
export const GRAPH_SPREAD_TARGET_EDGE = 130
export const GRAPH_SPREAD_REPULSION = 9000
export const GRAPH_SPREAD_MAX_PUSH = 40
export const GRAPH_SPREAD_GRAVITY = 0.02
export const GRAPH_SPREAD_COMPONENT_GAP = 260

export function layoutKnowledgeGraph(
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
): Map<string, GraphPosition> {
  const ids = nodes.map((node) => node.id).sort()
  const neighbors = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const edge of edges) {
    if (edge.from === edge.to || !neighbors.has(edge.from) || !neighbors.has(edge.to)) continue
    neighbors.get(edge.from)!.push(edge.to)
    neighbors.get(edge.to)!.push(edge.from)
  }
  for (const list of neighbors.values()) list.sort()

  // Connected components in deterministic seed order.
  const componentOf = new Map<string, number>()
  const components: string[][] = []
  for (const id of ids) {
    if (componentOf.has(id)) continue
    const members: string[] = []
    const stack = [id]
    componentOf.set(id, components.length)
    while (stack.length > 0) {
      const current = stack.pop()!
      members.push(current)
      for (const next of neighbors.get(current)!) {
        if (!componentOf.has(next)) {
          componentOf.set(next, components.length)
          stack.push(next)
        }
      }
    }
    members.sort()
    components.push(members)
  }
  // Largest cluster first so the eye lands on the dense region.
  components.sort((a, b) => b.length - a.length || (a[0]! < b[0]! ? -1 : 1))

  const positions = new Map<string, GraphPosition>()
  let cursorX = 0
  for (const members of components) {
    const count = members.length
    const radius = count === 1 ? 0 : Math.max(90, count * 26)
    for (let index = 0; index < count; index++) {
      const angle = (2 * Math.PI * index) / count
      positions.set(members[index]!, {
        x: cursorX + radius + Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      })
    }
    const centerX = cursorX + radius
    for (let iter = 0; iter < GRAPH_SPREAD_ITERATIONS; iter++) {
      for (let i = 0; i < count; i++) {
        const id = members[i]!
        const point = positions.get(id)!
        let fx = 0
        let fy = 0
        for (let j = 0; j < count; j++) {
          if (i === j) continue
          const other = positions.get(members[j]!)!
          let dx = point.x - other.x
          let dy = point.y - other.y
          if (dx === 0 && dy === 0) {
            // Deterministic nudge so stacked seeds separate.
            dx = (i < j ? -1 : 1) * 0.5
            dy = 0.5
          }
          const dist = Math.sqrt(dx * dx + dy * dy)
          const push = Math.min(GRAPH_SPREAD_REPULSION / (dist * dist), GRAPH_SPREAD_MAX_PUSH)
          fx += (dx / dist) * push
          fy += (dy / dist) * push
        }
        for (const next of neighbors.get(id)!) {
          const other = positions.get(next)!
          if (!other) continue
          const dx = other.x - point.x
          const dy = other.y - point.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const pull = (dist - GRAPH_SPREAD_TARGET_EDGE) * 0.05
          fx += (dx / dist) * pull
          fy += (dy / dist) * pull
        }
        fx += (centerX - point.x) * GRAPH_SPREAD_GRAVITY
        fy -= point.y * GRAPH_SPREAD_GRAVITY
        point.x += fx
        point.y += fy
      }
    }
    cursorX += radius * 2 + GRAPH_SPREAD_COMPONENT_GAP
  }
  for (const [id, point] of positions) {
    positions.set(id, { x: Math.round(point.x), y: Math.round(point.y) })
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
    // Only truth-backed nodes (fact/wiki) carry a revocable kind; other
    // settled kinds (entity/observation) are read-only in the inspector.
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
  // v2: force-spread era. v1 stored BFS-layered coordinates (vertical stacks
  // for edgeless graphs) and must not override the new computed layout.
  return `janusx:knowledge-graph-layout:v2:${workspaceId || 'global'}`
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
