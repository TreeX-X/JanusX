import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  countDistinctProviders,
  emptyLlmConfig,
  LLM_TERMINAL_CONSUMERS,
  normalizeLlmConfigDocument,
  type LlmConfig,
} from './config-document'

interface SyncMarker {
  sourceFingerprint: string
  sourceProfile: string
  synchronizedAt: string
}

export interface DevelopmentLlmSyncStatus {
  state: 'not-applicable' | 'source-missing' | 'unchanged' | 'synchronized' | 'failed'
  importedProviderCount: number
  sourceProfile?: string
  error?: string
}

const EMPTY_CONFIG: LlmConfig = emptyLlmConfig()
let latestStatus: DevelopmentLlmSyncStatus = { state: 'not-applicable', importedProviderCount: 0 }

function parseConfig(path: string): LlmConfig | null {
  try {
    const normalized = normalizeLlmConfigDocument(JSON.parse(readFileSync(path, 'utf-8')))
    return normalized?.config ?? null
  } catch {
    return null
  }
}

function hasProviders(config: LlmConfig): boolean {
  return LLM_TERMINAL_CONSUMERS.some((consumer) => Object.keys(config.terminals[consumer].providers).length > 0)
}

function readMarker(path: string): SyncMarker | null {
  try {
    const value = JSON.parse(readFileSync(path, 'utf-8')) as Partial<SyncMarker>
    return typeof value.sourceFingerprint === 'string' && typeof value.sourceProfile === 'string'
      ? value as SyncMarker
      : null
  } catch {
    return null
  }
}

function fingerprint(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function synchronizeInstalledLlmConfig(appDataRoot: string): DevelopmentLlmSyncStatus {
  const developmentConfigPath = join(appDataRoot, 'JanusX-Dev', 'janusx', 'llm-config.json')
  const markerPath = join(appDataRoot, 'JanusX-Dev', 'janusx', 'llm-config-sync.json')
  const sourceCandidates = [
    { profile: 'installed', path: join(appDataRoot, 'janusx', 'janusx', 'llm-config.json') },
    { profile: 'installed-legacy', path: join(appDataRoot, 'JanusX', 'janusx', 'llm-config.json') },
    { profile: 'electron-legacy', path: join(appDataRoot, 'Electron', 'janusx', 'llm-config.json') },
  ]

  try {
    const source = sourceCandidates.find((candidate) => {
      const config = existsSync(candidate.path) ? parseConfig(candidate.path) : null
      return config && hasProviders(config)
    })
    if (!source) return latestStatus = { state: 'source-missing', importedProviderCount: 0 }

    const sourceContent = readFileSync(source.path, 'utf-8')
    const sourceConfig = parseConfig(source.path)!
    const sourceFingerprint = fingerprint(sourceContent)
    const marker = readMarker(markerPath)
    if (marker?.sourceFingerprint === sourceFingerprint && existsSync(developmentConfigPath)) {
      return latestStatus = {
        state: 'unchanged',
        importedProviderCount: countDistinctProviders(sourceConfig),
        sourceProfile: source.profile,
      }
    }

    const developmentConfig = existsSync(developmentConfigPath)
      ? parseConfig(developmentConfigPath) ?? emptyLlmConfig()
      : emptyLlmConfig()
    const merged: LlmConfig = emptyLlmConfig()
    for (const consumer of LLM_TERMINAL_CONSUMERS) {
      const development = developmentConfig.terminals[consumer]
      const sourceTerminal = sourceConfig.terminals[consumer]
      const providers = { ...development.providers, ...sourceTerminal.providers }
      const defaultId = sourceTerminal.defaultId && providers[sourceTerminal.defaultId]
        ? sourceTerminal.defaultId
        : development.defaultId
      merged.terminals[consumer] = {
        providers,
        defaultId: defaultId ?? Object.keys(providers)[0] ?? null,
      }
    }
    merged.version = sourceConfig.version || developmentConfig.version

    mkdirSync(dirname(developmentConfigPath), { recursive: true })
    writeFileSync(developmentConfigPath, JSON.stringify(merged, null, 2), 'utf-8')
    writeFileSync(markerPath, JSON.stringify({
      sourceFingerprint,
      sourceProfile: source.profile,
      synchronizedAt: new Date().toISOString(),
    } satisfies SyncMarker, null, 2), 'utf-8')
    return latestStatus = {
      state: 'synchronized',
      importedProviderCount: countDistinctProviders(sourceConfig),
      sourceProfile: source.profile,
    }
  } catch (error) {
    return latestStatus = {
      state: 'failed',
      importedProviderCount: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function getDevelopmentLlmSyncStatus(): DevelopmentLlmSyncStatus {
  return { ...latestStatus }
}
