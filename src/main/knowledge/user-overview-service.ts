// Note: glance payload for persona cards plus badge — see .agents/notes/implemented/feature/2026-09-15-user-memory-surface-m4.md
/**
 * @file User memory overview service (M4).
 * @description Composes one workspace-free glance payload from the M1 stores:
 * the `UserProfile` snapshot, active scope-user habit facts, recent active
 * episodes, and the pending habit-candidate count for the Island badge. Read
 * paths only; cards and badges show state and initiate no privileged action.
 */
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { CandidateFact, UserMemoryOverview } from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { knowledgeContractService } from './contract-service'
import { knowledgeTruthService } from './truth-service'
import { userEpisodeService } from './user-episode-service'
import { userProfileService } from './user-profile-service'

const FACT_CANDIDATES_FILE = join('facts', 'candidates.jsonl')
export const OVERVIEW_HABIT_LIMIT = 20
export const OVERVIEW_RECENT_LIMIT = 10

async function readProposedUserCandidates(): Promise<CandidateFact[]> {
  try {
    const content = await readFile(join(knowledgeRootPath(), FACT_CANDIDATES_FILE), 'utf8')
    const out: CandidateFact[] = []
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const parsed = JSON.parse(trimmed) as CandidateFact
        if (parsed?.type === 'fact' && parsed.status === 'proposed'
          && (parsed.fact.scope === 'user' || parsed.fact.provenance.workspaceId === 'user')) {
          out.push(parsed)
        }
      } catch {
        continue
      }
    }
    return out
  } catch {
    return []
  }
}

export async function getUserMemoryOverview(nowMs: number = Date.now()): Promise<UserMemoryOverview> {
  await knowledgeContractService.bootstrapWorkspace(undefined)
  const [snapshot, profile, episodes, candidates] = await Promise.all([
    knowledgeTruthService.list(),
    userProfileService.load(),
    userEpisodeService.listActive(nowMs, OVERVIEW_RECENT_LIMIT),
    readProposedUserCandidates(),
  ])
  const habits = snapshot.facts
    .filter((fact) => fact.scope === 'user' || fact.provenance.workspaceId === 'user')
    .sort((left, right) => (right.lastSeenAt ?? right.provenance.createdAt)
      .localeCompare(left.lastSeenAt ?? left.provenance.createdAt))
    .slice(0, OVERVIEW_HABIT_LIMIT)
    .map((fact) => ({
      id: fact.id,
      content: fact.content,
      ...(fact.habitStrength !== undefined ? { habitStrength: fact.habitStrength } : {}),
      ...(fact.lastSeenAt ? { lastSeenAt: fact.lastSeenAt } : {}),
      ...(fact.supersedes?.trim() ? { succession: `supersedes ${fact.supersedes.trim()}` } : {}),
      observationIds: fact.provenance.sourceObservationIds,
    }))
  return {
    profile,
    habits,
    recent: episodes.map((episode) => ({
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
