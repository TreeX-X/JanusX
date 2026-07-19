import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createLarkChannel } = vi.hoisted(() => ({ createLarkChannel: vi.fn() }))
vi.mock('@larksuiteoapi/node-sdk', () => ({
  createLarkChannel,
  LoggerLevel: { warn: 'warn' },
}))

import { createFeishuSdkChannel } from '../../src/main/remote-notifications/feishu-inbound/sdk-channel'

describe('Feishu SDK channel adapter', () => {
  beforeEach(() => createLarkChannel.mockReset())

  it('maps SDK construction, events, receipts, lifecycle, and status', async () => {
    const handlers = new Map<string, (event?: unknown) => unknown>()
    const sdkChannel = {
      on: vi.fn((name: string, handler: (event?: unknown) => unknown) => {
        handlers.set(name, handler)
        return vi.fn()
      }),
      send: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getConnectionStatus: vi.fn(() => ({ state: 'reconnecting', reconnectAttempts: 2 })),
    }
    createLarkChannel.mockReturnValue(sdkChannel)

    const channel = createFeishuSdkChannel({ appId: ' app-id ', appSecret: 'secret' })
    expect(createLarkChannel).toHaveBeenCalledWith({
      appId: ' app-id ', appSecret: 'secret', transport: 'websocket', includeRawEvent: false,
      policy: { dmMode: 'open', requireMention: false, respondToMentionAll: false },
      safety: { dedup: { ttl: 0 }, staleMessageWindowMs: 30 * 60 * 1000 }, loggerLevel: 'warn',
      handshakeTimeoutMs: 10_000, source: 'janusx-companion',
    })

    const onMessage = vi.fn()
    const onCardAction = vi.fn()
    const onError = vi.fn()
    const onReconnecting = vi.fn()
    const onReconnected = vi.fn()
    channel.onMessage(onMessage)
    channel.onCardAction(onCardAction)
    channel.onError(onError)
    channel.onReconnecting(onReconnecting)
    channel.onReconnected(onReconnected)
    const message = { messageId: 'm-1', message: 'sdk-message' }
    const card = { action: { value: 'approve' } }
    handlers.get('message')?.(message)
    handlers.get('cardAction')?.(card)
    handlers.get('error')?.('socket-error')
    handlers.get('reconnecting')?.()
    handlers.get('reconnected')?.()
    expect(onMessage).toHaveBeenCalledWith(message)
    expect(onCardAction).toHaveBeenCalledWith(card)
    expect(onError).toHaveBeenCalledWith('socket-error')
    expect(onReconnecting).toHaveBeenCalledOnce()
    expect(onReconnected).toHaveBeenCalledOnce()

    await channel.receipts.send('oc-chat', 'm-1', 'Accepted: ok')
    expect(sdkChannel.send).toHaveBeenCalledWith('oc-chat', { text: 'Accepted: ok' }, { replyTo: 'm-1' })
    await channel.connect()
    await channel.disconnect()
    expect(sdkChannel.connect).toHaveBeenCalledOnce()
    expect(sdkChannel.disconnect).toHaveBeenCalledOnce()
    expect(channel.getStatus?.()).toEqual({ state: 'reconnecting' })
  })

  it('maps an absent SDK status to idle', () => {
    const sdkChannel = {
      on: vi.fn(() => vi.fn()), send: vi.fn(), connect: vi.fn(), disconnect: vi.fn(),
      getConnectionStatus: vi.fn(() => undefined),
    }
    createLarkChannel.mockReturnValue(sdkChannel)
    expect(createFeishuSdkChannel({ appId: 'id', appSecret: 'secret' }).getStatus?.()).toEqual({ state: 'idle' })
  })
})
