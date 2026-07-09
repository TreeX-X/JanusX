import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import os from 'os'

type RuntimeTelemetryPreset = 'shell' | 'claude' | 'codex' | 'opencode'

export interface RuntimeTelemetryRequest {
  preset?: RuntimeTelemetryPreset
  cwd?: string
  startedAt?: number
}

export interface RuntimeTelemetrySnapshot {
  detectedModel?: string
  contextTokens?: number
  contextWindowTokens?: number
  inputTokens?: number
  outputTokens?: number
  filePath?: string
  sessionId?: string
  updatedAt?: number
}

interface SessionFileRef {
  path: string
  updatedAt: number
}

interface JsonRecord {
  [key: string]: unknown
}

const MAX_CODEX_CANDIDATES = 80
const STARTED_AT_TOLERANCE_MS = 1_000

export async function getRuntimeTelemetrySnapshot(
  request: RuntimeTelemetryRequest,
): Promise<RuntimeTelemetrySnapshot | null> {
  const preset = request.preset
  const cwd = normalizePath(request.cwd)
  const startedAt = readStartedAt(request.startedAt)

  if (!preset || preset === 'shell' || !cwd) return null
  if (preset === 'claude') return scanClaudeHistory(cwd, startedAt)
  if (preset === 'codex') return scanCodexHistory(cwd, startedAt)
  return null
}

async function scanClaudeHistory(cwd: string, startedAt?: number): Promise<RuntimeTelemetrySnapshot | null> {
  const projectDir = join(os.homedir(), '.claude', 'projects', toClaudeProjectKey(cwd))
  const files = (await listJsonlFiles(projectDir, (name) => name.endsWith('.jsonl')))
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const latestCurrent = files.find((file) => isFileAfterStartedAt(file, startedAt))
  const latestKnownModel = startedAt === undefined ? null : await readClaudeLatestModel(files)

  if (!latestCurrent) {
    return startedAt === undefined ? null : createEmptyCurrentSnapshot(latestKnownModel)
  }

  const current = await parseClaudeSession(latestCurrent, startedAt)
  if (!current && latestKnownModel) return createEmptyCurrentSnapshot(latestKnownModel)
  if (!current) return startedAt === undefined ? null : createEmptyCurrentSnapshot()

  if (!current.detectedModel && latestKnownModel?.detectedModel) {
    current.detectedModel = latestKnownModel.detectedModel
  }

  if (startedAt !== undefined && current.contextTokens === undefined) {
    current.contextTokens = 0
    current.inputTokens = 0
    current.outputTokens = 0
  }

  return current
}

async function scanCodexHistory(cwd: string, startedAt?: number): Promise<RuntimeTelemetrySnapshot | null> {
  const root = join(os.homedir(), '.codex', 'sessions')
  const files = (await listJsonlFilesRecursive(root, (name) => name.startsWith('rollout-') && name.endsWith('.jsonl')))
    .filter((file) => isFileAfterStartedAt(file, startedAt))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CODEX_CANDIDATES)

  for (const file of files) {
    const snapshot = await parseCodexSession(file, cwd, startedAt)
    if (!snapshot) continue
    if (snapshotMatchesCwd(snapshot, cwd)) return snapshot
  }

  return null
}

async function parseClaudeSession(file: SessionFileRef, startedAt?: number): Promise<RuntimeTelemetrySnapshot | null> {
  const lines = await readJsonlLines(file.path)
  const snapshot: RuntimeTelemetrySnapshot = {
    filePath: file.path,
    updatedAt: file.updatedAt,
  }

  for (const line of lines) {
    const value = parseJsonObject(line)
    if (!value) continue
    if (!isLineAfterStartedAt(value, startedAt)) continue

    const message = asRecord(value.message)
    const usage = asRecord(message?.usage) ?? asRecord(value.usage)
    const model = readString(message?.model) ?? readString(value.model)
    const sessionId = readString(value.sessionId) ?? readString(value.session_id)

    if (model) snapshot.detectedModel = model
    if (sessionId) snapshot.sessionId = sessionId
    if (!usage) continue

    const inputTokens = readPositiveNumber(usage.input_tokens ?? usage.inputTokens)
    const outputTokens = readPositiveNumber(usage.output_tokens ?? usage.outputTokens)
    const cacheReadTokens =
      readPositiveNumber(usage.cache_read_input_tokens ?? usage.cache_read_tokens ?? usage.cacheReadTokens) ?? 0
    const cacheCreationTokens =
      readPositiveNumber(usage.cache_creation_input_tokens ?? usage.cache_creation_tokens ?? usage.cacheCreationTokens) ?? 0
    const contextTokens = (inputTokens ?? 0) + cacheReadTokens + cacheCreationTokens

    if (inputTokens !== undefined) snapshot.inputTokens = inputTokens
    if (outputTokens !== undefined) snapshot.outputTokens = outputTokens
    if (contextTokens > 0) snapshot.contextTokens = contextTokens
  }

  return hasTelemetry(snapshot) ? snapshot : null
}

