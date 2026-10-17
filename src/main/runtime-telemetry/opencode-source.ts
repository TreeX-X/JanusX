// Native message usage, projected into the same ledger as the JSONL engines.
// Reference: yetone/magpie internal/sessions/opencode.go and calls_opencode.go.
import { DatabaseSync } from 'node:sqlite'
import { statSync } from 'node:fs'
import type { UsageEvent, UsageObservation, UsageSourceCheckpoint, UsageTokens } from '../../shared/usage'
import { cumulativeUsage, usageTokens } from './history-usage'

interface SessionRow { id: string; directory: string; time_updated: number; v2: number }
interface MessageRow { id: string; time_updated: number; data: string }
type Json = Record<string, unknown>
function object(value: unknown): Json { return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {} }
function count(value: unknown): number | undefined { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined }
function text(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value : undefined }

/** Read-only handle; queries project usage fields only, never transcript bodies. */
export class OpenCodeUsageSource {
  private database: DatabaseSync
  private tables: Set<string>
  constructor(readonly path: string) {
    this.database = new DatabaseSync(path, { readOnly: true })
    try {
      this.database.exec('PRAGMA busy_timeout=100')
      this.tables = new Set((this.database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(row => row.name))
    } catch (error) { this.database.close(); throw error }
  }
  close(): void { this.database.close() }

  sessions(): SessionRow[] {
    const modern = this.tables.has('session_v2') && this.tables.has('session_message')
    let migrated = false
    if (modern && this.tables.has('kv')) {
      const row = this.database.prepare("SELECT value FROM kv WHERE key='migration.v1-v2'").get() as { value?: unknown } | undefined
      try { migrated = object(JSON.parse(String(row?.value))).phase === 'completed' } catch { /* migration not complete */ }
    }
    const rows = modern ? this.database.prepare('SELECT id, directory, time_updated, 1 AS v2 FROM session_v2').all() as unknown as SessionRow[] : []
    if (this.tables.has('session') && !migrated) {
      rows.push(...this.database.prepare(`SELECT id, directory, time_updated, 0 AS v2 FROM session${modern ? ' WHERE id NOT IN (SELECT id FROM session_v2)' : ''}`).all() as unknown as SessionRow[])
    }
    return rows
  }

  read(session: SessionRow, now: number, mode: 'events' | 'cumulative' = 'events', checkpoint?: UsageSourceCheckpoint) {
    this.database.exec('BEGIN')
    try {
      // Project only small accounting fields from potentially multi-MB messages.
      const fields = "json_object('tokens',json_extract(data,'$.tokens'),'modelID',json_extract(data,'$.modelID'),'model',json_extract(data,'$.model'),'time',json_extract(data,'$.time'))"
      const rows = this.database.prepare(session.v2
        ? `SELECT id,time_updated,${fields} AS data FROM session_message WHERE session_id=? AND type IN ('assistant','compaction') AND json_valid(data) ORDER BY seq`
        : `SELECT id,time_updated,${fields} AS data FROM message WHERE session_id=? AND json_valid(data) AND json_extract(data,'$.role')='assistant' ORDER BY time_created,id`)
        .all(session.id) as unknown as MessageRow[]
      const events: UsageEvent[] = []
      let latest: UsageEvent | undefined
      let lastModel: string | undefined
      let issue: string | undefined
      for (const row of rows) {
        const message = object(JSON.parse(row.data))
        const model = text(message.modelID) ?? text(object(message.model).id) ?? lastModel
        lastModel = model
        const time = object(message.time)
        // Counts change in place while streaming. Retry unfinished messages next pass.
        const completed = count(time.completed)
        if (!completed) continue
        const tokens = object(message.tokens)
        if (!Object.keys(tokens).length) continue
        const reasoning = tokens.reasoning === undefined ? 0 : count(tokens.reasoning)
        const output = count(tokens.output)
        const cache = object(tokens.cache)
        const usage = usageTokens(tokens.input, output === undefined || reasoning === undefined ? undefined : output + reasoning, cache.read, cache.write)
        if (!usage || !row.id) { issue = 'invalid-event'; continue }
        if (!usage.totalTokens) continue
        const event = { ...usage, id: row.id, at: completed, model }
        events.push(event)
        if (!latest || completed >= (latest.at ?? 0)) latest = event
      }
      const totals: UsageTokens = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      for (const event of events) {
        totals.inputTokens += event.inputTokens; totals.outputTokens += event.outputTokens; totals.totalTokens += event.totalTokens
        if (event.cacheReadTokens !== undefined) totals.cacheReadTokens = (totals.cacheReadTokens ?? 0) + event.cacheReadTokens
        if (event.cacheWriteTokens !== undefined) totals.cacheWriteTokens = (totals.cacheWriteTokens ?? 0) + event.cacheWriteTokens
      }
      let observation: UsageObservation = { engine: 'opencode', namespace: this.path, sessionId: session.id, collectedAt: now, mode: 'events', events, issue }
      if (mode === 'cumulative') {
        // Respect the ledger's existing mode lock and native baseline. No historical replay.
        const source = session.v2 ? undefined : this.database.prepare('SELECT * FROM session WHERE id=?').get(session.id)
        const native = source ? usageTokens(source.tokens_input, source.tokens_output, source.tokens_cache_read, source.tokens_cache_write) : undefined
        const mixed = checkpoint && events.some(event => (event.at ?? 0) > checkpoint.updatedAt && event.model !== latest?.model)
        observation = { ...cumulativeUsage('opencode', this.path, session.id, native ?? totals, mixed ? undefined : latest?.model), collectedAt: now }
        const info = statSync(this.path)
        observation.sourceIdentity = JSON.stringify([info.dev, info.ino, info.birthtimeMs])
      }
      this.database.exec('COMMIT')
      return { observation, totals, latest, directory: session.directory }
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  }
}
