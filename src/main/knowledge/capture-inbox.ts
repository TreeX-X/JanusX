// Note: persist evidence before asynchronous extraction — see .agents/notes/2026-10-05-hook-evidence-extraction--a61e849c.md
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CaptureObservationInput, Observation } from '../../shared/knowledge'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'
import { knowledgeRootPath } from './constants'
import { knowledgeObservationService, type ObservationCaptureContext } from './observation-service'
import { redactHighConfidenceSecrets } from '@janus-agent/agent-core'

export interface CaptureEntry { input: CaptureObservationInput; context: ObservationCaptureContext }
interface PendingCapture { id: string; entries: CaptureEntry[]; attempts: number; nextAttemptAt: number; error?: string }

/** Single local outbox. Acknowledgement follows observation persistence; replay uses source event IDs. */
export class CaptureInbox {
  private readonly queue = new SerialQueue()
  constructor(private readonly capture: (input: CaptureObservationInput, context: ObservationCaptureContext) => Promise<Observation> =
    (input, context) => knowledgeObservationService.capture(input, context)) {}
  private path() { return join(knowledgeRootPath(), 'processing', 'capture-inbox.json') }
  private async read(): Promise<PendingCapture[]> {
    try {
      const rows: unknown = JSON.parse(await readFile(this.path(), 'utf8'))
      if (!Array.isArray(rows) || rows.some(row => !row || typeof row.id !== 'string' || !Array.isArray(row.entries)
        || row.entries.some((entry: CaptureEntry) => !entry.context?.sourceEventId || !entry.input?.workspacePath)
        || !Number.isInteger(row.attempts) || typeof row.nextAttemptAt !== 'number')) throw new Error('invalid-capture-inbox')
      return rows
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  }
  private write(rows: PendingCapture[]) { return writeFileAtomic(this.path(), JSON.stringify(rows) + '\n') }
  async submit(entries: CaptureEntry[]): Promise<Observation[]> {
    if (!entries.length) return []
    if (entries.some(entry => !entry.context.sourceEventId)) throw new Error('capture-requires-event-id')
    // Scrub all nested fields before even the recovery file is written.
    const safe = JSON.parse(redactHighConfidenceSecrets(JSON.stringify(entries)).text) as CaptureEntry[]
    const id = createHash('sha256').update(JSON.stringify(safe.map(entry => [entry.input.workspaceId, entry.context.sourceEventId]))).digest('hex')
    return this.queue.run(async () => {
      const rows = await this.read()
      let row = rows.find(item => item.id === id)
      if (!row) { row = { id, entries: safe, attempts: 0, nextAttemptAt: 0 }; rows.push(row); await this.write(rows) }
      return this.deliver(rows, row)
    })
  }
  private async deliver(rows: PendingCapture[], row: PendingCapture): Promise<Observation[]> {
    try {
      const results: Observation[] = []
      for (const entry of row.entries) results.push(await this.capture(entry.input, entry.context))
      await this.write(rows.filter(item => item.id !== row.id))
      return results
    } catch (error) {
      row.attempts++
      row.nextAttemptAt = Date.now() + Math.min(300000, 1000 * 2 ** Math.min(row.attempts, 8))
      row.error = redactHighConfidenceSecrets(error instanceof Error ? error.message : String(error)).text.slice(0, 300)
      await this.write(rows.map(item => item.id === row.id ? row : item))
      throw error
    }
  }
  async drain(): Promise<void> {
    await this.queue.run(async () => {
      for (const row of (await this.read()).filter(item => item.nextAttemptAt <= Date.now()).slice(0, 20)) {
        try { await this.deliver(await this.read(), row) } catch { /* Persisted error and retry deadline remain visible. */ }
      }
    })
  }
  async status(workspaceId?: string): Promise<{ batches: number; events: number; lastError?: string }> {
    const rows = (await this.read()).filter(row => !workspaceId || row.entries.some(entry => entry.input.workspaceId === workspaceId))
    return { batches: rows.length, events: rows.reduce((count, row) => count + row.entries.length, 0),
      lastError: [...rows].reverse().find(row => row.error)?.error }
  }
}
export const knowledgeCaptureInbox = new CaptureInbox()
