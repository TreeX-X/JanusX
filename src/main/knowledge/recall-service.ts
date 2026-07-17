import { readFile } from 'fs/promises'
import { join } from 'path'
import type {
  CandidateFact,
  CandidateGraphEdge,
  CandidateWikiPatch,
  GraphEdge,
  KnowledgeContextItem,
  KnowledgeSearchHit,
  KnowledgeSearchIndexStats,
  KnowledgeSearchQuery,
  KnowledgeTruthSnapshot,
  MemoryFact,
  Observation,
  WikiPage,
} from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { knowledgeObservationService } from './observation-service'
import { Bm25Index } from './search/bm25'
import { knowledgeTruthService } from './truth-service'

const OBSERVATION_INDEX_LIMIT = 200

export type KnowledgeRecallLayer = 'truth' | 'governance'

export interface KnowledgeRecallRequest extends Omit<KnowledgeSearchQuery, 'limit'> {
  layer: KnowledgeRecallLayer
  allowGlobal?: boolean
  requireWorkspace?: boolean
}

export interface KnowledgeRecallDocument {
  key: string
  hit: KnowledgeSearchHit
  contextItem?: Omit<KnowledgeContextItem, 'score'>
}

export interface KnowledgeRecallResult {
  documents: Array<KnowledgeRecallDocument & {
    score: number
    scoreExplanation: NonNullable<KnowledgeSearchHit['scoreExplanation']>
  }>
  indexStats: KnowledgeSearchIndexStats
  degraded?: { reason: 'empty-query' | 'missing-workspace' }
}

interface RecallSources {
  listTruth(): Promise<KnowledgeTruthSnapshot>
  listObservations(): Promise<Observation[]>
  resolveObservationContent(observation: Observation): Promise<string>
  readCandidates<T>(relativePath: string): Promise<T[]>
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizeList(values?: string[]): string[] {
  if (!values?.length) return []
  const seen = new Set<string>()
  return values.flatMap((value) => {
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) return []
    seen.add(key)
    return [trimmed]
  })
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/^#/, '')
}

function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function documentKey(hit: Pick<KnowledgeSearchHit, 'workspaceId' | 'type' | 'id'>): string {
  return JSON.stringify([hit.workspaceId, hit.type, hit.id])
}

function searchText(hit: KnowledgeSearchHit): string {
  return [
    hit.title,
    hit.content,
    hit.tags.join(' '),
    hit.fileRefs.join(' '),
    hit.sourceObservationIds.join(' '),
  ].join('\n')
}

function normalizedPhrase(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ')
}

function lexicalExplanation(hit: KnowledgeSearchHit, query: string, bm25: number) {
  const phrase = normalizedPhrase(query)
  const title = normalizedPhrase(hit.title)
  const body = normalizedPhrase(hit.content)
  return {
    bm25,
    exactTitle: title === phrase ? 3 : 0,
    titlePhrase: title !== phrase && title.includes(phrase) ? 1.5 : 0,
    bodyPhrase: body.includes(phrase) ? 0.5 : 0,
  }
}

function matchesFilters(document: KnowledgeRecallDocument, request: KnowledgeRecallRequest): boolean {
  const { hit } = document
  if (!request.allowGlobal) {
    if (request.workspaceId && hit.workspaceId !== request.workspaceId) return false
    if (request.workspaceName && hit.workspaceName !== request.workspaceName) return false
    if (request.workspacePath && normalizePath(hit.workspacePath) !== normalizePath(request.workspacePath)) {
      return false
    }
  }
  if (request.source && hit.source !== request.source) return false
  if (request.types?.length && !request.types.includes(hit.type)) return false

  const tags = normalizeList(request.tags).map(normalizeTag)
  const availableTags = new Set(hit.tags.map(normalizeTag))
  if (!tags.every((tag) => availableTags.has(tag))) return false

  const files = normalizeList(request.files).map(normalizePath)
  const availableFiles = hit.fileRefs.map(normalizePath)
  return files.every((file) =>
    availableFiles.some((available) =>
      available === file || available.endsWith(file) || available.includes(file),
    ),
  )
}

function observationDocument(observation: Observation, content: string): KnowledgeRecallDocument {
  const hit: KnowledgeSearchHit = {
    id: observation.id,
    type: 'observation',
    title: observation.summary ?? content.split('\n')[0] ?? observation.id,
    content,
    score: 0,
    bm25Score: 0,
    workspaceId: observation.workspaceId,
    workspaceName: observation.workspaceName,
    workspacePath: observation.workspacePath,
    source: observation.source,
    tags: observation.tags,
    fileRefs: observation.fileRefs,
    sourceObservationIds: [observation.id],
    createdAt: observation.createdAt,
    status: 'active',
  }
  return { key: documentKey(hit), hit }
}

