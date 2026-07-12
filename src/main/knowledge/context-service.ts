import type {
  KnowledgeContextItem,
  KnowledgeContextRequest,
  KnowledgeContextResult,
} from '../../shared/knowledge'
import { knowledgeRecallService, KnowledgeRecallService } from './recall-service'
import { knowledgeTruthService } from './truth-service'

const DEFAULT_MAX_ITEMS = 8
const DEFAULT_MAX_CHARS = 4_000

function boundedInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.floor(value))
}

function formatItem(item: KnowledgeContextItem): string {
  const refs = [
    ...item.provenance.observationIds.map((id) => `observation:${id}`),
    ...item.provenance.factIds.map((id) => `fact:${id}`),
    ...item.provenance.fileRefs.map((file) => `file:${file}`),
  ]
  return `[${item.kind}] ${item.title}\n${item.content}\nworkspace=${item.workspaceId}; refs=${refs.join(',') || 'none'}`
}

function emptyResult(
  maxItems: number,
  maxChars: number,
  reason?: NonNullable<KnowledgeContextResult['degraded']>['reason'],
): KnowledgeContextResult {
  return {
    items: [],
    compactContext: '',
    truncated: false,
    eligibleCount: 0,
    maxItems,
    maxChars,
    ...(reason ? { degraded: { reason } } : {}),
  }
}

export class KnowledgeContextService {
  private readonly recallService: Pick<KnowledgeRecallService, 'recall'>

  constructor(
    truthService: Pick<typeof knowledgeTruthService, 'list'> = knowledgeTruthService,
    recallService?: Pick<KnowledgeRecallService, 'recall'>,
  ) {
    this.recallService = recallService ?? (truthService === knowledgeTruthService
      ? knowledgeRecallService
      : new KnowledgeRecallService({
          listTruth: () => truthService.list(),
          listObservations: async () => [],
          resolveObservationContent: async (observation) => observation.content,
          readCandidates: async () => [],
        }))
  }

  async search(request: KnowledgeContextRequest): Promise<KnowledgeContextResult> {
    const maxItems = boundedInteger(request.maxItems, DEFAULT_MAX_ITEMS)
    const maxChars = boundedInteger(request.maxChars, DEFAULT_MAX_CHARS)
    const recalled = await this.recallService.recall({
      query: request.query,
      layer: 'truth',
      workspaceId: request.workspaceId?.trim() || undefined,
      workspacePath: request.workspaceId ? undefined : request.workspacePath?.trim() || undefined,
      allowGlobal: request.allowGlobal,
      requireWorkspace: true,
    })
    if (recalled.degraded) return emptyResult(maxItems, maxChars, recalled.degraded.reason)

    const items: KnowledgeContextItem[] = []
    const sections: string[] = []
    for (const document of recalled.documents) {
      if (items.length >= maxItems) break
      if (!document.contextItem) continue
      const item = { ...document.contextItem, score: document.score }
      const section = formatItem(item)
      if ([...sections, section].join('\n\n').length > maxChars) break
      items.push(item)
      sections.push(section)
    }
    return {
      items,
      compactContext: sections.join('\n\n'),
      truncated: items.length < recalled.documents.length,
      eligibleCount: recalled.documents.length,
      maxItems,
      maxChars,
    }
  }
}

export const knowledgeContextService = new KnowledgeContextService()
