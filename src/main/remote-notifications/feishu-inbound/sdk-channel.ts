import {
  createLarkChannel,
  LoggerLevel,
  type CardActionEvent,
  type LarkChannel,
  type NormalizedMessage,
} from '@larksuiteoapi/node-sdk'
import type { FeishuInboundChannel } from './types'

/** 0 means drop almost all messages in SDK isStale(); keep a positive window. */
const STALE_MESSAGE_WINDOW_MS = 30 * 60 * 1000

export interface FeishuSdkChannelConfig {
  appId: string
  appSecret: string
}

export function createFeishuSdkChannel(config: FeishuSdkChannelConfig): FeishuInboundChannel {
  const channel = createLarkChannel({
    appId: config.appId,
    appSecret: config.appSecret,
    transport: 'websocket',
    includeRawEvent: false,
    policy: { dmMode: 'open', requireMention: false, respondToMentionAll: false },
    safety: { dedup: { ttl: 0 }, staleMessageWindowMs: STALE_MESSAGE_WINDOW_MS },
    loggerLevel: LoggerLevel.warn,
    handshakeTimeoutMs: 10_000,
    source: 'janusx-companion',
  })
  return new LarkChannelAdapter(channel)
}

class LarkChannelAdapter implements FeishuInboundChannel {
  readonly receipts = {
    send: async (chatId: string, messageId: string, text: string): Promise<void> => {
      await this.channel.send(chatId, { text }, { replyTo: messageId })
    },
    sendCard: async (chatId: string, messageId: string, card: Record<string, unknown>): Promise<void> => {
      await this.channel.send(chatId, { card }, { replyTo: messageId })
    },
  }

  constructor(private readonly channel: LarkChannel) {}

  onMessage(handler: (event: unknown) => void | Promise<void>): () => void {
    return this.channel.on('message', (event: NormalizedMessage) => handler(event))
  }

  onCardAction(handler: (event: unknown) => void | Promise<void>): () => void {
    return this.channel.on('cardAction', (event: CardActionEvent) => handler(event))
  }

  onError(handler: (error: unknown) => void): () => void {
    return this.channel.on('error', handler)
  }

  onReconnecting(handler: () => void): () => void {
    return this.channel.on('reconnecting', handler)
  }

  onReconnected(handler: () => void): () => void {
    return this.channel.on('reconnected', handler)
  }

  connect(): Promise<void> {
    return this.channel.connect()
  }

  disconnect(): Promise<void> {
    return this.channel.disconnect()
  }

  getStatus(): ReturnType<NonNullable<FeishuInboundChannel['getStatus']>> {
    const state = this.channel.getConnectionStatus()?.state ?? 'idle'
    return { state }
  }
}
