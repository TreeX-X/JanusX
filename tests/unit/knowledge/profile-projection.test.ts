import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MemoryFact } from '../../../src/shared/knowledge'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
vi.mock('../../../src/main/knowledge/audit-service', () => ({ knowledgeAuditService: { record: vi.fn().mockResolvedValue({}) } }))
import { UserProfileService } from '../../../src/main/knowledge/user-profile-service'
import { confirmedProfileFacts, reviewedFactHash } from '../../../src/main/knowledge/profile-projection'
import { searchUserMemory } from '../../../src/main/knowledge/user-recall-service'
import { knowledgeAuditService } from '../../../src/main/knowledge/audit-service'

function confirmed(id: string, content = 'Use pnpm'): MemoryFact {
  const fact: MemoryFact = { id, content, kind: 'preference', scope: 'user', status: 'active', version: 1,
    concepts: [], files: [], tags: [], confidence: 0.5,
    provenance: { workspaceId: 'user', workspaceName: 'user', workspacePath: '', source: 'manual', actor: 'test',
      createdAt: '2026-09-28T00:00:00.000Z', sourceObservationIds: ['obs-project'], fileRefs: [] } }
  fact.confirmation = { kind: 'human-review', contentHash: reviewedFactHash(fact), confirmedAt: '2026-09-28T00:00:00.000Z' }
  return fact
}

