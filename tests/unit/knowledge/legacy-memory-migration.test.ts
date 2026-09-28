import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { CandidateFact, MemoryFact } from '../../../src/shared/knowledge'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
import { importLegacyPersonalMemory } from '../../../src/main/knowledge/legacy-memory-migration'
import { knowledgeReviewService } from '../../../src/main/knowledge/review-service'
import { knowledgeOperationsService } from '../../../src/main/knowledge/operations-service'
import { knowledgeAuditService } from '../../../src/main/knowledge/audit-service'
import { userProfileService } from '../../../src/main/knowledge/user-profile-service'
import { reviewedFactHash } from '../../../src/main/knowledge/profile-projection'

const oldRoot = process.env.JANUSX_KNOWLEDGE_ROOT
let root: string
function fact(id = 'old-personal', scope: 'user' | 'project' = 'user'): MemoryFact {
  return { id, scope, status: 'active', content: 'Prefer pnpm', kind: 'preference', version: 2, concepts: [], files: [], tags: [], confidence: 0.8,
    provenance: { workspaceId: scope === 'user' ? 'user' : 'project-a', workspaceName: 'owner', workspacePath: '', source: 'manual',
      sourceObservationIds: ['obs-old'], fileRefs: [], actor: 'legacy', createdAt: '2026-09-01T00:00:00.000Z' } }
}
async function writeFacts(facts: MemoryFact[]) { await writeFile(join(root, 'facts/facts.jsonl'), facts.map(item => JSON.stringify(item)).join('\n')) }
async function records<T>(path: string): Promise<T[]> { return (await readFile(join(root, path), 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line)) }
async function candidates() { return records<CandidateFact>('facts/candidates.jsonl') }

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'janusx-legacy-memory-'))
  process.env.JANUSX_KNOWLEDGE_ROOT = root
  await mkdir(join(root, 'facts'))
  await mkdir(join(root, 'profile'))
  await writeFacts([fact()])
})
afterEach(async () => {
  vi.restoreAllMocks()
  // Drain asynchronous schema diagnostics before removing the temporary store.
  await knowledgeAuditService.record({ action: 'schema_violation', targetType: 'fact', targetId: 'test-drain', before: null, after: null, provenance: fact().provenance })
  await rm(root, { recursive: true, force: true })
  if (oldRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
  else process.env.JANUSX_KNOWLEDGE_ROOT = oldRoot
})

describe('legacy personal memory migration', () => {
  it('proposes personal records only, preserving legacy profile bytes and requiring approval', async () => {
    const confirmed = fact('confirmed')
    confirmed.confirmation = { kind: 'human-review', contentHash: reviewedFactHash(confirmed), confirmedAt: '2026-09-28T00:00:00.000Z' }
    await writeFacts([fact(), fact('project', 'project'), confirmed])
    const raw = '{"identity":"Tree","version":7}'
    await writeFile(join(root, 'profile/profile.json'), raw)
    expect(await importLegacyPersonalMemory()).toEqual({ created: 2, remaining: 0 })
    expect((await candidates()).every(item => item.status === 'proposed' && item.fact.scope === 'user' && !item.fact.confirmation)).toBe(true)
    expect(await readFile(join(root, 'profile/profile.json'), 'utf8')).toBe(raw)
    expect((await records<MemoryFact>('facts/facts.jsonl')).find(item => item.id === 'old-personal')?.status).toBe('active')
    expect((await userProfileService.load()).confirmedFacts?.map(item => item.id)).toEqual(['confirmed'])
  })

  it('confirms through the existing review transaction and keeps the archived predecessor', async () => {
    await importLegacyPersonalMemory()
    const [candidate] = await candidates()
    await knowledgeReviewService.applyCandidate({ type: 'fact', id: candidate.id })
    const truth = await records<MemoryFact>('facts/facts.jsonl')
    expect(truth.find(item => item.id === 'old-personal')?.status).toBe('archived')
    const approved = truth.find(item => item.id === candidate.fact.id)!
    expect(approved.version).toBe(3)
    expect(approved.confirmation?.contentHash).toBe(reviewedFactHash(approved))
    expect((await userProfileService.load()).confirmedFacts?.[0].supersedes).toBe('old-personal')
    expect(await importLegacyPersonalMemory()).toEqual({ created: 0, remaining: 0 })
  })

  it('does not resurrect a rejected migration candidate during concurrent or repeated imports', async () => {
    const imported = await Promise.all([importLegacyPersonalMemory(), importLegacyPersonalMemory()])
    expect(imported.reduce((sum, result) => sum + result.created, 0)).toBe(1)
    const [candidate] = await candidates()
    await knowledgeReviewService.rejectCandidate({ type: 'fact', id: candidate.id })
    expect((await importLegacyPersonalMemory()).created).toBe(0)
    expect((await candidates())[0].status).toBe('rejected')
  })

  it('rejects approval after a source fact changes, while permitting a fresh candidate', async () => {
    await importLegacyPersonalMemory()
    const [candidate] = await candidates()
    await writeFacts([{ ...fact(), content: 'Prefer npm' }])
    await expect(knowledgeReviewService.applyCandidate({ type: 'fact', id: candidate.id })).rejects.toThrow('source changed')
    expect((await importLegacyPersonalMemory()).created).toBe(1)
    expect((await records<MemoryFact>('facts/facts.jsonl'))[0].content).toBe('Prefer npm')
  })

  it('rejects a deleted or changed legacy profile field without overwriting that file', async () => {
    await writeFacts([])
    await writeFile(join(root, 'profile/profile.json'), '{"formatPrefs":["Chinese"]}')
    await importLegacyPersonalMemory()
    const [candidate] = await candidates()
    await writeFile(join(root, 'profile/profile.json'), '{}')
    await expect(knowledgeReviewService.applyCandidate({ type: 'fact', id: candidate.id })).rejects.toThrow('source changed')
    expect(await readFile(join(root, 'profile/profile.json'), 'utf8')).toBe('{}')
  })

  it('does not recreate forgotten confirmed profile entries on import', async () => {
    await writeFacts([])
    await writeFile(join(root, 'profile/profile.json'), '{"identity":"Tree"}')
    await importLegacyPersonalMemory()
    const [candidate] = await candidates()
    await knowledgeReviewService.applyCandidate({ type: 'fact', id: candidate.id })
    await knowledgeOperationsService.revoke({ kind: 'fact', id: candidate.fact.id, workspaceId: 'user' })
    expect((await importLegacyPersonalMemory()).created).toBe(0)
    expect((await userProfileService.load()).confirmedFacts).toEqual([])
  })

  it('rejects a revoked source and a modified candidate', async () => {
    await importLegacyPersonalMemory()
    const [candidate] = await candidates()
    await writeFile(join(root, 'facts/candidates.jsonl'), JSON.stringify({ ...candidate, fact: { ...candidate.fact, content: 'tampered' } }))
    await expect(knowledgeReviewService.applyCandidate({ type: 'fact', id: candidate.id })).rejects.toThrow('does not match')
    await knowledgeOperationsService.revoke({ kind: 'fact', id: 'old-personal', workspaceId: 'user' })
    await expect(knowledgeReviewService.applyCandidate({ type: 'fact', id: candidate.id })).rejects.toThrow('source changed')
  })

  it('continues bounded imports without duplicate candidates', async () => {
    await writeFacts([])
    await writeFile(join(root, 'profile/profile.json'), JSON.stringify({ formatPrefs: Array.from({ length: 101 }, (_, i) => `preference-${i}`) }))
    expect(await importLegacyPersonalMemory()).toEqual({ created: 100, remaining: 1 })
    expect(await importLegacyPersonalMemory()).toEqual({ created: 1, remaining: 0 })
    expect((await importLegacyPersonalMemory()).created).toBe(0)
    expect(await candidates()).toHaveLength(101)
  })

  it('fails on corrupt inputs and leaves their bytes unchanged', async () => {
    await writeFile(join(root, 'profile/profile.json'), '{broken')
    await expect(importLegacyPersonalMemory()).rejects.toThrow()
    expect(await readFile(join(root, 'profile/profile.json'), 'utf8')).toBe('{broken')
    await writeFile(join(root, 'profile/profile.json'), '{}')
    await writeFile(join(root, 'facts/candidates.jsonl'), '{broken-candidate')
    await expect(importLegacyPersonalMemory()).rejects.toThrow()
    expect(await readFile(join(root, 'facts/candidates.jsonl'), 'utf8')).toBe('{broken-candidate')
  })

  it('preserves corrupt truth at approval and rolls back an audit failure', async () => {
    await importLegacyPersonalMemory()
    const [candidate] = await candidates()
    await writeFile(join(root, 'facts/facts.jsonl'), '{broken-fact')
    await expect(knowledgeReviewService.applyCandidate({ type: 'fact', id: candidate.id })).rejects.toThrow()
    expect(await readFile(join(root, 'facts/facts.jsonl'), 'utf8')).toBe('{broken-fact')
    await writeFacts([fact()])
    vi.spyOn(knowledgeAuditService, 'recordBatch').mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(knowledgeReviewService.applyCandidate({ type: 'fact', id: candidate.id })).rejects.toThrow('audit unavailable')
    expect((await records<MemoryFact>('facts/facts.jsonl')).map(item => item.id)).toEqual(['old-personal'])
    expect((await candidates())[0].status).toBe('proposed')
  })

  it('preserves a partially corrupt candidate journal on both approval and rejection', async () => {
    await importLegacyPersonalMemory()
    const [candidate] = await candidates()
    const raw = JSON.stringify(candidate) + '\n{broken'
    await writeFile(join(root, 'facts/candidates.jsonl'), raw)
    await expect(knowledgeReviewService.applyCandidate({ type: 'fact', id: candidate.id })).rejects.toThrow()
    await expect(knowledgeReviewService.rejectCandidate({ type: 'fact', id: candidate.id })).rejects.toThrow()
    expect(await readFile(join(root, 'facts/candidates.jsonl'), 'utf8')).toBe(raw)
  })

  it('rejects lost source bindings instead of treating migration as an ordinary candidate', async () => {
    await importLegacyPersonalMemory()
    const [candidate] = await candidates()
    await writeFile(join(root, 'facts/candidates.jsonl'), JSON.stringify({ ...candidate, legacySource: undefined }))
    await expect(knowledgeReviewService.applyCandidate({ type: 'fact', id: candidate.id })).rejects.toThrow('binding is missing')
  })
})
