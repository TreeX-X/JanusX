import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
vi.mock('../../../src/main/knowledge/audit-service', () => ({ knowledgeAuditService: { record: vi.fn().mockResolvedValue({}) } }))
import { UserProfileService } from '../../../src/main/knowledge/user-profile-service'
import { knowledgeAuditService } from '../../../src/main/knowledge/audit-service'
import { memoryKey } from '../../../src/main/knowledge/personal-forgetting-barrier'
import { forgetPersonalMemory } from '../../../src/main/knowledge/personal-memory-forgetting'

describe('manual profile editing', () => {
  let root: string
  let service: UserProfileService
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'janusx-profile-edit-'))
    vi.stubEnv('JANUSX_KNOWLEDGE_ROOT', root)
    vi.mocked(knowledgeAuditService.record).mockClear()
    service = new UserProfileService({ root: () => root, facts: async () => [], now: () => Date.parse('2026-09-29T00:00:00Z') })
  })
  afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }) })

  it('saves displayed fields and clears overrides without changing facts', async () => {
    const first = await service.editContext()
    await service.replace({ expectedHash: first.hash, overrides: { identity: 'Tree', formatPrefs: ['中文'], toolPrefs: ['pnpm'] } })
    const profile = await service.load()
    expect(profile.identity).toBe('Tree')
    const next = await service.editContext()
    await service.replace({ expectedHash: next.hash, overrides: {} })
    const cleared = await service.load()
    expect(cleared.identity).toBeUndefined()
    expect(cleared.version).toBe(profile.version + 1)
    await expect(readFile(join(root, 'facts/facts.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('allows only one competing edit and accepts a lost-response retry without another audit', async () => {
    const { hash } = await service.editContext()
    const results = await Promise.allSettled([
      service.replace({ expectedHash: hash, overrides: { identity: 'first' } }),
      service.replace({ expectedHash: hash, overrides: { identity: 'second' } }),
    ])
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
    const first = await service.load()
    await service.replace({ expectedHash: hash, overrides: { identity: 'first' } })
    expect((await service.load()).version).toBe(first.version)
    expect(knowledgeAuditService.record).toHaveBeenCalledTimes(1)
  })

  it('rejects stale clear requests instead of overwriting newer manual fields', async () => {
    const original = await service.editContext()
    await service.save({ identity: 'another window' })
    await expect(service.replace({ expectedHash: original.hash, overrides: {} })).rejects.toThrow('Personal profile changed')
    expect((await service.load()).identity).toBe('another window')
  })

  it('rejects arbitrary fields, oversized input and missing snapshots', () => {
    expect(() => service.replace({ overrides: {} })).toThrow()
    expect(() => service.replace({ expectedHash: 'a'.repeat(64), overrides: { confirmedFacts: [] } })).toThrow()
    expect(() => service.replace({ expectedHash: 'a'.repeat(64), overrides: { identity: 'x'.repeat(501) } })).toThrow()
  })

  it('retains manual data if auditing fails', async () => {
    await service.save({ identity: 'original' })
    const context = await service.editContext()
    vi.mocked(knowledgeAuditService.record).mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(service.replace({ expectedHash: context.hash, overrides: { identity: 'new' } })).rejects.toThrow('audit unavailable')
    expect(await service.editContext()).toEqual(context)
  })

  it('commits an edit even when the derived snapshot is corrupt', async () => {
    await mkdir(join(root, 'profile'), { recursive: true })
    await writeFile(join(root, 'profile/snapshot.json'), '{broken')
    const context = await service.editContext()
    await service.replace({ expectedHash: context.hash, overrides: { identity: 'saved' } })
    expect((await service.editContext()).overrides.identity).toBe('saved')
    await expect(service.load()).rejects.toThrow()
    expect(await readFile(join(root, 'profile/snapshot.json'), 'utf8')).toBe('{broken')
  })

  it('preserves corrupt overrides rather than treating them as an empty form', async () => {
    await mkdir(join(root, 'profile'), { recursive: true })
    await writeFile(join(root, 'profile/overrides.json'), '{broken')
    await expect(service.editContext()).rejects.toThrow()
    await expect(service.replace({ expectedHash: 'a'.repeat(64), overrides: {} })).rejects.toThrow()
    expect(await readFile(join(root, 'profile/overrides.json'), 'utf8')).toBe('{broken')
  })

  it('hides forgotten fields and prevents an older form restoring them', async () => {
    await service.save({ identity: 'forgotten', toolPrefs: ['retained'] })
    const old = await service.editContext()
    await writeFile(join(root, 'profile/forgotten.json'), JSON.stringify({ version: 1, records: [{
      target: memoryKey('target'), targetHash: memoryKey('snapshot'), createdAt: '2026-09-29T00:00:00Z',
      facts: [], candidates: [], observations: [], contents: [memoryKey('forgotten')],
    }] }))
    const current = await service.editContext()
    expect(current.overrides).toEqual({ toolPrefs: ['retained'] })
    expect(current.hash).not.toBe(old.hash)
    await expect(service.replace({ expectedHash: old.hash, overrides: old.overrides })).rejects.toThrow('forgotten content')
    await service.replace({ expectedHash: current.hash, overrides: { identity: 'new' } })
    expect((await service.load()).identity).toBe('new')
  })

  it('forgets one stored manual field and rejects stale field selections', async () => {
    await service.save({ identity: 'private identity', formatPrefs: ['short'], toolPrefs: ['pnpm'] })
    const context = await service.editContext()
    const request = { targetId: 'identity', targetHash: context.hash, kind: 'override' }
    await forgetPersonalMemory(request)
    await forgetPersonalMemory(request)
    expect((await service.editContext()).overrides).toEqual({ formatPrefs: ['short'], toolPrefs: ['pnpm'] })
    await expect(service.replace({ expectedHash: (await service.editContext()).hash, overrides: { identity: 'private identity' } })).rejects.toThrow('forgotten content')
    await expect(forgetPersonalMemory({ targetId: 'toolPrefs:0', targetHash: context.hash, kind: 'override' })).rejects.toThrow('changed')
  })
})
