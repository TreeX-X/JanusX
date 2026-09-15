// Note: user-scope recall with independent budget behind the shell seam — see .agents/notes/implemented/feature/2026-09-15-user-recall-m2.md
/**
 * @file User recall service (M2).
 * @description Person-scoped recall beside project memory. Searches user facts
 * (`scope=user`), the `UserProfile` snapshot, and active episodes with BM25
 * over a per-call index, then applies habit-strength and recency boosts under
 * an independent character budget. Superseded habits stay out of the result;
 * survivors carrying `supersedes` render a succession label instead of guiding
 * twice. Every line cites its fact, observation, or episode source. Project
 * recall keeps its workspace filter and ranking untouched; fusion happens in
 * `context-service.searchWithUser` and the chat orchestrator, both JanusX-side,
 * so `janus-agentX` ports keep their generic shape with no persona types.
 */
import type {
  KnowledgeContextItem,
  KnowledgeContextResult,
  MemoryFact,
  UserEpisode,
  UserProfile,
} from '../../shared/knowledge'
import { Bm25Index } from './search/bm25'
import { knowledgeTruthService } from './truth-service'
import { userEpisodeService } from './user-episode-service'
import { userProfileService } from './user-profile-service'

/** Independent user budget: never eats the project recall allowance. */
export const USER_RECALL_MAX_ITEMS = 5
export const USER_RECALL_MAX_CHARS = 2_000

export const USER_MEMORY_SECTION_OPEN = '<janus-user-memory trust="untrusted" usage="reference-only">'
export const USER_MEMORY_SECTION_CLOSE = '</janus-user-memory>'

export type UserRecallItemKind = 'habit' | 'episode' | 'profile'

export interface UserRecallItem {
  id: string
  kind: UserRecallItemKind
  title: string
  content: string
  score: number
  bm25Score: number
  factIds: string[]
  observationIds: string[]
  episodeIds: string[]
  habitStrength?: number
  lastSeenAt?: string
  /** Rendered when this habit archives a predecessor (no dual guidance). */
  succession?: string
  expiresAt?: string
}

export interface UserRecallResult {
  items: UserRecallItem[]
  compactContext: string
  truncated: boolean
  eligibleCount: number
  maxItems: number
  maxChars: number
}

export interface UserRecallDeps {
  listUserFacts: () => Promise<MemoryFact[]>
  loadProfile: () => Promise<UserProfile>
  listActiveEpisodes: () => Promise<UserEpisode[]>
  nowMs?: () => number
}

interface UserDoc {
  id: string
  text: string
  item: Omit<UserRecallItem, 'score' | 'bm25Score'>
}

function recencyBoost(instantIso: string | undefined, nowMs: number, halfLifeDays: number): number {
  if (!instantIso) return 0
  const instant = Date.parse(instantIso)
  if (!Number.isFinite(instant)) return 0
  const ageDays = Math.max(0, (nowMs - instant) / (24 * 60 * 60 * 1000))
  return 0.5 * Math.pow(0.5, ageDays / halfLifeDays)
}

/**
 * Succession filter: facts archived via `supersedes` never guide; the survivor
 * keeps a label naming its predecessor.
 */
export function applyHabitSuccession(facts: MemoryFact[]): Array<{ fact: MemoryFact; succession?: string }> {
  const supersededIds = new Set(
    facts.map((fact) => fact.supersedes?.trim()).filter((id): id is string => Boolean(id)),
  )
  return facts
    .filter((fact) => !supersededIds.has(fact.id))
    .map((fact) => fact.supersedes?.trim()
      ? { fact, succession: `supersedes ${fact.supersedes.trim()}` }
      : { fact })
}

