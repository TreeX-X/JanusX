import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { CandidateFact, MemoryFact } from '../../../src/shared/knowledge'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
import { proposePersonalMemoryCorrection } from '../../../src/main/knowledge/personal-memory-correction'
import { knowledgeReviewService } from '../../../src/main/knowledge/review-service'
import { knowledgeOperationsService } from '../../../src/main/knowledge/operations-service'
import { knowledgeAuditService } from '../../../src/main/knowledge/audit-service'
import { reviewedFactHash } from '../../../src/main/knowledge/profile-projection'
import { userProfileService } from '../../../src/main/knowledge/user-profile-service'
import { getUserMemoryOverview } from '../../../src/main/knowledge/user-overview-service'
import { competingCorrections } from '../../../src/renderer/src/components/knowledge/inboxScope'

const oldRoot = process.env.JANUSX_KNOWLEDGE_ROOT
let root: string
let target: MemoryFact
const input = (content = 'Prefer npm') => ({ targetId: target.id, targetHash: reviewedFactHash(target), content })
async function records<T>(path: string): Promise<T[]> { return (await readFile(join(root, path), 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line)) }
async function writeTarget() { await writeFile(join(root, 'facts/facts.jsonl'), JSON.stringify(target)) }

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'janusx-personal-correction-'))
  process.env.JANUSX_KNOWLEDGE_ROOT = root
  await mkdir(join(root, 'facts'))
  target = { id: 'original', content: 'Prefer pnpm', scope: 'user', kind: 'preference', status: 'active', version: 3,
    concepts: [], files: [], tags: [], confidence: 0.8,
    provenance: { workspaceId: 'user', workspaceName: 'user', workspacePath: '', actor: 'test', source: 'manual',
      sourceObservationIds: ['old-evidence'], fileRefs: [], createdAt: '2026-09-28T00:00:00.000Z' } }
  target.confirmation = { kind: 'human-review', contentHash: reviewedFactHash(target), confirmedAt: '2026-09-28T00:00:00.000Z' }
  await writeTarget()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await knowledgeAuditService.record({ action: 'schema_violation', targetType: 'fact', targetId: 'test-drain', before: null, after: null, provenance: target.provenance })
  await rm(root, { recursive: true, force: true })
  if (oldRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
  else process.env.JANUSX_KNOWLEDGE_ROOT = oldRoot
})

