import { readPersonalForgettingBarrier } from './personal-forgetting-barrier'
/**
 * @file User episode service (M1).
 * @description Projects user observations and reads legacy episode files with
 * 30–90 day TTL harvest and a rolling working set. Capture redacts secrets
 * before storage; harvest marks expiry and audits `user_episode_harvested`.
 * Private by default; shared surfaces require explicit publish (M3).
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Observation, UserEpisode } from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'
import { knowledgeAuditService } from './audit-service'
import { knowledgeContractService } from './contract-service'
import { matchesForgettingQuery } from './search/tokenizer'
import { redactHighConfidenceSecrets } from '@janus-agent/agent-core'
import { knowledgeObservationService, type ObservationCaptureContext } from './observation-service'

const EPISODES_DIR = join('episodes')
export const EPISODE_TTL_MIN_DAYS = 30
export const EPISODE_TTL_MAX_DAYS = 90
export const EPISODE_WORKING_SET_LIMIT = 200

function clampTtlDays(value?: number): number {
  if (!Number.isFinite(value)) return EPISODE_TTL_MIN_DAYS
  return Math.max(EPISODE_TTL_MIN_DAYS, Math.min(EPISODE_TTL_MAX_DAYS, Math.trunc(value as number)))
}

function episodeFromObservation(observation: Observation, content: string): UserEpisode {
  return {
    id: observation.id, content: content.slice(0, 4000), createdAt: observation.createdAt, expiresAt: observation.expiresAt!,
    ttlDays: Math.round((Date.parse(observation.expiresAt!) - Date.parse(observation.createdAt)) / 86400000),
    tags: observation.tags, status: observation.episodeStatus ?? 'active',
    sourceObservationIds: [...new Set([observation.id, ...(observation.relatedObservationIds ?? [])])],
  }
}

function isEpisode(value: unknown): value is UserEpisode {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string' && typeof record.content === 'string'
    && typeof record.createdAt === 'string' && typeof record.expiresAt === 'string'
    && typeof record.ttlDays === 'number' && Array.isArray(record.sourceObservationIds)
}

export interface EpisodeHarvestResult {
  expired: number
  kept: number
  dryRun: boolean
}

export class UserEpisodeService {
  private readonly writeQueue = new SerialQueue()

  // Note: new episodes are observations; legacy files remain readable — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
  async capture(input: { content: string; ttlDays?: number; tags?: string[]; sourceObservationIds?: string[]; createdAt?: string; sessionId?: string; sourceEventId?: string }, context?: Pick<ObservationCaptureContext, 'speaker'>): Promise<UserEpisode> {
    const trimmed = input.content.trim()
    if (!trimmed) throw new Error('Episode content is required')
    const { text: redacted } = redactHighConfidenceSecrets(trimmed)
    const observation = await knowledgeObservationService.capture({
      workspaceId: 'user', workspaceName: 'user', workspacePath: 'user',
      source: context?.speaker === 'user' ? 'janus-chat' : 'system', type: 'conversation-turn',
      content: redacted, tags: input.tags, actor: context?.speaker ?? 'system',
      sessionId: input.sessionId, correlationId: input.sourceEventId, visibility: 'restricted',
    }, {
      speaker: context?.speaker ?? 'unknown', memoryIntent: 'episode', episodeTtlDays: clampTtlDays(input.ttlDays),
      createdAt: input.createdAt, sourceEventId: input.sourceEventId,
      relatedObservationIds: input.sourceObservationIds,
    })
    return episodeFromObservation(observation, await knowledgeObservationService.resolveContent(observation))
  }

  async listActive(nowMs: number = Date.now(), limit: number = EPISODE_WORKING_SET_LIMIT): Promise<UserEpisode[]> {
    const all = await this.readAll()
    const barrier = await readPersonalForgettingBarrier()
    return all
      .filter((episode) => !barrier.blocksEpisode(episode) && episode.status === 'active' && Date.parse(episode.expiresAt) > nowMs)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, Math.max(1, Math.min(EPISODE_WORKING_SET_LIMIT, Math.trunc(limit))))
  }

  async harvest(nowMs: number = Date.now(), confirm = true): Promise<EpisodeHarvestResult> {
    await knowledgeContractService.bootstrapWorkspace(undefined)
    const observations = await knowledgeObservationService.expireEpisodes({ nowMs, confirm })
    return this.writeQueue.run(async () => {
      const shards = await this.listShardFiles()
      let expired = observations.expiredIds.length
      let kept = observations.kept
      for (const relativePath of shards) {
        const absolutePath = join(knowledgeRootPath(), relativePath)
        let content = ''
        try {
          content = await readFile(absolutePath, 'utf8')
        } catch {
          continue
        }
        const lines = content.split('\n').filter((line) => line.trim())
        const nextLines: string[] = []
        let touched = false
        for (const line of lines) {
          let parsed: unknown
          try {
            parsed = JSON.parse(line) as unknown
          } catch {
            nextLines.push(line)
            kept += 1
            continue
          }
          if (!isEpisode(parsed)) {
            nextLines.push(line)
            kept += 1
            continue
          }
          if (parsed.status === 'active' && Date.parse(parsed.expiresAt) <= nowMs) {
            expired += 1
            touched = true
            if (confirm) {
              nextLines.push(JSON.stringify({ ...parsed, status: 'expired' }))
              await knowledgeAuditService.record({
                action: 'user_episode_harvested',
                targetType: 'observation',
                targetId: parsed.id,
                before: { status: 'active', expiresAt: parsed.expiresAt },
                after: { status: 'expired' },
                provenance: {
                  workspaceId: 'user',
                  workspaceName: 'user',
                  workspacePath: '',
                  source: 'system',
                  sourceObservationIds: [parsed.id],
                  fileRefs: [],
                  actor: 'user-memory-harvest',
                  createdAt: new Date(nowMs).toISOString(),
                },
              })
            }
          } else {
            nextLines.push(line)
            kept += 1
          }
        }
        if (confirm && touched) {
          await writeFileAtomic(absolutePath, nextLines.length > 0 ? `${nextLines.join('\n')}\n` : '')
        }
      }
      return { expired, kept, dryRun: !confirm }
    })
  }

  /**
   * User memory M3: expire active episodes sharing forgetting-weight tokens
   * with the query, so forget leaves no recall residue. Audits per record as
   * `user_episode_harvested` with the forget actor.
   */
  async expireMatching(query: string, nowMs: number = Date.now()): Promise<{ expiredIds: string[]; kept: number }> {
    if (!query.trim()) return { expiredIds: [], kept: 0 }
    await knowledgeContractService.bootstrapWorkspace(undefined)
    const observations = await knowledgeObservationService.expireEpisodes({ nowMs, confirm: true, query })
    return this.writeQueue.run(async () => {
      const expiredIds: string[] = [...observations.expiredIds]
      let kept = observations.kept
      for (const relativePath of await this.listShardFiles()) {
        const absolutePath = join(knowledgeRootPath(), relativePath)
        let content = ''
        try {
          content = await readFile(absolutePath, 'utf8')
        } catch {
          continue
        }
        const lines = content.split('\n').filter((line) => line.trim())
        const nextLines: string[] = []
        let touched = false
        for (const line of lines) {
          let parsed: unknown
          try {
            parsed = JSON.parse(line) as unknown
          } catch {
            nextLines.push(line)
            kept += 1
            continue
          }
          if (!isEpisode(parsed) || parsed.status !== 'active') {
            nextLines.push(line)
            kept += 1
            continue
          }
          const matched = matchesForgettingQuery(query, `${parsed.content}\n${parsed.tags.join(' ')}`)
          if (!matched) {
            nextLines.push(line)
            kept += 1
            continue
          }
          touched = true
          expiredIds.push(parsed.id)
          nextLines.push(JSON.stringify({ ...parsed, status: 'expired' }))
          await knowledgeAuditService.record({
            action: 'user_episode_harvested',
            targetType: 'observation',
            targetId: parsed.id,
            before: { status: 'active', expiresAt: parsed.expiresAt },
            after: { status: 'expired', reason: 'forget' },
            provenance: {
              workspaceId: 'user',
              workspaceName: 'user',
              workspacePath: '',
              source: 'system',
              sourceObservationIds: [parsed.id],
              fileRefs: [],
              actor: 'user-memory-forget',
              createdAt: new Date(nowMs).toISOString(),
            },
          })
        }
        if (touched) {
          await writeFileAtomic(absolutePath, nextLines.length > 0 ? `${nextLines.join('\n')}\n` : '')
        }
      }
      return { expiredIds, kept }
    })
  }

  private async listShardFiles(): Promise<string[]> {
    let entries: string[] = []
    try {
      entries = await readdir(join(knowledgeRootPath(), EPISODES_DIR))
    } catch {
      return []
    }
    return entries.filter((name) => name.endsWith('.jsonl')).map((name) => join(EPISODES_DIR, name)).sort()
  }

  private async readAll(): Promise<UserEpisode[]> {
    const out: UserEpisode[] = []
    for (const observation of await knowledgeObservationService.listAll()) {
      if (observation.scope !== 'user' || observation.memoryIntent !== 'episode') continue
      out.push(episodeFromObservation(observation, await knowledgeObservationService.resolveContent(observation)))
    }
    for (const relativePath of await this.listShardFiles()) {
      let content = ''
      try {
        content = await readFile(join(knowledgeRootPath(), relativePath), 'utf8')
      } catch {
        continue
      }
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const parsed = JSON.parse(trimmed) as unknown
          if (isEpisode(parsed)) out.push(parsed)
        } catch {
          continue
        }
      }
    }
    return out
  }
}

export const userEpisodeService = new UserEpisodeService()
