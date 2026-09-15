import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decayHabitStrength,
  deriveHabitPromotions,
  habitPromotionToCandidate,
  reheatHabitStrength,
} from '../../../src/main/knowledge/habit-aggregator'
import { getUserMemoryOverview } from '../../../src/main/knowledge/user-overview-service'
import { searchUserMemoryDefault } from '../../../src/main/knowledge/user-recall-service'
import { userEpisodeService } from '../../../src/main/knowledge/user-episode-service'
import { knowledgeOperationsService } from '../../../src/main/knowledge/operations-service'
import { knowledgeReviewService } from '../../../src/main/knowledge/review-service'
import type { AuditEvent, CandidateFact, MemoryFact } from '../../../src/shared/knowledge'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

const previousKnowledgeRoot = process.env.JANUSX_KNOWLEDGE_ROOT
let knowledgeRoot = ''
const temporaryDirectories: string[] = []

function userProvenance() {
  return {
    workspaceId: 'user',
    workspaceName: 'user',
    workspacePath: '',
    source: 'manual' as const,
    sourceObservationIds: ['obs-user'],
    fileRefs: [],
    actor: 'contract-test',
    createdAt: '2026-09-10T00:00:00.000Z',
  }
}

function userFact(id: string, content: string, extra: Partial<MemoryFact> = {}): MemoryFact {
  return {
    id,
    content,
    concepts: [],
    files: [],
    tags: ['habit', 'user-memory'],
    confidence: 0.8,
    version: 1,
    status: 'active',
    kind: 'preference',
    scope: 'user',
    habitStrength: 0.7,
    lastSeenAt: '2026-09-14T00:00:00.000Z',
    provenance: userProvenance(),
    ...extra,
  }
}

async function seedFacts(facts: MemoryFact[]): Promise<void> {
  const file = join(knowledgeRoot, 'facts', 'facts.jsonl')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, facts.map((fact) => JSON.stringify(fact)).join('\n') + '\n', 'utf8')
}

async function appendCandidates(candidates: CandidateFact[]): Promise<void> {
  const file = join(knowledgeRoot, 'facts', 'candidates.jsonl')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, candidates.map((candidate) => JSON.stringify(candidate)).join('\n') + '\n', 'utf8')
}

async function readAudits(): Promise<AuditEvent[]> {
  try {
    const content = await readFile(join(knowledgeRoot, 'audit', 'audit.jsonl'), 'utf8')
    return content.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line) as AuditEvent)
  } catch {
    return []
  }
}