async function readClaudeLatestModel(files: SessionFileRef[]): Promise<RuntimeTelemetrySnapshot | null> {
  for (const file of files) {
    const lines = await readJsonlLines(file.path)

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const value = parseJsonObject(lines[index])
      if (!value) continue

      const message = asRecord(value.message)
      const model = readString(message?.model) ?? readString(value.model)
      if (!model) continue

      return {
        detectedModel: model,
        sessionId: readString(value.sessionId) ?? readString(value.session_id),
        filePath: file.path,
        updatedAt: file.updatedAt,
      }
    }
  }

  return null
}

function createEmptyCurrentSnapshot(modelSnapshot?: RuntimeTelemetrySnapshot | null): RuntimeTelemetrySnapshot {
  return {
    ...(modelSnapshot ?? {}),
    contextTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    updatedAt: Date.now(),
  }
}

async function parseCodexSession(file: SessionFileRef, cwd: string, startedAt?: number): Promise<RuntimeTelemetrySnapshot | null> {
  const lines = await readJsonlLines(file.path)
  const snapshot: RuntimeTelemetrySnapshot & { cwd?: string } = {
    filePath: file.path,
    updatedAt: file.updatedAt,
  }

  for (const line of lines) {
    const value = parseJsonObject(line)
    if (!value) continue
    if (!isLineAfterStartedAt(value, startedAt)) continue

    const payload = asRecord(value.payload)
    const info = asRecord(payload?.info)
    const payloadType = readString(payload?.type)
    const rootType = readString(value.type)

    if (rootType === 'session_meta') {
      const sessionId = readString(payload?.id) ?? readString(value.session_id)
      const sessionCwd = readString(payload?.cwd)
      if (sessionId) snapshot.sessionId = sessionId
      if (sessionCwd) snapshot.cwd = normalizePath(sessionCwd)
    }

    if (rootType === 'turn_context') {
      const model = readString(payload?.model)
      const turnCwd = readString(payload?.cwd)
      if (model) snapshot.detectedModel = model
      if (turnCwd) snapshot.cwd = normalizePath(turnCwd)
    }

    if (payloadType !== 'token_count' || !info) continue
    const lastUsage = asRecord(info.last_token_usage) ?? asRecord(info.lastTokenUsage)
    const totalUsage = asRecord(info.total_token_usage) ?? asRecord(info.totalTokenUsage)

    const contextTokens = readPositiveNumber(lastUsage?.total_tokens ?? lastUsage?.totalTokens)
    const contextWindowTokens = readPositiveNumber(info.model_context_window ?? info.modelContextWindow)
    const inputTokens = readPositiveNumber(totalUsage?.input_tokens ?? totalUsage?.inputTokens)
    const cachedInputTokens = readPositiveNumber(totalUsage?.cached_input_tokens ?? totalUsage?.cachedInputTokens) ?? 0
    const outputTokens = readPositiveNumber(totalUsage?.output_tokens ?? totalUsage?.outputTokens)

    if (contextTokens !== undefined) snapshot.contextTokens = contextTokens
    if (contextWindowTokens !== undefined) snapshot.contextWindowTokens = contextWindowTokens
    if (inputTokens !== undefined) snapshot.inputTokens = Math.max(0, inputTokens - cachedInputTokens)
    if (outputTokens !== undefined) snapshot.outputTokens = outputTokens
  }

  if (snapshot.cwd && !pathsEqual(snapshot.cwd, cwd)) {
    return null
  }
  return hasTelemetry(snapshot) ? snapshot : null
}

