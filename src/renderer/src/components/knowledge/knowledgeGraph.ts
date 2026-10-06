import type {
  Derivation,
  FactKind,
  GraphRelationType,
  MemoryFact,
  WikiPage,
} from '../../../../shared/knowledge'
import type { InspectorRecord } from './KnowledgeWorkbench'
import type { KnowledgeWorkbenchSnapshot } from '../../services/knowledge'

// Note: the main graph projects published Wiki revisions; evidence is a separate read-only view — see .agents/notes/2026-10-06-knowledge-review-status-audit-plan--76ef32d1.md

export type KnowledgeGraphNodeKind = 'fact' | 'proposal' | 'wiki' | 'entity' | 'observation'

export interface KnowledgeGraphNode {
  id: string
  record?: InspectorRecord
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
  type: GraphRelationType | 'references'
  /** True when composed from provenance/evidence fields rather than stored. */
  synthetic: boolean
  reason?: string
  confidence?: number
}

export interface KnowledgeGraphView {
  nodes: KnowledgeGraphNode[]
  edges: KnowledgeGraphEdge[]
  /** True when entity aggregation / node cap dropped records. */
  truncated: boolean
  totalNodes: number
  diagnostics: GraphDiagnostic[]
}

export const KNOWLEDGE_GRAPH_NODE_LIMIT = 500

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


export interface GraphEvidence {
  id: string
  workspaceId: string
  status: 'available' | 'unavailable' | 'revoked'
  content?: string
}
export interface GraphDiagnostic {
  status: 'missing' | 'ambiguous' | 'changed' | 'stale' | 'invalid' | 'unverified' | 'not-loaded' | 'unavailable' | 'revoked'
  target: string
}
export interface GraphBuildOptions {
  /** A Wiki-rooted evidence view replaces, rather than mixes into, the main graph. */
  traceWikiId?: string
  expandedEvidence?: string[]
  evidence?: GraphEvidence[]
  nodeLimit?: number
}
export function graphWikiId(page: Pick<WikiPage, 'workspaceId' | 'slug'>): string {
  return `wiki:${JSON.stringify([page.workspaceId, page.slug])}`
}
export function graphSourceId(kind: 'fact' | 'observation' | 'entity', workspaceId: string, id: string): string {
  return `${kind}:${JSON.stringify([workspaceId, id])}`
}
export function publishedGraphPages(snapshot: KnowledgeWorkbenchSnapshot): WikiPage[] {
  const pages = snapshot.wikiPages ?? []
  const counts = new Map<string, number>()
  for (const page of pages) counts.set(graphWikiId(page), (counts.get(graphWikiId(page)) ?? 0) + 1)
  return pages.filter(page => page.status === 'published' && page.freshness !== 'stale'
    && page.workspaceId && page.workspaceId !== 'user' && counts.get(graphWikiId(page)) === 1)
    .sort((a, b) => graphWikiId(a).localeCompare(graphWikiId(b)))
}

