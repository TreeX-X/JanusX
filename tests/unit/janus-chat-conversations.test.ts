import { describe, expect, it } from 'vitest'
import type { JanusChatMessage, PersistedJanusConversation } from '../../src/shared/ipc/janus-chat'
import { normalizeJanusChatSnapshot } from '../../src/shared/ipc/janus-chat'
import {
  capChatMessages,
  getRetryTurn,
  titleFromMessages,
} from '../../src/renderer/src/components/janus/janusChatConversations'

function message(id: string, role: JanusChatMessage['role'], content = id): JanusChatMessage {
  return { id, role, content, timestamp: 1 }
}

function conversation(id: string): PersistedJanusConversation {
  return {
    id,
    title: id,
    createdAt: 1,
    updatedAt: 1,
    messages: [],
    attachedWorkspaceIds: [],
    toolTraces: [],
  }
}

describe('Janus Chat conversation domain', () => {
  it('derives a compact title from the first user message', () => {
    expect(titleFromMessages([
      message('assistant', 'assistant'),
      message('user', 'user', '  explain   this repository  '),
    ])).toBe('explain this repository')
  })

  it('caps history without mixing or reordering messages', () => {
    const messages = Array.from({ length: 205 }, (_, index) => message(String(index), 'user'))
    const capped = capChatMessages(messages)
    expect(capped).toHaveLength(200)
    expect(capped[0].id).toBe('5')
    expect(capped.at(-1)?.id).toBe('204')
  })

  it('retries the last user turn in place instead of duplicating it', () => {
    const messages = [
      message('u1', 'user'),
      message('a1', 'assistant'),
      message('u2', 'user'),
      message('a2', 'assistant'),
    ]
    const turn = getRetryTurn(messages)
    expect(turn?.history.map((item) => item.id)).toEqual(['u1', 'a1'])
    expect(turn?.userMessage.id).toBe('u2')
    expect([...turn!.history, turn!.userMessage].filter((item) => item.id === 'u2')).toHaveLength(1)
  })

  it('normalizes persisted conversations independently', () => {
    const first = { ...conversation('first'), providerId: 'provider-a', attachedWorkspaceIds: ['a'] }
    const second = { ...conversation('second'), providerId: 'provider-b', attachedWorkspaceIds: ['b'] }
    const snapshot = normalizeJanusChatSnapshot({
      version: 1,
      activeConversationId: 'second',
      conversations: [first, second],
    })
    expect(snapshot?.activeConversationId).toBe('second')
    expect(snapshot?.conversations[0]).toMatchObject({ providerId: 'provider-a', attachedWorkspaceIds: ['a'] })
    expect(snapshot?.conversations[1]).toMatchObject({ providerId: 'provider-b', attachedWorkspaceIds: ['b'] })
  })

  it('rejects malformed records and bounds renderer-controlled data', () => {
    const valid = {
      ...conversation('valid'),
      title: 'x'.repeat(100),
      messages: Array.from({ length: 205 }, (_, index) => message(String(index), 'user')),
      toolTraces: Array.from({ length: 50 }, (_, index) => ({
        toolName: `tool-${index}`,
        workspaceId: 'workspace',
        status: 'completed',
        summary: 'ok',
      })),
    }
    const snapshot = normalizeJanusChatSnapshot({
      version: 1,
      activeConversationId: 'missing',
      conversations: [{ id: 'bad' }, valid, valid],
    })
    expect(snapshot?.activeConversationId).toBe('valid')
    expect(snapshot?.conversations).toHaveLength(1)
    expect(snapshot?.conversations[0].title).toHaveLength(80)
    expect(snapshot?.conversations[0].messages).toHaveLength(200)
    expect(snapshot?.conversations[0].toolTraces).toHaveLength(48)
  })
})
