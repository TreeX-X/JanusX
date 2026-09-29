// Note: approval binds the displayed proposal — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import type { CandidateFact, CandidateGraphEdge, CandidateWikiPatch } from './knowledge'

export type ReviewCandidate = CandidateFact | CandidateGraphEdge | CandidateWikiPatch

/** Status and review notes change on commit; advisory scores do not change the proposal. */
export function reviewCandidateSnapshot(candidate: ReviewCandidate): string {
  const { status: _status, reviewNotes: _notes, ...proposal } = candidate
  if ('decision' in proposal) delete proposal.decision
  return JSON.stringify(proposal, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
    }
    return value
  })
}

export async function reviewCandidateInput(candidate: ReviewCandidate) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(reviewCandidateSnapshot(candidate)))
  const candidateHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return { type: candidate.type, id: candidate.id, candidateHash }
}
