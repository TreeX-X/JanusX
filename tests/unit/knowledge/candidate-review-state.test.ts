import { describe, expect, it } from 'vitest'
import type { CandidateFact, CandidateGraphEdge } from '../../../src/shared/knowledge'
import type { KnowledgeAutomationStatus } from '../../../src/shared/knowledge-automation'
import { candidateReviewState } from '../../../src/renderer/src/components/knowledge/candidateReviewState'
import { reviewCandidateInput } from '../../../src/shared/review-candidate-snapshot'

const candidate = { id: 'candidate', type: 'fact', status: 'proposed', fact: { scope: 'project', content: 'Use backups.', provenance: { workspaceId: 'project' } } } as CandidateFact
const automation = (): KnowledgeAutomationStatus => ({ reviewStateVersion: 1, enabled: true, reviewEnabled: true, running: false,
  stages: { extraction: 'rules-only', entryReview: 'automatic', wikiGeneration: 'automatic', wikiReview: 'automatic' },
  tasks: [], queue: [], total: 0, counts: { pending: 0, running: 0, succeeded: 0, failed: 0, 'needs-review': 0, cancelled: 0 } })

describe('current candidate review state', () => {
  it.each(['pending', 'running', 'needs-review', 'failed'] as const)('binds %s to the current workspace and proposal', async status => {
    const { candidateHash } = await reviewCandidateInput(candidate)
    const current = automation()
    current.queue = [{ stage: 'entryReview', subject: candidate.id, workspaceId: 'project', candidateHash, status, id: 'current', canRetry: status === 'failed', reason: 'current reason' }]
    expect(candidateReviewState(candidate, current, candidateHash)).toEqual({ status, canReview: ['failed','needs-review'].includes(status), taskId: status === 'failed' ? 'current' : undefined, reason: 'current reason' })
    expect(candidateReviewState(candidate, current, 'old-hash')).toMatchObject({ status: 'unknown', canReview: false })
    current.queue[0].workspaceId = 'other'
    expect(candidateReviewState(candidate, current, candidateHash)).toMatchObject({ status: 'unknown', canReview: false })
  })
  it('separates disabled automation, disabled domain, unavailable hosts and personal review', () => {
    const status = automation()
    status.enabled = false
    expect(candidateReviewState(candidate, status, '')).toMatchObject({ status: 'manual', canReview: true })
    status.reviewEnabled = false
    expect(candidateReviewState(candidate, status, '')).toMatchObject({ status: 'disabled', canReview: false })
    expect(candidateReviewState(candidate, null, '')).toMatchObject({ status: 'unknown', canReview: false })
    status.reviewStateVersion = undefined
    expect(candidateReviewState(candidate, status, '')).toMatchObject({ status: 'unknown', canReview: false })
    expect(candidateReviewState({ ...candidate, fact: { ...candidate.fact, scope: 'user' } }, null, '')).toMatchObject({ status: 'manual', canReview: true })
  })
  it('never uses historical task results or legacy graph records as current authorization', () => {
    const status = automation()
    status.tasks = [{ id: 'old', subject: candidate.id, status: 'failed', reason: 'historical' }] as KnowledgeAutomationStatus['tasks']
    expect(candidateReviewState(candidate, status, '')).toEqual({ status: 'manual', canReview: true })
    expect(candidateReviewState({ id: 'edge', type: 'graph-edge', status: 'proposed' } as CandidateGraphEdge, status, '')).toEqual({ status: 'legacy', canReview: false })
    expect(candidateReviewState({ ...candidate, status: 'applied' }, status, '')).toEqual({ status: 'succeeded', canReview: false })
  })
})
