import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CandidateWikiPatch, WikiPage } from '../../../src/shared/knowledge'
import { reviewCandidateInput } from '../../../src/shared/review-candidate-snapshot'
import { knowledgeReviewService, proposeDerivedCandidates, withWikiCandidatesLock } from '../../../src/main/knowledge/review-service'
import { listWikiHistory, readWikiRevision, pinWikiRevision, prepareWikiHistory } from '../../../src/main/knowledge/wiki-history'
import { prepareWikiReview, recoverPendingWikiReview, assertWikiReviewReady } from '../../../src/main/knowledge/wiki-review-recovery'
import { auditBatchEventId } from '../../../src/main/knowledge/fact-review-recovery'
import { knowledgeAuditService } from '../../../src/main/knowledge/audit-service'
import { knowledgeTruthService } from '../../../src/main/knowledge/truth-service'
import { KnowledgeRecallService } from '../../../src/main/knowledge/recall-service'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
let root: string
const identity = { workspaceId: 'project', slug: 'handbook' }
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'wiki-history-')); vi.stubEnv('JANUSX_KNOWLEDGE_ROOT', root) })
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }) })
async function publish(version: number, text = `Revision ${version}`, workspaceId = identity.workspaceId) {
  const candidate: CandidateWikiPatch = { id: `${workspaceId}:${version}:${text}`, type: 'wiki-patch', status: 'proposed', pageSlug: identity.slug, title: 'Handbook',
    patchMarkdown: text, rationale: 'Reviewed', sourceFactIds: [], reviewMode: 'full-page', expectedVersion: version - 1, derivation: 'llm', confidence: 0,
    evidence: { observationIds: [] }, provenance: { workspaceId, workspacePath: '', workspaceName: workspaceId, source: 'manual', actor: 'reviewer', createdAt: new Date().toISOString(), sourceObservationIds: [], fileRefs: [] } }
  await proposeDerivedCandidates([candidate])
  return knowledgeReviewService.applyCandidate(await reviewCandidateInput(candidate))
}
describe('published Wiki history', () => {
  it('retains latest 20 plus pinned, paginates, isolates workspaces and does not copy identical publications', async () => {
    await publish(1)
    const first = await readWikiRevision({ ...identity, version: 1 })
    await pinWikiRevision({ ...identity, version: 1, contentHash: first.contentHash, pinned: true })
    for (let version = 2; version <= 23; version++) await publish(version)
    const history = await listWikiHistory({ ...identity, offset: 19, limit: 5 })
    expect(history.total).toBe(21)
    expect(history.items.map(item => item.version)).toEqual([4, 1])
    const duplicate = await publish(24, 'Revision 23')
    expect(duplicate.applied?.page?.version).toBe(23)
    expect((await listWikiHistory(identity)).total).toBe(21)
    await publish(1, 'Other project', 'other')
    expect((await readWikiRevision({ workspaceId: 'other', slug: identity.slug, version: 1 })).page.markdown).toBe('Other project\n')
    await pinWikiRevision({ ...identity, version: 1, contentHash: first.contentHash, pinned: false })
    expect((await listWikiHistory(identity)).total).toBe(20)
    await expect(readWikiRevision({ ...identity, version: 1 })).rejects.toThrow()
  })
  it('rolls back content and all history bytes after failed audit; history never enters recall', async () => {
    await publish(1, 'historicalunique')
    const before = await listWikiHistory(identity)
    vi.spyOn(knowledgeAuditService, 'recordBatch').mockRejectedValueOnce(new Error('audit failed'))
    await expect(publish(2, 'Failed')).rejects.toThrow('audit failed')
    expect(await listWikiHistory(identity)).toEqual(before)
    expect((await knowledgeTruthService.list()).wikiPages[0].markdown).toContain('historicalunique')
    await publish(2, 'currentunique')
    const recall = new KnowledgeRecallService()
    expect((await recall.recall({ query: 'historicalunique', layer: 'truth' })).documents).toHaveLength(0)
    expect((await recall.recall({ query: 'currentunique', layer: 'truth' })).documents).toHaveLength(1)
  })
  it('seeds only the available legacy version and fails on corrupt history', async () => {
    const page: WikiPage = { ...identity, title: 'Legacy', markdown: 'old', tags: [], status: 'published', sourceFactIds: [], updatedAt: '2026-01-01', version: 8 }
    const prepared = await prepareWikiHistory(page, { ...page, version: 9, markdown: 'new' }, { actor: 'tester', reason: 'change', candidateId: 'candidate' })
    await mkdir(join(root, 'wiki/history'), { recursive: true }); await writeFile(prepared.path, prepared.after)
    expect((await listWikiHistory(identity)).items.map(item => [item.version, item.legacy])).toEqual([[9, false], [8, true]])
    await writeFile(prepared.path, '{broken')
    await expect(listWikiHistory(identity)).rejects.toThrow()
    await expect(publish(1)).rejects.toThrow()
  })
})
describe('Wiki crash recovery', () => {
  const updates = () => [
    { path: 'wiki/pages/a.md', after: 'current' }, { path: 'wiki/pages-index.json', after: '{"version":1,"pages":[]}' },
    { path: `wiki/history/${'a'.repeat(64)}.json`, after: 'history' }, { path: 'wiki/patches.jsonl', after: 'applied\n' },
  ]
  it.each([false, true])('recovers the complete publication using audit commit marker = %s', async committed => {
    await mkdir(join(root, 'wiki'), { recursive: true }); await writeFile(join(root, 'wiki/patches.jsonl'), 'proposed\r\n')
    const revision = await assertWikiReviewReady()
    const id = await prepareWikiReview(updates())
    await expect(knowledgeTruthService.list()).rejects.toThrow('recovering')
    if (committed) { await mkdir(join(root, 'audit')); await writeFile(join(root, 'audit/audit.jsonl'), JSON.stringify({ id: auditBatchEventId(id, 0) }) + '\n') }
    await withWikiCandidatesLock(async () => undefined)
    expect(await readFile(join(root, 'wiki/patches.jsonl'), 'utf8')).toBe(committed ? 'applied\n' : 'proposed\r\n')
    if (!committed) await expect(readFile(join(root, 'wiki/pages/a.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(assertWikiReviewReady(revision)).rejects.toThrow('recovering')
    await recoverPendingWikiReview()
  })
  it('retains recoverable files if an external edit conflicts', async () => {
    await prepareWikiReview(updates())
    await writeFile(join(root, 'wiki/pages/a.md'), 'external')
    await expect(recoverPendingWikiReview()).rejects.toThrow('conflict')
    expect(await readFile(join(root, 'wiki/patches.jsonl'), 'utf8')).toBe('applied\n')
    expect(await readFile(join(root, 'wiki/review-pending.json'), 'utf8')).toContain('wiki/patches.jsonl')
  })
  it('rejects an out-of-store transaction before writing any file', async () => {
    const invalid = updates(); invalid[0].path = 'wiki/../escape.md'
    await expect(prepareWikiReview(invalid)).rejects.toThrow('Invalid wiki recovery paths')
    await expect(readFile(join(root, 'wiki/review-pending.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
