import { app } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'
import {
  normalizeJanusChatSnapshot,
  type JanusChatStorageSnapshot,
} from '../../shared/ipc/janus-chat'

class JanusChatStore {
  private readonly path = join(app.getPath('userData'), 'janusx', 'chat-conversations.json')
  private readonly writeQueue = new SerialQueue()

  async load(): Promise<JanusChatStorageSnapshot | null> {
    try {
      return normalizeJanusChatSnapshot(JSON.parse(await readFile(this.path, 'utf8')))
    } catch {
      return null
    }
  }

  async save(snapshot: JanusChatStorageSnapshot): Promise<void> {
    const normalized = normalizeJanusChatSnapshot(snapshot)
    if (!normalized) throw new Error('Invalid Janus Chat snapshot')
    await this.writeQueue.run(() => writeFileAtomic(this.path, JSON.stringify(normalized, null, 2)))
  }
}

export const janusChatStore = new JanusChatStore()
