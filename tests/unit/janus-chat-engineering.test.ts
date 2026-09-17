import { describe, expect, it } from 'vitest'
import { normalizeJanusChatSnapshot } from '../../src/shared/ipc/janus-chat'

function baseConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    title: 'conv',
    createdAt: 1,
    updatedAt: 2,
    messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 3 }],
    attachedWorkspaceIds: [],
    toolTraces: [],
    ...overrides,
  }
}

describe('janus chat engineering persistence (S6-b)', () => {
  it('keeps engineering refs while trimming messages', () => {
    const messages = Array.from({ length: 210 }, (_, index) => ({
      id: `m${index}`,
      role: 'user' as const,
      content: `msg ${index}`,
      timestamp: index + 1,
    }))
    const snapshot = normalizeJanusChatSnapshot({
      version: 1,
      activeConversationId: 'conv-1',
      conversations: [baseConversation({
        messages,
        engineeringContext: {
          domain: 'project',
          intent: 'maintain',
          noteRefs: [{ uri: 'note://repo/note-1', expectedHash: 'abc' }],
          scope: 'selected',
          repoIds: ['repo-1'],
          taskRefs: ['note://repo/task-1'],
          workflow: { mode: 'xdel', standardVersion: '1.0.0-s1' },
          contextRevision: 3,
        },
        artifactRefs: [{ uri: 'note://repo/note-2' }],
        activeRunRefs: [{ taskUri: 'note://repo/task-1', runId: 'run-1' }],
        pendingActions: [{ id: 'a1', kind: 'apply', createdAt: 4 }],
      })],
    })

    expect(snapshot?.conversations[0].messages).toHaveLength(200)
    expect(snapshot?.conversations[0].engineeringContext).toEqual({
      domain: 'project',
      intent: 'maintain',
      noteRefs: [{ uri: 'note://repo/note-1', expectedHash: 'abc' }],
      scope: 'selected',
      repoIds: ['repo-1'],
      taskRefs: ['note://repo/task-1'],
      workflow: { mode: 'xdel', standardVersion: '1.0.0-s1' },
      contextRevision: 3,
    })
    expect(snapshot?.conversations[0].artifactRefs).toEqual([{ uri: 'note://repo/note-2' }])
    expect(snapshot?.conversations[0].activeRunRefs).toEqual([{ taskUri: 'note://repo/task-1', runId: 'run-1' }])
    expect(snapshot?.conversations[0].pendingActions).toEqual([{ id: 'a1', kind: 'apply', createdAt: 4 }])
  })

  it('drops invalid engineering fields but keeps the conversation readable', () => {
    const snapshot = normalizeJanusChatSnapshot({
      version: 1,
      activeConversationId: 'conv-1',
      conversations: [baseConversation({
        engineeringContext: { domain: 'work', intent: 'assist', scope: 'selected' },
        artifactRefs: [{ uri: '' }],
        activeRunRefs: [{ taskUri: 'note://repo/task-1' }],
        pendingActions: [{ id: 'a1', kind: 'apply' }],
      })],
    })

    expect(snapshot?.conversations[0].engineeringContext).toBeUndefined()
    expect(snapshot?.conversations[0].artifactRefs).toBeUndefined()
    expect(snapshot?.conversations[0].activeRunRefs).toBeUndefined()
    expect(snapshot?.conversations[0].pendingActions).toBeUndefined()
    expect(snapshot?.conversations[0].messages).toHaveLength(1)
  })

  it('leaves legacy conversations without engineering fields untouched', () => {
    const snapshot = normalizeJanusChatSnapshot({
      version: 1,
      activeConversationId: 'conv-1',
      conversations: [baseConversation()],
    })

    expect(snapshot?.conversations[0].engineeringContext).toBeUndefined()
    expect(snapshot?.conversations[0].messages).toHaveLength(1)
  })
})
