import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { SerialQueue } from '../lib/atomic-file'
import type { RoundtableSession } from '../../shared/ipc/janus-roundtable'

export interface RoundtableStorePaths { journalPath: string }
function defaultPaths(): RoundtableStorePaths {
  return { journalPath: join(app.getPath('userData'), 'janusx', 'roundtable-sessions.jsonl') }
}
export class RoundtableStore {
  private readonly queue = new SerialQueue()
  constructor(private readonly paths: RoundtableStorePaths = defaultPaths()) {}
  list(): Promise<RoundtableSession[]> { return this.queue.run(() => this.read()) }
  get(id: string): Promise<RoundtableSession | null> { return this.queue.run(async () => (await this.read()).find(s => s.id === id) ?? null) }
  save(session: RoundtableSession): Promise<void> {
    return this.queue.run(async () => {
      const sessions = await this.read()
      const next = sessions.filter(item => item.id !== session.id)
      next.push(session)
      await mkdir(dirname(this.paths.journalPath), { recursive: true })
      await appendFile(this.paths.journalPath, `${JSON.stringify({ type: 'snapshot', id: randomUUID(), session })}\n`, 'utf8')
    })
  }
  private async read(): Promise<RoundtableSession[]> {
    let content: string
    try { content = await readFile(this.paths.journalPath, 'utf8') } catch { return [] }
    const latest = new Map<string, RoundtableSession>()
    for (const line of content.split('\n')) {
      try {
        const value = JSON.parse(line) as { type?: string; session?: RoundtableSession }
        if (value.type === 'snapshot' && value.session?.id) latest.set(value.session.id, value.session)
      } catch { /* ignore corrupt journal lines */ }
    }
    return [...latest.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }
}
export const roundtableStore = new RoundtableStore()

