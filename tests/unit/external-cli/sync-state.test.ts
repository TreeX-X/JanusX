import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => join(tmpdir(), 'janusx-test-user-data')) },
}))

const { ExternalCliSyncStateStore } = await import('../../../src/main/external-cli/sync-state')

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'janusx-cc-sync-test-'))
}

const RECORD = {
  providerId: 'openai-1',
  providerName: 'Relay',
  baseURL: 'https://relay.example.com/v1',
  syncedAt: 1700000000000,
  backupPath: null,
}

describe('ExternalCliSyncStateStore', () => {
  it('starts empty and round-trips a record', async () => {
    const store = new ExternalCliSyncStateStore(await createTempDir())

    await expect(store.get()).resolves.toEqual({ claude: null })
    await store.record(RECORD)
    await expect(store.get()).resolves.toEqual({ claude: RECORD })
    await store.clear()
    await expect(store.get()).resolves.toEqual({ claude: null })
  })

  it('drops malformed records instead of surfacing them', async () => {
    const dir = await createTempDir()
    await writeFile(join(dir, 'external-cli-sync.json'), JSON.stringify({ version: '1.0.0', claude: { nope: true } }), 'utf8')

    const store = new ExternalCliSyncStateStore(dir)
    await expect(store.get()).resolves.toEqual({ claude: null })
  })

  it('backs up a corrupt document instead of overwriting it', async () => {
    const dir = await createTempDir()
    const storePath = join(dir, 'external-cli-sync.json')
    await writeFile(storePath, '{broken json', 'utf8')

    const store = new ExternalCliSyncStateStore(dir)
    await expect(store.get()).resolves.toEqual({ claude: null })
    expect(JSON.parse(await readFile(storePath, 'utf8'))).toEqual({ version: '1.0.0', claude: null })
  })
})
