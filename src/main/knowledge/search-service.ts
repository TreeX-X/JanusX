import { readFile } from 'fs/promises'
import { join } from 'path'
import type {
  CandidateFact,
  CandidateGraphEdge,
  CandidateWikiPatch,
  KnowledgeSearchDocumentType,
  KnowledgeSearchHit,
  KnowledgeSearchQuery,
  KnowledgeSearchResult,
  KnowledgeSource,
  MemoryFact,
  Observation,
} from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { knowledgeContractService } from './contract-service'
import { knowledgeObservationService } from './observation-service'
import { Bm25Index, type Bm25Document } from './search/bm25'

const DEFAULT_SEARCH_LIMIT = 8
const MAX_SEARCH_LIMIT = 30
const OBSERVATION_INDEX_LIMIT = 200

interface SearchDocument {
  hit: KnowledgeSearchHit
  text: string
}

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_SEARCH_LIMIT
  return Math.max(1, Math.min(MAX_SEARCH_LIMIT, Math.trunc(limit as number)))
}

function normalizeText(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function normalizeList(values?: string[]): string[] {
  if (!values?.length) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/^#/, '')
}

function matchesTagFilter(recordTags: string[], filterTags: string[]): boolean {
  if (filterTags.length === 0) return true
  const available = new Set(recordTags.map(normalizeTag))
  return filterTags.every((tag) => available.has(normalizeTag(tag)))
}

function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, '/').toLowerCase()
}

function matchesFileFilter(recordFiles: string[], filterFiles: string[]): boolean {
  if (filterFiles.length === 0) return true
  const available = recordFiles.map(normalizePath)
  return filterFiles.every((filter) => {
    const needle = normalizePath(filter)
    return available.some((file) => file === needle || file.endsWith(needle) || file.includes(needle))
  })
}

function matchesWorkspace(hit: KnowledgeSearchHit, query: KnowledgeSearchQuery): boolean {
  if (query.workspaceId && hit.workspaceId !== query.workspaceId) return false
  if (query.workspaceName && hit.workspaceName !== query.workspaceName) return false
  if (query.workspacePath && hit.workspacePath !== query.workspacePath) return false
  return true
}

function matchesFilters(document: SearchDocument, query: KnowledgeSearchQuery): boolean {
  const tags = normalizeList(query.tags)
  const files = normalizeList(query.files)
  const types = query.types ?? []
  const hit = document.hit

  if (!matchesWorkspace(hit, query)) return false
  if (query.source && hit.source !== query.source) return false
  if (types.length > 0 && !types.includes(hit.type)) return false
  if (!matchesTagFilter(hit.tags, tags)) return false
  if (!matchesFileFilter(hit.fileRefs, files)) return false
  return true
}

function documentSearchText(hit: KnowledgeSearchHit): string {
  return [
    hit.title,
    hit.content,
    hit.tags.join(' '),
    hit.fileRefs.join(' '),
    hit.sourceObservationIds.join(' '),
  ].join('\n')
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

function buildCompactContext(hits: KnowledgeSearchHit[]): string {
  if (hits.length === 0) return ''

  return hits
    .slice(0, 8)
    .map((hit, index) => {
      const refs = hit.sourceObservationIds.length
        ? ` refs=${hit.sourceObservationIds.join(',')}`
        : ''
      const files = hit.fileRefs.length ? ` files=${hit.fileRefs.slice(0, 3).join(',')}` : ''
      return [
        `[${index + 1}] ${hit.type} score=${hit.score.toFixed(3)}${refs}${files}`,
        `title: ${truncate(hit.title, 140)}`,
        `content: ${truncate(hit.content, 360)}`,
      ].join('\n')
    })
    .join('\n\n')
}

async function readJsonl<T>(relativePath: string): Promise<T[]> {
  let content = ''
  try {
    content = await readFile(join(knowledgeRootPath(), relativePath), 'utf8')
  } catch {
    return []
  }

  const records: T[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      records.push(JSON.parse(trimmed) as T)
    } catch {
      // skip malformed historical lines
    }
  }
  return records
}

