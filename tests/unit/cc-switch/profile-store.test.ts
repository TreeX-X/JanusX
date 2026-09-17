import { mkdtemp, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => join(tmpdir(), 'janusx-test-user-data')) },
}))

const { CcSwitchProfileStore } = await import('../../../src/main/cc-switch/profile-store')

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'janusx-cc-profile-test-'))
}

const VALID = { name: 'Relay', baseURL: 'https://relay.example.com/v1', authToken: 'sk-test' }

describe('CcSwitchProfileStore', () => {
  it('saves, lists, and auto-activates the first profile', async () => {
    const store = new CcSwitchProfileStore(await createTempDir())

    const saved = await store.save(VALID)
    expect(saved.id).toMatch(/^p-/)
    const state = await store.list()
    expect(state.profiles).toHaveLength(1)
    expect(state.activeProfileId).toBe(saved.id)
    await expect(store.getProfile(saved.id)).resolves.toMatchObject({ name: 'Relay' })
  })

  it('rejects invalid input without touching the disk state', async () => {
    const store = new CcSwitchProfileStore(await createTempDir())

    await expect(store.save({ ...VALID, baseURL: 'not-a-url' })).rejects.toThrow()
    await expect(store.save({ ...VALID, authToken: '  ' })).rejects.toThrow()
    await expect(store.list()).resolves.toMatchObject({ profiles: [] })
  })

  it('updates in place and clears the active flag when the active profile is removed', async () => {
    const store = new CcSwitchProfileStore(await createTempDir())
    const first = await store.save(VALID)
    const second = await store.save({ ...VALID, name: 'Second' })
    await store.setActive(second.id)

    const updated = await store.save({ ...VALID, id: first.id, name: 'Renamed' })
    expect(updated.id).toBe(first.id)
    expect(updated.name).toBe('Renamed')

    await store.remove(second.id)
    await expect(store.list()).resolves.toMatchObject({ profiles: [expect.objectContaining({ id: first.id })], activeProfileId: null })
  })

  it('backs up a corrupt document instead of overwriting it', async () => {
    const dir = await createTempDir()
    const store = new CcSwitchProfileStore(dir)
    await store.save(VALID)

    const storePath = join(dir, 'cc-switch-profiles.json')
    const { writeFile } = await import('fs/promises')
    await writeFile(storePath, '{broken json', 'utf8')

    const fresh = new CcSwitchProfileStore(dir)
    await expect(fresh.list()).resolves.toMatchObject({ profiles: [] })
    const raw = await readFile(storePath, 'utf8')
    expect(JSON.parse(raw).profiles).toEqual({})
  })
})
