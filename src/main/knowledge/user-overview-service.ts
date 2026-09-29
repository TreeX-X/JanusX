import { memoryStrength } from '../../shared/memory-strength'
// Note: glance payload for persona cards plus badge — see .agents/notes/2026-09-15-user-memory-surface-m4--b32f92b5.md
/**
 * @file User memory overview service (M4).
 * @description Composes one workspace-free glance payload from the M1 stores:
 * the `UserProfile` snapshot, active scope-user habit facts, recent active
 * episodes, and the pending habit-candidate count for the Island badge. Read
 * paths only; cards and badges show state and initiate no privileged action.
 */
import type { UserMemoryOverview } from '../../shared/knowledge'
import { knowledgeContractService } from './contract-service'
import { knowledgeTruthService } from './truth-service'
import { listProposedUserFactCandidates } from './review-service'
import { userEpisodeService } from './user-episode-service'
import { userProfileService } from './user-profile-service'
import { episodeContentHash } from './personal-forgetting-barrier'
import { reviewedFactHash } from './profile-projection'

export const OVERVIEW_HABIT_LIMIT = 20
export const OVERVIEW_RECENT_LIMIT = 10

export async function getUserMemoryOverview(nowMs: number = Date.now()): Promise<UserMemoryOverview> {
  await knowledgeContractService.bootstrapWorkspace(undefined)
  const candidates = await listProposedUserFactCandidates()
  const [snapshot, profile, episodes] = await Promise.all([
    knowledgeTruthService.list(),
    userProfileService.load(),
    userEpisodeService.listActive(nowMs, OVERVIEW_RECENT_LIMIT),
  ])
  const habits = snapshot.facts
    .filter((fact) => fact.scope === 'user' || fact.provenance.workspaceId === 'user')
    .filter((fact) => !fact.ttl || Date.parse(fact.ttl) > nowMs)
    .sort((left, right) => (right.lastSeenAt ?? right.provenance.createdAt)
      .localeCompare(left.lastSeenAt ?? left.provenance.createdAt))
    .slice(0, OVERVIEW_HABIT_LIMIT)
    .map((fact) => ({
      id: fact.id,
      contentHash: reviewedFactHash(fact),
      confirmed: fact.confirmation?.kind === 'human-review' && fact.confirmation.contentHash === reviewedFactHash(fact)
        && (!fact.ttl || Date.parse(fact.ttl) > nowMs),
      content: fact.content,
      ...(fact.habitStrength !== undefined ? { habitStrength: memoryStrength(fact, nowMs) } : {}),
      ...(fact.lastSeenAt ? { lastSeenAt: fact.lastSeenAt } : {}),
      ...(fact.supersedes?.trim() ? { succession: `supersedes ${fact.supersedes.trim()}` } : {}),
      observationIds: fact.provenance.sourceObservationIds,
    }))
  return {
    profile,
    habits,
    recent: episodes.map((episode) => ({
      contentHash: episodeContentHash(episode),
      id: episode.id,
      content: episode.content,
      createdAt: episode.createdAt,
      expiresAt: episode.expiresAt,
      tags: episode.tags,
    })),
    pendingHabitCount: candidates.length,
    generatedAt: new Date(nowMs).toISOString(),
  }
}