function observationToDocument(observation: Observation, content: string): SearchDocument {
  const title = observation.summary ?? content.split('\n')[0] ?? observation.id
  const hit: KnowledgeSearchHit = {
    id: observation.id,
    type: 'observation',
    title,
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

  return { hit, text: documentSearchText(hit) }
}

function factCandidateToDocument(candidate: CandidateFact): SearchDocument {
  const fact = candidate.fact
  const provenance = fact.provenance
  const hit: KnowledgeSearchHit = {
    id: candidate.id,
    type: 'fact-candidate',
    title: fact.content,
    content: fact.concepts.join(' · '),
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

  return { hit, text: documentSearchText(hit) }
}

function memoryFactToDocument(fact: MemoryFact): SearchDocument {
  const provenance = fact.provenance
  const hit: KnowledgeSearchHit = {
    id: fact.id,
    type: 'memory-fact',
    title: fact.content,
    content: fact.concepts.join(' · '),
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

  return { hit, text: documentSearchText(hit) }
}

function wikiPatchToDocument(patch: CandidateWikiPatch): SearchDocument {
  const provenance = patch.provenance
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

  return { hit, text: documentSearchText(hit) }
}

function graphCandidateToDocument(candidate: CandidateGraphEdge): SearchDocument {
  const edge = candidate.edge
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
    source: 'system' satisfies KnowledgeSource,
    tags: [edge.type],
    fileRefs: [],
    sourceObservationIds: edge.sourceFactIds,
    createdAt: edge.createdAt,
    confidence: edge.confidence,
    status: candidate.status,
  }

  return { hit, text: documentSearchText(hit) }
}

export class KnowledgeSearchService {
  async search(query: KnowledgeSearchQuery): Promise<KnowledgeSearchResult> {
    const normalizedQuery: KnowledgeSearchQuery = {
      ...query,
      query: query.query.trim(),
      workspaceId: normalizeText(query.workspaceId),
      workspaceName: normalizeText(query.workspaceName),
      workspacePath: normalizeText(query.workspacePath),
      tags: normalizeList(query.tags),
      files: normalizeList(query.files),
    }

    await knowledgeContractService.bootstrapWorkspace(normalizedQuery.workspacePath)

    const documents = await this.buildDocuments()
    const filteredDocuments = documents.filter((document) =>
      matchesFilters(document, normalizedQuery),
    )
    const bm25Documents: Bm25Document[] = filteredDocuments.map((document) => ({
      id: document.hit.id,
      text: document.text,
    }))
    const index = new Bm25Index(bm25Documents)

    if (!normalizedQuery.query) {
      return {
        query: normalizedQuery,
        hits: [],
        compactContext: '',
        indexStats: index.stats(),
        degraded: { reason: 'empty-query' },
      }
    }

    const byId = new Map(filteredDocuments.map((document) => [document.hit.id, document.hit]))
    const limit = clampLimit(query.limit)
    const hits = index
      .search(normalizedQuery.query)
      .map((bm25Hit) => {
        const hit = byId.get(bm25Hit.id)
        if (!hit) return null
        return {
          ...hit,
          bm25Score: bm25Hit.score,
          score: bm25Hit.score,
        } satisfies KnowledgeSearchHit
      })
      .filter((hit): hit is KnowledgeSearchHit => Boolean(hit))
      .slice(0, limit)

    return {
      query: normalizedQuery,
      hits,
      compactContext: buildCompactContext(hits),
      indexStats: index.stats(),
    }
  }

  private async buildDocuments(): Promise<SearchDocument[]> {
    const [
      observations,
      factCandidates,
      wikiPatches,
      graphCandidates,
      acceptedFacts,
    ] = await Promise.all([
      knowledgeObservationService.list({ limit: OBSERVATION_INDEX_LIMIT }),
      readJsonl<CandidateFact>('facts/candidates.jsonl'),
      readJsonl<CandidateWikiPatch>('wiki/patches.jsonl'),
      readJsonl<CandidateGraphEdge>('graph/candidates.jsonl'),
      readJsonl<MemoryFact>('facts/facts.jsonl'),
    ])

    const observationDocuments: SearchDocument[] = []
    for (const observation of observations) {
      let content = observation.content
      if (observation.blobRef) {
        try {
          content = await knowledgeObservationService.resolveContent(observation)
        } catch {
          content = observation.contentPreview ?? observation.content
        }
      }
      observationDocuments.push(observationToDocument(observation, content))
    }

    return [
      ...observationDocuments,
      ...factCandidates.map(factCandidateToDocument),
      ...wikiPatches.map(wikiPatchToDocument),
      ...graphCandidates.map(graphCandidateToDocument),
      ...acceptedFacts.map(memoryFactToDocument),
    ]
  }
}

export const knowledgeSearchService = new KnowledgeSearchService()
