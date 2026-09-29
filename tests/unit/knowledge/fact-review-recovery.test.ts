import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
import { prepareFactReview, recoverPendingFactReview, serializeReviewRecords, auditBatchEventId, assertFactReviewReady } from '../../../src/main/knowledge/fact-review-recovery'
import { knowledgeTruthService } from '../../../src/main/knowledge/truth-service'
import { readLegacyJsonl } from '../../../src/main/knowledge/legacy-memory-source'
import { withFactCandidatesLock } from '../../../src/main/knowledge/review-service'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'janusx-review-recovery-'))
  vi.stubEnv('JANUSX_KNOWLEDGE_ROOT', root)
  await mkdir(join(root, 'facts')); await mkdir(join(root, 'audit'))
})
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }) })

describe('fact review crash recovery', () => {
  it('rejects a read spanning a complete failed review even after the pending journal is gone', async () => {
    const revision = await assertFactReviewReady()
    await prepareFactReview([{ id: 'transient' }], [])
    await writeFile(join(root, 'facts/facts.jsonl'), serializeReviewRecords([{ id: 'transient' }]))
    const transient = await readFile(join(root, 'facts/facts.jsonl'), 'utf8')
    await recoverPendingFactReview()
    expect(transient).toContain('transient')
    await expect(assertFactReviewReady(revision)).rejects.toThrow('recovering')
    await expect(assertFactReviewReady()).resolves.toEqual(expect.any(Number))
  })
  it.each(['prepared', 'truth', 'candidate'])('rolls back a crash at %s and preserves exact original bytes', async phase => {
    const before = '{"id":"old"}\r\n'
    await writeFile(join(root, 'facts/candidates.jsonl'), before)
    await prepareFactReview([{ id: 'new' }], [{ id: 'old', status: 'applied' }])
    if (phase !== 'prepared') await writeFile(join(root, 'facts/facts.jsonl'), serializeReviewRecords([{ id: 'new' }]))
    if (phase === 'candidate') await writeFile(join(root, 'facts/candidates.jsonl'), serializeReviewRecords([{ id: 'old', status: 'applied' }]))
    await expect(knowledgeTruthService.list()).rejects.toThrow('recovering')
    await expect(readLegacyJsonl('facts/candidates.jsonl')).rejects.toThrow('recovering')
    // The production mutation lock recovers before admitting another writer.
    await withFactCandidatesLock(async () => {})
    await expect(readFile(join(root, 'facts/facts.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(root, 'facts/candidates.jsonl'), 'utf8')).toBe(before)
    await recoverPendingFactReview()
  })

  it('keeps an audited commit after a crash before journal cleanup without duplicating audit', async () => {
    const facts = [{ id: 'new' }]; const candidates = [{ id: 'candidate', status: 'applied' }]
    const id = await prepareFactReview(facts, candidates)
    await writeFile(join(root, 'facts/facts.jsonl'), serializeReviewRecords(facts))
    await writeFile(join(root, 'facts/candidates.jsonl'), serializeReviewRecords(candidates))
    const audit = JSON.stringify({ id: auditBatchEventId(id, 0) }) + '\n'
    await writeFile(join(root, 'audit/audit.jsonl'), audit)
    await recoverPendingFactReview(); await recoverPendingFactReview()
    expect(await readLegacyJsonl('facts/facts.jsonl')).toEqual(facts)
    expect(await readFile(join(root, 'audit/audit.jsonl'), 'utf8')).toBe(audit)
  })

  it('does not overwrite external edits or partially restore another file on conflict', async () => {
    await prepareFactReview([{ id: 'new' }], [{ id: 'candidate' }])
    const expected = serializeReviewRecords([{ id: 'new' }])
    await writeFile(join(root, 'facts/facts.jsonl'), expected)
    await writeFile(join(root, 'facts/candidates.jsonl'), 'external edit')
    await expect(recoverPendingFactReview()).rejects.toThrow('conflict')
    expect(await readFile(join(root, 'facts/facts.jsonl'), 'utf8')).toBe(expected)
    expect(await readFile(join(root, 'facts/candidates.jsonl'), 'utf8')).toBe('external edit')
    expect(await readFile(join(root, 'facts/review-pending.json'), 'utf8')).toContain('version')
  })

  it('fails on corrupt journals and corrupt audit data, retaining recoverable files', async () => {
    await writeFile(join(root, 'facts/review-pending.json'), '{broken')
    await expect(knowledgeTruthService.list()).rejects.toThrow()
    await expect(recoverPendingFactReview()).rejects.toThrow()
    expect(await readFile(join(root, 'facts/review-pending.json'), 'utf8')).toBe('{broken')
    await rm(join(root, 'facts/review-pending.json'))
    await prepareFactReview([], [])
    await writeFile(join(root, 'audit/audit.jsonl'), '{broken')
    await expect(recoverPendingFactReview()).rejects.toThrow()
    expect(await readFile(join(root, 'audit/audit.jsonl'), 'utf8')).toBe('{broken')
  })
})
