import { app } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'
import type { RuntimeTelemetryRequest, RuntimeTelemetrySnapshot } from '../../shared/ipc/system'
import { getRuntimeTelemetrySnapshot } from './history'

type TelemetryEngine = Exclude<NonNullable<RuntimeTelemetryRequest['preset']>, 'shell'>

interface ModelSegment {
  model?: string
  contextWindowTokens?: number
  startedAt: number
}

interface TerminalLedgerEntry {
  engine: TelemetryEngine
  sessionId: string
  compactionCount?: number
  modelSegments: ModelSegment[]
  updatedAt: number
}

interface TelemetryLedger {
  version: 1
  terminals: Record<string, TerminalLedgerEntry>
}

/**
 * Owns the one-to-one relationship between a JanusX terminal and an external
 * CLI session. Renderer requests can read this state but can never establish
 * it, which prevents concurrent terminals in the same cwd from sharing data.
 */
export class TerminalContextCoordinator {
  private readonly entries = new Map<string, TerminalLedgerEntry>()
  private readonly sessionOwners = new Map<string, string>()
  private loaded = false

  bindSession(terminalId: string, engine: TelemetryEngine, sessionId?: string): boolean {
    const normalizedSessionId = sessionId?.trim()
    if (!terminalId || !normalizedSessionId) return false
    this.load()

    const owner = this.sessionOwners.get(this.sessionKey(engine, normalizedSessionId))
    if (owner && owner !== terminalId) return false

    const previous = this.entries.get(terminalId)
    if (previous?.sessionId === normalizedSessionId && previous.engine === engine) return true
    if (previous) this.sessionOwners.delete(this.sessionKey(previous.engine, previous.sessionId))

    this.entries.set(terminalId, {
      engine,
      sessionId: normalizedSessionId,
      modelSegments: [],
      updatedAt: Date.now(),
    })
    this.sessionOwners.set(this.sessionKey(engine, normalizedSessionId), terminalId)
    this.persist()
    return true
  }

  unbindTerminal(terminalId: string): void {
    if (!terminalId) return
    this.load()
    const entry = this.entries.get(terminalId)
    if (!entry) return
    this.entries.delete(terminalId)
    this.sessionOwners.delete(this.sessionKey(entry.engine, entry.sessionId))
    this.persist()
  }

  async getSnapshot(request: RuntimeTelemetryRequest): Promise<RuntimeTelemetrySnapshot | null> {
    this.load()
    const bound = request.terminalId ? this.entries.get(request.terminalId) : undefined
    const preset = request.preset
    if (bound && bound.engine !== preset) return null

    // A renderer-supplied id is accepted only when it matches the main-process
    // binding. This also makes restored windows safe after renderer reloads.
    const sessionId = bound?.sessionId
    const snapshot = await getRuntimeTelemetrySnapshot({ ...request, sessionId })
    if (!snapshot) return null

    if (!bound) return snapshot
    const exact: RuntimeTelemetrySnapshot = {
      ...snapshot,
      sessionId: bound.sessionId,
      sessionBinding: 'exact',
    }
    this.recordSnapshot(request.terminalId!, bound, exact)
    return exact
  }

  private recordSnapshot(terminalId: string, entry: TerminalLedgerEntry, snapshot: RuntimeTelemetrySnapshot): void {
    let changed = false
    if (snapshot.compactionCountConfidence === 'exact' && snapshot.compactionCount !== undefined && entry.compactionCount !== snapshot.compactionCount) {
      entry.compactionCount = snapshot.compactionCount
      changed = true
    }

    const model = snapshot.detectedModel
    const window = snapshot.contextWindowTokens
    const latest = entry.modelSegments.at(-1)
    if ((model || window !== undefined) && (!latest || latest.model !== model || latest.contextWindowTokens !== window)) {
      entry.modelSegments.push({ model, contextWindowTokens: window, startedAt: snapshot.modelChangedAt ?? snapshot.observedAt ?? Date.now() })
      // A malformed or very long-running source must not grow this metadata without bound.
      if (entry.modelSegments.length > 64) entry.modelSegments.splice(0, entry.modelSegments.length - 64)
      changed = true
    }

    if (changed) {
      entry.updatedAt = Date.now()
      this.entries.set(terminalId, entry)
      this.persist()
    }
  }

  private load(): void {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = readFileSync(this.filePath(), 'utf8')
      const ledger = JSON.parse(raw) as TelemetryLedger
      if (ledger.version !== 1 || !ledger.terminals || typeof ledger.terminals !== 'object') return
      for (const [terminalId, entry] of Object.entries(ledger.terminals)) {
        if (!entry || !entry.sessionId || !entry.engine) continue
        const owner = this.sessionOwners.get(this.sessionKey(entry.engine, entry.sessionId))
        if (owner) continue
        this.entries.set(terminalId, { ...entry, modelSegments: Array.isArray(entry.modelSegments) ? entry.modelSegments : [] })
        this.sessionOwners.set(this.sessionKey(entry.engine, entry.sessionId), terminalId)
      }
    } catch {
      // Telemetry persistence is an optimization; an unavailable user-data path
      // must not make terminals or provider hooks fail.
    }
  }

  private persist(): void {
    try {
      const filePath = this.filePath()
      mkdirSync(dirname(filePath), { recursive: true })
      const terminals = Object.fromEntries(this.entries)
      const temporaryPath = `${filePath}.tmp`
      writeFileSync(temporaryPath, JSON.stringify({ version: 1, terminals } satisfies TelemetryLedger), 'utf8')
      renameSync(temporaryPath, filePath)
    } catch {
      // Keep the in-memory exact binding even when persistence is unavailable.
    }
  }

  private filePath(): string {
    const userData = app.getPath('userData')
    return join(userData, 'janusx', 'terminal-context-ledger.json')
  }

  private sessionKey(engine: TelemetryEngine, sessionId: string): string {
    return `${engine}:${sessionId.toLowerCase()}`
  }
}

export const terminalContextCoordinator = new TerminalContextCoordinator()
