import type {
  GraphEdge,
  KnowledgeCard,
  KnowledgeCardKind,
  KnowledgeSearchDocumentType,
  KnowledgeSearchHit,
  KnowledgeTruthSnapshot,
  MemoryFact,
  WikiPage,
} from './knowledge'

const SUMMARY_MAX_LENGTH = 240

const KIND_BY_TYPE: Record<KnowledgeSearchDocumentType, KnowledgeCardKind> = {
  'memory-fact': 'fact',
  'fact-candidate': 'fact',
  'wiki-patch': 'wiki',
  'wiki-page': 'wiki',
  observation: 'observation',
  'graph-candidate': 'graph',
  'graph-edge': 'graph',
}

function truncateSummary(value: string, maxLength = SUMMARY_MAX_LENGTH): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

export function toKnowledgeCard(hit: KnowledgeSearchHit): KnowledgeCard {
  const score = hit.score ?? hit.bm25Score ?? 0
  const status =
    hit.status ?? (hit.type === 'fact-candidate' ? 'proposed' : undefined)

  return {
    id: hit.id,
    kind: KIND_BY_TYPE[hit.type],
    title: hit.title,
    summary: truncateSummary(hit.content ?? ''),
    score,
    tags: hit.tags ?? [],
    workspaceId: hit.workspaceId || undefined,
    workspacePath: hit.workspacePath || undefined,
    sourceRefs: {
      observationIds: hit.sourceObservationIds ?? [],
      fileRefs: hit.fileRefs ?? [],
    },
    createdAt: hit.createdAt || undefined,
    status,
    rawType: hit.type,
  }
}

export function toKnowledgeCards(hits: KnowledgeSearchHit[]): KnowledgeCard[] {
  return hits.map(toKnowledgeCard)
}

function factToKnowledgeCard(fact: MemoryFact): KnowledgeCard {
  return {
    id: fact.id,
    kind: 'fact',
    title: fact.content,
    summary: fact.concepts.join(' - '),
    score: fact.confidence,
    tags: fact.tags,
    workspaceId: fact.provenance.workspaceId,
    workspacePath: fact.provenance.workspacePath,
    sourceRefs: {
      observationIds: fact.provenance.sourceObservationIds,
      fileRefs: fact.provenance.fileRefs,
    },
    createdAt: fact.provenance.createdAt,
    status: 'active',
    rawType: 'memory-fact',
  }
}

function wikiPageToKnowledgeCard(page: WikiPage): KnowledgeCard {
  return {
    id: page.slug,
    kind: 'wiki',
    title: page.title,
    summary: truncateSummary(page.markdown),
    score: 1,
    tags: page.tags,
    workspaceId: page.workspaceId,
    sourceRefs: { observationIds: [], fileRefs: [] },
    createdAt: page.updatedAt,
  }
}

function graphEdgeToKnowledgeCard(edge: GraphEdge): KnowledgeCard {
  return {
    id: edge.id,
    kind: 'graph',
    title: `${edge.from} -> ${edge.to}`,
    summary: edge.type,
    score: edge.confidence,
    tags: [edge.type],
    workspaceId: edge.workspaceId,
    sourceRefs: { observationIds: [], fileRefs: [] },
    createdAt: edge.createdAt,
  }
}

export function truthSnapshotToKnowledgeCards(
  snapshot: KnowledgeTruthSnapshot,
): KnowledgeCard[] {
  return sortKnowledgeCards([
    ...snapshot.facts.map(factToKnowledgeCard),
    ...snapshot.wikiPages.map(wikiPageToKnowledgeCard),
    ...snapshot.graphEdges.map(graphEdgeToKnowledgeCard),
  ])
}

/** Prefer active status, then higher score. */
export function sortKnowledgeCards(cards: KnowledgeCard[]): KnowledgeCard[] {
  return [...cards].sort((a, b) => {
    const aActive = a.status === 'active' ? 1 : 0
    const bActive = b.status === 'active' ? 1 : 0
    if (aActive !== bActive) return bActive - aActive
    return b.score - a.score
  })
}
