import { describe, expect, it, vi } from 'vitest'
import type { Observation } from '../../../src/shared/knowledge'
import { runLlmStage } from '../../../src/main/knowledge/llm-stage'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
const observation: Observation = {
  id: 'o1', workspaceId: 'ws', workspaceName: 'ws', workspacePath: 'C:/work', source: 'manual',
  type: 'user-note', content: 'Choose Postgres.', fileRefs: [], tags: [], visibility: 'workspace', actor: 'user',
  createdAt: '2026-09-28T00:00:00Z', retentionClass: 'evidence',
}
const batch = { workspaceId: 'ws', observations: [observation] }
const plan = { observations: [observation], candidateHashes: { candidate: 'hash' } }

describe('refinement planning stage', () => {
  it('persists selected plans before reporting the batch settled', async () => {
    const enqueue = vi.fn(async () => 1)
    expect(await runLlmStage(batch, { selectRefinement: async () => plan, enqueue }))
      .toMatchObject({ skipped: true, skippedReason: 'refinement-queued' })
    expect(enqueue).toHaveBeenCalledWith(plan)
  })

  it('accepts an already persisted plan without submitting duplicate work', async () => {
    expect(await runLlmStage(batch, { selectRefinement: async () => plan, enqueue: async () => 0 }))
      .toMatchObject({ skippedReason: 'refinement-queued' })
  })

  it('propagates persistence failure so the queue retains its observation cursor', async () => {
    await expect(runLlmStage(batch, { selectRefinement: async () => plan,
      enqueue: async () => { throw new Error('disk failure') },
    })).rejects.toThrow('disk failure')
  })

  it('does not persist a plan when no candidate requires refinement', async () => {
    const enqueue = vi.fn()
    expect(await runLlmStage(batch, { selectRefinement: async () => ({ observations: [], candidateHashes: {} }), enqueue }))
      .toMatchObject({ skippedReason: 'no-refinement' })
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('does not score expired observations or explicit remember requests', async () => {
    const selectRefinement = vi.fn()
    const enqueue = vi.fn()
    expect(await runLlmStage({ ...batch, observations: [{ ...observation, episodeStatus: 'expired' },
      { ...observation, id: 'o2', memoryIntent: 'remember' }] }, { selectRefinement, enqueue }))
      .toMatchObject({ skippedReason: 'no-evidence' })
    expect(selectRefinement).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })
})
