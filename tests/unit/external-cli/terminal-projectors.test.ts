import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const homeDir = await mkdtemp(join(tmpdir(), 'janusx-term-proj-home-'))
const userDataDir = await mkdtemp(join(tmpdir(), 'janusx-term-proj-data-'))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => userDataDir) },
}))

const {
  TerminalProjectors,
  readTomlTopLevelModel,
  writeTomlTopLevelModel,
  findJsoncTopLevelKey,
  writeJsoncTopLevelModel,
} = await import('../../../src/main/external-cli/terminal-projectors')
const { DefaultExternalCliService } = await import('../../../src/main/external-cli/service')
const { ClaudeSettingsApplier } = await import('../../../src/main/external-cli/settings-applier')
const { ExternalCliSyncStateStore } = await import('../../../src/main/external-cli/sync-state')
const { llmConfigStore } = await import('../../../src/main/llm/ConfigStore')
const { AuthType } = await import('@janusx/llm-core')

function projectors() {
  return new TerminalProjectors(homeDir)
}

async function freshHome() {
  return mkdtemp(join(tmpdir(), 'janusx-term-proj-case-'))
}

beforeEach(async () => {
  for (const consumer of ['janus', 'claude', 'codex', 'opencode', 'pi'] as const) {
    const existing = await llmConfigStore.getTerminalProviders(consumer)
    for (const provider of existing) {
      await llmConfigStore.removeTerminalProvider(consumer, provider.id)
    }
  }
})

describe('TOML top-level model editing', () => {
  it('replaces the top-level model while preserving comments, keys, and tables', () => {
    const text = '# Codex config\nmodel = "gpt-5"\nmodel_context_window = 128000\n\n[model_providers.openai]\nwire_api = "chat"\n'
    const next = writeTomlTopLevelModel(text, 'gpt-5.1')
    expect(next).toContain('model = "gpt-5.1"')
    expect(next).toContain('# Codex config')
    expect(next).toContain('model_context_window = 128000')
    expect(next).toContain('[model_providers.openai]')
    expect(readTomlTopLevelModel(next)).toBe('gpt-5.1')
  })

  it('inserts before the first table header when no top-level model exists', () => {
    const text = '# header\n[model_providers.openai]\nwire_api = "chat"\n'
    const next = writeTomlTopLevelModel(text, 'gpt-5')
    expect(next.indexOf('model = "gpt-5"')).toBeLessThan(next.indexOf('[model_providers.openai]'))
    expect(readTomlTopLevelModel(next)).toBe('gpt-5')
  })

  it('ignores table-level model keys on read', () => {
    const text = '[profile]\nmodel = "nested"\n'
    expect(readTomlTopLevelModel(text)).toBeUndefined()
  })
})

describe('JSONC top-level model editing', () => {
  it('finds only the depth-1 key, not nested provider model ids', () => {
    const text = '{\n  // active model\n  "model": "a",\n  "provider": { "openai": { "models": { "model": {} } } }\n}\n'
    const hit = findJsoncTopLevelKey(text, 'model')
    expect(hit).not.toBeNull()
    const next = writeJsoncTopLevelModel(text, 'model', 'b')
    expect(next).toContain('"model": "b"')
    expect(next).toContain('// active model')
    expect(next).toContain('{ "model": {} }')
  })

  it('inserts with or without a trailing comma', () => {
    for (const text of ['{\n  "a": 1\n}\n', '{\n  "a": 1,\n}\n', '{}\n']) {
      const next = writeJsoncTopLevelModel(text, 'model', 'm')
      expect(next).toContain('"model": "m"')
      expect(JSON.parse(next.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))).toMatchObject({ model: 'm' })
    }
  })

  it('refuses a non-object document', () => {
    expect(() => writeJsoncTopLevelModel('[1, 2]\n', 'model', 'm')).toThrow()
  })

  it('reads past trailing commas without touching strings that look like one', async () => {
    const home = await freshHome()
    const projector = new TerminalProjectors(home)
    const dir = join(home, '.config', 'opencode')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'opencode.json'), '{\n  "model": "a,}",\n  "note": "x",\n}\n', 'utf8')
    await expect(projector.read('opencode')).resolves.toMatchObject({ model: 'a,}' })
  })
})

