import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

import {
  decayHabitStrength,
  deriveHabitPromotions,
  habitPromotionToCandidate,
  mergeHabitEvidence,
  proposeHabitCandidates,
  reheatHabitStrength,
} from '../../../src/main/knowledge/habit-aggregator'
import { userEpisodeService } from '../../../src/main/knowledge/user-episode-service'
import { userProfileService } from '../../../src/main/knowledge/user-profile-service'
import { knowledgeContractService } from '../../../src/main/knowledge/contract-service'

describe('User memory M1', () => {
  const previousRoot = process.env.JANUSX_KNOWLEDGE_ROOT
  let knowledgeRoot = ''

  beforeEach(async () => {
    knowledgeRoot = await mkdtemp(join(tmpdir(), 'janusx-user-m1-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = knowledgeRoot
  })

  afterEach(async () => {
    await rm(knowledgeRoot, { recursive: true, force: true })
    if (previousRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
    else process.env.JANUSX_KNOWLEDGE_ROOT = previousRoot
  })

  it('bootstraps profile and episodes partitions', async () => {
    await knowledgeContractService.bootstrapWorkspace(undefined)
    const contracts = knowledgeContractService.getContracts()
    expect(contracts.storage.directories.some((dir) => dir.relativePath === 'profile')).toBe(true)
    expect(contracts.storage.directories.some((dir) => dir.relativePath === 'episodes')).toBe(true)
    const profile = await userProfileService.load()
    expect(profile.version).toBe(1)
  })

  it('promotes repeated observations at frequency three with evidence merge', () => {
    const now = '2026-09-15T00:00:00.000Z'
    const promotions = proposeHabitCandidates([
      { id: 'a1', content: '我习惯用 pnpm 而不用 npm', createdAt: now },
      { id: 'a2', content: '我习惯用 pnpm 而不用 npm', createdAt: now },
      { id: 'a3', content: '我习惯用 pnpm 而不用 npm', createdAt: now },
    ], now)
    expect(promotions).toHaveLength(1)
    expect(promotions[0]!.frequency).toBe(3)
    expect(promotions[0]!.evidenceObservationIds).toHaveLength(3)
    const candidate = habitPromotionToCandidate(promotions[0]!)
    expect(candidate.fact.scope).toBe('user')
    expect(candidate.fact.habitStrength).toBeGreaterThan(0)
    expect(candidate.status).toBe('proposed')
  })

  it('decays stale habits and reheats on retrieval', () => {
    const strong = decayHabitStrength(0.8, '2026-01-01T00:00:00.000Z', Date.parse('2026-09-15T00:00:00.000Z'))
    expect(strong).toBeLessThan(0.2)
    expect(reheatHabitStrength(0.5)).toBeCloseTo(0.65, 5)
    const merged = mergeHabitEvidence(
      { key: 'h', content: 'old', frequency: 3, evidenceObservationIds: ['a'], strength: 0.5, lastSeenAt: '2026-09-01T00:00:00.000Z' },
      { key: 'h', content: 'new', frequency: 3, evidenceObservationIds: ['b'], strength: 0.6, lastSeenAt: '2026-09-15T00:00:00.000Z' },
    )
    expect(merged.frequency).toBe(6)
    expect(merged.content).toBe('new')
  })

  it('harvests expired episodes while the working set rolls', async () => {
    const expiredAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
    await userEpisodeService.capture({ content: 'old event', createdAt: expiredAt, ttlDays: 30 })
    await userEpisodeService.capture({ content: 'fresh event', ttlDays: 90 })
    const harvest = await userEpisodeService.harvest(Date.now(), true)
    expect(harvest.expired).toBe(1)
    const active = await userEpisodeService.listActive(Date.now())
    expect(active.some((episode) => episode.content.includes('fresh'))).toBe(true)
    expect(active.some((episode) => episode.content.includes('old'))).toBe(false)
  })

  it('derives promotions from queue batches without owning cursors', async () => {
    const now = '2026-09-15T00:00:00.000Z'
    const promotions = await deriveHabitPromotions([
      { id: 'b1', content: '请用中文回复', type: 'user-note', createdAt: now },
      { id: 'b2', content: '请用中文回复', type: 'user-note', createdAt: now },
      { id: 'b3', content: '请用中文回复', type: 'user-note', createdAt: now },
    ], now)
    expect(promotions).toHaveLength(1)
  })
})