describe('user memory MVP contract', () => {
  beforeEach(async () => {
    knowledgeRoot = await mkdtemp(join(tmpdir(), 'janusx-user-contract-'))
    temporaryDirectories.push(knowledgeRoot)
    process.env.JANUSX_KNOWLEDGE_ROOT = knowledgeRoot
  })

  afterEach(async () => {
    if (previousKnowledgeRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
    else process.env.JANUSX_KNOWLEDGE_ROOT = previousKnowledgeRoot
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
  })

  it('promotes repeated observations through Inbox review into cited recall', async () => {
    const now = '2026-09-15T00:00:00.000Z'
    const thin = await deriveHabitPromotions([
      { id: 'o1', content: '我习惯用 pnpm 而不用 npm', type: 'user-note', createdAt: now },
      { id: 'o2', content: 'other topic entirely', type: 'user-note', createdAt: now },
    ], now)
    expect(thin).toHaveLength(0)

    const promotions = await deriveHabitPromotions([
      { id: 'o1', content: '我习惯用 pnpm 而不用 npm', type: 'user-note', createdAt: now },
      { id: 'o2', content: '我习惯用 pnpm 而不用 npm', type: 'user-note', createdAt: now },
      { id: 'o3', content: '我习惯用 pnpm 而不用 npm', type: 'user-note', createdAt: now },
    ], now)
    expect(promotions).toHaveLength(1)
    expect(promotions[0]!.frequency).toBe(3)

    const candidate = habitPromotionToCandidate(promotions[0]!, now)
    expect(candidate.fact.scope).toBe('user')
    await appendCandidates([candidate])
    await knowledgeReviewService.applyCandidate({ type: 'fact', id: candidate.id })

    const recalled = await searchUserMemoryDefault('pnpm')
    expect(recalled.items.map((item) => item.id)).toContain(candidate.fact.id)
    expect(recalled.compactContext).toContain(`fact:${candidate.fact.id}`)
  })

  it('decays stale habits and reheats on retrieval', () => {
    const stale = decayHabitStrength(0.8, '2026-01-01T00:00:00.000Z', Date.parse('2026-09-15T00:00:00.000Z'))
    const fresh = decayHabitStrength(0.8, '2026-09-14T00:00:00.000Z', Date.parse('2026-09-15T00:00:00.000Z'))
    expect(stale).toBeLessThan(0.2)
    expect(fresh).toBeGreaterThan(stale)
    expect(reheatHabitStrength(stale)).toBeGreaterThan(stale)
  })

  it('labels succession without dual guidance', async () => {
    await seedFacts([
      userFact('habit-old', '请用中文回复，每段不超过三行'),
      userFact('habit-new', '请用中文回复，每段不超过五行', { supersedes: 'habit-old' }),
    ])
    const recalled = await searchUserMemoryDefault('中文回复')
    expect(recalled.items.map((item) => item.id)).toEqual(['habit-new'])
    expect(recalled.compactContext).toContain('supersedes habit-old')
    expect(recalled.compactContext).not.toContain('不超过三行')
  })

  it('harvests expired events while the working set rolls', async () => {
    const oldAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
    await userEpisodeService.capture({ content: '过期的事件', createdAt: oldAt, ttlDays: 30 })
    await userEpisodeService.capture({ content: '新鲜的事件', ttlDays: 90 })
    const harvest = await userEpisodeService.harvest(Date.now(), true)
    expect(harvest.expired).toBe(1)
    const active = await userEpisodeService.listActive(Date.now())
    expect(active.map((episode) => episode.content)).toEqual(['新鲜的事件'])
  })

  it('leaves no recall residue after forget, with audit to prove it', async () => {
    await seedFacts([userFact('fact-u1', '我习惯用 pnpm 而不用 npm')])
    await userEpisodeService.capture({ content: '昨天用 pnpm 发布了新版本', ttlDays: 90 })
    expect((await searchUserMemoryDefault('pnpm')).items).not.toHaveLength(0)

    await knowledgeOperationsService.revoke({ kind: 'fact', id: 'fact-u1', workspaceId: 'user' })
    const { expiredIds } = await userEpisodeService.expireMatching('pnpm', Date.now())
    expect(expiredIds).toHaveLength(1)

    const silent = await searchUserMemoryDefault('pnpm')
    expect(silent.items).toEqual([])
    const audits = await readAudits()
    expect(audits.some((event) => event.action === 'truth_revoked' && event.targetId === 'fact-u1')).toBe(true)
    expect(audits.some((event) => event.action === 'user_episode_harvested')).toBe(true)
  })

  it('serves the glance overview with pending count, habits, and recent', async () => {
    await seedFacts([userFact('fact-u1', '我习惯用 pnpm 而不用 npm')])
    await userEpisodeService.capture({ content: '昨天用 pnpm 发布了新版本', ttlDays: 90 })
    const candidate = habitPromotionToCandidate({
      key: 'habit:x', content: '站会只说三件事', frequency: 3,
      evidenceObservationIds: ['o1'], strength: 0.55, lastSeenAt: '2026-09-15T00:00:00.000Z',
    }, '2026-09-15T00:00:00.000Z')
    await appendCandidates([candidate])

    const overview = await getUserMemoryOverview(Date.parse('2026-09-15T00:00:00.000Z'))
    expect(overview.pendingHabitCount).toBe(1)
    expect(overview.habits.map((habit) => habit.id)).toContain('fact-u1')
    expect(overview.recent.map((episode) => episode.content)).toContain('昨天用 pnpm 发布了新版本')
    expect(overview.profile.version).toBe(1)
  })
})
