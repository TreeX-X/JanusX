import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

import { LLM_STAGE_BATCH_LIMIT, runLlmStage } from '../../../src/main/knowledge/llm-stage'
import type { Observation } from '../../../src/shared/knowledge'

function observation(id: string): Observation {
  return {
    id,
    workspaceId: 'ws-1',
    workspaceName: 'Workspace 1',
    workspacePath: 'C:\\work',
    source: 'manual',
    type: 'user-note',
    content: `note ${id}`,
    fileRefs: [],
    tags: [],
    visibility: 'workspace',
    actor: 'tester',
    createdAt: '2026-09-04T00:00:00.000Z',
    retentionClass: 'evidence',
  } as Observation
}

describe('runLlmStage (Phase 2)', () => {
  it('skips without touching the model when mode is deterministic-only', async () => {
    const extractChunk = vi.fn()
    const status = await runLlmStage(
      { workspaceId: 'ws-1', observations: [observation('o1')] },
      { getMode: async () => 'deterministic-only', hasDefaultModel: async () => true, extractChunk },
    )

    expect(status).toMatchObject({ skipped: true, skippedReason: 'deterministic-only', processed: 0 })
    expect(extractChunk).not.toHaveBeenCalled()
  })

  it('skips without touching the model when no default model exists', async () => {
    const extractChunk = vi.fn()
    const status = await runLlmStage(
      { workspaceId: 'ws-1', observations: [observation('o1')] },
      { getMode: async () => 'auto', hasDefaultModel: async () => false, extractChunk },
    )

    expect(status).toMatchObject({ skipped: true, skippedReason: 'no-default-llm', processed: 0 })
    expect(extractChunk).not.toHaveBeenCalled()
  })

  it('delivers large batches in chunks of at most 50 observations', async () => {
    const seen: number[] = []
    const observations = Array.from({ length: LLM_STAGE_BATCH_LIMIT + 11 }, (_, index) =>
      observation(`o${index}`),
    )
    const status = await runLlmStage(
      { workspaceId: 'ws-1', observations },
      {
        getMode: async () => 'auto',
        hasDefaultModel: async () => true,
        extractChunk: async (chunk) => {
          seen.push(chunk.length)
          return { proposed: 1, merged: 0 }
        },
      },
    )

    expect(seen).toEqual([LLM_STAGE_BATCH_LIMIT, 11])
    expect(status).toMatchObject({
      skipped: false,
      processed: LLM_STAGE_BATCH_LIMIT + 11,
      proposed: 2,
      merged: 0,
    })
  })

  it('propagates degraded chunk results so the queue can ledger them', async () => {
    await expect(
      runLlmStage(
        { workspaceId: 'ws-1', observations: [observation('o1')] },
        {
          getMode: async () => 'auto',
          hasDefaultModel: async () => true,
          extractChunk: async () => {
            throw new Error('LLM stage degraded: generate-object-failed (boom)')
          },
        },
      ),
    ).rejects.toThrow(/degraded/)
  })
})
