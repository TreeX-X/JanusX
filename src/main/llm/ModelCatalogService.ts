import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import {
  getAiModelRegistryMetadata,
  getAllAiModels,
  isOpenRouterLatestAlias,
  openRouterRecordToRegistryEntry,
  type AiModelRegistryDocument,
  type ModelCatalogRefreshResult,
  type ModelCatalogSnapshot,
  type OpenRouterModelRecord,
} from '@janusx/llm-core'

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const DEFAULT_STALE_MS = 24 * 60 * 60 * 1000

interface ModelCatalogServiceOptions {
  cachePath?: string
  fetchModels?: () => Promise<unknown>
  now?: () => number
  staleMs?: number
  bundledDocument?: AiModelRegistryDocument
}

export class ModelCatalogService {
  private readonly cachePath: string
  private readonly fetchModels: () => Promise<unknown>
  private readonly now: () => number
  private readonly staleMs: number
  private readonly bundledDocument: AiModelRegistryDocument
  private loadedDocument?: AiModelRegistryDocument
  private loadPromise?: Promise<AiModelRegistryDocument>
  private refreshPromise?: Promise<ModelCatalogRefreshResult>

  constructor(options: ModelCatalogServiceOptions = {}) {
    const metadata = getAiModelRegistryMetadata()
    this.cachePath = options.cachePath ?? join(app.getPath('userData'), 'janusx', 'model-catalog.json')
    this.fetchModels = options.fetchModels ?? fetchOpenRouterModels
    this.now = options.now ?? Date.now
    this.staleMs = options.staleMs ?? DEFAULT_STALE_MS
    this.bundledDocument = options.bundledDocument ?? {
      ...metadata,
      models: getAllAiModels(),
    }
  }

  async getCatalog(): Promise<ModelCatalogSnapshot> {
    const catalog = this.toSnapshot(await this.loadDocument())
    if (catalog.isStale) void this.refresh().catch(() => {})
    return catalog
  }

  async refresh(): Promise<ModelCatalogRefreshResult> {
    if (this.refreshPromise) return this.refreshPromise

    this.refreshPromise = this.performRefresh().finally(() => {
      this.refreshPromise = undefined
    })
    return this.refreshPromise
  }

  private async performRefresh(): Promise<ModelCatalogRefreshResult> {
    const previous = await this.loadDocument()
    try {
      const payload = await this.fetchModels()
      const records = readOpenRouterRecords(payload)
      const models = records
        .map(openRouterRecordToRegistryEntry)
        .filter((model): model is NonNullable<typeof model> => model !== null)
        .sort((a, b) => a.id.localeCompare(b.id))

      if (models.length === 0) throw new Error('OpenRouter returned no valid models')

      const updatedAt = new Date(this.now()).toISOString()
      const document: AiModelRegistryDocument = {
        schemaVersion: 1,
        source: 'openrouter',
        updatedAt,
        cutoffCreatedAt: latestCreatedAt(models) ?? updatedAt,
        modelCount: models.length,
        models,
      }
      await this.persist(document)
      this.loadedDocument = document
      return { success: true, catalog: this.toSnapshot(document) }
    } catch (error) {
      return {
        success: false,
        catalog: this.toSnapshot(previous),
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private async loadDocument(): Promise<AiModelRegistryDocument> {
    if (this.loadedDocument) return this.loadedDocument
    if (!this.loadPromise) {
      this.loadPromise = this.readCache().then((cached) => {
        this.loadedDocument = cached ?? this.bundledDocument
        return this.loadedDocument
      })
    }
    return this.loadPromise
  }

  private async readCache(): Promise<AiModelRegistryDocument | null> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.cachePath, 'utf8'))
      return isRegistryDocument(parsed, this.now()) ? parsed : null
    } catch {
      return null
    }
  }

  private async persist(document: AiModelRegistryDocument): Promise<void> {
    await mkdir(dirname(this.cachePath), { recursive: true })
    const temporaryPath = `${this.cachePath}.${process.pid}.tmp`
    await writeFile(temporaryPath, JSON.stringify(document), 'utf8')
    await rename(temporaryPath, this.cachePath)
  }

  private toSnapshot(document: AiModelRegistryDocument): ModelCatalogSnapshot {
    return {
      models: document.models.filter((model) => !isOpenRouterLatestAlias(model)),
      updatedAt: document.updatedAt,
      source: document === this.bundledDocument ? 'bundled' : 'cache',
      isStale: !Number.isFinite(Date.parse(document.updatedAt))
        || this.now() - Date.parse(document.updatedAt) >= this.staleMs,
    }
  }
}

async function fetchOpenRouterModels(): Promise<unknown> {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`OpenRouter request failed (${response.status})`)
  return response.json()
}

function readOpenRouterRecords(payload: unknown): OpenRouterModelRecord[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new Error('OpenRouter returned an invalid model catalog')
  }
  return (payload as { data: OpenRouterModelRecord[] }).data
}

function isRegistryDocument(value: unknown, now: number): value is AiModelRegistryDocument {
  if (!value || typeof value !== 'object') return false
  const document = value as Partial<AiModelRegistryDocument>
  const updatedAt = parseTimestamp(document.updatedAt)
  const cutoffCreatedAt = parseTimestamp(document.cutoffCreatedAt)
  return document.source === 'openrouter'
    && document.schemaVersion === 1
    && typeof document.updatedAt === 'string'
    && updatedAt !== null
    && updatedAt <= now
    && typeof document.cutoffCreatedAt === 'string'
    && cutoffCreatedAt !== null
    && cutoffCreatedAt <= now
    && typeof document.modelCount === 'number'
    && Array.isArray(document.models)
    && document.models.length > 0
    && document.modelCount === document.models.length
    && document.models.every(isRegistryEntry)
}

function isRegistryEntry(value: unknown): value is AiModelRegistryDocument['models'][number] {
  if (!value || typeof value !== 'object') return false
  const model = value as Partial<AiModelRegistryDocument['models'][number]>
  return model.source === 'openrouter'
    && isNonEmptyString(model.id)
    && isNonEmptyString(model.name)
    && optionalString(model.description)
    && optionalString(model.canonicalSlug)
    && optionalString(model.providerAuthor)
    && optionalIsoTimestamp(model.createdAt)
    && optionalPositiveNumber(model.createdUnix)
    && optionalPositiveNumber(model.contextLength)
    && optionalPositiveNumber(model.providerContextLength)
    && optionalPositiveNumber(model.effectiveContextWindow)
    && optionalPositiveNumber(model.maxOutputTokens)
    && optionalStringArray(model.inputModalities)
    && optionalStringArray(model.outputModalities)
    && optionalString(model.tokenizer)
    && optionalStringArray(model.supportedParameters)
    && optionalNumericString(model.promptPricePerToken)
    && optionalNumericString(model.completionPricePerToken)
    && isStringArray(model.aliases)
    && isStringArray(model.normalizedKeys)
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function optionalIsoTimestamp(value: unknown): boolean {
  return value === undefined || parseTimestamp(value) !== null
}

function optionalPositiveNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value > 0)
}

function optionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function optionalNumericString(value: unknown): boolean {
  return value === undefined
    || (typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Number(value)))
}

function latestCreatedAt(models: AiModelRegistryDocument['models']): string | undefined {
  return models.reduce<string | undefined>((latest, model) => {
    if (!model.createdAt) return latest
    return !latest || model.createdAt > latest ? model.createdAt : latest
  }, undefined)
}

let modelCatalogService: ModelCatalogService | undefined

export function getModelCatalogService(): ModelCatalogService {
  modelCatalogService ??= new ModelCatalogService()
  return modelCatalogService
}