describe('confirmed profile projection', () => {
  let root: string
  let facts: MemoryFact[]
  let now: number
  let service: UserProfileService
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'janusx-profile-'))
    facts = [confirmed('personal')]
    now = Date.parse('2026-09-28T00:00:00.000Z')
    service = new UserProfileService({ root: () => root, facts: async () => facts, now: () => now })
  })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })

  it('includes reviewed personal facts, excluding unreviewed, project, expired and archived records', () => {
    const legacy = { ...confirmed('legacy'), confirmation: undefined }
    const project = { ...confirmed('project'), scope: 'project' as const }
    project.provenance.workspaceId = 'project-a'
    const expired = { ...confirmed('expired'), ttl: '2026-01-01T00:00:00.000Z' }
    expired.confirmation!.contentHash = reviewedFactHash(expired)
    expect(confirmedProfileFacts([...facts, legacy, project, expired, { ...confirmed('archived'), status: 'archived' }], now).map(fact => fact.id)).toEqual(['personal'])
  })

  it('rebuilds after content changes, revocation and restoration within the TTL', async () => {
    const first = await service.load()
    facts[0] = { ...facts[0], content: 'Use npm' }
    const tampered = await service.load()
    expect(tampered.confirmedFacts).toEqual([])
    expect(tampered.version).toBe(first.version + 1)
    facts[0].confirmation!.contentHash = reviewedFactHash(facts[0])
    const changed = await service.load()
    expect(changed.confirmedFacts?.[0].content).toBe('Use npm')
    facts[0].status = 'archived'
    expect((await service.load()).confirmedFacts).toEqual([])
  })

  it('does not change the version for ranking-only changes, reordered inputs, restarts or TTL renewal', async () => {
    facts.push(confirmed('second'))
    const first = await service.load()
    facts.reverse()
    facts[0].habitStrength = 0.99
    facts[0].lastSeenAt = '2026-09-29T00:00:00.000Z'
    now += 600_000
    const restarted = new UserProfileService({ root: () => root, facts: async () => facts, now: () => now })
    const next = await restarted.load()
    expect(next.version).toBe(first.version)
    expect(next.updatedAt).toBe(first.updatedAt)
    expect(next.derivation?.fingerprint).toBe(first.derivation?.fingerprint)
    expect(next.derivation?.expiresAt).not.toBe(first.derivation?.expiresAt)
  })

  it('preserves independent concurrent overrides and removes them without losing derived facts', async () => {
    await Promise.all([service.save({ identity: 'Tree' }), service.save({ formatPrefs: ['Chinese'] })])
    const profile = await service.load()
    expect(profile.identity).toBe('Tree')
    expect(profile.formatPrefs).toEqual(['Chinese'])
    const cleared = await service.save({ identity: undefined })
    expect(cleared.identity).toBeUndefined()
    expect(cleared.confirmedFacts).toHaveLength(1)
    expect(cleared.version).toBeGreaterThan(profile.version)
  })

  it('keeps unknown legacy profile bytes without injecting them', async () => {
    await mkdir(join(root, 'profile'))
    const legacy = '{"identity":"unverified old identity"}'
    await writeFile(join(root, 'profile/profile.json'), legacy)
    expect((await service.load()).identity).toBeUndefined()
    expect(await readFile(join(root, 'profile/profile.json'), 'utf8')).toBe(legacy)
  })

  it('preserves corrupt snapshots and overrides instead of replacing them with empty state', async () => {
    await service.load()
    const path = join(root, 'profile/snapshot.json')
    await writeFile(path, '{broken')
    await expect(service.load()).rejects.toThrow()
    expect(await readFile(path, 'utf8')).toBe('{broken')
    await writeFile(join(root, 'profile/overrides.json'), '{broken override')
    await expect(service.save({ identity: 'Tree' })).rejects.toThrow()
    expect(await readFile(join(root, 'profile/overrides.json'), 'utf8')).toBe('{broken override')
  })

  it('reconstructs content from facts instead of trusting the cached body', async () => {
    const profile = await service.load()
    await writeFile(join(root, 'profile/snapshot.json'), JSON.stringify({ ...profile, identity: 'poisoned', confirmedFacts: [] }))
    const next = await service.load()
    expect(next.identity).toBeUndefined()
    expect(next.confirmedFacts?.[0].content).toBe('Use pnpm')
    expect(JSON.parse(await readFile(join(root, 'profile/snapshot.json'), 'utf8')).identity).toBeUndefined()
  })

  it('rolls back an override when its audit fails', async () => {
    await service.save({ identity: 'Tree' })
    vi.mocked(knowledgeAuditService.record).mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(service.save({ identity: 'incorrect' })).rejects.toThrow('audit unavailable')
    expect((await service.load()).identity).toBe('Tree')
  })

  it('expires a confirmed fact within the snapshot TTL', async () => {
    facts[0].ttl = new Date(now + 1000).toISOString()
    facts[0].confirmation!.contentHash = reviewedFactHash(facts[0])
    const first = await service.load()
    now += 1001
    const expired = await service.load()
    expect(expired.confirmedFacts).toEqual([])
    expect(expired.version).toBe(first.version + 1)
  })

  it('changes the fingerprint when newly reviewed evidence changes under the same fact id', async () => {
    const first = await service.load()
    facts[0].provenance.sourceObservationIds.push('additional-evidence')
    facts[0].confirmation!.contentHash = reviewedFactHash(facts[0])
    const next = await service.load()
    expect(next.version).toBe(first.version + 1)
    expect(next.confirmedFacts?.[0].sourceHash).not.toBe(first.confirmedFacts?.[0].sourceHash)
  })

  it('reserves stable entries while still retrieving relevant overflow and skipping oversized entries', async () => {
    facts = ['a', 'b', 'c', 'd'].map(id => confirmed(id, id === 'd' ? 'astronomy' : id))
    const profile = await service.load()
    const deps = { listUserFacts: async () => facts, loadProfile: async () => profile, listActiveEpisodes: async () => [] }
    expect((await searchUserMemory('astronomy', deps)).items.map(item => item.id)).toEqual(['a', 'b', 'c', 'd'])
    profile.confirmedFacts![0].content = 'x'.repeat(3000)
    const bounded = await searchUserMemory('astronomy', deps, { maxItems: 2, maxChars: 200 })
    expect(bounded.items.map(item => item.id)).toEqual(['b', 'c'])
    expect(bounded.truncated).toBe(true)
  })

  it('injects stable confirmed preferences for unrelated queries and cites facts without duplicate recall', async () => {
    const profile = await service.load()
    const result = await searchUserMemory('unrelated astronomy', { listUserFacts: async () => facts, loadProfile: async () => profile, listActiveEpisodes: async () => [] })
    expect(result.items).toHaveLength(1)
    expect(result.compactContext).toContain('fact:personal')
    expect(result.compactContext).toContain('observation:obs-project')
    facts = [{ ...confirmed('unverified'), confirmation: undefined }]
    const empty = await service.load()
    expect((await searchUserMemory('pnpm', { listUserFacts: async () => facts, loadProfile: async () => empty, listActiveEpisodes: async () => [] })).items).toEqual([])
  })
})
