import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { knowledgeObservationService, resetObservationServiceEphemeralState } from '../../../src/main/knowledge/observation-service'
import { runDeterministicStage } from '../../../src/main/knowledge/deterministic-extractor'
import { knowledgeExtractService } from '../../../src/main/knowledge/extract-service'
import { knowledgeReviewService } from '../../../src/main/knowledge/review-service'
import { knowledgeTruthService } from '../../../src/main/knowledge/truth-service'
import { userEpisodeService } from '../../../src/main/knowledge/user-episode-service'
import { getUserMemoryOverview } from '../../../src/main/knowledge/user-overview-service'
import { reviewedFactHash } from '../../../src/main/knowledge/profile-projection'
import { reviewFixture } from './review-fixture'
import { knowledgeAuditService } from '../../../src/main/knowledge/audit-service'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
vi.mock('../../../src/main/knowledge/processing-queue', () => ({ knowledgeProcessingQueue: { schedule: vi.fn() } }))

describe('fact evidence approval and persona lifecycle', () => {
  let root: string
  const previousRoot = process.env.JANUSX_KNOWLEDGE_ROOT
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'janusx-remaining-audit-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = root
    resetObservationServiceEphemeralState()
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    const resolvedRoot = resolve(root)
    if (dirname(resolvedRoot) !== resolve(tmpdir()) || !basename(resolvedRoot).startsWith('janusx-remaining-audit-')) {
      throw new Error('Unexpected fixture cleanup path')
    }
    await rm(resolvedRoot, { recursive: true, force: true })
    if (previousRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
    else process.env.JANUSX_KNOWLEDGE_ROOT = previousRoot
  })

  async function projectCandidate(event: string) {
    const observation = await knowledgeObservationService.capture({
      workspaceId: 'audit-project', workspacePath: 'C:/audit-project', source: 'tool',
      type: 'analysis-result', content: '决定：采用软删除方案', actor: 'engineering-host',
    }, { speaker: 'tool', sourceEventId: event })
    await runDeterministicStage({ workspaceId: observation.workspaceId, observations: [observation] })
    const candidate = (await knowledgeExtractService.listFactCandidates()).find(item => item.evidence.observationIds.includes(observation.id))!
    expect(candidate).toBeDefined()
    return { observation, candidate }
  }

  async function personalCandidate() {
    const observation = await knowledgeObservationService.capture({
      workspaceId: 'user', workspacePath: 'user', source: 'janus-chat',
      type: 'conversation-turn', content: '我习惯用 pnpm 而不用 npm', actor: 'user',
    }, { speaker: 'user', sourceEventId: 'personal-turn' })
    await runDeterministicStage({ workspaceId: 'user', observations: [observation] })
    const [candidate] = await knowledgeExtractService.listFactCandidates()
    expect(candidate).toBeDefined()
    return { observation, candidate }
  }

  it('merges identical facts and both source references across separately approved batches', async () => {
    const first = await projectCandidate('turn-1')
    await knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: first.candidate.id }))
    const second = await projectCandidate('turn-2')
    await knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: second.candidate.id }))
    const facts = (await knowledgeTruthService.list()).facts
    expect(facts.map(fact => ({ content: fact.content, sources: fact.provenance.sourceObservationIds }))).toEqual([
      { content: first.candidate.fact.content, sources: [first.observation.id, second.observation.id] },
    ])
    expect(facts[0].id).toBe(first.candidate.fact.id)
    expect(facts[0].version).toBe(1)
  })

  it('rolls back merged evidence and candidates when the audit commit fails', async () => {
    const first = await projectCandidate('turn-1')
    await knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: first.candidate.id }))
    const second = await projectCandidate('turn-2')
    const before = await readFile(join(root, 'facts', 'facts.jsonl'), 'utf8')
    vi.spyOn(knowledgeAuditService, 'recordBatch').mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: second.candidate.id }))).rejects.toThrow('audit unavailable')
    expect(await readFile(join(root, 'facts', 'facts.jsonl'), 'utf8')).toBe(before)
    expect((await knowledgeExtractService.listFactCandidates()).find(row => row.id === second.candidate.id)?.status).toBe('proposed')
    await knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: second.candidate.id }))
    expect((await knowledgeTruthService.list()).facts[0].provenance.sourceObservationIds).toHaveLength(2)
  })

  it('serializes concurrent approvals of identical facts into one evidence union', async () => {
    const first = await projectCandidate('turn-1')
    const second = await projectCandidate('turn-2')
    await Promise.all([first, second].map(async row => knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: row.candidate.id }))))
    const facts = (await knowledgeTruthService.list()).facts
    expect(facts).toHaveLength(1)
    expect(new Set(facts[0].provenance.sourceObservationIds)).toEqual(new Set([first.observation.id, second.observation.id]))
  })

  it('keeps identical facts in independent project domains', async () => {
    const first = await projectCandidate('turn-1')
    await knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: first.candidate.id }))
    const other = await knowledgeObservationService.capture({ workspaceId: 'other-project', workspacePath: 'C:/other-project', source: 'tool',
      type: 'analysis-result', content: first.observation.content }, { speaker: 'tool', sourceEventId: 'turn-2' })
    await runDeterministicStage({ workspaceId: other.workspaceId, observations: [other] })
    const candidate = (await knowledgeExtractService.listFactCandidates()).find(row => row.evidence.observationIds.includes(other.id))!
    await knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: candidate.id }))
    expect((await knowledgeTruthService.list()).facts).toHaveLength(2)
  })

  it('refuses ordinary approval after the referenced source content changes', async () => {
    const { observation, candidate } = await personalCandidate()
    const input = await reviewFixture({ type: 'fact', id: candidate.id })
    const shard = join(root, 'observations', 'active', `${observation.createdAt.slice(0, 7)}.jsonl`)
    const changedContent = '本轮只是引用别人的话，并非我的习惯'
    const rows = (await readFile(shard, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line))
    const changed = rows.map(row => row.id === observation.id ? {
      ...row, content: changedContent, contentPreview: changedContent,
      contentHash: createHash('sha256').update(changedContent).digest('hex'),
      sourceEvidence: { ...row.sourceEvidence, excerpt: changedContent },
    } : row)
    await writeFile(shard, changed.map(row => JSON.stringify(row)).join('\n') + '\n')
    expect((await knowledgeObservationService.listAll(true)).find(row => row.id === observation.id)?.content).toBe(changedContent)
    await expect(knowledgeReviewService.applyCandidate(input)).rejects.toThrow()
  })

  it('recomputes source bytes instead of trusting an unchanged stored digest', async () => {
    const { observation, candidate } = await personalCandidate()
    const shard = join(root, 'observations', 'active', `${observation.createdAt.slice(0, 7)}.jsonl`)
    await writeFile(shard, JSON.stringify({ ...observation, content: observation.content + '；后来已经纠正。' }) + '\n')
    await expect(knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: candidate.id }))).rejects.toThrow('source changed')
    expect((await knowledgeTruthService.list()).facts).toEqual([])
  })

  it('refuses a pending ordinary candidate whose source Episode has expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'))
    const episode = await userEpisodeService.capture({ content: '我习惯用 pnpm 而不用 npm', ttlDays: 30, sourceEventId: 'episode-turn' }, { speaker: 'user' })
    const observation = (await knowledgeObservationService.listAll(true)).find(row => row.id === episode.id)!
    await runDeterministicStage({ workspaceId: 'user', observations: [observation] })
    const [candidate] = await knowledgeExtractService.listFactCandidates()
    expect(candidate).toBeDefined()
    const input = await reviewFixture({ type: 'fact', id: candidate.id })
    vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'))
    expect(await userEpisodeService.listActive()).toEqual([])
    await expect(knowledgeReviewService.applyCandidate(input)).rejects.toThrow()
  })

  it('excludes expired confirmed facts from current persona memories', async () => {
    const { candidate } = await personalCandidate()
    const result = await knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: candidate.id }))
    const fact = { ...result.applied!.fact!, ttl: '2020-01-01T00:00:00.000Z' }
    fact.confirmation = { kind: 'human-review', contentHash: reviewedFactHash(fact), confirmedAt: '2019-01-01T00:00:00.000Z' }
    await writeFile(join(root, 'facts', 'facts.jsonl'), JSON.stringify(fact) + '\n')
    const overview = await getUserMemoryOverview()
    expect(overview.profile.confirmedFacts).toEqual([])
    expect(overview.habits).toEqual([])
  })

  it('reports corrupt pending-candidate storage instead of an apparently empty pending list', async () => {
    await personalCandidate()
    await writeFile(join(root, 'facts', 'candidates.jsonl'), '{broken-json}\n')
    await expect(getUserMemoryOverview()).rejects.toThrow()
  })
})