describe('explicit personal memory corrections', () => {
  it('provides the displayed content hash and confirmation state without giving project records a correction surface', async () => {
    const overview = await getUserMemoryOverview()
    expect(overview.habits[0]).toMatchObject({ id: target.id, contentHash: reviewedFactHash(target), confirmed: true })
    target.confirmation = undefined
    await writeTarget()
    expect((await getUserMemoryOverview()).habits[0].confirmed).toBe(false)
    target.scope = 'project'
    target.provenance.workspaceId = 'project-a'
    await writeTarget()
    expect((await getUserMemoryOverview()).habits).toEqual([])
  })

  it('proposes idempotently without changing truth or reusing old evidence for the new claim', async () => {
    const [a, b] = await Promise.all([proposePersonalMemoryCorrection(input()), proposePersonalMemoryCorrection(input())])
    expect(a).toEqual(b)
    expect(a.status).toBe('proposed')
    const candidates = await records<CandidateFact>('facts/candidates.jsonl')
    expect(candidates).toHaveLength(1)
    expect(candidates[0].personalCorrection?.previousContent).toBe(target.content)
    expect(candidates[0].fact.provenance.sourceObservationIds).toEqual([])
    expect(candidates[0].fact.confirmation).toBeUndefined()
    expect((await userProfileService.load()).confirmedFacts?.[0].content).toBe(target.content)
  })

  it('approves an explicit successor and invalidates competing corrections', async () => {
    const a = await proposePersonalMemoryCorrection(input('Prefer npm'))
    const b = await proposePersonalMemoryCorrection(input('Prefer yarn'))
    const candidates = await records<CandidateFact>('facts/candidates.jsonl')
    expect(competingCorrections(candidates, candidates[0])).toBe(1)
    await knowledgeReviewService.applyCandidate({ type: 'fact', id: a.candidateId })
    await expect(knowledgeReviewService.applyCandidate({ type: 'fact', id: b.candidateId })).rejects.toThrow('Personal correction target changed')
    const truth = await records<MemoryFact>('facts/facts.jsonl')
    expect(truth.find(fact => fact.id === target.id)?.status).toBe('archived')
    const active = truth.find(fact => fact.status === 'active')!
    expect(active).toMatchObject({ content: 'Prefer npm', supersedes: target.id, version: 4, scope: 'user' })
    expect(active.confirmation?.contentHash).toBe(reviewedFactHash(active))
    expect((await userProfileService.load()).confirmedFacts?.map(fact => fact.content)).toEqual(['Prefer npm'])
  })

  it('rejects stale displayed content, engineering targets and caller-supplied authority fields', async () => {
    const stale = input()
    target.content = 'Changed under the same version'
    await writeTarget()
    await expect(proposePersonalMemoryCorrection(stale)).rejects.toThrow('Personal correction target changed')
    await expect(proposePersonalMemoryCorrection({ ...input(), scope: 'global' })).rejects.toThrow()
    target.scope = 'project'; target.provenance.workspaceId = 'project-a'
    await writeTarget()
    await expect(proposePersonalMemoryCorrection(input())).rejects.toThrow('not an active personal memory')
  })

  it('prevents approval after revocation or same-version source edits', async () => {
    const proposed = await proposePersonalMemoryCorrection(input())
    target.content = 'Changed original'
    await writeTarget()
    await expect(knowledgeReviewService.applyCandidate({ type: 'fact', id: proposed.candidateId })).rejects.toThrow('Personal correction target changed')
    await knowledgeOperationsService.revoke({ kind: 'fact', id: target.id, workspaceId: 'user' })
    await expect(knowledgeReviewService.applyCandidate({ type: 'fact', id: proposed.candidateId })).rejects.toThrow('Personal correction target changed')
  })

  it('does not recreate rejected corrections and rejects empty, oversized, unchanged or expired submissions', async () => {
    const proposed = await proposePersonalMemoryCorrection(input())
    await knowledgeReviewService.rejectCandidate({ type: 'fact', id: proposed.candidateId })
    expect((await proposePersonalMemoryCorrection(input())).status).toBe('rejected')
    expect(await records('facts/candidates.jsonl')).toHaveLength(1)
    for (const content of ['', 'x'.repeat(4001), target.content]) await expect(proposePersonalMemoryCorrection(input(content))).rejects.toThrow()
    target.ttl = '2020-01-01T00:00:00.000Z'; await writeTarget()
    await expect(proposePersonalMemoryCorrection(input())).rejects.toThrow('expired')
  })

  it('detects changed submitted text and missing bindings at approval', async () => {
    const proposed = await proposePersonalMemoryCorrection(input())
    const [candidate] = await records<CandidateFact>('facts/candidates.jsonl')
    await writeFile(join(root, 'facts/candidates.jsonl'), JSON.stringify({ ...candidate, fact: { ...candidate.fact, content: 'not submitted' } }))
    await expect(knowledgeReviewService.applyCandidate({ type: 'fact', id: proposed.candidateId })).rejects.toThrow('no longer matches')
    await writeFile(join(root, 'facts/candidates.jsonl'), JSON.stringify({ ...candidate, personalCorrection: undefined }))
    await expect(knowledgeReviewService.applyCandidate({ type: 'fact', id: proposed.candidateId })).rejects.toThrow('binding is missing')
  })

  it('preserves corrupt truth and rolls back approval when audit fails', async () => {
    const proposed = await proposePersonalMemoryCorrection(input())
    await writeFile(join(root, 'facts/facts.jsonl'), '{broken')
    await expect(knowledgeReviewService.applyCandidate({ type: 'fact', id: proposed.candidateId })).rejects.toThrow()
    expect(await readFile(join(root, 'facts/facts.jsonl'), 'utf8')).toBe('{broken')
    await writeTarget()
    vi.spyOn(knowledgeAuditService, 'recordBatch').mockRejectedValueOnce(new Error('audit failed'))
    await expect(knowledgeReviewService.applyCandidate({ type: 'fact', id: proposed.candidateId })).rejects.toThrow('audit failed')
    expect((await records<MemoryFact>('facts/facts.jsonl')).map(fact => fact.id)).toEqual([target.id])
    expect((await records<CandidateFact>('facts/candidates.jsonl'))[0].status).toBe('proposed')
  })
})