describe('TerminalProjectors file round-trips', () => {
  it('merges the opencode model while preserving the provider block', async () => {
    const home = await freshHome()
    const projector = new TerminalProjectors(home)
    const dir = join(home, '.config', 'opencode')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'opencode.json'), JSON.stringify({ model: 'old', provider: { openai: { models: { 'gpt-4o': {} } } } }, null, 2), 'utf8')

    const result = await projector.apply('opencode', 'new-model')
    expect(result.success).toBe(true)
    const live = JSON.parse(await readFile(join(dir, 'opencode.json'), 'utf8'))
    expect(live).toMatchObject({ model: 'new-model', provider: { openai: { models: { 'gpt-4o': {} } } } })
  })

  it('edits an opencode jsonc in place without dropping comments', async () => {
    const home = await freshHome()
    const projector = new TerminalProjectors(home)
    const dir = join(home, '.config', 'opencode')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'opencode.jsonc'), '// managed by hand\n{\n  "model": "old",\n}\n', 'utf8')

    const state = await projector.read('opencode')
    expect(state.model).toBe('old')
    await projector.apply('opencode', 'new-model')
    const raw = await readFile(join(dir, 'opencode.jsonc'), 'utf8')
    expect(raw).toContain('// managed by hand')
    expect(raw).toContain('"model": "new-model"')
  })

  it('merges the pi defaultModel while preserving sibling keys', async () => {
    const home = await freshHome()
    const projector = new TerminalProjectors(home)
    const dir = join(home, '.pi', 'agent')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'settings.json'), JSON.stringify({ defaultProvider: 'openai', defaultModel: 'old', sessionDir: '/tmp/s' }, null, 2), 'utf8')

    await projector.apply('pi', 'owner/new')
    const live = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'))
    expect(live).toMatchObject({ defaultProvider: 'openai', defaultModel: 'owner/new', sessionDir: '/tmp/s' })
  })

  it('creates a missing codex config and reports it as absent before', async () => {
    const projector = new TerminalProjectors(await freshHome())
    const before = await projector.read('codex')
    expect(before.exists).toBe(false)
    await projector.apply('codex', 'gpt-5')
    const after = await projector.read('codex')
    expect(after).toMatchObject({ exists: true, model: 'gpt-5' })
  })

  it('rejects empty models', async () => {
    await expect(projectors().apply('pi', '   ')).rejects.toThrow()
  })

  it('rotates backups to ten and rolls back to the previous content', async () => {
    const home = await freshHome()
    const dir = join(home, '.codex')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'config.toml'), 'model = "v0"\n', 'utf8')
    const projector = new TerminalProjectors(home)
    for (let index = 1; index <= 12; index += 1) {
      await projector.apply('codex', `v${index}`)
    }
    const backups = (await readdir(dir)).filter((name) => name.startsWith('config.toml.janusx-bak-'))
    expect(backups).toHaveLength(10)
    await projector.rollback('codex')
    expect(await readFile(join(dir, 'config.toml'), 'utf8')).toContain('model = "v11"')
  })

  it('refuses rollback without a backup', async () => {
    await expect(new TerminalProjectors(await mkdtemp(join(tmpdir(), 'janusx-term-proj-empty-'))).rollback('pi')).rejects.toThrow()
  })
})

describe('ExternalCliService terminal model channels', () => {
  function service() {
    return new DefaultExternalCliService(
      {},
      new ClaudeSettingsApplier(homeDir),
      new ExternalCliSyncStateStore(userDataDir),
      async () => null,
      undefined,
      new TerminalProjectors(homeDir),
    )
  }

  it('rejects janus and claude on the model-only channels', async () => {
    const instance = service()
    await expect(instance.readTerminalModel('janus')).resolves.toMatchObject({ exists: false })
    expect((await instance.readTerminalModel('janus')).error).toMatch(/internal/i)
    await expect(instance.applyTerminalModel({ toolId: 'claude', model: 'm' })).resolves.toMatchObject({ success: false })
    await expect(instance.rollbackTerminal('janus')).resolves.toMatchObject({ success: false })
  })

  it('applies and reads back a pi model through the service', async () => {
    const instance = service()
    await expect(instance.applyTerminalModel({ toolId: 'pi', model: 'owner/m' })).resolves.toMatchObject({ success: true })
    await expect(instance.readTerminalModel('pi')).resolves.toMatchObject({ exists: true, model: 'owner/m' })
  })

  it('syncs credentials from the claude terminal collection only', async () => {
    await llmConfigStore.saveTerminalProvider('claude', {
      id: 'relay-1',
      name: 'Relay',
      authType: AuthType.API_KEY,
      baseURL: 'https://relay.example.com/v1',
      apiKey: 'sk-test-1234567890',
      modelId: 'claude-model',
      enabled: true,
    })
    // 同 id 在 janus 集合里是另一条配置，不影响 Claude 同步
    await llmConfigStore.saveTerminalProvider('janus', {
      id: 'relay-1',
      name: 'Other',
      authType: AuthType.API_KEY,
      baseURL: 'https://other.example.com/v1',
      apiKey: 'sk-other-1234567890',
      modelId: 'other-model',
      enabled: true,
    })
    const instance = new DefaultExternalCliService(
      {},
      new ClaudeSettingsApplier(homeDir),
      new ExternalCliSyncStateStore(userDataDir),
      async (providerId) => {
        const provider = providerId === null
          ? await llmConfigStore.getTerminalDefaultSettings('claude')
          : await llmConfigStore.getTerminalProvider('claude', providerId)
        if (!provider) return null
        return {
          providerId: provider.id,
          providerName: provider.name,
          baseURL: provider.baseURL ?? '',
          authToken: provider.apiKey ?? '',
          model: provider.modelId,
        }
      },
      undefined,
      new TerminalProjectors(homeDir),
    )
    const result = await instance.applyProvider('claude', 'relay-1')
    expect(result.success).toBe(true)
    const live = JSON.parse(await readFile(join(homeDir, '.claude', 'settings.json'), 'utf8'))
    expect(live.env.ANTHROPIC_BASE_URL).toBe('https://relay.example.com/v1')
    expect(live.env.ANTHROPIC_MODEL).toBe('claude-model')
    expect(live.model).toBe('claude-model')
  })
})

describe('ExternalCliSyncStateStore legacy adoption', () => {
  it('adopts the legacy file once and keeps serving from the new path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'janusx-term-sync-legacy-'))
    const record = {
      providerId: 'p1',
      providerName: 'Relay',
      baseURL: 'https://relay.example.com/v1',
      syncedAt: 1700000000000,
      backupPath: null,
    }
    await writeFile(join(dir, 'cc-switch-sync.json'), JSON.stringify({ version: '1.0.0', claude: record }), 'utf8')
    const store = new ExternalCliSyncStateStore(dir)
    await expect(store.get()).resolves.toEqual({ claude: record })
    const adopted = JSON.parse(await readFile(join(dir, 'external-cli-sync.json'), 'utf8'))
    expect(adopted.claude).toMatchObject({ providerId: 'p1' })
  })
})
