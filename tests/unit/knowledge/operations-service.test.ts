import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import type { CandidateFact, KnowledgeProvenance, MemoryFact } from '../../../src/shared/knowledge'

async function seed(path: string, records: unknown[]) {
  const file = join(process.env.JANUSX_KNOWLEDGE_ROOT!, path)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, records.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8')
}

const provenance: KnowledgeProvenance = { workspaceId: 'ws', workspaceName: 'ws', workspacePath: 'C:/ws', source: 'manual', sourceObservationIds: [], fileRefs: ['src/a.ts'], actor: 'test', createdAt: '2026-01-01T00:00:00.000Z' }
const fact: MemoryFact = { id: 'f1', content: 'accepted', concepts: [], files: [], tags: [], confidence: 1, version: 1, status: 'active', provenance }

describe('KnowledgeOperationsService', () => {
  let root: string
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'janusx-ops-')); process.env.JANUSX_KNOWLEDGE_ROOT = root })
  afterEach(async () => { await rm(root, { recursive: true, force: true }); delete process.env.JANUSX_KNOWLEDGE_ROOT })

  it('revokes truth only in its workspace and records archived state', async () => {
    await seed('facts/facts.jsonl', [fact])
    const { knowledgeOperationsService } = await import('../../../src/main/knowledge/operations-service')
    await expect(knowledgeOperationsService.revoke({ kind: 'fact', id: 'f1', workspaceId: 'other' })).rejects.toThrow(/workspace/i)
    await knowledgeOperationsService.revoke({ kind: 'fact', id: 'f1', workspaceId: 'ws' })
    await knowledgeOperationsService.revoke({ kind: 'fact', id: 'f1', workspaceId: 'ws' })
    expect(await readFile(join(root, 'facts/facts.jsonl'), 'utf8')).toContain('"status":"archived"')
  })

  it('surfaces a proposed fact that conflicts with accepted truth', async () => {
    const candidate: CandidateFact = { id: 'c1', type: 'fact', status: 'proposed', fact: { ...fact, content: 'different', status: 'proposed' } }
    await seed('facts/facts.jsonl', [fact]); await seed('facts/candidates.jsonl', [candidate])
    const { knowledgeOperationsService } = await import('../../../src/main/knowledge/operations-service')
    expect(await knowledgeOperationsService.listConflicts('ws')).toMatchObject([{ candidateId: 'c1', targetId: 'f1', reason: 'content-mismatch' }])
  })

  it('stores feedback metadata without result content', async () => {
    const { knowledgeOperationsService } = await import('../../../src/main/knowledge/operations-service')
    await knowledgeOperationsService.recordFeedback({ action: 'copy', resultKind: 'fact', workspaceId: 'ws', outcome: 'success' })
    const stored = await readFile(join(root, 'metrics/feedback.jsonl'), 'utf8')
    expect(stored).toContain('"action":"copy"')
    expect(stored).not.toContain('content')
  })

  it('summarizes allowed feedback dimensions with an optional workspace boundary', async () => {
    const { knowledgeOperationsService } = await import('../../../src/main/knowledge/operations-service')
    await knowledgeOperationsService.recordFeedback({ action: 'copy', resultKind: 'fact', workspaceId: 'ws', outcome: 'success' })
    await knowledgeOperationsService.recordFeedback({ action: 'dismiss', resultKind: 'none', workspaceId: 'other', outcome: 'empty' })

    expect(await knowledgeOperationsService.feedbackSummary('ws')).toEqual({
      total: 1,
      byAction: { open: 0, copy: 1, apply: 0, reject: 0, dismiss: 0 },
      byOutcome: { success: 1, empty: 0, error: 0 },
      byKind: { fact: 1, wiki: 0, graph: 0, none: 0 },
    })
    expect((await knowledgeOperationsService.feedbackSummary()).total).toBe(2)
  })

  it('restores truth when revoke audit persistence fails', async () => {
    await seed('facts/facts.jsonl', [fact])
    const { knowledgeOperationsService } = await import('../../../src/main/knowledge/operations-service')
    const { knowledgeAuditService } = await import('../../../src/main/knowledge/audit-service')
    vi.spyOn(knowledgeAuditService, 'record').mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(knowledgeOperationsService.revoke({ kind: 'fact', id: 'f1', workspaceId: 'ws' })).rejects.toThrow('audit unavailable')
    expect(await readFile(join(root, 'facts/facts.jsonl'), 'utf8')).toContain('"status":"active"')
    vi.restoreAllMocks()
  })

  it('serializes concurrent feedback writes without losing events', async () => {
    const { knowledgeOperationsService } = await import('../../../src/main/knowledge/operations-service')
    await Promise.all(Array.from({ length: 20 }, () => knowledgeOperationsService.recordFeedback({ action: 'open', resultKind: 'fact', workspaceId: 'ws', outcome: 'success' })))
    expect((await knowledgeOperationsService.feedbackSummary('ws')).total).toBe(20)
  })

  it('restores feedback storage when audit persistence fails', async () => {
    const { knowledgeOperationsService } = await import('../../../src/main/knowledge/operations-service')
    const { knowledgeAuditService } = await import('../../../src/main/knowledge/audit-service')
    vi.spyOn(knowledgeAuditService, 'record').mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(knowledgeOperationsService.recordFeedback({ action: 'copy', resultKind: 'fact', workspaceId: 'ws', outcome: 'success' })).rejects.toThrow('audit unavailable')
    expect((await knowledgeOperationsService.feedbackSummary('ws')).total).toBe(0)
    vi.restoreAllMocks()
  })
})
