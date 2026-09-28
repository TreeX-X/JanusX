import { beforeEach, expect, it, vi } from 'vitest'
import type { CandidateFact } from '../../../src/shared/knowledge'
import { candidateDecisionHash } from '../../../src/main/knowledge/decision-scorer'
import { runCandidateAction } from '../../../src/main/knowledge/candidate-actions'

const mocks = vi.hoisted(() => ({ settings: vi.fn(), candidates: vi.fn(), observations: vi.fn(), run: vi.fn(), manual: vi.fn(), enqueue: vi.fn() }))
vi.mock('../../../src/main/config/service', () => ({ configService: { getKnowledgeSettings: mocks.settings } }))
vi.mock('../../../src/main/knowledge/extract-service', () => ({ knowledgeExtractService: { listFactCandidates: mocks.candidates } }))
vi.mock('../../../src/main/knowledge/observation-service', () => ({ knowledgeObservationService: { listAll: mocks.observations } }))
vi.mock('../../../src/main/knowledge/decision-stage', () => ({ knowledgeDecisionStage: { run: mocks.run } }))
vi.mock('../../../src/main/knowledge/refinement-tasks', () => ({ knowledgeRefinementTasks: { enqueueManual: mocks.manual, enqueue: mocks.enqueue } }))
let candidate: CandidateFact
beforeEach(() => {
  vi.resetAllMocks()
  candidate = { id: 'candidate', type: 'fact', status: 'proposed', derivation: 'deterministic', evidence: { observationIds: ['source'] },
    fact: { content: 'Use TypeScript', provenance: { workspaceId: 'project' } } } as CandidateFact
  mocks.settings.mockResolvedValue({ enabled: true })
  mocks.candidates.mockImplementation(async () => [candidate])
  mocks.observations.mockResolvedValue([{ id: 'source' }, { id: 'other' }])
  mocks.run.mockResolvedValue({ observations: [], candidateHashes: {} })
})
it('takes evidence and ownership from the host for selected scoring', async () => {
  const input = { candidateId: candidate.id, candidateHash: candidateDecisionHash(candidate), action: 'score' }
  await runCandidateAction(input)
  expect(mocks.run).toHaveBeenCalledExactlyOnceWith({ workspaceId: 'project', observations: [{ id: 'source' }] }, input)
  expect(mocks.enqueue).toHaveBeenCalledOnce()
  expect(mocks.manual).not.toHaveBeenCalled()
})
it('persists manual intent without making an inline model call', async () => {
  const hash = candidateDecisionHash(candidate)
  await runCandidateAction({ candidateId: candidate.id, candidateHash: hash, action: 'refine' })
  expect(mocks.manual).toHaveBeenCalledExactlyOnceWith(candidate.id, hash)
  expect(mocks.run).not.toHaveBeenCalled()
})
it('rejects stale snapshots, extra authority fields and disabled knowledge', async () => {
  const input = { candidateId: candidate.id, candidateHash: candidateDecisionHash(candidate), action: 'score' }
  await expect(runCandidateAction({ ...input, scope: 'user' })).rejects.toThrow()
  candidate.fact.content = 'changed'
  await expect(runCandidateAction(input)).rejects.toThrow('candidate-changed')
  mocks.settings.mockResolvedValue({ enabled: false })
  await expect(runCandidateAction(input)).rejects.toThrow('knowledge-disabled')
  expect(mocks.run).not.toHaveBeenCalled()
})
