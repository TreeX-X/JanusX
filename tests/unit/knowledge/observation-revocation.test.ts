import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { CandidateFact, MemoryFact, Observation } from '../../../src/shared/knowledge'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
import { knowledgeObservationService } from '../../../src/main/knowledge/observation-service'
import { observationRevocationContext, revokeObservation, listObservationRevocations } from '../../../src/main/knowledge/observation-revocation'
import { readObservationRevocationBarrier, revocationPath, sourceKey } from '../../../src/main/knowledge/observation-revocation-barrier'
import { knowledgeTruthService } from '../../../src/main/knowledge/truth-service'
import { knowledgeExtractService } from '../../../src/main/knowledge/extract-service'
import { knowledgeReviewService, proposeFactCandidates } from '../../../src/main/knowledge/review-service'
import { userProfileService } from '../../../src/main/knowledge/user-profile-service'
import { reviewedFactHash } from '../../../src/main/knowledge/profile-projection'
import { KnowledgeRecallService } from '../../../src/main/knowledge/recall-service'
import { isActiveObservation } from '../../../src/main/knowledge/memory-evidence'
import { reviewFixture } from './review-fixture'
import * as atomic from '../../../src/main/lib/atomic-file'
import { RefinementTaskService } from '../../../src/main/knowledge/refinement-tasks'
import { candidateDecisionHash } from '../../../src/main/knowledge/decision-scorer'
import { DEFAULT_KNOWLEDGE_SETTINGS } from '../../../src/shared/knowledge-settings'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'

let root: string
let source: Observation
let fact: MemoryFact
let candidate: CandidateFact
const previousRoot = process.env.JANUSX_KNOWLEDGE_ROOT
const input = async () => ({ id: source.id, workspaceId: source.workspaceId, sourceHash: (await observationRevocationContext({ id: source.id, workspaceId: source.workspaceId })).sourceHash })
const records = async (path: string, values: unknown[]) => writeFile(join(root, path), values.map(value => JSON.stringify(value)).join('\n') + '\n')
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'janusx-revoke-source-'))
  process.env.JANUSX_KNOWLEDGE_ROOT = root
  await Promise.all(['facts', 'graph', 'wiki', 'observations/active'].map(path => mkdir(join(root, path), { recursive: true })))
  source = { id: 'source', workspaceId: 'ws', workspaceName: 'ws', workspacePath: root, scope: 'project', source: 'manual', type: 'user-note',
    content: 'Prefer pnpm', fileRefs: [], tags: [], visibility: 'workspace', actor: 'user', createdAt: new Date().toISOString(), retentionClass: 'evidence',
    contentHash: 'a'.repeat(64), dedupeKey: 'b'.repeat(64), contentLength: 11, compactionStatus: 'active' }
  fact = { id: 'fact', content: 'Prefer pnpm', scope: 'user', kind: 'preference', status: 'active', version: 1, confidence: 0.8, concepts: [], files: [], tags: [],
    provenance: { workspaceId: 'ws', workspaceName: 'ws', workspacePath: root, source: 'manual', sourceObservationIds: [source.id], fileRefs: [], actor: 'user', createdAt: source.createdAt } }
  fact.confirmation = { kind: 'human-review', contentHash: reviewedFactHash(fact), confirmedAt: source.createdAt }
  candidate = { id: 'candidate', type: 'fact', status: 'proposed', derivation: 'deterministic', fact: { ...fact, id: 'proposed', status: 'proposed' }, evidence: { observationIds: [source.id] } }
  await records('observations/active/2026-09.jsonl', [source])
  await records('facts/facts.jsonl', [fact, { ...fact, id: 'independent', scope: 'project', provenance: { ...fact.provenance, sourceObservationIds: [] } }])
  await records('facts/candidates.jsonl', [candidate])
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
  if (previousRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
  else process.env.JANUSX_KNOWLEDGE_ROOT = previousRoot
})

