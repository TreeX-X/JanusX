import { reviewFixture } from './review-fixture'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

import { knowledgeObservationService, resetObservationServiceEphemeralState } from '../../../src/main/knowledge/observation-service'
import { knowledgeExtractService } from '../../../src/main/knowledge/extract-service'
import { knowledgeReviewService } from '../../../src/main/knowledge/review-service'
import { knowledgeTruthService } from '../../../src/main/knowledge/truth-service'
import { searchUserMemoryDefault } from '../../../src/main/knowledge/user-recall-service'
import { KnowledgeProcessingQueue } from '../../../src/main/knowledge/processing-queue'
import { runDeterministicStage } from '../../../src/main/knowledge/deterministic-extractor'
import type { CaptureObservationInput } from '../../../src/shared/knowledge'

const WS = 'ws-pipe'

function capture(input: Omit<CaptureObservationInput, 'workspaceId' | 'workspacePath'>) {
  return knowledgeObservationService.capture({
    workspaceId: WS,
    workspaceName: 'Pipe Workspace',
    workspacePath: 'C:\\pipe',
    ...input,
  })
}

describe('deterministic pipeline (Phase 1-2, no LLM)', () => {
  let root: string
  const previousKnowledgeRoot = process.env.JANUSX_KNOWLEDGE_ROOT

  beforeEach(async () => {
    resetObservationServiceEphemeralState()
    root = await mkdtemp(join(tmpdir(), 'janusx-pipe-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = join(root, 'knowledge')
  })

  afterEach(async () => {
    if (previousKnowledgeRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
    else process.env.JANUSX_KNOWLEDGE_ROOT = previousKnowledgeRoot
    await rm(root, { recursive: true, force: true })
  })

  it('does not regenerate engineering candidates from a legacy observation backlog', async () => {
    await capture({ source: 'git-analyzer', type: 'git-event', content: 'commit abc: add user index', fileRefs: ['src/db.ts'], actor: 'user' })
    await capture({ source: 'manual', type: 'user-note', content: 'Decision: adopt soft deletion', actor: 'user' })
    const queue = new KnowledgeProcessingQueue()
    queue.configureDeterministicHandler(async batch => { await runDeterministicStage(batch) })
    try {
      expect((await queue.processNow()).failed).toBe(0)
      expect(await knowledgeExtractService.listFactCandidates()).toEqual([])
      expect((await knowledgeTruthService.list()).facts).toEqual([])
      expect(await knowledgeObservationService.listAll(true)).toHaveLength(2)
    } finally { queue.dispose() }
  })

  it('keeps personal saves pending until explicit review and restores an empty processed backlog', async () => {
    await knowledgeObservationService.capture({ workspaceId: 'user', workspaceName: 'user', workspacePath: 'user',
      source: 'manual', type: 'user-note', content: 'My bicycle is named Bluebird.', actor: 'user' }, { speaker: 'user', memoryIntent: 'remember' })
    const queue = new KnowledgeProcessingQueue()
    queue.configureDeterministicHandler(async batch => { await runDeterministicStage(batch) })
    try {
      expect((await queue.processNow()).failed).toBe(0)
      const [candidate] = await knowledgeExtractService.listFactCandidates()
      expect(candidate).toMatchObject({ status: 'proposed', fact: { scope: 'user' } })
      expect((await knowledgeTruthService.list()).facts).toEqual([])
      await knowledgeReviewService.applyCandidate(await reviewFixture({ type: 'fact', id: candidate.id }))
      expect((await searchUserMemoryDefault('Bluebird')).items.map(item => item.id)).toContain(candidate.fact.id)
      const restarted = new KnowledgeProcessingQueue()
      try { expect((await restarted.startupRestore()).pendingTotal).toBe(0) }
      finally { restarted.dispose() }
    } finally { queue.dispose() }
  })
})
