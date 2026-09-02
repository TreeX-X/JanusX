import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { app } from 'electron'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { RoundtableEventEnvelope, RoundtableState } from '../../shared/roundtable/events'

export interface RoundtableStorePaths { journalPath: string }
function defaultPaths(): RoundtableStorePaths {
  const userData = typeof app?.getPath === 'function' ? app.getPath('userData') : process.cwd()
  return { journalPath: join(userData, 'janusx', 'roundtable-events.jsonl') }
}
export class RoundtableStore {
  constructor(private readonly paths: RoundtableStorePaths = defaultPaths()) {}
  async append(sessionId: string, event: RoundtableEventEnvelope, state: RoundtableState): Promise<void> {
    await mkdir(dirname(this.paths.journalPath), { recursive: true })
    await appendFile(this.paths.journalPath, `${JSON.stringify({ id: randomUUID(), sessionId, event, state })}\n`, 'utf8')
  }
  async load(sessionId: string): Promise<{ events: RoundtableEventEnvelope[]; state: RoundtableState } | null> {
    let content: string
    try { content = await readFile(this.paths.journalPath, 'utf8') } catch { return null }
    let latest: { events: RoundtableEventEnvelope[]; state: RoundtableState } | null = null
    for (const line of content.split('\n')) {
      try {
        const value = JSON.parse(line) as { sessionId?: string; event?: RoundtableEventEnvelope; state?: RoundtableState }
        if (value.sessionId !== sessionId || !value.event || !value.state) continue
        latest ??= { events: [], state: value.state }
        latest.events.push(value.event); latest.state = value.state
      } catch { /* ignore corrupt journal lines */ }
    }
    return latest
  }
}
export const roundtableStore = new RoundtableStore()
