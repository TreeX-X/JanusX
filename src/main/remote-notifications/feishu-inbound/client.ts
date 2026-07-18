import type { CompanionGateway } from '../../companion/gateway'
import { normalizeFeishuCardAction, normalizeFeishuMessage } from './normalize'
import { FeishuInboundRouter } from './router'
import type { FeishuConnectionStatus, FeishuInboundChannel } from './types'

export class FeishuInboundClient {
  private readonly disposers: Array<() => void> = []
  private status: FeishuConnectionStatus = { state: 'idle' }

  constructor(
    private readonly channel: FeishuInboundChannel,
    gateway: Pick<CompanionGateway, 'execute'>,
    private readonly onStatus?: (status: FeishuConnectionStatus) => void,
    groupPromptPrefix = '/p',
  ) {
    const router = new FeishuInboundRouter(gateway, channel.receipts, groupPromptPrefix)
    try {
      this.addDisposer(channel.onMessage(async (raw) => {
        const event = normalizeFeishuMessage(raw)
        if (event) {
          await router.handle(event)
        } else {
          const identity = extractReplyIdentity(raw)
          await router.rejectMalformed(identity?.chatId, identity?.messageId)
        }
      }))
      this.addDisposer(channel.onCardAction(async (raw) => {
        const event = normalizeFeishuCardAction(raw)
        if (event) {
          await router.handle(event)
        } else {
          const identity = extractReplyIdentity(raw)
          await router.rejectMalformed(identity?.chatId, identity?.messageId)
        }
      }))
      this.addDisposer(channel.onError((error) => this.setStatus('failed', rawError(error))))
      this.addDisposer(channel.onReconnecting(() => this.setStatus('reconnecting')))
      this.addDisposer(channel.onReconnected(() => this.setStatus('connected')))
    } catch (error) {
      this.disposeListeners()
      throw error
    }
  }

  async start(): Promise<void> {
    this.setStatus('connecting')
    try {
      await this.channel.connect()
      this.setStatus('connected')
    } catch (error) {
      this.setStatus('failed', rawError(error))
      throw error
    }
  }

  async stop(): Promise<void> {
    this.disposeListeners()
    await this.channel.disconnect().catch(() => undefined)
    this.setStatus('idle')
  }

  getStatus(): FeishuConnectionStatus {
    return { ...this.status }
  }

  private setStatus(state: FeishuConnectionStatus['state'], error?: string): void {
    this.status = { state, ...(error ? { error } : {}) }
    this.onStatus?.({ ...this.status })
  }

  private addDisposer(dispose: () => void): void {
    this.disposers.push(dispose)
  }

  private disposeListeners(): void {
    for (const dispose of this.disposers.splice(0).reverse()) {
      try { dispose() } catch { /* best-effort listener cleanup */ }
    }
  }
}

function rawError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function extractReplyIdentity(raw: unknown): { chatId: string; messageId: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const chatId = boundedIdentity(value.chatId)
  const messageId = boundedIdentity(value.messageId)
  return chatId && messageId ? { chatId, messageId } : null
}

function boundedIdentity(value: unknown): string | null {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && !/[\x00-\x20\x7f]/.test(value)
    ? value
    : null
}
