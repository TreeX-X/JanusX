import type { CandidateFact } from './knowledge'

/** The reviewed content, ownership and evidence; excludes advisory scores. */
export function memoryCandidateSnapshot(candidate: CandidateFact): string {
  return JSON.stringify([candidate.id, candidate.fact, candidate.evidence, candidate.conflicts ?? [], candidate.derivation])
}
