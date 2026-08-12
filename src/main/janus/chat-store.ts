import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
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
      const entries = await this.readJournal()
      const head = entries.at(-1)
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
      if (this.headId === undefined) this.headId = (await this.readJournal()).at(-1)?.id ?? null
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

  private async readJournal(): Promise<JanusChatJournalEntry[]> {
    let content: string
    try { content = await readFile(this.paths.journalPath, 'utf8') }
    catch { return [] }
    const entries: JanusChatJournalEntry[] = []
    const knownIds = new Set<string>()
    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      let entry: JanusChatJournalEntry | null = null
      try { entry = normalizeEntry(JSON.parse(line)) } catch { continue }
      if (!entry || knownIds.has(entry.id)) continue
      if (entry.parentId !== null && !knownIds.has(entry.parentId)) continue
      entries.push(entry)
      knownIds.add(entry.id)
    }
    return entries
  }
}

export const janusChatStore = new JanusChatStore()