/** Build all endpoints before edges. Only host-checked Wiki relations enter the main view. */
export function buildKnowledgeGraphView(snapshot: KnowledgeWorkbenchSnapshot, options: GraphBuildOptions = {}): KnowledgeGraphView {
  const nodes = new Map<string, KnowledgeGraphNode>()
  const edges = new Map<string, KnowledgeGraphEdge>()
  const diagnostics: GraphDiagnostic[] = []
  const pages = publishedGraphPages(snapshot)
  const diagnose = (status: GraphDiagnostic['status'], target: string) => diagnostics.push({ status, target })
  const addEdge = (edge: KnowledgeGraphEdge) => { edges.set(edge.id, edge) }
  const wikiNode = (page: WikiPage): KnowledgeGraphNode => ({
    id: graphWikiId(page), kind: 'wiki', label: page.title, workspaceId: page.workspaceId,
    evidenceIds: [], fileRefs: [], status: 'active', createdAt: page.updatedAt,
    record: { id: JSON.stringify([page.workspaceId, page.slug]), pageSlug: page.slug, title: page.title,
      body: page.markdown, tags: page.tags, sourceIds: [], fileRefs: [], kind: 'wiki',
      workspaceId: page.workspaceId, status: 'active', createdAt: page.updatedAt },
  })
  if (!options.traceWikiId) {
    for (const page of pages) nodes.set(graphWikiId(page), wikiNode(page))
    for (const page of snapshot.wikiPages ?? []) {
      if (page.workspaceId === 'user') continue
      const matches = (snapshot.wikiPages ?? []).filter(other => graphWikiId(other) === graphWikiId(page))
      if (matches.length > 1) diagnose('ambiguous', page.title)
      else if (page.status === 'published' && page.freshness === 'stale') diagnose('stale', page.title)
    }
    for (const page of pages) for (const relation of page.relations ?? []) {
      const from = graphWikiId(page), to = graphWikiId(relation.target)
      const target = pages.find(other => graphWikiId(other) === to)
      const issue = page.relationIssues?.find(item => item.targetSlug === relation.target.slug && item.type === relation.type)
      const status = relation.target.workspaceId !== page.workspaceId || from === to ? 'invalid'
        : issue?.status ?? (!target ? 'missing' : target.version !== relation.target.version ? 'changed'
          : page.relationIssues === undefined ? 'unverified' : undefined)
      if (status) { diagnose(status, `${page.title} → ${relation.target.title}`); continue }
      addEdge({ id: JSON.stringify([from, relation.type, to]), from, to, type: relation.type,
        synthetic: false, reason: relation.reason })
    }
  } else {
    const page = pages.find(item => graphWikiId(item) === options.traceWikiId)
    if (!page) diagnose('missing', options.traceWikiId)
    else {
      const wikiId = graphWikiId(page), workspaceId = page.workspaceId
      nodes.set(wikiId, wikiNode(page))
      const facts = (snapshot.truthFacts ?? []).filter(fact => fact.provenance.workspaceId === workspaceId && fact.scope !== 'user')
      const selected = new Map<string, MemoryFact>()
      const visit = (id: string) => {
        if (selected.has(id)) return
        const matches = facts.filter(fact => fact.id === id)
        if (matches.length !== 1) { diagnose(matches.length ? 'ambiguous' : 'missing', id); return }
        const fact = matches[0]!
        selected.set(id, fact)
        if (fact.supersedes) visit(fact.supersedes)
      }
      page.sourceFactIds.forEach(visit)
      for (const fact of selected.values()) {
        const id = graphSourceId('fact', workspaceId, fact.id)
        nodes.set(id, { id, kind: 'fact', label: fact.content, workspaceId, status: fact.status,
          factKind: fact.kind, confidence: fact.confidence, evidenceIds: [...fact.provenance.sourceObservationIds],
          fileRefs: [...new Set([...fact.files, ...fact.provenance.fileRefs])], createdAt: fact.provenance.createdAt,
          record: { id: fact.id, title: fact.content.split('\n')[0]!, body: fact.content,
            tags: fact.tags, sourceIds: fact.provenance.sourceObservationIds, fileRefs: fact.files,
            kind: 'fact', workspaceId, status: fact.status, factKind: fact.kind } })
      }
      // File/concept identity includes its workspace. It is a structural citation, never a new proposal.
      for (const fact of selected.values()) {
        const from = graphSourceId('fact', workspaceId, fact.id)
        for (const name of new Set([...fact.files, ...fact.provenance.fileRefs, ...fact.concepts])) {
          if (!name.trim()) continue
          const to = graphSourceId('entity', workspaceId, name)
          const isFile = fact.files.includes(name) || fact.provenance.fileRefs.includes(name)
          const entity = nodes.get(to)
          if (!entity) nodes.set(to, { id: to, kind: 'entity', label: name, workspaceId, evidenceIds: [], fileRefs: isFile ? [name] : [] })
          else if (isFile) entity.fileRefs = [name]
          addEdge({ id: JSON.stringify([from, 'mentions', to]), from, to, type: 'mentions', synthetic: true })
        }
      }
      for (const fact of selected.values()) {
        const id = graphSourceId('fact', workspaceId, fact.id)
        if (page.sourceFactIds.includes(fact.id)) addEdge({ id: JSON.stringify([wikiId, id]), from: wikiId, to: id, type: 'derived_from', synthetic: true })
        if (fact.supersedes) {
          const to = graphSourceId('fact', workspaceId, fact.supersedes)
          if (nodes.has(to)) addEdge({ id: JSON.stringify([id, 'supersedes', to]), from: id, to, type: 'supersedes', synthetic: true })
        }
      }
      // Resolve legacy edges only against this page's evidence, after entities exist.
      const resolve = (ref: string) => {
        const matches = [...nodes.values()].filter(node => node.id === ref
          || node.kind === 'fact' && (node.record?.id === ref || `fact:${node.record?.id}` === ref)
          || node.kind === 'entity' && (node.label === ref || `entity:${node.label}` === ref))
        return matches.length === 1 ? matches[0]!.id : undefined
      }
      for (const edge of snapshot.truthEdges ?? []) {
        if (edge.workspaceId !== workspaceId) continue
        const from = resolve(edge.from), to = resolve(edge.to)
        if (!from && !to) continue
        if (!from || !to) { diagnose('missing', !from ? edge.from : edge.to); continue }
        addEdge({ id: `stored:${edge.id}`, from, to, type: edge.type, synthetic: false, confidence: edge.confidence })
      }
      for (const node of [...nodes.values()]) {
        if (!options.expandedEvidence?.includes(node.id)) continue
        for (const id of new Set(node.evidenceIds)) {
          const evidence = options.evidence?.find(item => item.id === id && item.workspaceId === workspaceId)
          if (!evidence) { diagnose('not-loaded', id); continue }
          if (evidence.status !== 'available') { diagnose(evidence.status, id); continue }
          const to = graphSourceId('observation', workspaceId, id)
          nodes.set(to, { id: to, kind: 'observation', label: evidence.content ?? id, workspaceId, evidenceIds: [], fileRefs: [],
            record: { id, title: id, body: evidence.content ?? '', tags: [], sourceIds: [id], fileRefs: [], workspaceId, status: 'active' } })
          addEdge({ id: JSON.stringify([node.id, to]), from: node.id, to, type: 'derived_from', synthetic: true })
        }
      }
    }
  }
  const priority = { wiki: 0, fact: 1, entity: 2, observation: 3, proposal: 4 }
  const ordered = [...nodes.values()].sort((a, b) => priority[a.kind] - priority[b.kind] || a.id.localeCompare(b.id))
  const kept = ordered.slice(0, Math.max(0, options.nodeLimit ?? KNOWLEDGE_GRAPH_NODE_LIMIT))
  const keptIds = new Set(kept.map(node => node.id))
  return { nodes: kept, edges: [...edges.values()].filter(edge => keptIds.has(edge.from) && keptIds.has(edge.to)).sort((a, b) => a.id.localeCompare(b.id)),
    totalNodes: nodes.size, truncated: kept.length < nodes.size,
    diagnostics: [...new Map(diagnostics.map(item => [JSON.stringify(item), item])).values()] }
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
  if (node.record) return node.record
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
    body: edge.reason ?? (edge.synthetic ? `synthetic ${edge.type}` : `stored ${edge.type}`),
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