async function listJsonlFiles(
  dir: string,
  acceptsName: (name: string) => boolean,
): Promise<SessionFileRef[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const files: SessionFileRef[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !acceptsName(entry.name)) continue
      const path = join(dir, entry.name)
      const info = await stat(path)
      files.push({ path, updatedAt: info.mtimeMs })
    }
    return files
  } catch {
    return []
  }
}

async function listJsonlFilesRecursive(
  root: string,
  acceptsName: (name: string) => boolean,
): Promise<SessionFileRef[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    const nested = await Promise.all(entries.map(async (entry) => {
      const path = join(root, entry.name)
      if (entry.isDirectory()) return listJsonlFilesRecursive(path, acceptsName)
      if (!entry.isFile() || !acceptsName(entry.name)) return []
      const info = await stat(path)
      return [{ path, updatedAt: info.mtimeMs }]
    }))
    return nested.flat()
  } catch {
    return []
  }
}

async function readJsonlLines(filePath: string): Promise<string[]> {
  try {
    const content = await readFile(filePath, 'utf-8')
    return content.split(/\r?\n/).filter(Boolean)
  } catch {
    return []
  }
}

function parseJsonObject(line: string): JsonRecord | null {
  try {
    const value = JSON.parse(line) as unknown
    return asRecord(value) ?? null
  } catch {
    return null
  }
}

function readStartedAt(value: unknown): number | undefined {
  const startedAt = readTimestampMs(value)
  return startedAt && startedAt > 0 ? startedAt : undefined
}

function isFileAfterStartedAt(file: SessionFileRef, startedAt?: number): boolean {
  return startedAt === undefined || file.updatedAt >= startedAt - STARTED_AT_TOLERANCE_MS
}

function isLineAfterStartedAt(value: JsonRecord, startedAt?: number): boolean {
  if (startedAt === undefined) return true
  const timestamp = readRecordTimestampMs(value)
  return timestamp !== undefined && timestamp >= startedAt - STARTED_AT_TOLERANCE_MS
}

function readRecordTimestampMs(value: JsonRecord): number | undefined {
  const message = asRecord(value.message)
  const payload = asRecord(value.payload)
  return (
    readTimestampMs(value.timestamp) ??
    readTimestampMs(value.created_at) ??
    readTimestampMs(value.createdAt) ??
    readTimestampMs(message?.timestamp) ??
    readTimestampMs(payload?.timestamp)
  )
}

function readTimestampMs(value: unknown): number | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return undefined
    return value < 1_000_000_000_000 ? Math.round(value * 1000) : Math.round(value)
  }

  const raw = readString(value)
  if (!raw) return undefined
  const parsed = Date.parse(raw)
  if (Number.isFinite(parsed)) return parsed

  const numeric = Number(raw)
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined
  return numeric < 1_000_000_000_000 ? Math.round(numeric * 1000) : Math.round(numeric)
}

function toClaudeProjectKey(cwd: string): string {
  return cwd.replace(/[\\/]/g, '-').replace(/:/g, '-')
}

function snapshotMatchesCwd(snapshot: RuntimeTelemetrySnapshot & { cwd?: string }, cwd: string): boolean {
  return Boolean(snapshot.cwd && pathsEqual(snapshot.cwd, cwd))
}

function pathsEqual(a: string, b: string): boolean {
  return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase()
}

function normalizePath(value?: string): string {
  return value ? value.replace(/[\\/]+$/g, '') : ''
}

function hasTelemetry(snapshot: RuntimeTelemetrySnapshot): boolean {
  return Boolean(
    snapshot.detectedModel ||
    snapshot.contextTokens !== undefined ||
    snapshot.contextWindowTokens !== undefined ||
    snapshot.inputTokens !== undefined ||
    snapshot.outputTokens !== undefined
  )
}

function readPositiveNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined
  return Math.round(numeric)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined
}
