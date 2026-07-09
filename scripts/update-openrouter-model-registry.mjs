#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetch, ProxyAgent } from 'undici'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const registryDir = path.join(rootDir, 'packages', 'llm-core', 'src', 'registry')
const outputPath = path.join(registryDir, 'models.openrouter.generated.json')
const overridesPath = path.join(registryDir, 'models.overrides.json')
const legacyOverridesPath = path.join(registryDir, 'models.legacy-overrides.json')
const sourceUrl = 'https://openrouter.ai/api/v1/models'
const schemaVersion = 1

const cutoffDate = resolveCutoffDate()
const cutoffUnix = Math.floor(cutoffDate.getTime() / 1000)

const response = await fetch(sourceUrl, {
  headers: buildHeaders(),
  dispatcher: buildProxyDispatcher(),
  signal: AbortSignal.timeout(30_000)
})

if (!response.ok) {
  throw new Error(`OpenRouter models request failed: ${response.status} ${response.statusText}`)
}

const payload = await response.json()
const records = Array.isArray(payload?.data) ? payload.data : []
if (!Array.isArray(records)) {
  throw new Error('OpenRouter response does not contain a data array')
}

const allEntries = records
  .filter(record => typeof record?.created === 'number' && record.created >= cutoffUnix)
  .map(openRouterRecordToRegistryEntry)
  .filter(Boolean)

const overrides = await readOverrides(overridesPath)
const legacyOverrides = await readOverrides(legacyOverridesPath)
const models = mergeOverrides(allEntries, [...overrides, ...legacyOverrides])

const registry = {
  schemaVersion,
  source: 'openrouter',
  updatedAt: new Date().toISOString(),
  cutoffCreatedAt: cutoffDate.toISOString(),
  modelCount: models.length,
  models
}

