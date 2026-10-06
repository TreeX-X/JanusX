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

export interface GraphPosition {
  x: number
  y: number
}

export const GRAPH_CARD_WIDTH = 208
export const GRAPH_CARD_HEIGHT = 84
export const GRAPH_LOCAL_NEIGHBORS = 12

/** A bounded, explicit reading scope; selection never changes its root. */
export function localKnowledgeGraph(nodes: KnowledgeGraphNode[], edges: KnowledgeGraphEdge[], root: string) {
  const neighbors = new Set<string>()
  for (const edge of edges) {
    if (edge.from === root && edge.to !== root) neighbors.add(edge.to)
    if (edge.to === root && edge.from !== root) neighbors.add(edge.from)
  }
  const ids = new Set([root, ...[...neighbors].sort().slice(0, GRAPH_LOCAL_NEIGHBORS)])
  return { nodes: nodes.filter(node => ids.has(node.id)), totalNeighbors: neighbors.size }
}

/** Choose the best-connected page once per snapshot, independently of detail selection. */
export function defaultGraphRoot(nodes: KnowledgeGraphNode[], edges: KnowledgeGraphEdge[]): string | undefined {
  const degree = new Map<string, number>()
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1)
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1)
  }
  return [...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.id.localeCompare(b.id))[0]?.id
}

/** Center the reading root so a narrow viewport can pan without losing its anchor. */
export function layoutLocalKnowledgeGraph(nodes: KnowledgeGraphNode[], root: string): Map<string, GraphPosition> {
  const neighbors = nodes.filter(node => node.id !== root).sort((a, b) => a.id.localeCompare(b.id))
  const rows = Math.ceil(neighbors.length / 2)
  const positions = new Map<string, GraphPosition>()
  if (nodes.some(node => node.id === root)) positions.set(root, { x: 340, y: Math.max(0, rows - 1) * 60 })
  neighbors.forEach((node, index) => positions.set(node.id, { x: index % 2 === 0 ? 680 : 0, y: Math.floor(index / 2) * 120 }))
  return positions
}

// Note: readable cards use bounded component grids and two-dimensional packing — see .agents/notes/2026-10-06-knowledge-review-status-audit-plan--76ef32d1.md
export function layoutKnowledgeGraph(nodes: KnowledgeGraphNode[], edges: KnowledgeGraphEdge[]): Map<string, GraphPosition> {
  const ids = nodes.map(node => node.id).sort()
  const neighbors = new Map<string, Set<string>>(ids.map(id => [id, new Set()]))
  for (const edge of edges) {
    if (edge.from === edge.to || !neighbors.has(edge.from) || !neighbors.has(edge.to)) continue
    neighbors.get(edge.from)!.add(edge.to)
    neighbors.get(edge.to)!.add(edge.from)
  }
  const visited = new Set<string>()
  const components: string[][] = []
  for (const id of ids) {
    if (visited.has(id)) continue
    const queue = [id]
    visited.add(id)
    for (let index = 0; index < queue.length; index++) {
      for (const next of [...neighbors.get(queue[index]!)!].sort()) {
        if (!visited.has(next)) { visited.add(next); queue.push(next) }
      }
    }
    components.push(queue)
  }
  components.sort((a, b) => b.length - a.length || a[0]!.localeCompare(b[0]!))
  const stepX = GRAPH_CARD_WIDTH + 132, stepY = GRAPH_CARD_HEIGHT + 80, gap = 96
  const boxes = components.map(members => {
    const columns = Math.ceil(Math.sqrt(members.length))
    return { members, columns, width: (columns - 1) * stepX + GRAPH_CARD_WIDTH,
      height: (Math.ceil(members.length / columns) - 1) * stepY + GRAPH_CARD_HEIGHT }
  })
  const area = boxes.reduce((sum, box) => sum + (box.width + gap) * (box.height + gap), 0)
  const rowWidth = Math.max(0, ...boxes.map(box => box.width), Math.sqrt(area * 1.5))
  const positions = new Map<string, GraphPosition>()
  let x = 0, y = 0, rowHeight = 0
  for (const box of boxes) {
    if (x > 0 && x + box.width > rowWidth) { x = 0; y += rowHeight + gap; rowHeight = 0 }
    box.members.forEach((id, index) => positions.set(id, {
      x: x + (index % box.columns) * stepX, y: y + Math.floor(index / box.columns) * stepY,
    }))
    x += box.width + gap
    rowHeight = Math.max(rowHeight, box.height)
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

export function graphLayoutStorageKey(workspaceId: string, scope = 'overview'): string {
  // Card dimensions invalidate dot coordinates; local, overview and trace drags stay separate.
  return `janusx:knowledge-graph-layout:v3:${JSON.stringify([workspaceId || 'global', scope])}`
}

export type StoredGraphLayout = Record<string, GraphPosition>

export function loadStoredLayout(workspaceId: string, scope = 'overview'): StoredGraphLayout | null {
  try {
    const raw = localStorage.getItem(graphLayoutStorageKey(workspaceId, scope))
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
