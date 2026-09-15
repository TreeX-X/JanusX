import type {
  KnowledgeContextItem,
  KnowledgeContextRequest,
  KnowledgeContextResult,
} from '../../shared/knowledge'
import { knowledgeRecallService, KnowledgeRecallService } from './recall-service'
import { excerptAroundQuery } from './recall-service'
import { knowledgeTruthService } from './truth-service'
import {
  fuseKnowledgeResults,
  searchUserMemory,
  searchUserMemoryDefault,
  type UserRecallDeps,
  type UserRecallResult,
} from './user-recall-service'

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
  private readonly searchUser: (query: string) => Promise<UserRecallResult>

  constructor(
    truthService: Pick<typeof knowledgeTruthService, 'list'> = knowledgeTruthService,
    recallService?: Pick<KnowledgeRecallService, 'recall'>,
    userDeps?: UserRecallDeps,
  ) {
    this.recallService = recallService ?? (truthService === knowledgeTruthService
      ? knowledgeRecallService
      : new KnowledgeRecallService({
          listTruth: () => truthService.list(),
          listObservations: async () => [],
          resolveObservationContent: async (observation) => observation.content,
          readCandidates: async () => [],
        }))
    this.searchUser = userDeps
      ? (query: string) => searchUserMemory(query, userDeps)
      : searchUserMemoryDefault
  }

  /**
   * Project-only recall. Workspace gating stays untouched so shared surfaces
   * (MCP, maintenance) never observe user memory through this path.
   */
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
      agentId: request.agentId?.trim() || undefined,
      sessionId: request.sessionId?.trim() || undefined,
      since: request.since?.trim() || undefined,
      until: request.until?.trim() || undefined,
    })
    if (recalled.degraded) return emptyResult(maxItems, maxChars, recalled.degraded.reason)

    const items: KnowledgeContextItem[] = []
    const sections: string[] = []
    for (const document of recalled.documents) {
      if (items.length >= maxItems) break
      if (!document.contextItem) continue
      // Long wiki pages ride as query-centered excerpts so one page cannot
      // eat the whole shared budget; full text stays one wiki_get away.
      const content = document.contextItem.kind === 'wiki'
        ? excerptAroundQuery(document.contextItem.content, request.query)
        : document.contextItem.content
      const item = { ...document.contextItem, content, score: document.score }
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

  /** User-only recall under its independent budget; needs no workspace. */
  async searchUserOnly(query: string): Promise<UserRecallResult> {
    return this.searchUser(query)
  }

  /**
   * Fused chat recall. Project recall keeps its filter and budget; the user
   * section appends under its own budget. `scope=user` returns the user side
   * alone so no-workspace sessions still answer personal questions.
   */
  async searchWithUser(request: KnowledgeContextRequest): Promise<KnowledgeContextResult> {
    if (request.scope === 'user') {
      const user = await this.searchUser(request.query)
      if (!user.compactContext) {
        return {
          items: [],
          compactContext: '',
          truncated: user.truncated,
          eligibleCount: user.eligibleCount,
          maxItems: user.maxItems,
          maxChars: user.maxChars,
        }
      }
      return fuseKnowledgeResults(
        { items: [], compactContext: '', truncated: false, eligibleCount: 0, maxItems: 0, maxChars: 0 },
        user,
      )
    }
    const [project, user] = await Promise.all([
      this.search(request),
      request.includeUser === false ? null : this.searchUser(request.query).catch(() => null),
    ])
    if (!user || !user.compactContext) return project
    return fuseKnowledgeResults(project, user)
  }
}

export const knowledgeContextService = new KnowledgeContextService()
