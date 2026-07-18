import { describe, expect, it, vi } from 'vitest'
import { FeishuInboundClient } from '../../src/main/remote-notifications/feishu-inbound/client'
import type { FeishuInboundChannel } from '../../src/main/remote-notifications/feishu-inbound/types'

function fakeChannel() {
  let message: (event: unknown) => void | Promise<void> = () => undefined
  let card: (event: unknown) => void | Promise<void> = () => undefined
  let error: (event: unknown) => void = () => undefined
  const channel: FeishuInboundChannel = {
    onMessage: (handler) => { message = handler; return vi.fn() },
    onCardAction: (handler) => { card = handler; return vi.fn() },
    onError: (handler) => { error = handler; return vi.fn() },
    onReconnecting: () => vi.fn(),
    onReconnected: () => vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    receipts: { send: vi.fn().mockResolvedValue(undefined) },
  }
  return { channel, emitMessage: (value: unknown) => message(value), emitCard: (value: unknown) => card(value), emitError: (value: unknown) => error(value) }
}

describe('FeishuInboundClient', () => {
  it('connects, routes valid events, ignores malformed events, reports errors, and disposes', async () => {
    const fake = fakeChannel()
    const execute = vi.fn().mockResolvedValue({ ok: true, code: 'ok', message: 'ok' })
    const statuses = vi.fn()
    const client = new FeishuInboundClient(fake.channel, { execute }, statuses)
    await client.start()
    await fake.emitMessage({
      messageId: 'm-1', chatId: 'oc-1', chatType: 'p2p', senderId: 'ou-1', content: '/status',
      rawContentType: 'text', mentionedBot: false, mentions: [], createTime: Date.now(),
    })
    await fake.emitMessage({ chatId: 'oc-bad', messageId: 'm-bad', bad: true })
    await fake.emitMessage({ chatId: 'contains space', messageId: 'm-unsafe', bad: true })
    await fake.emitMessage({ bad: true })
    await fake.emitCard({ bad: true })
    fake.emitError(new Error('socket unavailable\nsecretless'))
    await client.stop()

    expect(fake.channel.connect).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledOnce()
    expect(fake.channel.receipts.send).toHaveBeenCalledWith(
      'oc-bad', 'm-bad', 'Rejected: malformed Feishu event',
    )
    expect(fake.channel.receipts.send).toHaveBeenCalledTimes(2)
    expect(statuses).toHaveBeenCalledWith({ state: 'failed', error: 'socket unavailable\nsecretless' })
    expect(fake.channel.disconnect).toHaveBeenCalledOnce()
    expect(client.getStatus()).toEqual({ state: 'idle' })
  })
})
