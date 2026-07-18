import { randomUUID } from 'crypto'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname } from 'path'
import type { CompanionProvider, CompanionRequestContext } from './contracts'

export interface CompanionBinding {
  provider: CompanionProvider
  chatId: string
  threadId?: string
  terminalId: string
  createdBy: string
  createdAt: number
  expiresAt: number
}

export type BindingResolution =
  | { status: 'active'; binding: CompanionBinding }
  | { status: 'expired'; binding: CompanionBinding }
  | { status: 'missing' }

function scopeKey(scope: Pick<CompanionRequestContext, 'provider' | 'chatId' | 'threadId'>): string {
  return `${scope.provider}\u0000${scope.chatId}\u0000${scope.threadId ?? ''}`
}

export class CompanionBindingStore {
  private readonly bindings = new Map<string, CompanionBinding>()
  private readonly ready: Promise<void>
  private queue = Promise.resolve()

  constructor(
    private readonly filePath: string,
    private readonly now: () => number = Date.now,
  ) {
    this.ready = this.load()
  }

  async bind(binding: CompanionBinding): Promise<void> {
    await this.ready
    await this.exclusive(async () => {
      this.bindings.set(scopeKey(binding), binding)
      await this.persist()
    })
  }

  async get(scope: Pick<CompanionRequestContext, 'provider' | 'chatId' | 'threadId'>): Promise<CompanionBinding | null> {
    const resolution = await this.resolve(scope)
    return resolution.status === 'active' ? resolution.binding : null
  }

  async resolve(scope: Pick<CompanionRequestContext, 'provider' | 'chatId' | 'threadId'>): Promise<BindingResolution> {
    await this.ready
    return this.exclusive(async () => {
      const key = scopeKey(scope)
      const binding = this.bindings.get(key)
      if (!binding) return { status: 'missing' }
      if (binding.expiresAt > this.now()) return { status: 'active', binding }
      this.bindings.delete(key)
      await this.persist()
      return { status: 'expired', binding }
    })
  }

  async unbind(scope: Pick<CompanionRequestContext, 'provider' | 'chatId' | 'threadId'>): Promise<CompanionBinding | null> {
    await this.ready
    return this.exclusive(async () => {
      const key = scopeKey(scope)
      const binding = this.bindings.get(key) ?? null
      if (binding) {
        this.bindings.delete(key)
        await this.persist()
      }
      return binding
    })
  }

  private async load(): Promise<void> {
    try {
      const values = JSON.parse(await readFile(this.filePath, 'utf8')) as CompanionBinding[]
      for (const binding of values) this.bindings.set(scopeKey(binding), binding)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, JSON.stringify([...this.bindings.values()]), { mode: 0o600 })
    await rename(temporaryPath, this.filePath)
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }
}
