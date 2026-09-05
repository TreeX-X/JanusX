import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

import {
  KnowledgeProcessingQueue,
  countProposalsByDerivation,
  EMPTY_PROPOSALS_BY_DERIVATION,
  failureBackoffMs,
  type DeterministicBatch,
  type LlmStageBatch,
} from '../../../src/main/knowledge/processing-queue'
import type { AuditEventInput } from '../../../src/main/knowledge/audit-service'
import type { Observation } from '../../../src/shared/knowledge'

function observation(overrides: Partial<Observation> & { id: string }): Observation {
  return {
    workspaceId: 'ws-1',
    workspaceName: 'Workspace 1',
    workspacePath: 'C:\\work',
    source: 'tool',
    type: 'git-event',
    content: `content ${overrides.id}`,
    fileRefs: [],
    tags: [],
    visibility: 'workspace',
    actor: 'system',
    createdAt: '2026-09-04T00:00:00.000Z',
    retentionClass: 'evidence',
    ...overrides,
  }
}

describe('knowledge processing queue (Phase 1-1 skeleton)', () => {
  let root: string
  let observations: Observation[]
  let audits: AuditEventInput[]
  let queue: KnowledgeProcessingQueue
  const previousKnowledgeRoot = process.env.JANUSX_KNOWLEDGE_ROOT

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'janusx-processing-queue-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = join(root, 'knowledge')
    observations = []
    audits = []
    queue = new KnowledgeProcessingQueue({
      listAllObservations: async () => observations,
      recordAudit: async (input) => {
        audits.push(input)
        return null
      },
      nowMs: () => Date.parse('2026-09-04T01:00:00.000Z'),
    })
  })

  afterEach(async () => {
    queue.dispose()
    if (previousKnowledgeRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
    else process.env.JANUSX_KNOWLEDGE_ROOT = previousKnowledgeRoot
    await rm(root, { recursive: true, force: true })
  })

  it('reports pending work without moving the cursor when no handler is configured', async () => {
    observations = [
      observation({ id: 'o1', createdAt: '2026-09-04T00:01:00.000Z' }),
      observation({ id: 'o2', workspaceId: 'ws-2', createdAt: '2026-09-04T00:02:00.000Z' }),
    ]

    const result = await queue.processNow()
    expect(result).toEqual({ processed: 0, failed: 0, pending: 2, advancedWorkspaces: [], handlerMissing: true })

    const stats = await queue.processingStats()
    expect(stats.pendingTotal).toBe(2)
    expect(stats.handlerConfigured).toBe(false)
    expect(stats.failures).toBe(0)
    // Cursor file must not exist: nothing was actually processed.
    await expect(readFile(join(root, 'knowledge', 'processing', 'cursor.json'), 'utf8')).rejects.toThrow()
  })

  it('advances the cursor per workspace and survives restart via the cursor file', async () => {
    observations = [
      observation({ id: 'o1', createdAt: '2026-09-04T00:01:00.000Z' }),
      observation({ id: 'o2', createdAt: '2026-09-04T00:02:00.000Z' }),
      observation({ id: 'o3', workspaceId: 'ws-2', createdAt: '2026-09-04T00:03:00.000Z' }),
    ]
    const seen: DeterministicBatch[] = []
    queue.configureDeterministicHandler(async (batch) => {
      seen.push(batch)
    })

    const first = await queue.processNow()
    expect(first.handlerMissing).toBe(false)
    expect(first.processed).toBe(3)
    expect(first.advancedWorkspaces).toEqual(['ws-1', 'ws-2'])
    expect(seen.map((batch) => [batch.workspaceId, batch.observations.map((o) => o.id)])).toEqual([
      ['ws-1', ['o1', 'o2']],
      ['ws-2', ['o3']],
    ])

    // New instance = restarted app: cursor restored from disk, nothing pending.
    const restarted = new KnowledgeProcessingQueue({
      listAllObservations: async () => observations,
      recordAudit: async () => null,
      nowMs: () => Date.parse('2026-09-04T02:00:00.000Z'),
    })
    try {
      const restore = await restarted.startupRestore()
      expect(restore.pendingTotal).toBe(0)
      // Only newer observations become pending again.
      observations = [...observations, observation({ id: 'o4', createdAt: '2026-09-04T03:00:00.000Z' })]
      const retry = await restarted.processNow('ws-1')
      expect(retry.processed).toBe(0)
      expect(retry.pending).toBe(1)
      expect(retry.handlerMissing).toBe(true)
    } finally {
      restarted.dispose()
    }
  })

  it('persists failures with backoff and a processing_failed audit when the handler throws', async () => {
    observations = [observation({ id: 'o1' })]
    queue.configureDeterministicHandler(async () => {
      throw new Error('extractor exploded')
    })

    const result = await queue.processNow()
    expect(result.processed).toBe(0)
    expect(result.failed).toBe(1)

    const failures = await queue.listFailures()
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({
      observationId: 'o1',
      workspaceId: 'ws-1',
      stage: 'deterministic',
      reason: 'extractor exploded',
      attempts: 1,
    })
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ action: 'processing_failed', targetId: 'ws-1' })

    // Cursor did not advance: the observation stays pending for retry.
    const stats = await queue.processingStats()
    expect(stats.pendingTotal).toBe(1)
    expect(stats.failures).toBe(1)

    // Second failure bumps attempts instead of duplicating the ledger row.
    await queue.processNow()
    const again = await queue.listFailures()
    expect(again).toHaveLength(1)
    expect(again[0]?.attempts).toBe(2)
  })

  it('ignores non-evidence observations when computing pending work', async () => {
    observations = [
      observation({ id: 'noise', retentionClass: 'noise' }),
      observation({ id: 'ops', retentionClass: 'operational' }),
      observation({ id: 'ev', retentionClass: 'evidence' }),
    ]
    const result = await queue.processNow()
    expect(result.pending).toBe(1)
  })

  it('schedules a run after the capture threshold is reached', async () => {
    queue.configure({ threshold: 2, debounceMs: 60_000 })
    const seen: string[] = []
    queue.configureDeterministicHandler(async (batch) => {
      seen.push(batch.workspaceId)
    })
    observations = [observation({ id: 'o1' })]

    queue.schedule('ws-1')
    queue.schedule('ws-1')
    await vi.waitFor(() => expect(seen).toEqual(['ws-1']))
    const stats = await queue.processingStats()
    expect(stats.pendingTotal).toBe(0)
    expect(stats.lastRunAt).not.toBeNull()
  })

  it('backs off exponentially and caps at one hour', () => {
    expect(failureBackoffMs(0)).toBe(60_000)
    expect(failureBackoffMs(1)).toBe(120_000)
    expect(failureBackoffMs(2)).toBe(240_000)
    expect(failureBackoffMs(100)).toBe(3_600_000)
  })

  it('runs the LLM stage after deterministic success and advances llmCursor', async () => {
    observations = [
      observation({ id: 'o1', createdAt: '2026-09-04T00:01:00.000Z' }),
      observation({ id: 'o2', createdAt: '2026-09-04T00:02:00.000Z' }),
    ]
    queue.configureDeterministicHandler(async () => {})
    const seen: LlmStageBatch[] = []
    queue.configureLlmHandler(async (batch) => {
      seen.push(batch)
      return { skipped: false, processed: batch.observations.length, proposed: 1, merged: 0 }
    })

    const result = await queue.processNow()
    expect(result.processed).toBe(2)
    expect(result.failed).toBe(0)
    expect(seen.map((batch) => [batch.workspaceId, batch.observations.map((o) => o.id)])).toEqual([
      ['ws-1', ['o1', 'o2']],
    ])

    const cursorRaw = await readFile(join(root, 'knowledge', 'processing', 'cursor.json'), 'utf8')
    const cursor = JSON.parse(cursorRaw) as {
      workspaces: Record<string, { lastObservationId: string; llmCursor: string | null }>
    }
    expect(cursor.workspaces['ws-1']?.lastObservationId).toBe('o2')
    expect(cursor.workspaces['ws-1']?.llmCursor).toBe('o2')

    const stats = await queue.processingStats()
    expect(stats.llmConfigured).toBe(true)
    expect(stats.llmSucceeded).toBe(1)
    expect(stats.llmFailed).toBe(0)
    expect(stats.llmSkipped).toBe(0)
    expect(stats.pendingTotal).toBe(0)
  })

  it('records llm-stage failures without rolling back deterministic products', async () => {
    observations = [observation({ id: 'o1' })]
    queue.configureDeterministicHandler(async () => {})
    queue.configureLlmHandler(async () => {
      throw new Error('model melted')
    })

    const result = await queue.processNow()
    expect(result.processed).toBe(1)
    expect(result.failed).toBe(0)

    const failures = await queue.listFailures()
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({
      observationId: 'o1',
      workspaceId: 'ws-1',
      stage: 'llm',
      reason: 'model melted',
    })
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ action: 'processing_failed', targetId: 'ws-1' })

    // Deterministic cursor still advanced: nothing pending for retry.
    const stats = await queue.processingStats()
    expect(stats.pendingTotal).toBe(0)
    expect(stats.llmFailed).toBe(1)
    expect(stats.llmSucceeded).toBe(0)
  })

  it('counts clean LLM skips without failing the batch', async () => {
    observations = [observation({ id: 'o1' })]
    queue.configureDeterministicHandler(async () => {})
    queue.configureLlmHandler(async () => ({
      skipped: true,
      skippedReason: 'deterministic-only' as const,
      processed: 0,
      proposed: 0,
      merged: 0,
    }))

    const result = await queue.processNow()
    expect(result.processed).toBe(1)
    expect(result.failed).toBe(0)
    expect(await queue.listFailures()).toHaveLength(0)

    const stats = await queue.processingStats()
    expect(stats.llmSkipped).toBe(1)
    expect(stats.pendingTotal).toBe(0)
  })

  it('reports llmConfigured false when no LLM handler is attached', async () => {
    observations = [observation({ id: 'o1' })]
    queue.configureDeterministicHandler(async () => {})

    await queue.processNow()
    const stats = await queue.processingStats()
    expect(stats.llmConfigured).toBe(false)
    expect(stats.llmSucceeded).toBe(0)
  })

  it('scheduleImmediate bypasses debounce and threshold (Phase 5 §6)', async () => {
    queue.configure({ threshold: 100, debounceMs: 60_000 })
    const seen: string[] = []
    queue.configureDeterministicHandler(async (batch) => {
      seen.push(batch.workspaceId)
    })
    observations = [observation({ id: 'o1' })]

    queue.scheduleImmediate('ws-1')
    await vi.waitFor(() => expect(seen).toEqual(['ws-1']))
    const stats = await queue.processingStats()
    expect(stats.pendingTotal).toBe(0)
    expect(stats.lastRunAt).not.toBeNull()
  })

  it('runs daily maintenance once per interval and audits failures (Phase 5 §6)', async () => {
    let runs = 0
    queue.configureMaintenanceHandler(async () => {
      runs += 1
    })

    const first = await queue.maybeRunMaintenanceIfDue(24 * 60 * 60 * 1000)
    expect(first.ran).toBe(true)
    expect(runs).toBe(1)

    const second = await queue.maybeRunMaintenanceIfDue(24 * 60 * 60 * 1000)
    expect(second).toMatchObject({ ran: false, skippedReason: 'not-due' })
    expect(runs).toBe(1)

    const forced = await queue.runMaintenanceNow()
    expect(forced.ran).toBe(true)
    expect(runs).toBe(2)
  })

  it('skips maintenance without a handler and records handler-missing', async () => {
    const result = await queue.maybeRunMaintenanceIfDue(0)
    expect(result).toMatchObject({ ran: false, skippedReason: 'handler-missing' })
  })

  it('countProposalsByDerivation counts proposed only and ignores unknown derivations', () => {
    expect(countProposalsByDerivation([], [])).toEqual(EMPTY_PROPOSALS_BY_DERIVATION)
    expect(countProposalsByDerivation(
      [
        { status: 'proposed', derivation: 'deterministic' },
        { status: 'applied', derivation: 'deterministic' },
        { status: 'rejected', derivation: 'llm' },
        { status: 'proposed', derivation: 'llm' },
        { status: 'proposed', derivation: 'merged' },
        { status: 'proposed', derivation: 'mystery' },
        { status: 'proposed' },
      ],
      [{ status: 'proposed', derivation: 'deterministic' }],
    )).toEqual({ deterministic: 2, llm: 1, merged: 1 })
  })

  it('reports proposals by derivation with freshness stamps in stats (Phase 5 §6)', async () => {
    const factsDir = join(root, 'knowledge', 'facts')
    await mkdir(factsDir, { recursive: true })
    await writeFile(join(factsDir, 'candidates.jsonl'), [
      JSON.stringify({ id: 'c1', status: 'proposed', derivation: 'deterministic' }),
      JSON.stringify({ id: 'c2', status: 'applied', derivation: 'deterministic' }),
      JSON.stringify({ id: 'c3', status: 'proposed', derivation: 'llm' }),
      JSON.stringify({ id: 'c4', status: 'proposed', derivation: 'merged' }),
      JSON.stringify({ id: 'c5', status: 'rejected', derivation: 'llm' }),
    ].join('\n') + '\n', 'utf8')

    const before = await queue.processingStats()
    expect(before.proposalsByDerivation).toEqual({ deterministic: 1, llm: 1, merged: 1 })
    expect(before.proposalsTotal).toBe(3)
    // No recall ran in this file and no maintenance succeeded yet.
    expect(before.indexUpdatedAt).toBeNull()
    expect(before.lastMaintenanceAt).toBeNull()

    queue.configureMaintenanceHandler(async () => {})
    const run = await queue.runMaintenanceNow()
    const after = await queue.processingStats()
    expect(after.lastMaintenanceAt).toBe(run.at)
  })

  it('maintenance failure audits processing_failed without advancing the stamp', async () => {
    queue.configureMaintenanceHandler(async () => {
      throw new Error('prune exploded')
    })
    await expect(queue.runMaintenanceNow()).rejects.toThrow('prune exploded')
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      action: 'processing_failed',
      targetId: 'maintenance',
      after: expect.objectContaining({ stage: 'maintenance' }),
    })

    // Stamp untouched: the next due-check retries instead of waiting a day.
    queue.configureMaintenanceHandler(async () => {})
    const retry = await queue.maybeRunMaintenanceIfDue(24 * 60 * 60 * 1000)
    expect(retry.ran).toBe(true)
  })
})