function profileDocs(profile: UserProfile): UserDoc[] {
  const docs: UserDoc[] = []
  if (profile.identity?.trim()) {
    docs.push({
      id: 'profile:identity',
      text: profile.identity.trim(),
      item: {
        id: 'profile:identity',
        kind: 'profile',
        title: 'Identity',
        content: profile.identity.trim().slice(0, 500),
        factIds: [],
        observationIds: [],
        episodeIds: [],
      },
    })
  }
  for (const pref of profile.formatPrefs ?? []) {
    docs.push({
      id: `profile:format:${pref.slice(0, 40)}`,
      text: pref,
      item: {
        id: `profile:format:${pref.slice(0, 40)}`,
        kind: 'profile',
        title: 'Format preference',
        content: pref.slice(0, 500),
        factIds: [],
        observationIds: [],
        episodeIds: [],
      },
    })
  }
  for (const pref of profile.toolPrefs ?? []) {
    docs.push({
      id: `profile:tool:${pref.slice(0, 40)}`,
      text: pref,
      item: {
        id: `profile:tool:${pref.slice(0, 40)}`,
        kind: 'profile',
        title: 'Tool preference',
        content: pref.slice(0, 500),
        factIds: [],
        observationIds: [],
        episodeIds: [],
      },
    })
  }
  return docs
}

function formatUserLine(item: UserRecallItem): string {
  if (item.kind === 'episode') {
    const expiry = item.expiresAt ? item.expiresAt.slice(0, 10) : 'unknown'
    return `[episode] ${item.content} (episode:${item.id}; expires:${expiry})`
  }
  if (item.kind === 'profile') {
    return `[profile] ${item.content} (profile)`
  }
  const refs = [
    `fact:${item.id}`,
    ...(item.observationIds.length > 0 ? [`observation:${item.observationIds.join(',observation:')}`] : []),
  ].join('; ')
  const strength = item.habitStrength !== undefined ? `; strength=${item.habitStrength.toFixed(2)}` : ''
  const seen = item.lastSeenAt ? `; lastSeen=${item.lastSeenAt.slice(0, 10)}` : ''
  const succession = item.succession ? `; ${item.succession}` : ''
  return `[habit] ${item.content} (${refs}${strength}${seen}${succession})`
}

export function formatUserMemorySection(lines: string[]): string {
  if (lines.length === 0) return ''
  return [
    USER_MEMORY_SECTION_OPEN,
    'Durable user memory (private). Cite fact, observation, or episode ids on every used claim.',
    ...lines,
    USER_MEMORY_SECTION_CLOSE,
  ].join('\n')
}

export async function searchUserMemory(
  query: string,
  deps: UserRecallDeps,
  budget: { maxItems?: number; maxChars?: number } = {},
): Promise<UserRecallResult> {
  const maxItems = Math.max(0, Math.floor(budget.maxItems ?? USER_RECALL_MAX_ITEMS))
  const maxChars = Math.max(0, Math.floor(budget.maxChars ?? USER_RECALL_MAX_CHARS))
  const empty: UserRecallResult = { items: [], compactContext: '', truncated: false, eligibleCount: 0, maxItems, maxChars }
  if (!query.trim() || maxItems === 0 || maxChars === 0) return empty

  const nowMs = deps.nowMs?.() ?? Date.now()
  const [facts, profile, episodes] = await Promise.all([
    deps.listUserFacts(),
    deps.loadProfile(),
    deps.listActiveEpisodes(),
  ])

  const docs: UserDoc[] = []
  for (const { fact, succession } of applyHabitSuccession(facts)) {
    docs.push({
      id: `fact:${fact.id}`,
      text: `${fact.content}\n${fact.concepts.join(' ')}`,
      item: {
        id: fact.id,
        kind: 'habit',
        title: fact.content.slice(0, 120),
        content: fact.content,
        factIds: [fact.id],
        observationIds: fact.provenance.sourceObservationIds,
        episodeIds: [],
        habitStrength: fact.habitStrength,
        lastSeenAt: fact.lastSeenAt,
        ...(succession ? { succession } : {}),
      },
    })
  }
  for (const episode of episodes) {
    docs.push({
      id: `episode:${episode.id}`,
      text: `${episode.content}\n${episode.tags.join(' ')}`,
      item: {
        id: episode.id,
        kind: 'episode',
        title: episode.content.slice(0, 120),
        content: episode.content,
        factIds: [],
        observationIds: episode.sourceObservationIds,
        episodeIds: [episode.id],
        expiresAt: episode.expiresAt,
      },
    })
  }
  docs.push(...profileDocs(profile))
  if (docs.length === 0) return empty

  const index = new Bm25Index(docs.map((doc) => ({ id: doc.id, text: doc.text })))
  const byId = new Map(docs.map((doc) => [doc.id, doc]))
  const ranked: UserRecallItem[] = []
  for (const hit of index.search(query)) {
    const doc = byId.get(hit.id)
    if (!doc) continue
    let boost = 0
    if (doc.item.kind === 'habit') {
      const strength = doc.item.habitStrength ?? 0.5
      boost = strength * 0.5 + recencyBoost(doc.item.lastSeenAt, nowMs, 180) * 0.3
    } else if (doc.item.kind === 'episode') {
      const episode = episodes.find((candidate) => candidate.id === doc.item.id)
      boost = recencyBoost(episode?.createdAt, nowMs, 90) * 0.5
    }
    ranked.push({ ...doc.item, score: hit.score + boost, bm25Score: hit.score })
  }
  ranked.sort((left, right) => right.score - left.score || (left.id < right.id ? -1 : 1))

  const lines: string[] = []
  const items: UserRecallItem[] = []
  for (const item of ranked) {
    if (items.length >= maxItems) break
    const line = formatUserLine(item)
    if ([...lines, line].join('\n').length > maxChars) break
    lines.push(line)
    items.push(item)
  }
  return {
    items,
    compactContext: formatUserMemorySection(lines),
    truncated: items.length < ranked.length,
    eligibleCount: ranked.length,
    maxItems,
    maxChars,
  }
}

