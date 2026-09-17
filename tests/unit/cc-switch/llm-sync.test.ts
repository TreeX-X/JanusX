import { mkdtemp, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => join(tmpdir(), 'janusx-test-user-data')) },
}))

const { ClaudeSettingsApplier } = await import('../../../src/main/cc-switch/settings-applier')
const { ClaudeDetector } = await import('../../../src/main/cc-switch/claude-detector')
const { CcSwitchSyncStateStore } = await import('../../../src/main/cc-switch/sync-state')
const { DefaultCcSwitchService } = await import('../../../src/main/cc-switch/service')

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

type Credentials = { providerId: string; providerName: string; baseURL: string; authToken: string; model?: string }

function createService(homeDir: string, userDataDir: string, credentials: Credentials | null) {
  const detector = new ClaudeDetector({
    env: {},
    platform: 'linux',
    homeDir,
    isRegularFile: async () => false,
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
  })
  return new DefaultCcSwitchService(
    detector,
    new ClaudeSettingsApplier(homeDir),
    new CcSwitchSyncStateStore(userDataDir),
    async () => credentials,
  )
}

const CREDENTIALS: Credentials = {
  providerId: 'openai-1',
  providerName: 'Relay',
  baseURL: 'https://relay.example.com/v1',
  authToken: 'sk-test',
  model: 'm',
}

describe('CcSwitchService provider sync', () => {
  it('applies provider credentials and records the sync source', async () => {
    const homeDir = await createTempDir('janusx-cc-llm-home-')
    const userDataDir = await createTempDir('janusx-cc-llm-data-')
    const service = createService(homeDir, userDataDir, CREDENTIALS)

    const result = await service.applyProvider('claude', null)
    expect(result).toMatchObject({ success: true, providerName: 'Relay' })

    const live = JSON.parse(await readFile(join(homeDir, '.claude', 'settings.json'), 'utf8'))
    expect(live.env.ANTHROPIC_BASE_URL).toBe('https://relay.example.com/v1')
    expect(live.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test')

    const state = await service.syncState()
    expect(state.claude).toMatchObject({ providerId: 'openai-1', providerName: 'Relay' })
  })

  it('reports NO_LLM_PROVIDER when no usable provider exists', async () => {
    const homeDir = await createTempDir('janusx-cc-llm-none-')
    const userDataDir = await createTempDir('janusx-cc-llm-none-data-')
    const service = createService(homeDir, userDataDir, null)

    await expect(service.applyProvider('claude', null)).resolves.toEqual({ success: false, error: 'NO_LLM_PROVIDER' })
    await expect(service.syncState()).resolves.toEqual({ claude: null })
  })

  it('clears the sync record on rollback', async () => {
    const homeDir = await createTempDir('janusx-cc-llm-rb-')
    const userDataDir = await createTempDir('janusx-cc-llm-rb-data-')
    const service = createService(homeDir, userDataDir, CREDENTIALS)

    const { mkdir, writeFile } = await import('fs/promises')
    await mkdir(join(homeDir, '.claude'), { recursive: true })
    await writeFile(join(homeDir, '.claude', 'settings.json'), JSON.stringify({ env: { V: '0' } }), 'utf8')

    await service.applyProvider('claude', 'openai-1')
    await expect(service.syncState()).resolves.toMatchObject({ claude: { providerId: 'openai-1' } })

    const rolled = await service.rollbackProfile()
    expect(rolled.success).toBe(true)
    await expect(service.syncState()).resolves.toEqual({ claude: null })
  })

  it('rejects unsupported tools without touching resolvers', async () => {
    const homeDir = await createTempDir('janusx-cc-llm-tool-')
    const userDataDir = await createTempDir('janusx-cc-llm-tool-data-')
    const resolver = vi.fn(async () => CREDENTIALS)
    const detector = new ClaudeDetector({
      env: {},
      platform: 'linux',
      homeDir,
      isRegularFile: async () => false,
      run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
    })
    const service = new DefaultCcSwitchService(
      detector,
      new ClaudeSettingsApplier(homeDir),
      new CcSwitchSyncStateStore(userDataDir),
      resolver,
    )

    await expect(service.applyProvider('codex' as never, null)).resolves.toMatchObject({ success: false })
    expect(resolver).not.toHaveBeenCalled()
  })
})
