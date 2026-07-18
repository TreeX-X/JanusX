import { describe, expect, it, vi } from 'vitest'
import { normalizeFeishuCardAction, normalizeFeishuMessage } from '../../src/main/remote-notifications/feishu-inbound/normalize'
import { FeishuInboundRouter, parseCommand } from '../../src/main/remote-notifications/feishu-inbound/router'
import type { FeishuInboundMessage } from '../../src/main/remote-notifications/feishu-inbound/types'

const NOW = 1_800_000_000_000

function message(overrides: Partial<FeishuInboundMessage> = {}): FeishuInboundMessage {
  return {
    kind: 'message',
    context: {
      provider: 'feishu', eventId: 'm-1', operatorOpenId: 'ou-1', chatId: 'oc-1', timestamp: NOW,
    },
    messageId: 'm-1',
    chatType: 'p2p',
    mentionedBot: false,
    mentionKeys: [],
    text: 'hello',
    ...overrides,
  }
}

describe('Feishu inbound normalization and routing', () => {
  it('schema-checks and normalizes message identity, thread, mentions, and timestamp', () => {
    expect(normalizeFeishuMessage({
      messageId: 'm-1', chatId: 'oc-1', chatType: 'group', senderId: 'ou-1',
      content: '@_user_1 /p hello', rawContentType: 'text', mentionedBot: true,
      mentions: [{ key: '@_user_1', isBot: true }], rootId: 'root-1', threadId: 'thread-1', createTime: NOW,
    })).toMatchObject({
      messageId: 'm-1', chatType: 'group', mentionedBot: true, mentionKeys: ['@_user_1'],
      context: { eventId: 'm-1', operatorOpenId: 'ou-1', chatId: 'oc-1', threadId: 'thread-1', timestamp: NOW },
    })
    expect(normalizeFeishuMessage({ messageId: 'm-1' })).toBeNull()
    expect(normalizeFeishuMessage({
      messageId: 'm-1', chatId: 'oc-1', chatType: 'p2p', senderId: 'ou-1', content: '{}',
      rawContentType: 'image', mentionedBot: false, mentions: [], createTime: NOW,
    })).toBeNull()
  })

  it('parses only exact commands', () => {
    expect(parseCommand('/status', true)).toEqual({ type: 'status' })
    expect(parseCommand('/bind term-1', true)).toEqual({ type: 'bind', terminalId: 'term-1' })
    expect(parseCommand('/unbind', true)).toEqual({ type: 'unbind' })
    expect(parseCommand('/stop', true)).toEqual({ type: 'stop' })
    expect(parseCommand('/p continue', true)).toEqual({ type: 'follow-up', text: 'continue' })
    expect(parseCommand('continue', true)).toEqual({ type: 'follow-up', text: 'continue' })
    for (const invalid of ['/status now', '/bind', '/bind a b', '/p', '/approve', '/unknown']) {
      expect(parseCommand(invalid, true)).toBeNull()
    }
    expect(parseCommand('/prompt continue', true, '/prompt')).toEqual({
      type: 'follow-up', text: 'continue',
    })
    expect(parseCommand('/p continue', true, '/prompt')).toBeNull()
  })

  it('accepts direct text and requires mention or /p in groups while stripping mentions', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true, code: 'ok', message: 'done' })
    const send = vi.fn().mockResolvedValue(undefined)
    const router = new FeishuInboundRouter({ execute }, { send })

    await router.handle(message())
    await router.handle(message({
      context: { ...message().context, eventId: 'm-2' }, messageId: 'm-2', chatType: 'group', text: 'ignored',
    }))
    await router.handle(message({
      context: { ...message().context, eventId: 'm-3' }, messageId: 'm-3', chatType: 'group',
      mentionedBot: true, mentionKeys: ['@bot'], text: '@bot continue',
    }))
    await router.handle(message({
      context: { ...message().context, eventId: 'm-4' }, messageId: 'm-4', chatType: 'group', text: '/p prefixed',
    }))

    expect(execute).toHaveBeenCalledTimes(3)
    expect(execute).toHaveBeenNthCalledWith(1, expect.objectContaining({ command: { type: 'follow-up', text: 'hello' } }))
    expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({ command: { type: 'follow-up', text: 'continue' } }))
    expect(execute).toHaveBeenNthCalledWith(3, expect.objectContaining({ command: { type: 'follow-up', text: 'prefixed' } }))
    expect(send).toHaveBeenCalledWith('oc-1', 'm-2', expect.stringContaining('Rejected: Commands'))
  })

  it('normalizes only signed JanusX card actions and routes the token', async () => {
    const action = normalizeFeishuCardAction({
      messageId: 'card-message', chatId: 'oc-1', operator: { openId: 'ou-1' },
      action: { value: { janusx: 1, action: 'bind', terminalId: 'term-1', token: 'signed-token' } },
    }, () => NOW)
    expect(action).toMatchObject({
      command: { type: 'bind', terminalId: 'term-1' }, actionToken: 'signed-token',
      context: { operatorOpenId: 'ou-1', chatId: 'oc-1', timestamp: NOW },
    })
    expect(action?.context.eventId).toMatch(/^card-[a-f0-9]{64}$/)
    expect(normalizeFeishuCardAction({
      messageId: 'card-message', chatId: 'oc-1', operator: { openId: 'ou-1' },
      action: { value: { action: 'stop', terminalId: 'term-1' } },
    })).toBeNull()

    const execute = vi.fn().mockResolvedValue({ ok: false, code: 'expired-token', message: 'expired' })
    const send = vi.fn().mockResolvedValue(undefined)
    const router = new FeishuInboundRouter({ execute }, { send })
    await router.handle(action!)
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ actionToken: 'signed-token' }))
    expect(send).toHaveBeenCalledWith('oc-1', 'card-message', 'Expired: expired')
  })

  it('returns deterministic duplicate and failure receipts without leaking result data', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const router = new FeishuInboundRouter({
      execute: vi.fn().mockResolvedValue({
        ok: true, code: 'ok', message: 'Follow-up submitted', replayed: true, data: { secret: 'hidden' },
      }),
    }, { send })
    await router.handle(message())
    expect(send).toHaveBeenCalledWith('oc-1', 'm-1', 'Duplicate: Follow-up submitted')
    expect(JSON.stringify(send.mock.calls)).not.toContain('hidden')
  })
})
