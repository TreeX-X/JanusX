import { useEffect, useState } from 'react'
import type { KnowledgeAutomationStatus } from '../../../../shared/knowledge-automation'
import { reviewCandidateInput, reviewCandidateSnapshot } from '../../../../shared/review-candidate-snapshot'
import { isUserScopeCandidate, type InboxCandidate } from './inboxScope'

export interface CandidateReviewState {
  status: 'unknown' | 'disabled' | 'manual' | 'legacy' | 'pending' | 'running' | 'needs-review' | 'failed' | 'succeeded' | 'rejected'
  canReview: boolean
  taskId?: string
  reason?: string
}
const unknown: CandidateReviewState = { status: 'unknown', canReview: false }

/** Historical tasks and advisory decision scores cannot authorize current actions. */
export function candidateReviewState(candidate: InboxCandidate, automation: KnowledgeAutomationStatus | null, candidateHash: string): CandidateReviewState {
  if (candidate.status !== 'proposed') return { status: candidate.status === 'applied' ? 'succeeded' : 'rejected', canReview: false }
  if (candidate.type === 'graph-edge') return { status: 'legacy', canReview: false }
  if (isUserScopeCandidate(candidate)) return { status: 'manual', canReview: true }
  if (automation?.reviewStateVersion !== 1) return unknown
  if (automation.reviewEnabled === false) return { status: 'disabled', canReview: false }
  if (!automation.enabled) return { status: 'manual', canReview: true }
  const stage = candidate.type === 'fact' ? 'entryReview' : 'wikiReview'
  const workspaceId = candidate.type === 'fact' ? candidate.fact.provenance.workspaceId : candidate.provenance.workspaceId
  const matches = automation.queue.filter(task => task.stage === stage && task.subject === candidate.id)
  if (!matches.length) return { status: 'manual', canReview: true }
  const task = matches.find(item => item.workspaceId === workspaceId && item.candidateHash === candidateHash)
  if (!task) return unknown
  return { status: task.status, canReview: task.status === 'needs-review' || task.status === 'failed',
    taskId: task.canRetry ? task.id : undefined, reason: task.reason }
}

export function useCandidateReviewState(candidate: InboxCandidate, automation: KnowledgeAutomationStatus | null): CandidateReviewState {
  const snapshot = reviewCandidateSnapshot(candidate)
  const [digest, setDigest] = useState<{ snapshot: string; hash: string }>()
  useEffect(() => {
    let current = true
    void reviewCandidateInput(candidate).then(input => { if (current) setDigest({ snapshot, hash: input.candidateHash }) }).catch(() => { if (current) setDigest(undefined) })
    return () => { current = false }
  }, [candidate, snapshot])
  if (candidate.type === 'graph-edge' || isUserScopeCandidate(candidate) || candidate.status !== 'proposed') return candidateReviewState(candidate, automation, '')
  return digest?.snapshot === snapshot ? candidateReviewState(candidate, automation, digest.hash) : unknown
}

export async function assertCandidateCanReview(candidate: InboxCandidate): Promise<void> {
  const input = await reviewCandidateInput(candidate)
  const status = isUserScopeCandidate(candidate) ? null : await window.electron.knowledge.automationStatus()
  if (!candidateReviewState(candidate, status, input.candidateHash).canReview) throw new Error('candidate-review-state-changed')
}
