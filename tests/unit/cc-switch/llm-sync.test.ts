import { mkdtemp, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => join(tmpdir(), 'janusx-test-user-data')) },
}))

const { ClaudeSettingsApplier } = await import('../../../src/main/cc-switch/settings-applier')
const { ClaudeDetector } = await import('../../../src/main/cc-switch/claude-detector')
const { DefaultCcSwitchService } = await import('../../../src/main/cc-switch/service')

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

function createService(homeDir: string, credentials: { providerName: string; baseURL: string; authToken: string; model?: string } | null) {
  const detector = new ClaudeDetector({
    env: {},
    platform: 'linux',
    homeDir,
    isRegularFile: async () => false,
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
  })
  return new DefaultCcSwitchService(detector, new ClaudeSettingsApplier(homeDir), async () => credentials)
}

describe('CcSwitchService LLM sync', () => {
  it('applies the default LLM credentials to the live file', async () => {
    const homeDir = await createTempDir('janusx-cc-llm-home-')
    const service = createService(homeDir, {
      providerName: 'Relay',
      baseURL: 'https://relay.example.com/v1',
      authToken: 'sk-test',
      model: 'm',
    })

    const result = await service.applyLlm('claude')
    expect(result).toMatchObject({ success: true, providerName: 'Relay' })

    const live = JSON.parse(await readFile(join(homeDir, '.claude', 'settings.json'), 'utf8'))
    expect(live.env.ANTHROPIC_BASE_URL).toBe('https://relay.example.com/v1')
    expect(live.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test')
  })

  it('reports NO_LLM_PROVIDER when no usable default provider exists', async () => {
    const homeDir = await createTempDir('janusx-cc-llm-none-')
    const service = createService(homeDir, null)

    await expect(service.applyLlm('claude')).resolves.toEqual({ success: false, error: 'NO_LLM_PROVIDER' })
  })

  it('rejects unsupported tools without touching resolvers', async () => {
    const homeDir = await createTempDir('janusx-cc-llm-tool-')
    const resolver = vi.fn(async () => null)
    const detector = new ClaudeDetector({
      env: {},
      platform: 'linux',
      homeDir,
      isRegularFile: async () => false,
      run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
    })
    const service = new DefaultCcSwitchService(detector, new ClaudeSettingsApplier(homeDir), resolver)

    await expect(service.applyLlm('codex' as never)).resolves.toMatchObject({ success: false })
    expect(resolver).not.toHaveBeenCalled()
  })
})
