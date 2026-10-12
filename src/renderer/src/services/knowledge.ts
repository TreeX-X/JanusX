import type { UserMemoryOverview } from '../../../shared/knowledge'
import type { ReviewCandidateInput as KnowledgeReviewCandidateInput } from '../../../shared/ipc/knowledge'

export async function getUserMemoryOverview(): Promise<UserMemoryOverview | null> {
  try {
    return await window.electron.knowledge.userMemoryOverview()
  } catch {
    return null
  }
}

export async function rejectKnowledgeCandidate(
  input: KnowledgeReviewCandidateInput,
): Promise<unknown> {
  const result = await window.electron.knowledge.rejectCandidate(input)
  window.dispatchEvent(new Event('janusx-memory-changed'))
  return result
}

export async function applyKnowledgeCandidate(
  input: KnowledgeReviewCandidateInput,
): Promise<unknown> {
  const result = await window.electron.knowledge.applyCandidate(input)
  window.dispatchEvent(new Event('janusx-memory-changed'))
  return result
}
