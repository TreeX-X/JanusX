import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { dirname } from 'path'
import type { CompanionCommand, CompanionRequestContext, CompanionResult } from './contracts'

export interface CompanionEventIdentity {
  provider: CompanionRequestContext['provider']
  eventId: string
  operatorOpenId: string
  chatId: string
  threadId?: string
  command: CompanionCommand['type']
  commandFingerprint: string
}

interface EventReceipt {
  identity: CompanionEventIdentity
  expiresAt: number
  result: CompanionResult
}

interface ActionReceipt { jti: string; expiresAt: number }
interface DedupeState { version: 1; events: EventReceipt[]; actions: ActionReceipt[] }

const INDETERMINATE_RESULT: CompanionResult = {
  ok: false,
  code: 'execution-failed',
  message: 'A previous delivery has an indeterminate outcome and will not be repeated',
}

export class CompanionDedupe {
  private readonly events = new Map<string, EventReceipt>()
  private readonly actions = new Map<string, number>()
  private readonly pendingEvents = new Map<string, Promise<CompanionResult>>()
  private readonly ready: Promise<void>
  private queue = Promise.resolve()

  constructor(
    private readonly filePath: string,
    private readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {
    this.ready = this.load()
  }

  async runEvent(
    identity: CompanionEventIdentity,
    operation: () => Promise<CompanionResult>,
    collision: () => Promise<CompanionResult>,
  ): Promise<CompanionResult> {
    await this.ready
    const key = eventKey(identity)
    const reservation = await this.exclusive(async () => {
      await this.prune()
      const existing = this.events.get(key)
      if (existing && !scopesMatch(existing.identity, identity)) return { kind: 'collision' as const }
      const pending = this.pendingEvents.get(key)
      if (pending) return { kind: 'pending' as const, pending }
      if (existing) return { kind: 'receipt' as const, result: { ...existing.result, replayed: true } }

      this.events.set(key, {
        identity,
        expiresAt: this.now() + this.ttlMs,
        result: INDETERMINATE_RESULT,
      })
      await this.persist()
      const execution = operation()
      this.pendingEvents.set(key, execution)
      return { kind: 'started' as const, execution }
    })

    if (reservation.kind === 'receipt') return reservation.result
    if (reservation.kind === 'collision') return collision()
    if (reservation.kind === 'pending') return { ...(await reservation.pending), replayed: true }

    const execution = reservation.execution
    try {
      const result = await execution
      await this.exclusive(async () => {
        const receipt = this.events.get(key)
        if (receipt) receipt.result = result
        await this.persist()
      })
      return result
    } finally {
      this.pendingEvents.delete(key)
    }
  }

  async consumeAction(jti: string, expiresAt: number): Promise<boolean> {
    await this.ready
    return this.exclusive(async () => {
      await this.prune()
      if (this.actions.has(jti)) return false
      this.actions.set(jti, expiresAt)
      await this.persist()
      return true
    })
  }

  private async load(): Promise<void> {
    try {
      const state = JSON.parse(await readFile(this.filePath, 'utf8')) as DedupeState
      if (state.version !== 1 || !Array.isArray(state.events) || !Array.isArray(state.actions)) {
        throw new Error('Unsupported Companion dedupe state')
      }
      for (const receipt of state.events) this.events.set(eventKey(receipt.identity), receipt)
      for (const receipt of state.actions) this.actions.set(receipt.jti, receipt.expiresAt)
      await this.exclusive(() => this.prune())
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  private async prune(): Promise<void> {
    const now = this.now()
    let changed = false
    for (const [key, receipt] of this.events) {
      if (receipt.expiresAt <= now) {
        this.events.delete(key)
        changed = true
      }
    }
    for (const [key, expiresAt] of this.actions) {
      if (expiresAt <= now) {
        this.actions.delete(key)
        changed = true
      }
    }
    if (changed) await this.persist()
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
    const state: DedupeState = {
      version: 1,
      events: [...this.events.values()],
      actions: [...this.actions].map(([jti, expiresAt]) => ({ jti, expiresAt })),
    }
    await writeFile(temporaryPath, JSON.stringify(state), { mode: 0o600 })
    await rename(temporaryPath, this.filePath)
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }
}

function eventKey(identity: CompanionEventIdentity): string {
  return `${identity.provider}:${identity.eventId}`
}

function scopesMatch(left: CompanionEventIdentity, right: CompanionEventIdentity): boolean {
  return left.provider === right.provider
    && left.eventId === right.eventId
    && left.operatorOpenId === right.operatorOpenId
    && left.chatId === right.chatId
    && (left.threadId ?? '') === (right.threadId ?? '')
    && left.command === right.command
    && left.commandFingerprint === right.commandFingerprint
}
