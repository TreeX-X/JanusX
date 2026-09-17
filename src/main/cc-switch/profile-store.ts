import { app } from 'electron'
import { randomUUID } from 'crypto'
import { readFile, rename } from 'fs/promises'
import { join } from 'path'
import type { CcSwitchProfile, CcSwitchProfileInput } from '../../shared/ipc/cc-switch'
import { validateCcSwitchProfile } from '../../shared/ipc/cc-switch'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'

const STORE_VERSION = '1.0.0'

interface CcSwitchProfileDocument {
  version: string
  profiles: Record<string, CcSwitchProfile>
  activeProfileId: string | null
}

function emptyDocument(): CcSwitchProfileDocument {
  return { version: STORE_VERSION, profiles: {}, activeProfileId: null }
}

function sortProfiles(document: CcSwitchProfileDocument): CcSwitchProfile[] {
  return Object.values(document.profiles).sort((a, b) => a.createdAt - b.createdAt)
}

export class CcSwitchProfileStore {
  private readonly storePath: string
  private document: CcSwitchProfileDocument | null = null
  private readonly queue = new SerialQueue()

  constructor(userDataDir?: string) {
    const root = userDataDir ?? join(app.getPath('userData'), 'janusx')
    this.storePath = join(root, 'cc-switch-profiles.json')
  }

  private async load(): Promise<CcSwitchProfileDocument> {
    try {
      const raw = await readFile(this.storePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<CcSwitchProfileDocument>
      this.document = {
        version: STORE_VERSION,
        profiles: parsed.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : {},
        activeProfileId: typeof parsed.activeProfileId === 'string' ? parsed.activeProfileId : null,
      }
    } catch (error) {
      // 损坏先备份再重建，绝不让默认文档覆盖用户画像。
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        try {
          await rename(this.storePath, `${this.storePath}.corrupt-${Date.now()}`)
        } catch {
          /* 备份失败不阻塞启动 */
        }
      }
      this.document = emptyDocument()
      await this.persist()
    }
    if (this.document.activeProfileId && !this.document.profiles[this.document.activeProfileId]) {
      this.document.activeProfileId = null
    }
    return this.document
  }

  private async persist(): Promise<void> {
    if (!this.document) return
    await writeFileAtomic(this.storePath, `${JSON.stringify(this.document, null, 2)}\n`)
  }

  private async get(): Promise<CcSwitchProfileDocument> {
    if (!this.document) this.document = await this.load()
    return this.document
  }

  async list(): Promise<{ profiles: CcSwitchProfile[]; activeProfileId: string | null }> {
    const document = await this.get()
    return { profiles: sortProfiles(document), activeProfileId: document.activeProfileId }
  }

  async getProfile(id: string): Promise<CcSwitchProfile | null> {
    const document = await this.get()
    return document.profiles[id] ?? null
  }

  async save(input: CcSwitchProfileInput): Promise<CcSwitchProfile> {
    const failure = validateCcSwitchProfile(input)
    if (failure) throw new Error(failure)
    return this.queue.run(async () => {
      const document = await this.get()
      const now = Date.now()
      const id = input.id && document.profiles[input.id] ? input.id : `p-${now.toString(36)}-${randomUUID().slice(0, 8)}`
      const previous = document.profiles[id]
      const profile: CcSwitchProfile = {
        id,
        name: input.name.trim(),
        baseURL: input.baseURL.trim().replace(/\/+$/, ''),
        authToken: input.authToken.trim(),
        model: input.model?.trim() ? input.model.trim() : undefined,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      }
      document.profiles[id] = profile
      if (!document.activeProfileId) document.activeProfileId = id
      await this.persist()
      return profile
    })
  }

  async remove(id: string): Promise<void> {
    await this.queue.run(async () => {
      const document = await this.get()
      delete document.profiles[id]
      // 删的是激活画像就诚实地置空，不擅自指定继承者。
      if (document.activeProfileId === id) document.activeProfileId = null
      await this.persist()
    })
  }

  async setActive(id: string | null): Promise<void> {
    await this.queue.run(async () => {
      const document = await this.get()
      if (id !== null && !document.profiles[id]) throw new Error('Profile not found.')
      document.activeProfileId = id
      await this.persist()
    })
  }
}

export const ccSwitchProfileStore = new CcSwitchProfileStore()
