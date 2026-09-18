import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const userDataDir = await mkdtemp(join(tmpdir(), 'janusx-llm-collections-'))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => userDataDir) },
}))

const { llmConfigStore, LlmConfigStore } = await import('../../../src/main/llm/ConfigStore')
const { AuthType } = await import('@janusx/llm-core')

const CONSUMERS = ['janus', 'claude', 'codex', 'opencode', 'pi'] as const

function provider(id: string, name: string, modelId = 'm') {
  return {
    id,
    name,
    authType: AuthType.API_KEY,
    baseURL: 'https://relay.example.com/v1',
    apiKey: 'sk-test-1234567890',
    modelId,
    enabled: true,
  }
}

beforeEach(async () => {
  for (const consumer of CONSUMERS) {
    const existing = await llmConfigStore.getTerminalProviders(consumer)
    for (const entry of existing) {
      await llmConfigStore.removeTerminalProvider(consumer, entry.id)
    }
  }
})

describe('LlmConfigStore per-terminal collections', () => {
  it('starts empty in every terminal', async () => {
    for (const consumer of CONSUMERS) {
      await expect(llmConfigStore.getTerminalProviders(consumer)).resolves.toEqual([])
      await expect(llmConfigStore.getTerminalDefaultSettings(consumer)).resolves.toBeNull()
    }
  })

  it('keeps same-id providers independent across terminals', async () => {
    await llmConfigStore.saveTerminalProvider('janus', provider('shared', 'Janus Relay', 'janus-model'))
    await llmConfigStore.saveTerminalProvider('claude', provider('shared', 'Claude Relay', 'claude-model'))

    const janus = await llmConfigStore.getTerminalProvider('janus', 'shared')
    const claude = await llmConfigStore.getTerminalProvider('claude', 'shared')
    expect(janus?.name).toBe('Janus Relay')
    expect(claude?.name).toBe('Claude Relay')

    await llmConfigStore.removeTerminalProvider('janus', 'shared')
    await expect(llmConfigStore.getTerminalProvider('janus', 'shared')).resolves.toBeNull()
    await expect(llmConfigStore.getTerminalProvider('claude', 'shared')).resolves.toMatchObject({ name: 'Claude Relay' })
  })

  it('defaults the first saved provider and falls back on removal', async () => {
    await llmConfigStore.saveTerminalProvider('codex', provider('a', 'A'))
    await llmConfigStore.saveTerminalProvider('codex', provider('b', 'B'))
    await expect(llmConfigStore.getTerminalDefaultSettings('codex')).resolves.toMatchObject({ id: 'a' })

    await llmConfigStore.setTerminalDefault('codex', 'b')
    await expect(llmConfigStore.getTerminalDefaultSettings('codex')).resolves.toMatchObject({ id: 'b' })

    await llmConfigStore.removeTerminalProvider('codex', 'b')
    await expect(llmConfigStore.getTerminalDefaultSettings('codex')).resolves.toMatchObject({ id: 'a' })
  })

  it('rejects unknown consumers', async () => {
    await expect(llmConfigStore.getTerminalProviders('shell' as never)).rejects.toThrow()
    await expect(llmConfigStore.saveTerminalProvider('shell' as never, provider('x', 'X'))).rejects.toThrow()
  })

  it('migrates a v1 shared pool into every terminal with binding defaults and folded overrides', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'janusx-llm-migrate-'))
    await mkdir(join(scratch, 'janusx'), { recursive: true })
    await writeFile(join(scratch, 'janusx', 'llm-config.json'), JSON.stringify({
      version: '1.0.0',
      providers: {
        relay: provider('relay', 'Relay', 'provider-model'),
        other: provider('other', 'Other', 'other-model'),
      },
      defaultProvider: 'other',
      terminalBindings: {
        claude: { providerId: 'relay', modelId: 'override-model' },
        codex: { providerId: 'missing', modelId: '' },
      },
    }), 'utf8')

    const store = new LlmConfigStore(scratch)
    await store.load()

    // janus 沿用全局默认；claude 沿用绑定并折入模型覆盖；指向缺失 id 的绑定退回全局默认
    await expect(store.getTerminalDefaultSettings('janus')).resolves.toMatchObject({ id: 'other' })
    const claudeDefault = await store.getTerminalDefaultSettings('claude')
    expect(claudeDefault).toMatchObject({ id: 'relay', modelId: 'override-model' })
    await expect(store.getTerminalDefaultSettings('codex')).resolves.toMatchObject({ id: 'other' })
    await expect(store.getTerminalProvider('pi', 'other')).resolves.toMatchObject({ name: 'Other' })

    // 落盘已是 v2 形态
    const rewritten = JSON.parse(await readFile(join(scratch, 'janusx', 'llm-config.json'), 'utf8'))
    expect(Object.keys(rewritten.terminals)).toEqual(['janus', 'claude', 'codex', 'opencode', 'pi'])
    expect(rewritten.providers).toBeUndefined()
    expect(rewritten.terminalBindings).toBeUndefined()
  })

  it('backs up a corrupt document instead of overwriting it', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'janusx-llm-corrupt-'))
    await mkdir(join(scratch, 'janusx'), { recursive: true })
    await writeFile(join(scratch, 'janusx', 'llm-config.json'), '{broken json', 'utf8')

    const store = new LlmConfigStore(scratch)
    await store.load()

    const entries = await readdir(join(scratch, 'janusx'))
    expect(entries.some((name) => name.startsWith('llm-config.json.corrupt-'))).toBe(true)
    expect(await readFile(join(scratch, 'janusx', 'llm-config.json'), 'utf8')).not.toContain('{broken json')
    await expect(store.getTerminalDefaultSettings('janus')).resolves.toBeNull()
  })
})
