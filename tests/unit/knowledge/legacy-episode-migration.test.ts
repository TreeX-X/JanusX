import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { UserEpisode } from '../../../src/shared/knowledge'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
vi.mock('../../../src/main/knowledge/audit-service', () => ({ knowledgeAuditService: { record: vi.fn().mockResolvedValue({}) } }))
import { migrateLegacyEpisodes } from '../../../src/main/knowledge/legacy-episode-migration'
import { userEpisodeService } from '../../../src/main/knowledge/user-episode-service'
import { knowledgeObservationService } from '../../../src/main/knowledge/observation-service'
import { episodeContentHash, memoryKey } from '../../../src/main/knowledge/personal-forgetting-barrier'
import * as atomic from '../../../src/main/lib/atomic-file'
import { isUserStatement } from '../../../src/main/knowledge/memory-evidence'

let root: string
const episode = (id: string): UserEpisode => ({ id, content: `Memory ${id}`, createdAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z', ttlDays: 60, tags: ['legacy'], sourceObservationIds: ['source'], status: 'active' })
async function writeLegacy(records: UserEpisode[], name = '2026-09.jsonl') {
  const bytes = records.map(row => JSON.stringify(row)).join('\r\n') + '\r\n'
  await writeFile(join(root, 'episodes', name), bytes)
  return bytes
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'janusx-episode-migration-'))
  vi.stubEnv('JANUSX_KNOWLEDGE_ROOT', root)
  await mkdir(join(root, 'episodes'), { recursive: true })
})
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }) })

describe('legacy episode migration', () => {
  it('previews without writing, preserves original bytes and exact episode semantics, and safely repeats', async () => {
    const rows = [episode('a'), { ...episode('b'), status: 'expired' as const }]
    rows[0].content = 'x'.repeat(4500)
    const original = await writeLegacy(rows)
    const before = await userEpisodeService.listForForgetting()
    const preview = await migrateLegacyEpisodes()
    expect(preview).toMatchObject({ files: 1, episodes: 2, migrated: 0 })
    await expect(readdir(join(root, 'migration'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await migrateLegacyEpisodes({ expectedHash: preview.hash })).toMatchObject({ files: 0, episodes: 0, migrated: 2 })
    const after = await userEpisodeService.listForForgetting()
    expect(after).toEqual(before)
    expect(after.map(episodeContentHash)).toEqual(before.map(episodeContentHash))
    expect(await readdir(join(root, 'episodes'))).toEqual([])
    const [backup] = await readdir(join(root, 'migration/episodes'))
    expect(await readFile(join(root, 'migration/episodes', backup), 'utf8')).toBe(original)
    expect((await knowledgeObservationService.listAll(true)).every(row => !isUserStatement(row))).toBe(true)
    expect((await knowledgeObservationService.listAll(true)).find(row => row.id === 'a')?.contentHash)
      .toBe(createHash('sha256').update(rows[0].content).digest('hex'))
    expect(await migrateLegacyEpisodes({ expectedHash: preview.hash })).toMatchObject({ migrated: 0 })
  })

  it('rejects stale previews, malformed data and duplicate IDs before writing anything', async () => {
    await writeLegacy([episode('a')])
    const preview = await migrateLegacyEpisodes()
    await writeLegacy([episode('changed')])
    await expect(migrateLegacyEpisodes({ expectedHash: preview.hash })).rejects.toThrow('changed')
    await writeLegacy([episode('same'), episode('same')])
    await expect(migrateLegacyEpisodes()).rejects.toThrow('Duplicate')
    await writeFile(join(root, 'episodes/2026-09.jsonl'), '{broken')
    await expect(migrateLegacyEpisodes()).rejects.toThrow()
    await expect(readdir(join(root, 'migration'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('retains originals on a destination write failure and resumes without duplicate records', async () => {
    const original = await writeLegacy([episode('a')])
    const preview = await migrateLegacyEpisodes()
    const write = atomic.writeFileAtomic
    vi.spyOn(atomic, 'writeFileAtomic').mockImplementation(async (path, content) => {
      if (path.includes('legacy-episodes-')) throw new Error('disk failure')
      return write(path, content)
    })
    await expect(migrateLegacyEpisodes({ expectedHash: preview.hash })).rejects.toThrow('disk failure')
    expect(await readFile(join(root, 'episodes/2026-09.jsonl'), 'utf8')).toBe(original)
    vi.restoreAllMocks()
    await migrateLegacyEpisodes({ expectedHash: preview.hash })
    expect(await userEpisodeService.listForForgetting()).toEqual([episode('a')])
  })

  it('handles a restart after target commit but before the original leaves the legacy directory', async () => {
    const original = await writeLegacy([episode('a')])
    const preview = await migrateLegacyEpisodes()
    await migrateLegacyEpisodes({ expectedHash: preview.hash })
    await writeFile(join(root, 'episodes/2026-09.jsonl'), original)
    expect(await userEpisodeService.listForForgetting()).toEqual([episode('a')])
    await migrateLegacyEpisodes({ expectedHash: preview.hash })
    expect(await userEpisodeService.listForForgetting()).toEqual([episode('a')])
  })

  it('retains forgetting barriers after migration and supports restoring an untouched backup to the legacy reader', async () => {
    await writeLegacy([episode('a')])
    await mkdir(join(root, 'profile'))
    await writeFile(join(root, 'profile/forgotten.json'), JSON.stringify({ version: 1, records: [{
      target: memoryKey('a'), targetHash: memoryKey('a'), createdAt: '2026-09-29T00:00:00Z', facts: [], candidates: [],
      observations: [memoryKey('a')], contents: [],
    }] }))
    const preview = await migrateLegacyEpisodes()
    await migrateLegacyEpisodes({ expectedHash: preview.hash })
    expect(await userEpisodeService.listActive()).toEqual([])
    const [backup] = await readdir(join(root, 'migration/episodes'))
    await copyFile(join(root, 'migration/episodes', backup), join(root, 'episodes/2026-09.jsonl'))
    const [target] = await readdir(join(root, 'observations/active'))
    await rm(join(root, 'observations/active', target))
    expect(await userEpisodeService.listForForgetting()).toEqual([episode('a')])
    expect(await userEpisodeService.listActive()).toEqual([])
  })
})
