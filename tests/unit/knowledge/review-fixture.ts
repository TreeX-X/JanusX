import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { knowledgeRootPath } from '../../../src/main/knowledge/constants'
import { reviewCandidateInput, type ReviewCandidate } from '../../../src/shared/review-candidate-snapshot'
import type { ReviewCandidateInput } from '../../../src/shared/ipc/knowledge'

/** Existing pipeline tests review the current fixture; stale-snapshot tests retain an earlier explicit input. */
export async function reviewFixture(input: Omit<ReviewCandidateInput, 'candidateHash'>): Promise<ReviewCandidateInput> {
  const path = input.type === 'fact' ? 'facts/candidates.jsonl' : input.type === 'wiki-patch' ? 'wiki/patches.jsonl' : 'graph/candidates.jsonl'
  let candidate: ReviewCandidate | undefined
  try {
    candidate = (await readFile(join(knowledgeRootPath(), path), 'utf8')).split('\n').filter(Boolean)
      .map(line => JSON.parse(line) as ReviewCandidate).find(item => item.id === input.id)
  } catch { /* The production reader, not the fixture helper, must report storage errors. */ }
  return { ...input, candidateHash: candidate ? (await reviewCandidateInput(candidate)).candidateHash : '0'.repeat(64) }
}
