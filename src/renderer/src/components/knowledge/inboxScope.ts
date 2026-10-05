// Note: Inbox person/engineering columns share one scope rule — see .agents/notes/2026-09-18-personal-engineering-separation--296ddf52.md
/**
 * @file Inbox scope split (memory separation, pure)
 * @description One scope rule for the person/engineering Inbox columns: a
 *  candidate is personal when it carries user scope or user provenance.
 *  Mirrors `listProposedUserFactCandidates` in main (same file source, same
 *  predicate shape) so the Inbox personal count and the persona
 *  `pendingHabitCount` badge cannot diverge by definition drift. No React,
 *  no styles, unit-testable in node.
 */
import type {
  CandidateFact,
  CandidateGraphEdge,
  CandidateWikiPatch,
} from '../../../../shared/knowledge'
import type { KnowledgeAutomationStatus } from '../../../../shared/knowledge-automation'

export type InboxCandidate = CandidateFact | CandidateWikiPatch | CandidateGraphEdge
export type InboxScopeFilter = 'all' | 'user' | 'engineering'

/** Personal candidates: user scope or user provenance, every candidate kind. */
export function isUserScopeCandidate(candidate: InboxCandidate): boolean {
  if (candidate.type === 'fact') {
    return candidate.fact.scope === 'user' || candidate.fact.provenance.workspaceId === 'user'
  }
  if (candidate.type === 'wiki-patch') {
    return candidate.provenance.workspaceId === 'user'
  }
  return candidate.edge.workspaceId === 'user'
}

export function filterInboxByScope(candidates: InboxCandidate[], scope: InboxScopeFilter): InboxCandidate[] {
  if (scope === 'all') return candidates
  return candidates.filter((candidate) => isUserScopeCandidate(candidate) === (scope === 'user'))
}

/** Split counts over one proposed list; user + engineering always sum to all. */
export function countInboxScopes(candidates: InboxCandidate[]): { user: number; engineering: number } {
  let user = 0
  for (const candidate of candidates) {
    if (isUserScopeCandidate(candidate)) user += 1
  }
  return { user, engineering: candidates.length - user }
}

/** Only current host plans can move project candidates out of the human inbox. */
export function splitReviewCandidates(candidates: InboxCandidate[], automation: KnowledgeAutomationStatus | null) {
  const pending = new Map<string, 'pending' | 'running'>()
  if (automation?.enabled) for (const task of automation.queue ?? []) {
    if (task.status !== 'pending' && task.status !== 'running') continue
    const type = task.stage === 'entryReview' ? 'fact' : task.stage === 'wikiReview' ? 'wiki-patch' : null
    if (type) pending.set(`${type}:${task.subject}`, task.status)
  }
  const manual: InboxCandidate[] = []
  const automatic: Array<{ candidate: InboxCandidate; status: 'pending' | 'running' }> = []
  for (const candidate of candidates) {
    const status = !isUserScopeCandidate(candidate) && pending.get(`${candidate.type}:${candidate.id}`)
    if (status) automatic.push({ candidate, status })
    else manual.push(candidate)
  }
  return { manual, automatic }
}

export function competingCorrections(candidates: InboxCandidate[], candidate: InboxCandidate): number {
  if (candidate.type !== 'fact' || !candidate.personalCorrection) return 0
  return candidates.filter(other => other.type === 'fact' && other.id !== candidate.id && other.status === 'proposed'
    && other.personalCorrection?.targetId === candidate.personalCorrection?.targetId).length
}
