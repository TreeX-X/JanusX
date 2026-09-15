import { describe, expect, it, vi } from 'vitest'
import { USER_RECALL_MAX_CHARS, applyHabitSuccession, fuseKnowledgeResults, searchUserMemory } from '../../../src/main/knowledge/user-recall-service'
import { KnowledgeContextService } from '../../../src/main/knowledge/context-service'
import { recallFilterKey } from '../../../src/main/knowledge/recall-service'
import type { KnowledgeTruthSnapshot, MemoryFact, UserEpisode, UserProfile } from '../../../src/shared/knowledge'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

function provenance(workspaceId: string) {
  return {
    workspaceId,
    workspaceName: workspaceId,
    workspacePath: workspaceId === 'user' ? '' : `C:/${workspaceId}`,
    source: 'manual' as const,
    sourceObservationIds: [`obs-${workspaceId}`],
    fileRefs: [],
    actor: 'tester',
    createdAt: '2026-09-10T00:00:00.000Z',
  }
}

function userFact(overrides: Partial<MemoryFact> & { id: string; content: string }): MemoryFact {
  return {
    concepts: [],
    files: [],
    tags: ['habit'],
    confidence: 0.8,
    version: 1,
    status: 'active',
    kind: 'preference',
    scope: 'user',
    habitStrength: 0.7,
    lastSeenAt: '2026-09-14T00:00:00.000Z',
    provenance: provenance('user'),
    ...overrides,
  }
}

function projectFact(id: string, content: string): MemoryFact {
  return {
    id,
    content,
    concepts: ['build'],
    files: [],
    tags: [],
    confidence: 0.9,
    version: 1,
    status: 'active',
    kind: 'fact',
    provenance: provenance('ws-a'),
  }
}

const emptyProfile: UserProfile = { version: 1, updatedAt: '2026-09-15T00:00:00.000Z' }

function depsOf(facts: MemoryFact[], profile: UserProfile = emptyProfile, episodes: UserEpisode[] = []) {
  return {
    listUserFacts: async () => facts,
    loadProfile: async () => profile,
    listActiveEpisodes: async () => episodes,
  }
}

describe('User recall M2', () => {
  it('answers personal preferences with citations and no workspace', async () => {
    const result = await searchUserMemory(
      'pnpm',
      depsOf([userFact({ id: 'fact-u1', content: '我习惯用 pnpm 而不用 npm' })]),
    )
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.id).toBe('fact-u1')
    expect(result.compactContext).toContain('[habit]')
    expect(result.compactContext).toContain('fact:fact-u1')
    expect(result.compactContext).toContain('observation:obs-user')
    expect(result.compactContext).toContain('janus-user-memory')
  })

  it('recalls profile prefs and episodes with source citations', async () => {
    const result = await searchUserMemory(
      '中文',
      depsOf([], {
        version: 1,
        formatPrefs: ['请用中文回复'],
        updatedAt: '2026-09-15T00:00:00.000Z',
      }, [{
        id: 'ep-1',
        content: '和朋友讨论中文写作技巧',
        createdAt: '2026-09-14T00:00:00.000Z',
        expiresAt: '2026-10-14T00:00:00.000Z',
        ttlDays: 30,
        tags: [],
        sourceObservationIds: [],
        status: 'active',
      }]),
    )
    expect(result.items.map((item) => item.kind).sort()).toEqual(['episode', 'profile'])
    expect(result.compactContext).toContain('(profile)')
    expect(result.compactContext).toContain('episode:ep-1')
  })

  it('labels succession without dual guidance', async () => {
    const old = userFact({ id: 'habit-old', content: '请用中文回复，每段不超过三行' })
    const current = userFact({ id: 'habit-new', content: '请用中文回复，每段不超过五行', supersedes: 'habit-old' })
    expect(applyHabitSuccession([old, current]).map((entry) => entry.fact.id)).toEqual(['habit-new'])
    const result = await searchUserMemory('中文回复', depsOf([old, current]))
    expect(result.items.map((item) => item.id)).toEqual(['habit-new'])
    expect(result.compactContext).toContain('supersedes habit-old')
    expect(result.compactContext).not.toContain('不超过三行')
  })

  it('keeps project recall filtered with zero user leakage', async () => {
    const snapshot: KnowledgeTruthSnapshot = {
      facts: [projectFact('fact-p1', '项目构建使用 pnpm workspace'), userFact({ id: 'fact-u1', content: '我习惯用 pnpm 而不用 npm' })],
      wikiPages: [],
      graphEdges: [],
    }
    const context = new KnowledgeContextService(
      { list: async () => snapshot },
      undefined,
      depsOf([snapshot.facts[1]!]),
    )
    const scoped = await context.search({ query: 'pnpm', workspaceId: 'ws-a' })
    expect(scoped.items.map((item) => item.id)).toEqual(['fact-p1'])
    const global = await context.search({ query: 'pnpm', allowGlobal: true })
    expect(global.items.map((item) => item.id)).toEqual(['fact-p1'])
  })

  it('fuses both budgets and serves user-only recall with no workspace', async () => {
    const user = userFact({ id: 'fact-u1', content: '我习惯用 pnpm 而不用 npm' })
    const snapshot: KnowledgeTruthSnapshot = {
      facts: [projectFact('fact-p1', '项目构建使用 pnpm workspace'), user],
      wikiPages: [],
      graphEdges: [],
    }
    const context = new KnowledgeContextService({ list: async () => snapshot }, undefined, depsOf([user]))
    const fused = await context.searchWithUser({ query: 'pnpm', workspaceId: 'ws-a' })
    expect(fused.compactContext).toContain('项目构建使用 pnpm')
    expect(fused.compactContext).toContain('janus-user-memory')
    expect(fused.maxChars).toBe(4000 + USER_RECALL_MAX_CHARS)
    expect(fused.items.some((item) => item.workspaceId === 'user')).toBe(true)

    const userOnly = await context.searchWithUser({ query: 'pnpm', scope: 'user' })
    expect(userOnly.degraded).toBeUndefined()
    expect(userOnly.items.map((item) => item.workspaceId)).toEqual(['user'])
    expect(userOnly.compactContext).toContain('janus-user-memory')
  })

  it('caps the user budget without touching project items', async () => {
    const facts = Array.from({ length: 8 }, (_, index) =>
      userFact({ id: `fact-u${index}`, content: `第${index}条习惯：构建统一用 pnpm 安装` }))
    const result = await searchUserMemory('pnpm', depsOf(facts))
    expect(result.items).toHaveLength(5)
    expect(result.truncated).toBe(true)
    expect(result.eligibleCount).toBe(8)

    const fused = fuseKnowledgeResults(
      { items: [], compactContext: '', truncated: false, eligibleCount: 0, maxItems: 8, maxChars: 4000 },
      result,
    )
    expect(fused.maxChars).toBe(4000 + result.maxChars)
  })

  it('separates recall filter keys by scope', () => {
    const base = { query: 'pnpm', layer: 'truth' as const }
    expect(recallFilterKey(base)).not.toBe(recallFilterKey({ ...base, scope: 'user' }))
  })
})
