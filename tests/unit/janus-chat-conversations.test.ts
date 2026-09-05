import { describe, expect, it } from 'vitest'
import type { JanusChatMessage, PersistedJanusConversation } from '../../src/shared/ipc/janus-chat'
import { normalizeJanusChatSnapshot } from '../../src/shared/ipc/janus-chat'
import {
  COMPACT_SUMMARY_MAX_CHARS,
  capChatMessages,
  compactJanusConversation,
  getRetryTurn,
  parseCompactCommand,
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

  it('preserves bounded tool-card details across persistence', () => {
    const value = conversation('trace')
    value.toolTraces = [{
      toolName: 'workspace.read',
      workspaceId: 'workspace',
      status: 'completed',
      summary: 'read file',
      turnId: 'turn-1',
      argsDigest: 'src/main.ts',
      resultDigest: '42 lines',
      startedAt: 10,
      completedAt: 20,
    }]
    const normalized = normalizeJanusChatSnapshot({
      version: 1,
      activeConversationId: value.id,
      conversations: [value],
    })
    expect(normalized?.conversations[0].toolTraces[0]).toMatchObject({
      turnId: 'turn-1',
      argsDigest: 'src/main.ts',
      resultDigest: '42 lines',
      startedAt: 10,
      completedAt: 20,
    })
  })
})

describe('R7 manual /compact', () => {
  it('parses /compact with default, explicit, and clamped keep counts', () => {
    expect(parseCompactCommand('/compact')).toEqual({ keepLast: 10 })
    expect(parseCompactCommand('  /compact 4  ')).toEqual({ keepLast: 4 })
    expect(parseCompactCommand('/compact 999')).toEqual({ keepLast: 50 })
    expect(parseCompactCommand('/compact 0')).toEqual({ keepLast: 2 })
    expect(parseCompactCommand('/compact foo')).toBeNull()
    expect(parseCompactCommand('/compacts')).toBeNull()
    expect(parseCompactCommand('please /compact')).toBeNull()
  })

  it('leaves short histories untouched', () => {
    const messages = [message('u1', 'user'), message('a1', 'assistant')]
    const result = compactJanusConversation(messages, [], 10)
    expect(result.compactedCount).toBe(0)
    expect(result.messages).toHaveLength(2)
    expect(result.summaryChars).toBe(0)
  })

  it('folds old turns into a verbatim summary and keeps recent order', () => {
    const messages = Array.from({ length: 15 }, (_, index) =>
      message(`m${index}`, index % 2 === 0 ? 'user' : 'assistant', `content-${index} sha256=abc123 path=src/file${index}.ts`))
    const result = compactJanusConversation(messages, [], 10)
    expect(result.compactedCount).toBe(5)
    expect(result.keptCount).toBe(10)
    expect(result.messages).toHaveLength(11)
    const [summary, ...kept] = result.messages
    expect(summary.role).toBe('assistant')
    expect(summary.content).toContain('[Compacted conversation summary')
    // 旧部 hash/path 原文保留（P1 原则：永不改写）。
    expect(summary.content).toContain('sha256=abc123')
    expect(summary.content).toContain('src/file0.ts')
    expect(kept.map((item) => item.id)).toEqual(messages.slice(-10).map((item) => item.id))
  })

  it('bounds the summary and prunes tool traces with digests kept', () => {
    const messages = Array.from({ length: 30 }, (_, index) =>
      message(`m${index}`, 'user', `long request ${'x'.repeat(500)} ${index}`))
    const toolTraces = Array.from({ length: 30 }, (_, index) => ({
      toolName: 'workspace.read',
      workspaceId: 'workspace',
      status: 'completed',
      summary: `read src/big${index}.ts`,
    }))
    const result = compactJanusConversation(messages, toolTraces, 10)
    expect(result.messages[0].content.length).toBeLessThanOrEqual(COMPACT_SUMMARY_MAX_CHARS + 200)
    expect(result.toolTraces).toHaveLength(24)
    expect(result.droppedToolTraces).toBe(6)
    expect(result.messages[0].content).toContain('workspace.read')
  })
})