/** Production wiring over the M1 singleton stores. */
export function searchUserMemoryDefault(query: string): Promise<UserRecallResult> {
  return searchUserMemory(query, {
    listUserFacts: async () => {
      const snapshot = await knowledgeTruthService.list()
      return snapshot.facts.filter(
        (fact) => fact.scope === 'user' || fact.provenance.workspaceId === 'user',
      )
    },
    loadProfile: () => userProfileService.load(),
    listActiveEpisodes: () => userEpisodeService.listActive(Date.now()),
  })
}

/** Insert the user section after project knowledge, falling back to after the persona block. */
export function injectUserMemoryContext<T extends { role: string; content: string }>(
  messages: T[],
  section: string,
): T[] {
  if (!section) return messages
  const message = { role: 'system', content: section } as T
  const projectIndex = messages.findIndex(
    (entry) => entry.role === 'system' && entry.content.includes('janus-knowledge-context'),
  )
  if (projectIndex >= 0) return [...messages.slice(0, projectIndex + 1), message, ...messages.slice(projectIndex + 1)]
  const firstConversationIndex = messages.findIndex((entry) => entry.role !== 'system')
  const insertAt = firstConversationIndex >= 0 ? firstConversationIndex : messages.length
  return [...messages.slice(0, insertAt), message, ...messages.slice(insertAt)]
}

/** Fuse project recall with the user section; user items ride as workspace `user` facts. */
export function fuseKnowledgeResults(
  project: KnowledgeContextResult,
  user: UserRecallResult,
): KnowledgeContextResult {
  if (!user.compactContext) return project
  const userItems: KnowledgeContextItem[] = user.items.map((item) => ({
    id: item.id,
    kind: 'fact',
    title: item.title,
    content: item.content,
    score: item.score,
    workspaceId: 'user',
    provenance: {
      observationIds: item.observationIds,
      factIds: item.factIds,
      fileRefs: [],
      createdAt: item.lastSeenAt ?? new Date().toISOString(),
    },
  }))
  return {
    items: [...project.items, ...userItems],
    compactContext: project.compactContext
      ? `${project.compactContext}\n\n${user.compactContext}`
      : user.compactContext,
    truncated: project.truncated || user.truncated,
    eligibleCount: project.eligibleCount + user.eligibleCount,
    maxItems: project.maxItems + user.maxItems,
    maxChars: project.maxChars + user.maxChars,
    // Fused recall carries user content, so a workspace-only degradation
    // never marks the turn as failed.
  }
}