describe('durable observation revocation', () => {
  it('resolves old evidence by workspace and ID beyond the recent 40 without mutation', async () => {
    const old = { ...source, createdAt: '2020-01-01T00:00:00.000Z', content: 'Old original evidence' }
    await records('observations/active/2026-09.jsonl', [old, ...Array.from({ length: 45 }, (_, i) => ({ ...source, id: 'new-' + i }))])
    const before = await readFile(join(root, 'observations/active/2026-09.jsonl'), 'utf8')
    expect((await knowledgeObservationService.list({ scope: 'workspace', workspaceId: 'ws', limit: 40 })).some(item => item.id === old.id)).toBe(false)
    expect(await observationRevocationContext({ id: old.id, workspaceId: 'ws' })).toMatchObject({ content: old.content, revoked: false })
    await expect(observationRevocationContext({ id: old.id, workspaceId: 'other' })).rejects.toThrow('missing or ambiguous')
    expect(await readFile(join(root, 'observations/active/2026-09.jsonl'), 'utf8')).toBe(before)
  })

  it.each(['available', 'changed', 'missing', 'ambiguous'] as const)('keeps the receipt visible when source is %s without writing storage', async status => {
    await revokeObservation(await input())
    if (status === 'changed') await records('observations/active/2026-09.jsonl', [{ ...source, content: 'new text' }])
    if (status === 'missing') await records('observations/active/2026-09.jsonl', [])
    if (status === 'ambiguous') await records('observations/active/2026-09.jsonl', [source, source])
    const before = await readFile(revocationPath(), 'utf8')
    const page = await listObservationRevocations({})
    expect(page).toMatchObject({ total: 1, offset: 0, limit: 20, items: [{ sourceStatus: status, observationCount: 1, factCount: 2 }] })
    if (status === 'available') expect(page.items[0].source?.content).toBe(source.content)
    if (status === 'changed') expect(page.items[0].source?.content).toBe('new text')
    if (status === 'missing' || status === 'ambiguous') expect(page.items[0].source).toBeUndefined()
    expect(await readFile(revocationPath(), 'utf8')).toBe(before)
  })

  it('pages deterministically, bounds previews and rejects invalid pagination or damaged sources', async () => {
    await revokeObservation(await input())
    const record = (await readObservationRevocationBarrier()).records[0]
    await writeFile(revocationPath(), JSON.stringify({ version: 1, records: Array.from({ length: 25 }, (_, index) => ({ ...record, source: index === 0 ? record.source : sourceKey('ws', `source-${index}`), revokedAt: new Date(Date.UTC(2026, 8, 29, 0, 25 - index)).toISOString() })) }))
    await records('observations/active/2026-09.jsonl', [{ ...source, content: 'x'.repeat(5000) }])
    const first = await listObservationRevocations({ limit: 20 })
    const second = await listObservationRevocations({ offset: 20, limit: 20 })
    expect(first.total).toBe(25)
    expect(first.items).toHaveLength(20)
    expect(second.items).toHaveLength(5)
    expect(new Set([...first.items, ...second.items].map(item => item.key)).size).toBe(25)
    expect(first.items[0].source).toMatchObject({ truncated: true, content: 'x'.repeat(4000) })
    await expect(listObservationRevocations({ limit: 101 })).rejects.toThrow()
    await expect(listObservationRevocations({ offset: -1 })).rejects.toThrow()
    await writeFile(join(root, 'observations/active/broken.jsonl'), '{bad')
    await expect(listObservationRevocations({})).rejects.toThrow()
  })

  it('cancels refinement and rejects provider output when its source is withdrawn in flight', async () => {
    candidate.fact.scope = 'project'
    await records('facts/candidates.jsonl', [candidate])
    const service = new RefinementTaskService({
      listCandidates: () => knowledgeExtractService.listFactCandidates(),
      listObservations: () => knowledgeObservationService.listAll(true),
      listTruth: async () => (await knowledgeTruthService.list()).facts,
      resolveContent: source => knowledgeObservationService.resolveContent(source),
      settings: async () => ({ ...DEFAULT_KNOWLEDGE_SETTINGS, enabled: true }), hasModel: async () => true,
      scorerIdentity: () => ({ provider: 'noop', modelRevision: 'none', templateVersion: 'none', calibrationId: null }), nowMs: Date.now,
      extract: async (_observations, _hashes, validate) => {
        expect(await validate!()).toBe(true)
        await revokeObservation(await input())
        expect(await validate!()).toBe(false)
        expect(await service.stats()).toMatchObject({ cancelled: 1, running: 0 })
      },
    })
    await service.enqueueManual(candidate.id, candidateDecisionHash(candidate))
    expect(await service.runDue()).toMatchObject({ cancelled: 1, processed: 0 })
    expect((await service.list())[0].status).toBe('cancelled')
  })

  it('withdraws a source stored in a gzip archive and rejects a corrupt revocation ledger', async () => {
    const raw = await readFile(join(root, 'observations/active/2026-09.jsonl'))
    await mkdir(join(root, 'observations/archive'))
    await writeFile(join(root, 'observations/archive/2026-09.jsonl.gz'), await promisify(gzip)(raw))
    await rm(join(root, 'observations/active/2026-09.jsonl'))
    await revokeObservation(await input())
    expect(isActiveObservation((await knowledgeObservationService.listAll(true))[0])).toBe(false)
    await writeFile(revocationPath(), '{broken')
    await expect(knowledgeTruthService.list()).rejects.toThrow()
    await expect(knowledgeExtractService.listFactCandidates()).rejects.toThrow()
    expect(await readFile(revocationPath(), 'utf8')).toBe('{broken')
  })

  it('withdraws derived truth, profile, wiki, graph and candidates without deleting originals', async () => {
    await records('graph/edges.jsonl', [{ id: 'edge', from: 'a', to: 'b', type: 'mentions', confidence: 1, sourceFactIds: [fact.id], workspaceId: 'ws', createdAt: source.createdAt }])
    await writeFile(join(root, 'wiki/page.md'), 'pnpm page')
    await writeFile(join(root, 'wiki/pages-index.json'), JSON.stringify({ version: 1, pages: [{ slug: 'page', title: 'pnpm', relativePath: 'wiki/page.md', markdown: '', tags: [], status: 'published', sourceFactIds: [fact.id], updatedAt: source.createdAt, version: 1, workspaceId: 'ws' }] }))
    const original = await readFile(join(root, 'facts/facts.jsonl'), 'utf8')
    expect((await userProfileService.load()).confirmedFacts).toHaveLength(1)
    // Engineering Wiki cannot recall a private or cross-workspace source even before withdrawal.
    expect((await knowledgeTruthService.list()).wikiPages).toHaveLength(0)
    expect((await knowledgeTruthService.list({ includeStaleWiki: true })).wikiPages).toHaveLength(1)
    await revokeObservation(await input())
    const truth = await knowledgeTruthService.list()
    expect(truth.facts.map(item => item.id)).toEqual(['independent'])
    expect(truth.wikiPages).toEqual([])
    expect(truth.graphEdges).toEqual([])
    expect((await userProfileService.load()).confirmedFacts).toEqual([])
    expect((await knowledgeExtractService.listFactCandidates())[0]).toMatchObject({ status: 'rejected', reviewNotes: 'observation-revoked' })
    await expect(knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: candidate.id }))).rejects.toThrow('revoked')
    expect(await proposeFactCandidates([{ ...candidate, id: 'replay' }])).toEqual([])
    expect(await readFile(join(root, 'facts/facts.jsonl'), 'utf8')).toBe(original)
    expect(await readFile(revocationPath(), 'utf8')).not.toContain(source.content)
  })

  it('survives replay and invalidates a warm governance index', async () => {
    const recall = new KnowledgeRecallService()
    const query = { query: 'pnpm', layer: 'governance' as const, allowGlobal: true }
    expect((await recall.recall(query)).documents.some(doc => doc.hit.id === source.id)).toBe(true)
    const target = await input()
    await Promise.all([revokeObservation(target), revokeObservation(target)])
    expect((await readObservationRevocationBarrier()).records).toHaveLength(1)
    await records('observations/active/2026-09.jsonl', [source])
    expect(isActiveObservation((await knowledgeObservationService.listAll(true))[0])).toBe(false)
    expect((await recall.recall(query)).documents.some(doc => doc.hit.id === source.id)).toBe(false)
    expect((await new KnowledgeRecallService().recall(query)).documents.some(doc => doc.hit.id === source.id)).toBe(false)
  })

  it('follows related observations while preserving the same id in another workspace', async () => {
    const related = { ...source, id: 'related', relatedObservationIds: [source.id] }
    const descendant = { ...source, id: 'descendant', relatedObservationIds: [related.id] }
    await records('observations/active/2026-09.jsonl', [source, related, descendant, { ...source, workspaceId: 'other' }])
    await records('facts/facts.jsonl', [{ ...fact, provenance: { ...fact.provenance, sourceObservationIds: [descendant.id] } }])
    await revokeObservation(await input())
    const all = await knowledgeObservationService.listAll(true)
    expect(all.map(item => !!item.revokedAt)).toEqual([true, true, true, false])
    expect((await knowledgeTruthService.list()).facts).toEqual([])
  })

  it.each(['stale', 'duplicate', 'damaged-source', 'damaged-truth', 'write'])('does not commit revocation after %s failure', async kind => {
    const target = await input()
    if (kind === 'stale') await records('observations/active/2026-09.jsonl', [{ ...source, content: 'changed' }])
    if (kind === 'duplicate') await records('observations/active/2026-09.jsonl', [source, source])
    if (kind === 'damaged-source') await writeFile(join(root, 'observations/active/broken.jsonl'), '{broken')
    if (kind === 'damaged-truth') await writeFile(join(root, 'facts/facts.jsonl'), '{broken')
    if (kind === 'write') vi.spyOn(atomic, 'writeFileAtomic').mockRejectedValueOnce(new Error('disk failure'))
    await expect(revokeObservation(target)).rejects.toThrow()
    expect((await readObservationRevocationBarrier()).records).toEqual([])
  })
})
