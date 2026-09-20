import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { synchronizeInstalledLlmConfig } from '../../src/main/llm/development-config-sync'

const roots: string[] = []

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'janusx-llm-sync-'))
  roots.push(root)
  return root
}

async function writeConfig(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, JSON.stringify(value), 'utf-8')
}

function v2Terminals(entries: Record<string, { providers: Record<string, unknown>; defaultId: string | null }>) {
  const base: Record<string, { providers: Record<string, unknown>; defaultId: string | null }> = {
    janus: { providers: {}, defaultId: null },
    claude: { providers: {}, defaultId: null },
    codex: { providers: {}, defaultId: null },
    opencode: { providers: {}, defaultId: null },
    pi: { providers: {}, defaultId: null },
  }
  return { ...base, ...entries }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('development LLM config sync', () => {
  it('copies the installed provider and default into the development profile', async () => {
    const root = await createRoot()
    const sourcePath = join(root, 'janusx', 'janusx', 'llm-config.json')
    const destinationPath = join(root, 'JanusX-Dev', 'janusx', 'llm-config.json')
    await writeConfig(sourcePath, {
      version: '2.0.0',
      terminals: v2Terminals({
        janus: {
          providers: { installed: { id: 'installed', name: 'Installed', authType: 'api-key', apiKey: 'secret-value' } },
          defaultId: 'installed',
        },
      }),
    })

    expect(synchronizeInstalledLlmConfig(root)).toMatchObject({
      state: 'synchronized', importedProviderCount: 1, sourceProfile: 'installed',
    })
    const synced = JSON.parse(await readFile(destinationPath, 'utf-8'))
    expect(synced.terminals.janus.defaultId).toBe('installed')
    expect(synced.terminals.janus.providers.installed.apiKey).toBe('secret-value')
  })

  it('preserves development-only providers and does not overwrite later edits for an unchanged source', async () => {
    const root = await createRoot()
    const sourcePath = join(root, 'janusx', 'janusx', 'llm-config.json')
    const destinationPath = join(root, 'JanusX-Dev', 'janusx', 'llm-config.json')
    await writeConfig(sourcePath, {
      version: '2.0.0',
      terminals: v2Terminals({
        janus: {
          providers: { shared: { id: 'shared', name: 'Installed', authType: 'api-key' } },
          defaultId: 'shared',
        },
      }),
    })
    await writeConfig(destinationPath, {
      version: '2.0.0',
      terminals: v2Terminals({
        janus: {
          providers: { local: { id: 'local', name: 'Local', authType: 'api-key' } },
          defaultId: 'local',
        },
      }),
    })

    synchronizeInstalledLlmConfig(root)
    const merged = JSON.parse(await readFile(destinationPath, 'utf-8'))
    expect(Object.keys(merged.terminals.janus.providers)).toEqual(['local', 'shared'])
    merged.terminals.janus.providers.shared.name = 'Development edit'
    await writeFile(destinationPath, JSON.stringify(merged), 'utf-8')

    expect(synchronizeInstalledLlmConfig(root).state).toBe('unchanged')
    expect(JSON.parse(await readFile(destinationPath, 'utf-8')).terminals.janus.providers.shared.name).toBe('Development edit')
  })

  it('migrates a v1 installed file into per-terminal collections', async () => {
    const root = await createRoot()
    const sourcePath = join(root, 'janusx', 'janusx', 'llm-config.json')
    const destinationPath = join(root, 'JanusX-Dev', 'janusx', 'llm-config.json')
    await writeConfig(sourcePath, {
      version: '1.0.0',
      providers: { installed: { id: 'installed', name: 'Installed', authType: 'api-key', apiKey: 'secret-value' } },
      defaultProvider: 'installed',
    })

    expect(synchronizeInstalledLlmConfig(root)).toMatchObject({ state: 'synchronized', sourceProfile: 'installed' })
    const synced = JSON.parse(await readFile(destinationPath, 'utf-8'))
    expect(synced.terminals.janus.defaultId).toBe('installed')
    expect(synced.terminals.claude.providers.installed.apiKey).toBe('secret-value')
    expect(synced.providers).toBeUndefined()
  })

  it('reports a missing source without creating a development config', async () => {
    const root = await createRoot()
    expect(synchronizeInstalledLlmConfig(root)).toEqual({ state: 'source-missing', importedProviderCount: 0 })
  })
})
