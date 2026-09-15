/**
 * @file User episode service (M1).
 * @description Owns `episodes/YYYY-MM.jsonl`: auto-written dated events with
 * 30–90 day TTL harvest and a rolling working set. Capture redacts secrets
 * before storage; harvest marks expiry and audits `user_episode_harvested`.
 * Private by default; shared surfaces require explicit publish (M3).
 */
import { randomUUID } from 'crypto'
import { mkdir, readFile, readdir } from 'fs/promises'
import { join } from 'path'
import type { UserEpisode } from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'
import { knowledgeAuditService } from './audit-service'
import { knowledgeContractService } from './contract-service'
import { redactHighConfidenceSecrets } from '@janus-agent/agent-core'

const EPISODES_DIR = join('episodes')
export const EPISODE_TTL_MIN_DAYS = 30
export const EPISODE_TTL_MAX_DAYS = 90
export const EPISODE_WORKING_SET_LIMIT = 200

function clampTtlDays(value?: number): number {
  if (!Number.isFinite(value)) return EPISODE_TTL_MIN_DAYS
  return Math.max(EPISODE_TTL_MIN_DAYS, Math.min(EPISODE_TTL_MAX_DAYS, Math.trunc(value as number)))
}

function shardFor(createdAtIso: string): string {
  const instant = Date.parse(createdAtIso)
  const date = Number.isFinite(instant) ? new Date(instant) : new Date()
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return join(EPISODES_DIR, `${year}-${month}.jsonl`)
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

  async capture(input: { content: string; ttlDays?: number; tags?: string[]; sourceObservationIds?: string[]; createdAt?: string }): Promise<UserEpisode> {
    const trimmed = input.content.trim()
    if (!trimmed) throw new Error('Episode content is required')
    const { text: redacted } = redactHighConfidenceSecrets(trimmed)
    const createdAt = input.createdAt ?? new Date().toISOString()
    const ttlDays = clampTtlDays(input.ttlDays)
    const episode: UserEpisode = {
      id: randomUUID(),
      content: redacted.slice(0, 4000),
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + ttlDays * 24 * 60 * 60 * 1000).toISOString(),
      ttlDays,
      tags: [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))].slice(0, 20),
      sourceObservationIds: [...new Set(input.sourceObservationIds ?? [])].slice(0, 50),
      status: 'active',
    }
    await knowledgeContractService.bootstrapWorkspace(undefined)
    const relativePath = shardFor(createdAt)
    const absolutePath = join(knowledgeRootPath(), relativePath)
    await this.writeQueue.run(async () => {
      await mkdir(join(absolutePath, '..'), { recursive: true })
      let previous = ''
      try {
        previous = await readFile(absolutePath, 'utf8')
      } catch {
        previous = ''
      }
      const next = previous.length > 0 && !previous.endsWith('\n') ? `${previous}\n` : previous
      await writeFileAtomic(absolutePath, `${next}${JSON.stringify(episode)}\n`)
    })
    await knowledgeAuditService.record({
      action: 'user_episode_captured',
      targetType: 'observation',
      targetId: episode.id,
      before: null,
      after: { createdAt: episode.createdAt, expiresAt: episode.expiresAt },
      provenance: {
        workspaceId: 'user',
        workspaceName: 'user',
        workspacePath: '',
        source: 'system',
        sourceObservationIds: episode.sourceObservationIds,
        fileRefs: [],
        actor: 'user-memory',
        createdAt,
      },
    })
    return episode
  }

  async listActive(nowMs: number = Date.now(), limit: number = EPISODE_WORKING_SET_LIMIT): Promise<UserEpisode[]> {
    const all = await this.readAll()
    return all
      .filter((episode) => episode.status === 'active' && Date.parse(episode.expiresAt) > nowMs)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, Math.max(1, Math.min(EPISODE_WORKING_SET_LIMIT, Math.trunc(limit))))
  }

  async harvest(nowMs: number = Date.now(), confirm = true): Promise<EpisodeHarvestResult> {
    await knowledgeContractService.bootstrapWorkspace(undefined)
    return this.writeQueue.run(async () => {
      const shards = await this.listShardFiles()
      let expired = 0
      let kept = 0
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
