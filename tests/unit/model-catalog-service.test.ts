import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiModelRegistryDocument } from '@janusx/llm-core'
import { ModelCatalogService } from '../../src/main/llm/ModelCatalogService'

const temporaryDirectories: string[] = []
const NOW = Date.parse('2026-07-10T08:00:00.000Z')

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('ModelCatalogService', () => {
  it('uses an updated window on the next resolution of an existing stale model', async () => {
    const cachePath = await createCachePath()
    const bundled = documentAt('2026-07-01T00:00:00.000Z', 'vendor/model')
    bundled.models[0].effectiveContextWindow = 16_384
    let resolveFetch!: (value: unknown) => void
    const fetchModels = vi.fn(() => new Promise(resolve => { resolveFetch = resolve }))
    const service = new ModelCatalogService({ cachePath, bundledDocument: bundled, fetchModels, now: () => NOW })
    expect(await service.resolveModel('vendor/model')).toMatchObject({ effectiveContextWindow: 16_384 })
    await vi.waitFor(() => expect(fetchModels).toHaveBeenCalledOnce())
    resolveFetch({ data: [{ id: 'vendor/model', name: 'Vendor Model', context_length: 1_048_576 }] })
    await service.refresh()
    expect(await service.resolveModel('vendor/model')).toMatchObject({ effectiveContextWindow: 1_048_576 })
    expect(fetchModels).toHaveBeenCalledOnce()
  })

  it('waits for a missing Gemini model before returning its automatic limits, then reuses the cache', async () => {
    const cachePath = await createCachePath()
    let resolveFetch!: (value: unknown) => void
    const fetchModels = vi.fn(() => new Promise(resolve => { resolveFetch = resolve }))
    const options = { cachePath, bundledDocument: documentAt('2026-07-10T07:30:00.000Z', 'bundled/model'), now: () => NOW }
    const service = new ModelCatalogService({ ...options, fetchModels })
    let resolved = false
    const first = service.resolveModel('gemini-3.8-flash').then(value => { resolved = true; return value })
    const second = service.resolveModel('google/gemini-3.8-flash')
    await vi.waitFor(() => expect(fetchModels).toHaveBeenCalledOnce())
    expect(resolved).toBe(false)
    resolveFetch({ data: [{ id: 'google/gemini-3.8-flash', name: 'Google: Gemini 3.8 Flash', context_length: 1_048_576,
      top_provider: { context_length: 1_048_576, max_completion_tokens: 65_536 } }] })
    for (const model of await Promise.all([first, second])) expect(model).toMatchObject({ effectiveContextWindow: 1_048_576, maxOutputTokens: 65_536 })
    await service.resolveModel('gemini-3.8-flash')
    expect(fetchModels).toHaveBeenCalledOnce()
    const offline = vi.fn(async () => { throw new Error('offline') })
    const restarted = new ModelCatalogService({ ...options, fetchModels: offline })
    expect(await restarted.resolveModel('gemini-3.8-flash')).toMatchObject({ effectiveContextWindow: 1_048_576 })
    expect(offline).not.toHaveBeenCalled()
  })

  it('does not assign a nearby model window or repeatedly fetch unknown models after a failed refresh', async () => {
    let time = NOW
    const fetchModels = vi.fn(async () => { throw new Error('offline') })
    const service = new ModelCatalogService({ cachePath: await createCachePath(),
      bundledDocument: documentAt('2026-07-01T00:00:00.000Z', 'bundled/model'), now: () => time, fetchModels })
    expect(await service.resolveModel('gemini-3.8-flash')).toBeUndefined()
    expect(await service.resolveModel('unknown/model')).toBeUndefined()
    await service.getCatalog()
    expect(fetchModels).toHaveBeenCalledOnce()
    time += 60_001
    expect(await service.resolveModel('gemini-3.8-flash')).toBeUndefined()
    expect(fetchModels).toHaveBeenCalledTimes(2)
  })

  it('returns bundled data immediately while a stale refresh runs', async () => {
    const cachePath = await createCachePath()
    let resolveFetch!: (value: unknown) => void
    const fetchModels = vi.fn(() => new Promise<unknown>((resolve) => { resolveFetch = resolve }))
    const service = new ModelCatalogService({
      cachePath,
      bundledDocument: documentAt('2026-07-01T00:00:00.000Z', 'bundled/model'),
      fetchModels,
      now: () => NOW,
    })

    const initial = await service.getCatalog()
    expect(initial.source).toBe('bundled')
    expect(initial.models[0].id).toBe('bundled/model')
    expect(fetchModels).toHaveBeenCalledOnce()

    resolveFetch({ data: [openRouterRecord('vendor/new-model')] })
    const refreshed = await service.refresh()
    expect(refreshed.success).toBe(true)
    expect(refreshed.catalog.models[0].id).toBe('vendor/new-model')
  })

  it('loads a valid fresh cache instead of refreshing', async () => {
    const cachePath = await createCachePath()
    await writeFile(cachePath, JSON.stringify(documentAt('2026-07-10T07:30:00.000Z', 'cached/model')))
    const fetchModels = vi.fn()
    const service = new ModelCatalogService({
      cachePath,
      bundledDocument: documentAt('2026-07-01T00:00:00.000Z', 'bundled/model'),
      fetchModels,
      now: () => NOW,
    })

    const catalog = await service.getCatalog()
    expect(catalog.source).toBe('cache')
    expect(catalog.models[0].id).toBe('cached/model')
    expect(fetchModels).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'malformed renderer-used optional cache fields',
      updatedAt: '2026-07-10T07:30:00.000Z',
      mutate: (doc: AiModelRegistryDocument) => {
        doc.models[0].supportedParameters = ['tools', 42] as unknown as string[]
      },
    },
    {
      name: 'blank price strings',
      updatedAt: '2026-07-10T07:30:00.000Z',
      mutate: (doc: AiModelRegistryDocument) => {
        doc.models[0].promptPricePerToken = ' '
        doc.models[0].completionPricePerToken = ''
      },
    },
    {
      name: 'future-dated cache snapshots',
      updatedAt: '2026-07-10T08:00:01.000Z',
      mutate: () => undefined,
    },
  ])('ignores $name and falls back to the bundled catalog', async ({ updatedAt, mutate }) => {
    const cachePath = await createCachePath()
    const malformed = documentAt(updatedAt, 'cached/model')
    mutate(malformed)
    await writeFile(cachePath, JSON.stringify(malformed))
    const fetchModels = vi.fn()
    const service = new ModelCatalogService({
      cachePath,
      bundledDocument: documentAt('2026-07-10T07:30:00.000Z', 'bundled/model'),
      fetchModels,
      now: () => NOW,
    })

    const catalog = await service.getCatalog()
    expect(catalog.source).toBe('bundled')
    expect(catalog.models[0].id).toBe('bundled/model')
    expect(fetchModels).not.toHaveBeenCalled()
  })

  it('shares a single stale automatic refresh across concurrent fast reads', async () => {
    const cachePath = await createCachePath()
    const fetchModels = vi.fn(async () => ({ data: [openRouterRecord('vendor/new-model')] }))
    const service = new ModelCatalogService({
      cachePath,
      bundledDocument: documentAt('2026-07-01T00:00:00.000Z', 'bundled/model'),
      fetchModels,
      now: () => NOW,
    })

    const [first, second] = await Promise.all([service.getCatalog(), service.getCatalog()])
    await vi.waitFor(() => expect(fetchModels).toHaveBeenCalledOnce())
    expect(first.models[0].id).toBe('bundled/model')
    expect(second.models[0].id).toBe('bundled/model')
    await service.refresh()
  })

  it('preserves the last valid catalog when refresh fails', async () => {
    const cachePath = await createCachePath()
    const service = new ModelCatalogService({
      cachePath,
      bundledDocument: documentAt('2026-07-10T07:30:00.000Z', 'bundled/model'),
      fetchModels: async () => { throw new Error('network unavailable') },
      now: () => NOW,
    })

    const result = await service.refresh()
    expect(result.success).toBe(false)
    expect(result.error).toBe('network unavailable')
    expect(result.catalog.models[0].id).toBe('bundled/model')
  })

  it('normalizes and persists successful runtime updates', async () => {
    const cachePath = await createCachePath()
    await writeFile(cachePath, JSON.stringify(documentAt('2026-07-10T07:30:00.000Z', 'cached/model')))
    const service = new ModelCatalogService({
      cachePath,
      bundledDocument: documentAt('2026-07-10T07:30:00.000Z', 'bundled/model'),
      fetchModels: async () => ({ data: [openRouterRecord('acme/model-one')] }),
      now: () => NOW,
    })

    const result = await service.refresh()
    const persisted = JSON.parse(await readFile(cachePath, 'utf8')) as AiModelRegistryDocument
    expect(result.success).toBe(true)
    expect(result.catalog.source).toBe('cache')
    expect(persisted.models[0]).toMatchObject({
      id: 'acme/model-one',
      providerAuthor: 'acme',
      effectiveContextWindow: 32_000,
      maxOutputTokens: 4_096,
    })
  })

  it('filters latest aliases from bundled, cache, and refresh catalogs', async () => {
    const cachePath = await createCachePath()
    const mixedDocument = documentWithModels('2026-07-10T07:30:00.000Z', [
      'anthropic/claude-fable-5',
      '~anthropic/claude-fable-latest',
      'openai/gpt-chat-latest',
    ])
    const mixedBundled = documentWithModels('2026-07-01T00:00:00.000Z', [
      'anthropic/claude-fable-5',
      '~openai/gpt-latest',
      'openai/gpt-chat-latest',
    ])

    const bundledService = new ModelCatalogService({
      cachePath: await createCachePath(),
      bundledDocument: mixedBundled,
      fetchModels: vi.fn(async () => ({ data: [] })),
      now: () => NOW,
      staleMs: Number.POSITIVE_INFINITY,
    })
    const bundled = await bundledService.getCatalog()
    expect(bundled.source).toBe('bundled')
    expect(bundled.models.map((model) => model.id)).toEqual(['anthropic/claude-fable-5'])

    await writeFile(cachePath, JSON.stringify(mixedDocument))
    const service = new ModelCatalogService({
      cachePath,
      bundledDocument: mixedBundled,
      fetchModels: async () => ({
        data: [
          openRouterRecord('anthropic/claude-fable-5'),
          openRouterRecord('~anthropic/claude-fable-latest'),
          openRouterRecord('openai/gpt-chat-latest'),
          openRouterRecord('openai/gpt-5.2'),
        ],
      }),
      now: () => NOW,
    })

    const cached = await service.getCatalog()
    expect(cached.source).toBe('cache')
    expect(cached.models.map((model) => model.id)).toEqual(['anthropic/claude-fable-5'])

    const refreshed = await service.refresh()
    expect(refreshed.success).toBe(true)
    expect(refreshed.catalog.models.map((model) => model.id)).toEqual([
      'anthropic/claude-fable-5',
      'openai/gpt-5.2',
    ])

    const persisted = JSON.parse(await readFile(cachePath, 'utf8')) as AiModelRegistryDocument
    expect(persisted.models.map((model) => model.id)).toEqual([
      'anthropic/claude-fable-5',
      'openai/gpt-5.2',
    ])
  })
})

async function createCachePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'janusx-model-catalog-'))
  temporaryDirectories.push(directory)
  return join(directory, 'model-catalog.json')
}

function documentAt(updatedAt: string, id: string): AiModelRegistryDocument {
  return documentWithModels(updatedAt, [id])
}

function documentWithModels(updatedAt: string, ids: string[]): AiModelRegistryDocument {
  return {
    schemaVersion: 1,
    source: 'openrouter',
    updatedAt,
    cutoffCreatedAt: updatedAt,
    modelCount: ids.length,
    models: ids.map((id) => ({
      id,
      name: id,
      source: 'openrouter' as const,
      aliases: [id],
      normalizedKeys: [id],
    })),
  }
}

function openRouterRecord(id: string) {
  return {
    id,
    name: 'Model One',
    created: NOW / 1_000,
    context_length: 32_000,
    top_provider: { max_completion_tokens: 4_096 },
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    supported_parameters: ['tools'],
    pricing: { prompt: '0.000001', completion: '0.000002' },
  }
}
