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
  return Object.keys(config.providers).length > 0
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
    const sourceDocument = JSON.parse(sourceContent)
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
    merged.providers = { ...developmentConfig.providers, ...sourceConfig.providers }
    for (const consumer of LLM_TERMINAL_CONSUMERS) {
      const hasSelection = sourceDocument.version === '3.0.0'
        ? Object.hasOwn(sourceDocument.bindings ?? {}, consumer)
        : sourceDocument.terminals
          ? Object.keys(sourceDocument.terminals[consumer]?.providers ?? {}).length > 0
          : true
      // Selection travels; an external write receipt belongs to this profile only.
      const { appliedFingerprint: _receipt, ...binding } = hasSelection ? sourceConfig.bindings[consumer] : developmentConfig.bindings[consumer]
      merged.bindings[consumer] = binding
    }

    mkdirSync(dirname(developmentConfigPath), { recursive: true })
    if (existsSync(developmentConfigPath) && !existsSync(developmentConfigPath + '.pre-v3')) {
      const previous = readFileSync(developmentConfigPath, 'utf-8')
      if (JSON.parse(previous).version !== '3.0.0') writeFileSync(developmentConfigPath + '.pre-v3', previous, { encoding: 'utf-8', mode: 0o600 })
    }
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
