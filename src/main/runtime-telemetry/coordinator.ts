import { app } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'
import type { RuntimeTelemetryRequest, RuntimeTelemetrySnapshot } from '../../shared/ipc/system'
import { getRuntimeTelemetrySnapshot } from './history'
import { UsageLedger } from './usage-ledger'
import type { UsageLedgerPage, UsageLedgerQuery } from '../../shared/usage'

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
  private readonly requests = new Map<string, RuntimeTelemetryRequest>()
  private readonly listeners = new Map<string, (snapshot: RuntimeTelemetrySnapshot) => void>()
  private readonly pending = new Map<string, Promise<RuntimeTelemetrySnapshot | null>>()
  private pollTimer?: ReturnType<typeof setInterval>
  private readonly usageLedger = new UsageLedger(() => join(app.getPath('userData'), 'janusx', 'usage-ledger.sqlite'))
  private usageError?: string
  private readonly failedSessions = new Map<string, string>()

  trackTerminal(terminalId: string, preset: RuntimeTelemetryRequest['preset'], cwd: string, notify?: (snapshot: RuntimeTelemetrySnapshot) => void): void {
    if (!preset || preset === 'shell') return
    this.requests.set(terminalId, { terminalId, preset, cwd })
    if (notify) this.listeners.set(terminalId, notify)
    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => {
        for (const request of this.requests.values()) {
          if (this.pending.has(request.terminalId!)) continue
          void this.getSnapshot(request).then(snapshot => {
            if (snapshot && this.requests.get(request.terminalId!) === request) this.listeners.get(request.terminalId!)?.(snapshot)
          }).catch(error => this.reportUsageError(error))
        }
      }, 10_000)
      this.pollTimer.unref()
    }
  }

  async releaseTerminal(terminalId: string): Promise<void> {
    const request = this.requests.get(terminalId)
    this.requests.delete(terminalId)
    this.listeners.delete(terminalId)
    const bound = this.entries.get(terminalId)
    try { if (request) await this.getSnapshot(request) }
    catch (error) { this.reportUsageError(error) }
    finally { if (this.entries.get(terminalId) === bound) this.unbindTerminal(terminalId) }
  }

  listUsage(query: UsageLedgerQuery): UsageLedgerPage {
    try { return { ...this.usageLedger.list(query), warning: this.usageError ?? this.failedSessions.values().next().value } }
    catch (error) { this.reportUsageError(error); return { records: [], sessions: [], error: this.usageError } }
  }

  private reportUsageError(error: unknown): void {
    this.usageError = error instanceof Error ? error.message : String(error)
    console.error('Usage ledger:', this.usageError)
  }

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
    this.requests.delete(terminalId)
    this.listeners.delete(terminalId)
    if (this.requests.size === 0 && this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = undefined }
    const entry = this.entries.get(terminalId)
    if (!entry) return
    this.entries.delete(terminalId)
    this.sessionOwners.delete(this.sessionKey(entry.engine, entry.sessionId))
    this.persist()
  }

  getSnapshot(request: RuntimeTelemetryRequest): Promise<RuntimeTelemetrySnapshot | null> {
    const key = request.terminalId ?? ''
    const pending = (this.pending.get(key) ?? Promise.resolve(null)).catch(() => null).then(() => this.readSnapshot(request))
    this.pending.set(key, pending)
    void pending.finally(() => { if (this.pending.get(key) === pending) this.pending.delete(key) }).catch(() => {})
    return pending
  }

  private async readSnapshot(request: RuntimeTelemetryRequest): Promise<RuntimeTelemetrySnapshot | null> {
    this.load()
    const bound = request.terminalId ? this.entries.get(request.terminalId) : undefined
    const preset = request.preset
    if (bound && bound.engine !== preset) return null

    // A renderer-supplied id is accepted only when it matches the main-process
    // binding. This also makes restored windows safe after renderer reloads.
    const sessionId = bound?.sessionId
    // Restoring the same native session must not redefine its accounting or context range.
    const snapshot = await getRuntimeTelemetrySnapshot({ ...request, sessionId, startedAt: bound ? undefined : request.startedAt }, (engine, namespace, nativeId) => {
      try { return this.usageLedger.sourceCheckpoint(engine, namespace, nativeId) }
      catch (error) {
        this.failedSessions.set(this.sessionKey(engine, nativeId), error instanceof Error ? error.message : String(error))
        return undefined
      }
    })
    if (request.terminalId && this.entries.get(request.terminalId) !== bound) return null
    if (!snapshot) {
      if (bound) {
        try { this.usageLedger.markMissing(bound.engine, bound.sessionId) }
        catch (error) { this.reportUsageError(error) }
      }
      return null
    }

    const { usageObservation, ...telemetry } = snapshot

    if (!bound) return telemetry
    if (snapshot.sessionId && snapshot.sessionId !== bound.sessionId) return null
    if (usageObservation && usageObservation.sessionId === bound.sessionId) {
      const key = this.sessionKey(bound.engine, bound.sessionId)
      try { this.usageLedger.record(usageObservation); this.failedSessions.delete(key); this.usageError = undefined }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.failedSessions.set(key, message)
        console.error('Usage ledger:', message)
      }
    }
    const exact: RuntimeTelemetrySnapshot = {
      ...telemetry,
      observedAt: Date.now(),
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
    return `${engine}:${sessionId}`
  }
}

export const terminalContextCoordinator = new TerminalContextCoordinator()