await mkdir(registryDir, { recursive: true })
await writeFile(outputPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')

const missingContext = models.filter(model => model.effectiveContextWindow === undefined).length
console.log([
  'OpenRouter model registry updated.',
  `Source records: ${records.length}`,
  `Kept recent models: ${allEntries.length}`,
  `Final models after overrides: ${models.length}`,
  `Missing context window: ${missingContext}`,
  `Cutoff: ${cutoffDate.toISOString()}`,
  `Output: ${path.relative(rootDir, outputPath)}`
].join('\n'))

function buildHeaders() {
  const headers = { Accept: 'application/json' }
  if (process.env.OPENROUTER_API_KEY) {
    headers.Authorization = `Bearer ${process.env.OPENROUTER_API_KEY}`
  }
  return headers
}

function buildProxyDispatcher() {
  const proxyUrl = process.env.HTTPS_PROXY
    || process.env.https_proxy
    || process.env.HTTP_PROXY
    || process.env.http_proxy
    || process.env.ALL_PROXY
    || process.env.all_proxy

  return proxyUrl ? new ProxyAgent(proxyUrl) : undefined
}

function resolveCutoffDate() {
  if (process.env.MODEL_REGISTRY_CUTOFF_DATE) {
    const explicit = new Date(process.env.MODEL_REGISTRY_CUTOFF_DATE)
    if (Number.isNaN(explicit.getTime())) {
      throw new Error('MODEL_REGISTRY_CUTOFF_DATE must be a valid date')
    }
    return explicit
  }

  const date = new Date()
  date.setUTCFullYear(date.getUTCFullYear() - 1)
  date.setUTCHours(0, 0, 0, 0)
  return date
}

function openRouterRecordToRegistryEntry(record) {
  if (!record?.id || !record?.name) return null

  const providerContextLength = readPositiveNumber(record.top_provider?.context_length)
  const contextLength = readPositiveNumber(record.context_length)
  const aliases = buildModelAliases(record.id, record.name)

  return cleanUndefined({
    id: record.id,
    canonicalSlug: record.id.replace(/:free$/u, ''),
    name: record.name,
    description: record.description,
    source: 'openrouter',
    providerAuthor: providerAuthorFromId(record.id),
    createdAt: new Date(record.created * 1000).toISOString(),
    createdUnix: record.created,
    contextLength,
    providerContextLength,
    effectiveContextWindow: providerContextLength ?? contextLength,
    maxOutputTokens: readPositiveNumber(record.top_provider?.max_completion_tokens),
    inputModalities: record.architecture?.input_modalities,
    outputModalities: record.architecture?.output_modalities,
    tokenizer: record.architecture?.tokenizer,
    supportedParameters: record.supported_parameters,
    promptPricePerToken: record.pricing?.prompt,
    completionPricePerToken: record.pricing?.completion,
    aliases,
    normalizedKeys: buildNormalizedKeys(record.id, record.name, aliases)
  })
}

async function readOverrides(filePath) {
  try {
    const text = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(text)
    return Array.isArray(parsed?.overrides) ? parsed.overrides : []
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

function mergeOverrides(models, overrides) {
  const byId = new Map(models.map(model => [model.id, model]))

  for (const override of overrides) {
    if (!override?.id) continue
    const existing = byId.get(override.id)
    const aliases = buildModelAliases(
      override.id,
      override.name ?? existing?.name ?? override.id,
      [...(existing?.aliases ?? []), ...(override.aliases ?? [])]
    )

    const merged = cleanUndefined({
      ...(existing ?? {
        id: override.id,
        name: override.name ?? override.id,
        source: override.source ?? 'openrouter',
        aliases: [],
        normalizedKeys: []
      }),
      ...override,
      source: override.source ?? existing?.source ?? 'openrouter',
      aliases,
      effectiveContextWindow: override.effectiveContextWindow
        ?? override.providerContextLength
        ?? override.contextLength
        ?? existing?.effectiveContextWindow,
      normalizedKeys: buildNormalizedKeys(
        override.id,
        override.name ?? existing?.name ?? override.id,
        aliases
      )
    })

    byId.set(override.id, merged)
  }

  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id))
}

function providerAuthorFromId(id) {
  const index = id.indexOf('/')
  if (index <= 0) return undefined
  return id.slice(0, index)
}

function buildModelAliases(id, name, existing = []) {
  const aliases = new Set()
  const providerlessId = id.replace(/^[^/]+\//u, '').replace(/:free$/u, '')

  for (const value of [id, providerlessId, name, ...existing]) {
    const trimmed = String(value).trim()
    if (trimmed) aliases.add(trimmed)
  }

  const dateMatch = id.match(/(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})/u)
  if (dateMatch?.[1] && dateMatch[2] && dateMatch[3]) {
    aliases.add(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`)
    aliases.add(`${dateMatch[2]}${dateMatch[3]}`)
  }

  return Array.from(aliases).sort()
}

function buildNormalizedKeys(id, name, aliases = []) {
  const keys = new Set()

  for (const value of [id, name, ...aliases]) {
    const normalized = normalizeModelKey(value)
    const compact = compactModelKey(value)
    if (normalized) keys.add(normalized)
    if (compact) keys.add(compact)
  }

  return Array.from(keys).sort()
}

function normalizeModelKey(value) {
  return tokenizeModelName(value).join(' ')
}

function compactModelKey(value) {
  return tokenizeModelName(value).join('')
}

function tokenizeModelName(value) {
  const noiseWords = new Set(['preview', 'latest', 'beta', 'alpha', 'chat', 'instruct'])
  const normalized = String(value)
    .toLowerCase()
    .replace(/^[a-z0-9_.-]+\//u, '')
    .replace(/:free$/u, '')
    .replace(/[._/:-]+/gu, ' ')
    .replace(/([a-z])(\d)/gu, '$1 $2')
    .replace(/(\d)([a-z])/gu, '$1 $2')

  return normalized
    .split(/\s+/u)
    .map(token => token.trim())
    .filter(token => token.length > 0 && !noiseWords.has(token))
}

function readPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function cleanUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}
