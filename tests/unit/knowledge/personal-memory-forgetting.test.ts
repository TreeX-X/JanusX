import { reviewFixture } from './review-fixture'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { CandidateFact, MemoryFact } from '../../../src/shared/knowledge'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
import { forgetPersonalMemory, forgetPersonalMemoryQuery } from '../../../src/main/knowledge/personal-memory-forgetting'
import { episodeContentHash, PersonalForgettingBarrier, readPersonalForgettingBarrier } from '../../../src/main/knowledge/personal-forgetting-barrier'
import { proposePersonalMemoryCorrection } from '../../../src/main/knowledge/personal-memory-correction'
import { knowledgeReviewService, proposeFactCandidates, listProposedUserFactCandidates } from '../../../src/main/knowledge/review-service'
import { knowledgeTruthService } from '../../../src/main/knowledge/truth-service'
import { knowledgeExtractService } from '../../../src/main/knowledge/extract-service'
import { importLegacyPersonalMemory } from '../../../src/main/knowledge/legacy-memory-migration'
import { reviewedFactHash } from '../../../src/main/knowledge/profile-projection'
import { userProfileService } from '../../../src/main/knowledge/user-profile-service'
import { userEpisodeService } from '../../../src/main/knowledge/user-episode-service'
import { searchUserMemoryDefault } from '../../../src/main/knowledge/user-recall-service'
import { knowledgeRecallService } from '../../../src/main/knowledge/recall-service'
import * as atomic from '../../../src/main/lib/atomic-file'

const oldRoot = process.env.JANUSX_KNOWLEDGE_ROOT
let root: string
let target: MemoryFact
const input = () => ({ targetId: target.id, targetHash: reviewedFactHash(target) })
async function writeRecords(path: string, records: unknown[]) {
  await writeFile(join(root, path), records.map(value => JSON.stringify(value)).join('\n'))
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'janusx-personal-forget-'))
  process.env.JANUSX_KNOWLEDGE_ROOT = root
  await Promise.all(['facts', 'profile', 'episodes'].map(path => mkdir(join(root, path))))
  target = { id: 'personal', content: 'Prefer pnpm', scope: 'user', kind: 'preference', status: 'active', version: 1,
    concepts: [], files: [], tags: [], confidence: 0.8,
    provenance: { workspaceId: 'project-a', workspaceName: 'Project A', workspacePath: '/project-a', actor: 'test', source: 'manual',
      sourceObservationIds: ['source-event'], fileRefs: [], createdAt: '2026-09-28T00:00:00.000Z' } }
  target.confirmation = { kind: 'human-review', contentHash: reviewedFactHash(target), confirmedAt: '2026-09-28T00:00:00.000Z' }
  await writeRecords('facts/facts.jsonl', [target])
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
  if (oldRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
  else process.env.JANUSX_KNOWLEDGE_ROOT = oldRoot
})

