import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
const { LlmConfigStore } = await import('../../../src/main/llm/ConfigStore')
const { normalizeLlmConfigDocument } = await import('../../../src/main/llm/config-document')
const { AuthType } = await import('@janusx/llm-core')
let root: string
let store: InstanceType<typeof LlmConfigStore>
const provider = (id = 'relay', modelId = 'model-a') => ({
  id, name: id, authType: AuthType.API_KEY, apiKey: 'sk-test-1234567890', baseURL: 'https://relay.example/v1', modelId,
})
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'janus-shared-')); store = new LlmConfigStore(root) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('shared channels and independent Agent selections', () => {
  it('saves once without selecting any Agent, and resolves a model independently', async () => {
    await store.saveProvider(provider())
    for (const consumer of ['janus', 'claude', 'codex', 'opencode', 'pi'] as const) {
      expect(await store.getTerminalProviders(consumer)).toHaveLength(1)
      expect(await store.getTerminalDefaultSettings(consumer)).toBeNull()
    }
    await store.setBinding('janus', { mode: 'provider', providerId: 'relay', modelId: 'model-a' })
    await store.setBinding('pi', { mode: 'provider', providerId: 'relay', modelId: 'model-b' })
    await store.saveProvider({ ...provider(), apiKey: 'new-shared-key' })
    expect(await store.getTerminalDefaultSettings('janus')).toMatchObject({ modelId: 'model-a', apiKey: 'new-shared-key' })
    expect(await store.getTerminalDefaultSettings('pi')).toMatchObject({ modelId: 'model-b', apiKey: 'new-shared-key' })
    expect(await store.getTerminalProvider('pi', 'relay')).toMatchObject({ modelId: 'model-b' })
    expect((await store.get()).providers.relay?.modelId).toBe('model-a')
  })
  it('does not delete a referenced channel or silently fall back', async () => {
    await store.saveProvider(provider())
    await store.setBinding('pi', { mode: 'provider', providerId: 'relay' })
    await expect(store.removeTerminalProvider('janus', 'relay')).rejects.toThrow('pi')
    await store.setBinding('pi', { mode: 'native' })
    await store.removeTerminalProvider('janus', 'relay')
    expect((await store.get()).providers).toEqual({})
  })
  it('preserves concurrent saves and returns isolated snapshots', async () => {
    await Promise.all([store.saveProvider(provider('a')), store.saveProvider(provider('b'))])
    const snapshot = await store.get()
    delete snapshot.providers.a
    expect(Object.keys((await store.get()).providers)).toEqual(['a', 'b'])
  })
  it('rejects unknown Agents and missing channels', async () => {
    await expect(store.getTerminalProviders('shell' as never)).rejects.toThrow()
    await expect(store.setTerminalDefault('janus', 'missing')).rejects.toThrow()
    await expect(store.setBinding('janus', { mode: 'native' })).rejects.toThrow()
  })
  it('migrates v1 without folding one Agent model into the shared channel', () => {
    const result = normalizeLlmConfigDocument({ version: '1.0.0', providers: { relay: provider() }, defaultProvider: 'relay',
      terminalBindings: { claude: { providerId: 'relay', modelId: 'claude-model' } } })!
    expect(result.config.providers.relay?.modelId).toBe('model-a')
    expect(result.config.bindings.claude).toMatchObject({ providerId: 'relay', modelId: 'claude-model' })
    expect(result.config.bindings.janus).toMatchObject({ providerId: 'relay', modelId: 'model-a' })
  })
  it('deduplicates v2 copies with distinct model selections and preserves conflicting connections', async () => {
    const old = { version: '2.0.0', terminals: {
      janus: { providers: { relay: provider() }, defaultId: 'relay' },
      pi: { providers: { relay: provider('relay', 'model-b') }, defaultId: 'relay' },
      claude: { providers: { relay: { ...provider(), baseURL: 'https://different.example' } }, defaultId: 'relay' },
    } }
    await mkdir(join(root, 'janusx'), { recursive: true })
    await writeFile(join(root, 'janusx', 'llm-config.json'), JSON.stringify(old))
    const config = await store.load()
    expect(Object.keys(config.providers)).toEqual(['relay', 'relay--claude'])
    expect(config.bindings.pi).toMatchObject({ providerId: 'relay', modelId: 'model-b' })
    expect(config.bindings.claude.providerId).toBe('relay--claude')
    expect(config.providers.relay?.models).toEqual(['model-a', 'model-b'])
    expect(JSON.parse(await readFile(join(root, 'janusx', 'llm-config.json'), 'utf8')).version).toBe('3.0.0')
    expect(normalizeLlmConfigDocument(config)?.migrated).toBe(false)
  })
  it('keeps different channel IDs even when both serve the same model', async () => {
    await store.saveProvider(provider('official'))
    await store.saveProvider(provider('cpa'))
    expect(await store.getTerminalProviders('janus')).toHaveLength(2)
  })
  it('backs up corrupt documents before resetting', async () => {
    await mkdir(join(root, 'janusx'), { recursive: true })
    await writeFile(join(root, 'janusx', 'llm-config.json'), '{broken')
    await store.load()
    expect((await readdir(join(root, 'janusx'))).some(name => name.startsWith('llm-config.json.corrupt-'))).toBe(true)
    expect((await store.get()).providers).toEqual({})
  })
})
