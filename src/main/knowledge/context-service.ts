import type {
  KnowledgeContextRequest,
  KnowledgeContextResult,
} from '../../shared/knowledge'
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
  private readonly searchUser: (query: string) => Promise<UserRecallResult>
  constructor(userDeps?: UserRecallDeps) {
    this.searchUser = userDeps ? query => searchUserMemory(query, userDeps) : searchUserMemoryDefault
  }
  /** Original Notes replace project memory; callers retain their personal recall budget. */
  async search(request: KnowledgeContextRequest): Promise<KnowledgeContextResult> {
    return emptyResult(boundedInteger(request.maxItems, DEFAULT_MAX_ITEMS), boundedInteger(request.maxChars, DEFAULT_MAX_CHARS))
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
