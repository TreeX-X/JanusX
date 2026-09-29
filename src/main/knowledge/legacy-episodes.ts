// Note: migration preserves episode identity and source references without granting authority — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { z } from 'zod'
import { createHash } from 'node:crypto'
import type { Observation, UserEpisode } from '../../shared/knowledge'
import { profileContentHash } from './profile-projection'

export const legacyEpisodeSchema = z.object({
  id: z.string().min(1), content: z.string(), createdAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }), ttlDays: z.number().finite().nonnegative(),
  tags: z.array(z.string()), sourceObservationIds: z.array(z.string()), status: z.enum(['active', 'expired']),
}).strict()

const migrationSchema = z.object({
  version: z.literal(1), file: z.string(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  recordHash: z.string().regex(/^[a-f0-9]{64}$/), ttlDays: z.number(), sourceObservationIds: z.array(z.string()),
}).strict()

export function migratedEpisodeMetadata(observation: Observation) {
  const raw = observation.metadata?.legacyEpisode
  return raw === undefined ? undefined : migrationSchema.parse(raw)
}

export function migratedEpisode(episode: UserEpisode, file: string, sourceHash: string): Observation {
  const contentHash = createHash('sha256').update(episode.content).digest('hex')
  return {
    id: episode.id, scope: 'user', workspaceId: 'user', workspaceName: 'user', workspacePath: 'user',
    source: 'system', type: 'conversation-turn', actor: 'legacy-episode-migration', visibility: 'restricted',
    content: episode.content, createdAt: episode.createdAt, tags: episode.tags, fileRefs: [],
    memoryIntent: 'episode', episodeStatus: episode.status, expiresAt: episode.expiresAt,
    relatedObservationIds: episode.sourceObservationIds,
    sourceEvidence: { observationId: episode.id, workspaceId: 'user', scope: 'user', source: 'system',
      createdAt: episode.createdAt, speaker: 'unknown', authority: 'unverified', excerpt: episode.content.slice(0, 280) },
    metadata: { legacyEpisode: { version: 1, file, sourceHash, recordHash: profileContentHash(episode),
      ttlDays: episode.ttlDays, sourceObservationIds: episode.sourceObservationIds } },
    retentionClass: 'evidence', retentionReason: 'legacy-episode', contentHash,
    dedupeKey: profileContentHash(['legacy-episode', episode.id]), contentLength: episode.content.length,
    originalLength: episode.content.length, truncated: false, compactionStatus: 'active',
  }
}
