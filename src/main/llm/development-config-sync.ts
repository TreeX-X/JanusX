import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ProviderSettings } from '@janusx/llm-core'

interface StoredLlmConfig {
  version: string
  providers: Record<string, ProviderSettings>
  defaultProvider: string | null
}

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

const EMPTY_CONFIG: StoredLlmConfig = { version: '1.0.0', providers: {}, defaultProvider: null }
let latestStatus: DevelopmentLlmSyncStatus = { state: 'not-applicable', importedProviderCount: 0 }

function parseConfig(path: string): StoredLlmConfig | null {
  try {
    const value = JSON.parse(readFileSync(path, 'utf-8')) as Partial<StoredLlmConfig>
    if (!value.providers || typeof value.providers !== 'object' || Array.isArray(value.providers)) return null
    return {
      version: typeof value.version === 'string' ? value.version : EMPTY_CONFIG.version,
      providers: value.providers,
      defaultProvider: typeof value.defaultProvider === 'string' ? value.defaultProvider : null,
    }
  } catch {
    return null
  }
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
      return config && Object.keys(config.providers).length > 0
    })
    if (!source) return latestStatus = { state: 'source-missing', importedProviderCount: 0 }

    const sourceContent = readFileSync(source.path, 'utf-8')
    const sourceConfig = parseConfig(source.path)!
    const sourceFingerprint = fingerprint(sourceContent)
    const marker = readMarker(markerPath)
    if (marker?.sourceFingerprint === sourceFingerprint && existsSync(developmentConfigPath)) {
      return latestStatus = {
        state: 'unchanged',
        importedProviderCount: Object.keys(sourceConfig.providers).length,
        sourceProfile: source.profile,
      }
    }

    const developmentConfig = existsSync(developmentConfigPath)
      ? parseConfig(developmentConfigPath) ?? { ...EMPTY_CONFIG, providers: {} }
      : { ...EMPTY_CONFIG, providers: {} }
    const mergedProviders = { ...developmentConfig.providers, ...sourceConfig.providers }
    const defaultProvider = sourceConfig.defaultProvider && mergedProviders[sourceConfig.defaultProvider]
      ? sourceConfig.defaultProvider
      : developmentConfig.defaultProvider
    const merged: StoredLlmConfig = {
      version: sourceConfig.version || developmentConfig.version,
      providers: mergedProviders,
      defaultProvider: defaultProvider ?? Object.keys(mergedProviders)[0] ?? null,
    }

    mkdirSync(dirname(developmentConfigPath), { recursive: true })
    writeFileSync(developmentConfigPath, JSON.stringify(merged, null, 2), 'utf-8')
    writeFileSync(markerPath, JSON.stringify({
      sourceFingerprint,
      sourceProfile: source.profile,
      synchronizedAt: new Date().toISOString(),
    } satisfies SyncMarker, null, 2), 'utf-8')
    return latestStatus = {
      state: 'synchronized',
      importedProviderCount: Object.keys(sourceConfig.providers).length,
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
