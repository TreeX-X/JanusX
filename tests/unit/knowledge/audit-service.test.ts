import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { knowledgeAuditService } from '../../../src/main/knowledge/audit-service'
import type { AuditEventInput } from '../../../src/main/knowledge/audit-service'

function makeEventInput(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    action: 'capture',
    targetType: 'observation',
    targetId: 'obs-1',
    before: null,
    after: { ok: true },
    provenance: {
      workspaceId: 'ws',
      workspaceName: 'ws',
      workspacePath: 'C:/work',
      source: 'manual',
      sourceObservationIds: ['obs-1'],
      fileRefs: [],
      actor: 'tester',
      createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
    },
    ...overrides,
  }
}

describe('KnowledgeAuditService', () => {
  let knowledgeRoot: string
  const previousKnowledgeRoot = process.env.JANUSX_KNOWLEDGE_ROOT

  beforeEach(async () => {
    knowledgeRoot = await mkdtemp(join(tmpdir(), 'janusx-audit-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = knowledgeRoot
  })

  afterEach(async () => {
    await rm(knowledgeRoot, { recursive: true, force: true })
    if (previousKnowledgeRoot === undefined) {
      delete process.env.JANUSX_KNOWLEDGE_ROOT
    } else {
      process.env.JANUSX_KNOWLEDGE_ROOT = previousKnowledgeRoot
    }
  })

  it('appends audit events with assigned ids and reads them back', async () => {
    const event = await knowledgeAuditService.record(makeEventInput())
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/)

    const events = await knowledgeAuditService.list({})
    expect(events).toHaveLength(1)
    expect(events[0]?.id).toBe(event.id)
    expect(events[0]?.action).toBe('capture')
    expect(events[0]?.targetId).toBe('obs-1')

    const fileContent = await readFile(join(knowledgeRoot, 'audit/audit.jsonl'), 'utf8')
    expect(fileContent).toContain(event.id)
  })

  it('filters by action and targetType', async () => {
    await knowledgeAuditService.record(makeEventInput({ action: 'observation_pruned', targetId: 'a' }))
    await knowledgeAuditService.record(
      makeEventInput({ action: 'observation_auto_pruned', targetId: 'b' }),
    )
    await knowledgeAuditService.record(
      makeEventInput({
        action: 'observation_pruned',
        targetType: 'fact',
        targetId: 'c',
      }),
    )

    const pruned = await knowledgeAuditService.list({ action: 'observation_pruned' })
    expect(pruned).toHaveLength(2)
    expect(pruned.every((e) => e.action === 'observation_pruned')).toBe(true)

    const observations = await knowledgeAuditService.list({ targetType: 'observation' })
    expect(observations).toHaveLength(2)

    const byTarget = await knowledgeAuditService.list({ targetId: 'b' })
    expect(byTarget).toHaveLength(1)
    expect(byTarget[0]?.action).toBe('observation_auto_pruned')
  })

  it('sorts by provenance.createdAt descending', async () => {
    await knowledgeAuditService.record(
      makeEventInput({
        targetId: 'old',
        provenance: {
          workspaceId: 'ws',
          workspaceName: 'ws',
          workspacePath: 'C:/work',
          source: 'manual',
          sourceObservationIds: [],
          fileRefs: [],
          actor: 'tester',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      }),
    )
    await knowledgeAuditService.record(
      makeEventInput({
        targetId: 'new',
        provenance: {
          workspaceId: 'ws',
          workspaceName: 'ws',
          workspacePath: 'C:/work',
          source: 'manual',
          sourceObservationIds: [],
          fileRefs: [],
          actor: 'tester',
          createdAt: '2024-06-01T00:00:00.000Z',
        },
      }),
    )

    const events = await knowledgeAuditService.list({})
    expect(events[0]?.targetId).toBe('new')
    expect(events[1]?.targetId).toBe('old')
  })

  it('clamps limit to max 200 and defaults to 50', async () => {
    for (let i = 0; i < 5; i++) {
      await knowledgeAuditService.record(makeEventInput({ targetId: `obs-${i}` }))
    }
    const defaultLimited = await knowledgeAuditService.list({})
    expect(defaultLimited).toHaveLength(5)

    const clampedHigh = await knowledgeAuditService.list({ limit: 1000 })
    expect(clampedHigh.length).toBeLessThanOrEqual(200)

    const clampedLow = await knowledgeAuditService.list({ limit: 0 })
    expect(clampedLow).toHaveLength(1)
  })

  it('stats aggregates counts by action', async () => {
    await knowledgeAuditService.record(makeEventInput({ action: 'capture' }))
    await knowledgeAuditService.record(makeEventInput({ action: 'capture' }))
    await knowledgeAuditService.record(makeEventInput({ action: 'observation_pruned' }))

    const stats = await knowledgeAuditService.stats()
    expect(stats.total).toBe(3)
    expect(stats.byAction.capture).toBe(2)
    expect(stats.byAction.observation_pruned).toBe(1)
  })

  it('bootstraps a missing audit file on first access', async () => {
    // No bootstrap call — audit dir does not exist yet.
    const events = await knowledgeAuditService.list({})
    expect(events).toEqual([])

    // The file should now exist (ensureAuditFile created it).
    const fileContent = await readFile(join(knowledgeRoot, 'audit/audit.jsonl'), 'utf8')
    expect(fileContent).toBe('')

    const stats = await knowledgeAuditService.stats()
    expect(stats.total).toBe(0)
  })

  it('reads events from a pre-existing audit file with partial garbage lines', async () => {
    await mkdir(join(knowledgeRoot, 'audit'), { recursive: true })
    const validEvent = {
      id: 'pre-existing-1',
      action: 'observation_archived',
      targetType: 'observation',
      targetId: '2024-01.jsonl',
      before: null,
      after: null,
      provenance: {
        workspaceId: 'global',
        workspaceName: 'global',
        workspacePath: '',
        source: 'system',
        sourceObservationIds: [],
        fileRefs: [],
        actor: 'knowledge-archive',
        createdAt: '2024-08-01T00:00:00.000Z',
      },
    }
    const fileContent = `not-json-at-all\n${JSON.stringify(validEvent)}\n\n{"broken":\n`
    await writeFile(join(knowledgeRoot, 'audit/audit.jsonl'), fileContent, 'utf8')

    const events = await knowledgeAuditService.list({})
    expect(events).toHaveLength(1)
    expect(events[0]?.id).toBe('pre-existing-1')

    const stats = await knowledgeAuditService.stats()
    expect(stats.total).toBe(1)
    expect(stats.byAction.observation_archived).toBe(1)
  })
})