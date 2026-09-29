// Note: verified per-shard migration preserves backups and resumes after interruption — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { UserEpisode } from '../../shared/knowledge'
import { knowledgeRootPath } from './constants'
import { knowledgeObservationService } from './observation-service'
import { userEpisodeService } from './user-episode-service'
import { legacyEpisodeSchema, migratedEpisode, migratedEpisodeMetadata } from './legacy-episodes'
import { writeFileAtomic } from '../lib/atomic-file'
import { profileContentHash } from './profile-projection'

const bytesHash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
export interface EpisodeMigrationPreview { hash: string; files: number; episodes: number; migrated: number }
interface Shard { name: string; bytes: Buffer; hash: string; episodes: UserEpisode[]; target: string; output: string; backup: string }

async function optionalBytes(path: string): Promise<Buffer | undefined> {
  try { return await readFile(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function inspect(): Promise<{ shards: Shard[]; preview: EpisodeMigrationPreview }> {
  const root = knowledgeRootPath()
  let names: string[]
  try { names = (await readdir(join(root, 'episodes'))).filter(name => name.endsWith('.jsonl')).sort() }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; names = [] }
  const observations = await knowledgeObservationService.listAll(true)
  const seen = new Set<string>()
  const shards: Shard[] = []
  for (const name of names) {
    const bytes = await readFile(join(root, 'episodes', name))
    const hash = bytesHash(bytes)
    const episodes = bytes.toString('utf8').split(/\r?\n/).filter(line => line.trim()).map(line => legacyEpisodeSchema.parse(JSON.parse(line)))
    const output = episodes.map(episode => {
      if (seen.has(episode.id)) throw new Error('Duplicate legacy episode identity')
      seen.add(episode.id)
      const matches = observations.filter(observation => observation.workspaceId === 'user' && observation.id === episode.id)
      if (matches.length > 1) throw new Error('Ambiguous migrated episode identity')
      const metadata = matches[0] && migratedEpisodeMetadata(matches[0])
      if (matches.length && (!metadata || metadata.file !== name || metadata.sourceHash !== hash || metadata.recordHash !== profileContentHash(episode))) {
        throw new Error('Legacy episode conflicts with an existing observation')
      }
      return JSON.stringify(migratedEpisode(episode, name, hash))
    }).join('\n') + (episodes.length ? '\n' : '')
    const target = join(root, 'observations', 'active', `legacy-episodes-${bytesHash(name)}.jsonl`)
    const backup = join(root, 'migration', 'episodes', `${hash}-${name}`)
    const existing = await optionalBytes(target)
    if (existing && !existing.equals(Buffer.from(output))) throw new Error('Migrated episode shard changed; manual reconciliation required')
    const previousBackup = await optionalBytes(backup)
    if (previousBackup && !previousBackup.equals(bytes)) throw new Error('Legacy episode backup changed')
    shards.push({ name, bytes, hash, episodes, target, output, backup })
  }
  return { shards, preview: { hash: profileContentHash(shards.map(shard => [shard.name, shard.hash])), files: shards.length,
    episodes: shards.reduce((sum, shard) => sum + shard.episodes.length, 0), migrated: 0 } }
}

/** Empty input previews. A matching source snapshot authorizes migration of that exact selection. */
export async function migrateLegacyEpisodes(input: unknown = {}): Promise<EpisodeMigrationPreview> {
  const request = z.object({ expectedHash: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict().parse(input)
  return userEpisodeService.withLegacyMutation(() => knowledgeObservationService.withSourceMutation(async () => {
    const { shards, preview } = await inspect()
    if (!request.expectedHash) return preview
    if (!shards.length) return preview
    if (request.expectedHash !== preview.hash) throw new Error('Legacy episodes changed; preview again')
    for (const shard of shards) {
      const source = join(knowledgeRootPath(), 'episodes', shard.name)
      if (!(await readFile(source)).equals(shard.bytes)) throw new Error('Legacy episodes changed during migration')
      await mkdir(join(knowledgeRootPath(), 'migration', 'episodes'), { recursive: true })
      // The untouched original is a recovery copy before the new source becomes visible.
      if (!await optionalBytes(shard.backup)) await writeFileAtomic(shard.backup, shard.bytes.toString('utf8'))
      if (!(await readFile(shard.backup)).equals(shard.bytes)) throw new Error('Legacy episode backup verification failed')
      if (!await optionalBytes(shard.target)) await writeFileAtomic(shard.target, shard.output)
      if (!(await readFile(shard.target)).equals(Buffer.from(shard.output))) throw new Error('Migrated episode verification failed')
      if (!(await readFile(source)).equals(shard.bytes)) throw new Error('Legacy episodes changed during migration')
      // Rename removes the legacy read path only after both verified copies exist.
      await rename(source, shard.backup)
      preview.migrated += shard.episodes.length
    }
    return { ...preview, files: 0, episodes: 0 }
  }))
}
