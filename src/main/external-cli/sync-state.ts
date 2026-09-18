import { app } from 'electron'
import { readFile, rename } from 'fs/promises'
import { join } from 'path'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'

const STORE_VERSION = '1.0.0'

/** 某外部 CLI 最近一次同步的来源画像快照；只记来源标识，不存密钥。 */
export interface ClaudeSyncRecord {
  providerId: string
  providerName: string
  baseURL: string
  model?: string
  syncedAt: number
  backupPath: string | null
}

export interface ExternalCliSyncState {
  claude: ClaudeSyncRecord | null
}

interface SyncStateDocument {
  version: string
  claude: ClaudeSyncRecord | null
}

function emptyDocument(): SyncStateDocument {
  return { version: STORE_VERSION, claude: null }
}

function isSyncRecord(value: unknown): value is ClaudeSyncRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.providerId === 'string' &&
    typeof record.providerName === 'string' &&
    typeof record.baseURL === 'string' &&
    typeof record.syncedAt === 'number'
}

export class ExternalCliSyncStateStore {
  private readonly storePath: string
  private readonly legacyPath: string
  private document: SyncStateDocument | null = null
  private readonly queue = new SerialQueue()

  constructor(userDataDir?: string) {
    const root = userDataDir ?? join(app.getPath('userData'), 'janusx')
    this.storePath = join(root, 'external-cli-sync.json')
    this.legacyPath = join(root, 'cc-switch-sync.json')
  }

  private async load(): Promise<SyncStateDocument> {
    for (const candidate of [this.storePath, this.legacyPath]) {
      try {
        const raw = await readFile(candidate, 'utf-8')
        const parsed = JSON.parse(raw) as Partial<SyncStateDocument>
        this.document = {
          version: STORE_VERSION,
          claude: parsed.claude && isSyncRecord(parsed.claude) ? parsed.claude : null,
        }
        // 旧名文件仅做一次性承接：读到即落到新名，下次不再碰旧文件。
        await this.persist()
        return this.document
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          try {
            await rename(candidate, `${candidate}.corrupt-${Date.now()}`)
          } catch {
            /* 备份失败不阻塞启动 */
          }
          this.document = emptyDocument()
          await this.persist()
          return this.document
        }
      }
    }
    this.document = emptyDocument()
    await this.persist()
    return this.document
  }

  private async persist(): Promise<void> {
    if (!this.document) return
    await writeFileAtomic(this.storePath, `${JSON.stringify(this.document, null, 2)}\n`)
  }

  async get(): Promise<ExternalCliSyncState> {
    if (!this.document) this.document = await this.load()
    return { claude: this.document.claude }
  }

  async record(record: ClaudeSyncRecord): Promise<void> {
    await this.queue.run(async () => {
      if (!this.document) this.document = await this.load()
      this.document.claude = record
      await this.persist()
    })
  }

  async clear(): Promise<void> {
    await this.queue.run(async () => {
      if (!this.document) this.document = await this.load()
      this.document.claude = null
      await this.persist()
    })
  }
}

export const externalCliSyncStateStore = new ExternalCliSyncStateStore()