function factCandidateDocument(candidate: CandidateFact): KnowledgeRecallDocument {
  const { fact } = candidate
  const { provenance } = fact
  const hit: KnowledgeSearchHit = {
    id: candidate.id,
    type: 'fact-candidate',
    title: fact.content,
    content: fact.concepts.join(' / '),
    score: 0,
    bm25Score: 0,
    workspaceId: provenance.workspaceId,
    workspaceName: provenance.workspaceName,
    workspacePath: provenance.workspacePath,
    source: provenance.source,
    tags: fact.tags,
    fileRefs: Array.from(new Set([...fact.files, ...provenance.fileRefs])),
    sourceObservationIds: provenance.sourceObservationIds,
    createdAt: provenance.createdAt,
    confidence: fact.confidence,
    status: candidate.status,
  }
  return { key: documentKey(hit), hit }
}

function wikiPatchDocument(patch: CandidateWikiPatch): KnowledgeRecallDocument {
  const { provenance } = patch
  const hit: KnowledgeSearchHit = {
    id: patch.id,
    type: 'wiki-patch',
    title: patch.title,
    content: `${patch.pageSlug}\n${patch.rationale}\n${patch.patchMarkdown}`,
    score: 0,
    bm25Score: 0,
    workspaceId: provenance.workspaceId,
    workspaceName: provenance.workspaceName,
    workspacePath: provenance.workspacePath,
    source: provenance.source,
    tags: [patch.pageSlug],
    fileRefs: provenance.fileRefs,
    sourceObservationIds: provenance.sourceObservationIds,
    createdAt: provenance.createdAt,
    confidence: patch.confidence,
    status: patch.status,
  }
  return { key: documentKey(hit), hit }
}

function graphCandidateDocument(candidate: CandidateGraphEdge): KnowledgeRecallDocument {
  const { edge } = candidate
  const hit: KnowledgeSearchHit = {
    id: candidate.id,
    type: 'graph-candidate',
    title: `${edge.from} -> ${edge.to}`,
    content: edge.type,
    score: 0,
    bm25Score: 0,
    workspaceId: edge.workspaceId,
    workspaceName: edge.workspaceId,
    workspacePath: '',
    source: 'system',
    tags: [edge.type],
    fileRefs: [],
    sourceObservationIds: edge.sourceFactIds,
    createdAt: edge.createdAt,
    confidence: edge.confidence,
    status: candidate.status,
  }
  return { key: documentKey(hit), hit }
}

function factDocument(fact: MemoryFact): KnowledgeRecallDocument {
  const { provenance } = fact
  const hit: KnowledgeSearchHit = {
    id: fact.id,
    type: 'memory-fact',
    title: fact.content,
    content: fact.concepts.join(' / '),
    score: 0,
    bm25Score: 0,
    workspaceId: provenance.workspaceId,
    workspaceName: provenance.workspaceName,
    workspacePath: provenance.workspacePath,
    source: provenance.source,
    tags: fact.tags,
    fileRefs: Array.from(new Set([...fact.files, ...provenance.fileRefs])),
    sourceObservationIds: provenance.sourceObservationIds,
    createdAt: provenance.createdAt,
    confidence: fact.confidence,
    status: fact.status,
  }
  return {
    key: documentKey(hit),
    hit,
    contextItem: {
      id: fact.id,
      kind: 'fact',
      title: fact.concepts.join(' / ') || 'Fact',
      content: fact.content,
      workspaceId: provenance.workspaceId,
      workspacePath: provenance.workspacePath,
      provenance: {
        observationIds: provenance.sourceObservationIds,
        factIds: [fact.id],
        fileRefs: provenance.fileRefs,
        source: provenance.source,
        actor: provenance.actor,
        createdAt: provenance.createdAt,
      },
    },
  }
}

function wikiDocument(page: WikiPage): KnowledgeRecallDocument {
  const hit: KnowledgeSearchHit = {
    id: page.slug,
    type: 'wiki-page',
    title: page.title,
    content: page.markdown,
    score: 0,
    bm25Score: 0,
    workspaceId: page.workspaceId,
    workspaceName: page.workspaceId,
    workspacePath: '',
    source: 'system',
    tags: page.tags,
    fileRefs: [],
    sourceObservationIds: [],
    createdAt: page.updatedAt,
    status: 'active',
  }
  return {
    key: documentKey(hit),
    hit,
    contextItem: {
      id: page.slug,
      kind: 'wiki',
      title: page.title,
      content: page.markdown,
      workspaceId: page.workspaceId,
      provenance: {
        observationIds: [],
        factIds: page.sourceFactIds,
        fileRefs: [],
        createdAt: page.updatedAt,
      },
    },
  }
}

function graphDocument(edge: GraphEdge): KnowledgeRecallDocument {
  const hit: KnowledgeSearchHit = {
    id: edge.id,
    type: 'graph-edge',
    title: `${edge.from} -> ${edge.to}`,
    content: `${edge.from} ${edge.type} ${edge.to}`,
    score: 0,
    bm25Score: 0,
    workspaceId: edge.workspaceId,
    workspaceName: edge.workspaceId,
    workspacePath: '',
    source: 'system',
    tags: [edge.type],
    fileRefs: [],
    sourceObservationIds: [],
    createdAt: edge.createdAt,
    confidence: edge.confidence,
    status: 'active',
  }
  return {
    key: documentKey(hit),
    hit,
    contextItem: {
      id: edge.id,
      kind: 'graph',
      title: `${edge.from} -> ${edge.to}`,
      content: `${edge.from} ${edge.type} ${edge.to}`,
      workspaceId: edge.workspaceId,
      provenance: {
        observationIds: [],
        factIds: edge.sourceFactIds,
        fileRefs: [],
        createdAt: edge.createdAt,
      },
    },
  }
}

