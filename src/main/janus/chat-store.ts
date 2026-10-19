import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { setImmediate as yieldToEventLoop } from 'node:timers/promises'
import { app } from 'electron'
import { SerialQueue } from '../lib/atomic-file'
import {
  normalizeJanusChatSnapshot,
  type JanusChatStorageSnapshot,
} from '../../shared/ipc/janus-chat'

interface JanusChatJournalEntry {
  type: 'snapshot'
  version: 1
  id: string
  parentId: string | null
  createdAt: number
  snapshot: JanusChatStorageSnapshot
}

export interface JanusChatStorePaths {
  journalPath: string
  legacyPath: string
}

function defaultPaths(): JanusChatStorePaths {
  const directory = join(app.getPath('userData'), 'janusx')
  return {
    journalPath: join(directory, 'chat-conversations.jsonl'),
    legacyPath: join(directory, 'chat-conversations.json'),
  }
}

function normalizeEntry(value: unknown): JanusChatJournalEntry | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const snapshot = normalizeJanusChatSnapshot(source.snapshot)
  if (
    source.type !== 'snapshot'
    || source.version !== 1
    || typeof source.id !== 'string'
    || (source.parentId !== null && typeof source.parentId !== 'string')
    || typeof source.createdAt !== 'number'
    || !Number.isFinite(source.createdAt)
    || !snapshot
  ) return null
  return {
    type: 'snapshot',
    version: 1,
    id: source.id,
    parentId: source.parentId,
    createdAt: source.createdAt,
    snapshot,
  }
}

export class JanusChatStore {
  private readonly writeQueue = new SerialQueue()
  private headId: string | null | undefined

  constructor(private readonly paths: JanusChatStorePaths = defaultPaths()) {}

  load(): Promise<JanusChatStorageSnapshot | null> {
    return this.writeQueue.run(async () => {
      const head = await this.readJournalHead()
      if (head) {
        this.headId = head.id
        return head.snapshot
      }
      this.headId = null
      try {
        return normalizeJanusChatSnapshot(JSON.parse(await readFile(this.paths.legacyPath, 'utf8')))
      } catch {
        return null
      }
    })
  }

  save(snapshot: JanusChatStorageSnapshot): Promise<void> {
    const normalized = normalizeJanusChatSnapshot(snapshot)
    if (!normalized) return Promise.reject(new Error('Invalid Janus Chat snapshot'))
    return this.writeQueue.run(async () => {
      if (this.headId === undefined) this.headId = (await this.readJournalHead())?.id ?? null
      const entry: JanusChatJournalEntry = {
        type: 'snapshot',
        version: 1,
        id: randomUUID(),
        parentId: this.headId,
        createdAt: Date.now(),
        snapshot: normalized,
      }
      await mkdir(dirname(this.paths.journalPath), { recursive: true })
      await appendFile(this.paths.journalPath, `${JSON.stringify(entry)}\n`, 'utf8')
      this.headId = entry.id
    })
  }

  private async readJournalHead(): Promise<JanusChatJournalEntry | null> {
    let head: JanusChatJournalEntry | null = null
    const knownIds = new Set<string>()
    const accept = (line: string): void => {
      if (!line.trim()) return
      let entry: JanusChatJournalEntry | null = null
      try { entry = normalizeEntry(JSON.parse(line)) } catch { return }
      if (!entry || knownIds.has(entry.id)) return
      if (entry.parentId !== null && !knownIds.has(entry.parentId)) return
      head = entry
      knownIds.add(entry.id)
    }
    // Keep one snapshot plus lineage IDs, rather than every historical copy.
    // Fragments avoid repeatedly copying an unusually long JSONL row.
    let pending: string[] = []
    try {
      const stream = createReadStream(this.paths.journalPath, { encoding: 'utf8', highWaterMark: 256 * 1024 })
      for await (const chunk of stream) {
        const text = chunk as string
        let start = 0
        for (let end = text.indexOf('\n', start); end >= 0; end = text.indexOf('\n', start)) {
          const part = text.slice(start, end)
          accept(pending.length ? pending.join('') + part : part)
          pending = []
          start = end + 1
        }
        if (start < text.length) pending.push(text.slice(start))
        // Parsing still runs on main; yield between bounded input batches.
        await yieldToEventLoop()
      }
      if (pending.length) accept(pending.join(''))
      return head
    } catch {
      // As with the former readFile path, an unreadable journal uses legacy data.
      return null
    }
  }
}

export const janusChatStore = new JanusChatStore()
