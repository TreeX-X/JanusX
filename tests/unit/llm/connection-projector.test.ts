import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse as parseToml } from 'smol-toml'
import { parse as parseJsonc } from 'jsonc-parser'
import { AuthType } from '@janusx/llm-core'
import { ConnectionProjector } from '../../../src/main/llm/connection-projector'
let root: string
let projector: ConnectionProjector
const provider = { id: 'relay', name: 'My channel', authType: AuthType.API_KEY, baseURL: 'https://api.example/v1', apiKey: 'literal-key', models: ['model-a', 'model-b'] }
const commit = async () => {}
async function put(path: string, text: string) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, text) }
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'janus-connections-')); projector = new ConnectionProjector(join(root, 'state'), root, {}) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('Agent connection projection', () => {
  it('writes a real Codex Responses connection, preserves other tables, and restores native selection', async () => {
    const path = join(root, '.codex', 'config.toml')
    await put(path, '# user settings\nmodel = "native-model"\nmodel_provider = "openai"\n[features]\nweb_search = true\n')
    const p = { ...provider, extra: { protocol: 'responses' } }
    await projector.apply('codex', p, 'model-b', commit)
    const raw = await readFile(path, 'utf8')
    const data = parseToml(raw) as any
    expect(data).toMatchObject({ model: 'model-b', model_provider: 'janusx_managed', features: { web_search: true } })
    expect(data.model_providers.janusx_managed).toMatchObject({ base_url: provider.baseURL, experimental_bearer_token: provider.apiKey, wire_api: 'responses', requires_openai_auth: false })
    expect(raw).toContain('# user settings')
    expect(await projector.isCurrent('codex')).toBe(true)
    await projector.apply('codex', { ...p, apiKey: 'updated-key' }, 'model-a', commit)
    await projector.apply('codex', null, '', commit)
    const restored = parseToml(await readFile(path, 'utf8')) as any
    expect(restored).toMatchObject({ model: 'native-model', model_provider: 'openai' })
    expect(restored.model_providers).toBeUndefined()
  })
  it('merges OpenCode JSONC while preserving comments and unrelated providers', async () => {
    const path = join(root, '.config', 'opencode', 'opencode.jsonc')
    await put(path, '{\n // retain me\n "theme": "system", "provider": { "custom": {"name":"user"} },\n}')
    await projector.apply('opencode', provider, 'model-a', commit)
    const raw = await readFile(path, 'utf8')
    expect(raw).toContain('// retain me')
    expect(parseJsonc(raw)).toMatchObject({ model: 'janusx_managed/model-a', provider: { custom: { name: 'user' }, janusx_managed: { options: { apiKey: 'literal-key' }, models: { 'model-a': {}, 'model-b': {} } } } })
    await projector.apply('opencode', null, '', commit)
    expect(parseJsonc(await readFile(path, 'utf8')).provider).toEqual({ custom: { name: 'user' } })
  })
  it('writes both Pi model definitions and provider/model selection', async () => {
    await projector.apply('pi', provider, 'model-b', commit)
    const settings = JSON.parse(await readFile(join(root, '.pi', 'agent', 'settings.json'), 'utf8'))
    const models = JSON.parse(await readFile(join(root, '.pi', 'agent', 'models.json'), 'utf8'))
    expect(settings).toMatchObject({ defaultProvider: 'janusx_managed', defaultModel: 'model-b' })
    expect(models.providers.janusx_managed).toMatchObject({ baseUrl: provider.baseURL, api: 'openai-completions', models: [{ id: 'model-a' }, { id: 'model-b' }] })
  })
  it('uses Anthropic credentials and restores the previous auth fields', async () => {
    const path = join(root, '.claude', 'settings.json')
    await put(path, '{ "env": { "ANTHROPIC_AUTH_TOKEN": "previous", "OTHER": "keep" }, "permissions": {"allow":["Read"]} }')
    await projector.apply('claude', { ...provider, authType: AuthType.ANTHROPIC }, 'claude-model', commit)
    let value = JSON.parse(await readFile(path, 'utf8'))
    expect(value.env.ANTHROPIC_API_KEY).toBe(provider.apiKey)
    expect(value.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    await projector.apply('claude', null, '', commit)
    value = JSON.parse(await readFile(path, 'utf8'))
    expect(value.env).toEqual({ ANTHROPIC_AUTH_TOKEN: 'previous', OTHER: 'keep' })
    expect(value.permissions).toEqual({ allow: ['Read'] })
  })
  it('rolls back every Pi file if persisting the binding fails', async () => {
    const path = join(root, '.pi', 'agent', 'settings.json')
    const original = '{ "theme": "dark", "defaultModel": "old" }'
    await put(path, original)
    await expect(projector.apply('pi', provider, 'model-a', async () => { throw new Error('disk failure') })).rejects.toThrow('disk failure')
    expect(await readFile(path, 'utf8')).toBe(original)
    await expect(readFile(join(root, '.pi', 'agent', 'models.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('refuses destructive restoration when managed fields changed externally', async () => {
    const path = join(root, '.pi', 'agent', 'settings.json')
    await projector.apply('pi', provider, 'model-a', commit)
    const original = JSON.parse(await readFile(path, 'utf8'))
    await put(path, JSON.stringify({ ...original, defaultModel: 'manual-change' }))
    expect(await projector.isCurrent('pi')).toBe(false)
    const save = vi.fn()
    await expect(projector.apply('pi', null, '', save)).rejects.toThrow('outside JanusX')
    expect(save).not.toHaveBeenCalled()
    expect(JSON.parse(await readFile(path, 'utf8')).defaultModel).toBe('manual-change')
  })
  it('refuses malformed files, existing reserved namespaces, and executable Pi key expressions', async () => {
    await put(join(root, '.codex', 'config.toml'), '[broken')
    await expect(projector.apply('codex', provider, 'model-a', commit)).rejects.toThrow()
    await put(join(root, '.pi', 'agent', 'models.json'), '{"providers":{"janusx_managed":{"apiKey":"existing"}}}')
    await expect(projector.apply('pi', provider, 'model-a', commit)).rejects.toThrow('already in use')
    await expect(projector.apply('pi', { ...provider, apiKey: '!echo secret' }, 'model-a', commit)).rejects.toThrow('literal')
  })
  it('keeps native settings intact if no JanusX connection was applied', async () => {
    const path = join(root, '.codex', 'config.toml')
    await put(path, '# original\nmodel = "native"\n')
    await projector.apply('codex', null, '', commit)
    expect(await readFile(path, 'utf8')).toBe('# original\nmodel = "native"\n')
  })
})