function truthDocuments(snapshot: KnowledgeTruthSnapshot): KnowledgeRecallDocument[] {
  const documents = [
    ...snapshot.facts.map(factDocument),
    ...snapshot.wikiPages.map(wikiDocument),
    ...snapshot.graphEdges.map(graphDocument),
  ].sort((left, right) => {
    const keyOrder = compareText(left.key, right.key)
    if (keyOrder !== 0) return keyOrder
    const newestFirst = compareText(right.hit.createdAt, left.hit.createdAt)
    if (newestFirst !== 0) return newestFirst
    return compareText(left.hit.content, right.hit.content)
  })
  const unique = new Map<string, KnowledgeRecallDocument>()
  for (const document of documents) {
    if (!unique.has(document.key)) unique.set(document.key, document)
  }
  return [...unique.values()]
}

async function readJsonl<T>(relativePath: string): Promise<T[]> {
  try {
    const content = await readFile(join(knowledgeRootPath(), relativePath), 'utf8')
    return content.split('\n').flatMap((line) => {
      try {
        return line.trim() ? [JSON.parse(line) as T] : []
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

const defaultSources: RecallSources = {
  listTruth: () => knowledgeTruthService.list(),
  listObservations: () => knowledgeObservationService.list({ limit: OBSERVATION_INDEX_LIMIT }),
  resolveObservationContent: (observation) => knowledgeObservationService.resolveContent(observation),
  readCandidates: readJsonl,
}

export class KnowledgeRecallService {
  constructor(private readonly sources: RecallSources = defaultSources) {}

  async recall(request: KnowledgeRecallRequest): Promise<KnowledgeRecallResult> {
    const query = request.query.trim()
    if (!query) return this.emptyResult('empty-query')
    if (request.requireWorkspace && !request.allowGlobal && !request.workspaceId && !request.workspacePath) {
      return this.emptyResult('missing-workspace')
    }

    const documents = (await this.buildDocuments(request.layer))
      .filter((document) => matchesFilters(document, request))
    const index = new Bm25Index(documents.map((document) => ({
      id: document.key,
      text: searchText(document.hit),
    })))
    const byKey = new Map(documents.map((document) => [document.key, document]))
    const ranked = index.search(query)
      .sort((left, right) => right.score - left.score || compareText(left.id, right.id))
      .flatMap(({ id, score: bm25 }) => {
        const document = byKey.get(id)
        if (!document) return []
        const scoreExplanation = lexicalExplanation(document.hit, query, bm25)
        const score = Object.values(scoreExplanation).reduce((total, value) => total + value, 0)
        return [{ ...document, score, scoreExplanation }]
      })
      .sort((left, right) => right.score - left.score || compareText(left.key, right.key))
    return { documents: ranked, indexStats: index.stats() }
  }

  private emptyResult(
    reason: NonNullable<KnowledgeRecallResult['degraded']>['reason'],
  ): KnowledgeRecallResult {
    return {
      documents: [],
      indexStats: { documentCount: 0, termCount: 0, averageDocumentLength: 0 },
      degraded: { reason },
    }
  }

  private async buildDocuments(layer: KnowledgeRecallLayer): Promise<KnowledgeRecallDocument[]> {
    const truth = truthDocuments(await this.sources.listTruth())
    if (layer === 'truth') return truth

    const [observations, factCandidates, wikiPatches, graphCandidates] = await Promise.all([
      this.sources.listObservations(),
      this.sources.readCandidates<CandidateFact>('facts/candidates.jsonl'),
      this.sources.readCandidates<CandidateWikiPatch>('wiki/patches.jsonl'),
      this.sources.readCandidates<CandidateGraphEdge>('graph/candidates.jsonl'),
    ])
    const observationDocuments = await Promise.all(observations.map(async (observation) => {
      if (!observation.blobRef) return observationDocument(observation, observation.content)
      try {
        return observationDocument(observation, await this.sources.resolveObservationContent(observation))
      } catch {
        return observationDocument(observation, observation.contentPreview ?? observation.content)
      }
    }))
    return [
      ...observationDocuments,
      ...factCandidates.filter((candidate) => candidate.status === 'proposed').map(factCandidateDocument),
      ...wikiPatches.filter((candidate) => candidate.status === 'proposed').map(wikiPatchDocument),
      ...graphCandidates.filter((candidate) => candidate.status === 'proposed').map(graphCandidateDocument),
      ...truth,
    ]
  }
}

export const knowledgeRecallService = new KnowledgeRecallService()
