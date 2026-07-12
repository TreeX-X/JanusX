import type {
  KnowledgeSearchHit,
  KnowledgeSearchQuery,
  KnowledgeSearchResult,
} from '../../shared/knowledge'
import { knowledgeContractService } from './contract-service'
import { knowledgeRecallService, type KnowledgeRecallService } from './recall-service'

const DEFAULT_SEARCH_LIMIT = 8
const MAX_SEARCH_LIMIT = 30

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
  return values.flatMap((value) => {
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) return []
    seen.add(key)
    return [trimmed]
  })
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

function buildCompactContext(hits: KnowledgeSearchHit[]): string {
  return hits.slice(0, 8).map((hit, index) => {
    const refs = hit.sourceObservationIds.length ? ` refs=${hit.sourceObservationIds.join(',')}` : ''
    const files = hit.fileRefs.length ? ` files=${hit.fileRefs.slice(0, 3).join(',')}` : ''
    return [
      `[${index + 1}] ${hit.type} score=${hit.score.toFixed(3)}${refs}${files}`,
      `title: ${truncate(hit.title, 140)}`,
      `content: ${truncate(hit.content, 360)}`,
    ].join('\n')
  }).join('\n\n')
}

export class KnowledgeSearchService {
  constructor(private readonly recallService: Pick<KnowledgeRecallService, 'recall'> = knowledgeRecallService) {}

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

    const recalled = await this.recallService.recall({ ...normalizedQuery, layer: 'governance' })
    const hits = recalled.documents.slice(0, clampLimit(query.limit)).map(({ hit, score, scoreExplanation }) => ({
      ...hit,
      bm25Score: scoreExplanation.bm25,
      score,
      scoreExplanation,
    }))
    return {
      query: normalizedQuery,
      hits,
      compactContext: buildCompactContext(hits),
      indexStats: recalled.indexStats,
      ...(recalled.degraded ? { degraded: recalled.degraded } : {}),
    }
  }
}

export const knowledgeSearchService = new KnowledgeSearchService()