describe('durable selected personal memory forgetting', () => {
  it('removes personal truth, profile, related episodes and candidates while retaining engineering sources', async () => {
    const project = { ...target, id: 'engineering', scope: 'project' }
    await writeRecords('facts/facts.jsonl', [target, project])
    await writeRecords('episodes/old.jsonl', [{ id: 'episode', content: 'Discussed pnpm', tags: [], status: 'active',
      sourceObservationIds: ['source-event'], createdAt: new Date().toISOString(), expiresAt: '2099-01-01T00:00:00.000Z', ttlDays: 30 }])
    const correction = await proposePersonalMemoryCorrection({ ...input(), content: 'Prefer npm' })
    expect((await userProfileService.load()).confirmedFacts).toHaveLength(1)
    const raw = await readFile(join(root, 'facts/facts.jsonl'), 'utf8')
    await forgetPersonalMemory(input())
    expect((await knowledgeTruthService.list()).facts.map(fact => fact.id)).toEqual(['engineering'])
    expect((await userProfileService.load()).confirmedFacts).toEqual([])
    expect(await userEpisodeService.listActive()).toEqual([])
    expect((await searchUserMemoryDefault('pnpm')).compactContext).toBe('')
    expect(await listProposedUserFactCandidates()).toEqual([])
    expect((await knowledgeExtractService.listFactCandidates())[0].status).toBe('rejected')
    await expect(knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: correction.candidateId }))).rejects.toThrow('forgotten')
    expect(await readFile(join(root, 'facts/facts.jsonl'), 'utf8')).toBe(raw)
    const receipt = await readFile(join(root, 'profile/forgotten.json'), 'utf8')
    expect(receipt).not.toContain('Prefer pnpm')
    expect(receipt).not.toContain('source-event')
  })

  it('survives fresh readers and candidate journal loss; blocks replay, not engineering admissions', async () => {
    await forgetPersonalMemory(input())
    const barrier = new PersonalForgettingBarrier((await readPersonalForgettingBarrier()).records)
    expect(barrier.blocksFact(target)).toBe(true)
    const candidate: CandidateFact = { id: 'replay', type: 'fact', status: 'proposed', derivation: 'deterministic',
      fact: { ...target, id: 'different-id', content: 'Paraphrased preference', status: 'proposed' }, evidence: { observationIds: ['source-event'], snippets: [] } }
    expect(await proposeFactCandidates([candidate])).toEqual([])
    expect(await proposeFactCandidates([{ ...candidate, fact: { ...candidate.fact, scope: 'project' } }])).toHaveLength(1)
    await writeFile(join(root, 'profile/profile.json'), JSON.stringify({ formatPrefs: ['Prefer pnpm'] }))
    expect(await importLegacyPersonalMemory()).toEqual({ created: 0, remaining: 0 })
  })

  it('follows version history and candidate-only evidence dependencies', async () => {
    const old = { ...target, id: 'previous', content: 'Old preference', status: 'archived', provenance: { ...target.provenance, sourceObservationIds: ['old-event'] } }
    target.supersedes = old.id
    await writeRecords('facts/facts.jsonl', [old, target])
    await writeRecords('facts/candidates.jsonl', [{ id: 'original-candidate', type: 'fact', status: 'applied', fact: target,
      evidence: { observationIds: ['extra-event'], snippets: [] } }])
    await forgetPersonalMemory(input())
    const barrier = await readPersonalForgettingBarrier()
    expect(barrier.blocksContent('Old preference')).toBe(true)
    expect(barrier.blocksObservations(['extra-event'])).toBe(true)
    expect(barrier.blocksTask({ scope: 'user', candidateId: 'new', evidenceHashes: { 'old-event': 'hash' } })).toBe(true)
    expect(barrier.blocksTask({ scope: 'project', candidateId: 'new', evidenceHashes: { 'old-event': 'hash' } })).toBe(false)
  })

  it('commits once for concurrent retries and suppresses exact manual overrides', async () => {
    await writeFile(join(root, 'profile/overrides.json'), JSON.stringify({ identity: 'Prefer pnpm', toolPrefs: ['Prefer pnpm', 'Other preference'] }))
    await Promise.all([forgetPersonalMemory(input()), forgetPersonalMemory(input())])
    expect((await readPersonalForgettingBarrier()).records).toHaveLength(1)
    expect(await userProfileService.load()).toMatchObject({ toolPrefs: ['Other preference'] })
    expect((await userProfileService.load()).identity).toBeUndefined()
    await expect(proposePersonalMemoryCorrection({ ...input(), content: 'Changed' })).rejects.toThrow()
  })

  it('rejects stale, nonpersonal and forged requests without creating a barrier', async () => {
    await expect(forgetPersonalMemory({ ...input(), targetHash: 'a'.repeat(64) })).rejects.toThrow()
    await expect(forgetPersonalMemory({ ...input(), scope: 'user' })).rejects.toThrow()
    target.scope = 'project'; await writeRecords('facts/facts.jsonl', [target])
    await expect(forgetPersonalMemory(input())).rejects.toThrow()
    expect((await readPersonalForgettingBarrier()).records).toEqual([])
  })

  it('preserves malformed journals and fails closed on a corrupt barrier', async () => {
    await writeFile(join(root, 'facts/candidates.jsonl'), '{broken')
    await expect(forgetPersonalMemory(input())).rejects.toThrow()
    expect(await readFile(join(root, 'facts/candidates.jsonl'), 'utf8')).toBe('{broken')
    await writeFile(join(root, 'profile/forgotten.json'), '{broken')
    await expect(knowledgeTruthService.list()).rejects.toThrow()
    await expect(userProfileService.load()).rejects.toThrow()
    await expect(forgetPersonalMemory(input())).rejects.toThrow()
    expect(await readFile(join(root, 'profile/forgotten.json'), 'utf8')).toBe('{broken')
  })

  it('leaves memory usable when the atomic write fails and permits a successful retry', async () => {
    const write = vi.spyOn(atomic, 'writeFileAtomic').mockRejectedValueOnce(new Error('disk unavailable'))
    await expect(forgetPersonalMemory(input())).rejects.toThrow('disk unavailable')
    expect((await knowledgeTruthService.list()).facts).toHaveLength(1)
    write.mockRestore()
    await forgetPersonalMemory(input())
    expect((await knowledgeTruthService.list()).facts).toEqual([])
  })

  it('invalidates a warm governance index and discards recall assembled across forgetting', async () => {
    const correction = await proposePersonalMemoryCorrection({ ...input(), content: 'Prefer pnpm nightly' })
    const request = { query: 'pnpm', scope: 'user' as const, layer: 'governance' as const, workspaceId: 'project-a' }
    expect((await knowledgeRecallService.recall(request)).documents.some(doc => doc.hit.id === correction.candidateId)).toBe(true)
    const profile = await userProfileService.load()
    let release!: () => void
    const load = vi.spyOn(userProfileService, 'load').mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(profile) }))
    const recall = searchUserMemoryDefault('pnpm')
    await vi.waitFor(() => expect(load).toHaveBeenCalled())
    await forgetPersonalMemory(input())
    release()
    expect((await recall).compactContext).toBe('')
    expect((await knowledgeRecallService.recall(request)).documents).toEqual([])
  })

  it('recovers an acknowledged-late atomic commit without another lifecycle record', async () => {
    const original = atomic.writeFileAtomic
    const write = vi.spyOn(atomic, 'writeFileAtomic').mockImplementationOnce(async (...args) => {
      await original(...args)
      throw new Error('response lost after commit')
    })
    await expect(forgetPersonalMemory(input())).rejects.toThrow('response lost')
    write.mockRestore()
    expect((await knowledgeTruthService.list()).facts).toEqual([])
    await forgetPersonalMemory(input())
    expect((await readPersonalForgettingBarrier()).records).toHaveLength(1)
  })

  it('forgets an independent episode and rejects its evidence replay without changing engineering sources', async () => {
    const episode = await userEpisodeService.capture({ content: 'Prefer isolated event', sourceObservationIds: ['independent-source'] })
    const selected = { kind: 'episode', targetId: episode.id, targetHash: episodeContentHash(episode) }
    await expect(forgetPersonalMemory({ ...selected, targetHash: 'a'.repeat(64) })).rejects.toThrow('episode changed')
    await forgetPersonalMemory(selected)
    await forgetPersonalMemory(selected)
    expect(await userEpisodeService.listActive()).toEqual([])
    expect((await readPersonalForgettingBarrier()).blocksObservations(['independent-source'])).toBe(true)
    expect((await knowledgeTruthService.list()).facts).toHaveLength(1)
    expect((await readPersonalForgettingBarrier()).records).toHaveLength(1)
  })

  it('atomically forgets chat-query facts and events and repeats after acknowledgement loss', async () => {
    await userEpisodeService.capture({ content: 'pnpm recent event' })
    const request = { query: 'pnpm', confirm: true }
    const write = vi.spyOn(atomic, 'writeFileAtomic').mockRejectedValueOnce(new Error('disk unavailable'))
    await expect(forgetPersonalMemoryQuery(request)).rejects.toThrow('disk unavailable')
    write.mockRestore()
    expect((await knowledgeTruthService.list()).facts).toHaveLength(1)
    expect(await userEpisodeService.listActive()).toHaveLength(1)
    const result = await forgetPersonalMemoryQuery(request)
    expect(result).toMatchObject({ archivedFactIds: [target.id], mode: 'logical', silent: true })
    expect(result.expiredEpisodeIds).toHaveLength(1)
    expect(await forgetPersonalMemoryQuery(request)).toEqual(result)
    expect((await readPersonalForgettingBarrier()).records).toHaveLength(1)
    expect((await searchUserMemoryDefault('pnpm')).items).toEqual([])
  })

  it('covers legacy episodes beyond the recall cap and preserves malformed source files', async () => {
    const episodes = Array.from({ length: 205 }, (_, i) => ({ id: `legacy-${i}`, content: 'pnpm event', tags: [], status: 'active',
      sourceObservationIds: [], createdAt: '2026-09-28T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z', ttlDays: 30 }))
    await writeRecords('episodes/legacy.jsonl', episodes)
    expect((await forgetPersonalMemoryQuery({ query: 'pnpm', confirm: true })).expiredEpisodeIds).toHaveLength(205)
    expect(await userEpisodeService.listActive()).toEqual([])
    await writeFile(join(root, 'episodes/legacy.jsonl'), '{broken')
    await expect(forgetPersonalMemoryQuery({ query: 'pnpm', confirm: true })).rejects.toThrow()
    expect(await readFile(join(root, 'episodes/legacy.jsonl'), 'utf8')).toBe('{broken')
    expect((await readPersonalForgettingBarrier()).records).toHaveLength(1)
  })

  it('requires explicit query confirmation and ignores invalid or unmatched requests', async () => {
    await expect(forgetPersonalMemoryQuery({ query: 'pnpm', confirm: false })).rejects.toThrow()
    await expect(forgetPersonalMemoryQuery({ query: 'pnpm', confirm: true, scope: 'project' })).rejects.toThrow()
    await expect(forgetPersonalMemoryQuery({ query: 'a', confirm: true })).rejects.toThrow('too broad')
    await expect(forgetPersonalMemoryQuery({ query: 'nonexistent-zebra', confirm: true })).rejects.toThrow('no user memory')
    expect((await readPersonalForgettingBarrier()).records).toEqual([])
  })

  it('aborts the complete query when an observation shard is malformed', async () => {
    await userEpisodeService.capture({ content: 'pnpm event' })
    const path = join(root, 'observations/active/broken.jsonl')
    await writeFile(path, '{broken')
    await expect(forgetPersonalMemoryQuery({ query: 'pnpm', confirm: true })).rejects.toThrow('Invalid observation source journal')
    expect((await readPersonalForgettingBarrier()).records).toEqual([])
    expect(await readFile(path, 'utf8')).toBe('{broken')
  })
})
