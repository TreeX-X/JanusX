import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import type { RoundtableProgressEvent, RoundtableSession } from '../../src/shared/ipc/janus-roundtable'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

function session(): RoundtableSession {
  return {
    id: 'r1', title: '评审', topic: '评审方案', status: 'ended', currentRound: 1,
    createdAt: 1, updatedAt: 2, messages: [],
    sharedState: { version: 1, requirements: ['评审方案'], openIssues: [], resolvedIssues: ['已确认'], proposals: ['方案 A'], risks: [], actionItems: [], citations: [] },
    finalResult: { conclusion: '采用方案 A', sharedState: { version: 1, requirements: ['评审方案'], openIssues: [], resolvedIssues: ['已确认'], proposals: ['方案 A'], risks: [], actionItems: [], citations: [] }, generatedAt: 2 },
  }
}

describe('RoundtableStore', () => {
  it('keeps the latest snapshot for each session', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'janusx-roundtable-'))
    try {
      const { RoundtableStore } = await import('../../src/main/janus/roundtable-store')
      const store = new RoundtableStore({ journalPath: join(root, 'sessions.jsonl') })
      await store.save(session())
      await store.save({ ...session(), updatedAt: 3, currentRound: 2 })
      await expect(store.get('r1')).resolves.toMatchObject({ currentRound: 2 })
    } finally { await fs.rm(root, { recursive: true, force: true }) }
  })
})

describe('RoundtableOrchestrator progress', () => {
  it('publishes working state and each completed message in role order', async () => {
    const active: RoundtableSession = {
      id: 'active-1', title: 'Review', topic: 'Review plan', status: 'active', currentRound: 0,
      createdAt: 1, updatedAt: 1, messages: [],
      sharedState: { version: 0, requirements: ['Review plan'], openIssues: [], resolvedIssues: [], proposals: [], risks: [], actionItems: [], citations: [] },
    }
    const snapshots: RoundtableSession[] = []
    const store = {
      get: vi.fn(async () => active),
      save: vi.fn(async (value: RoundtableSession) => { snapshots.push(structuredClone(value)) }),
    }
    const generate = vi.fn(async (role: 'agent-1' | 'agent-2' | 'host') => `${role} output`)
    const { RoundtableOrchestrator } = await import('../../src/main/janus/roundtable-orchestrator')
    const orchestrator = new RoundtableOrchestrator(generate, store)
    const events: RoundtableProgressEvent[] = []

    const result = await orchestrator.advance({ sessionId: active.id }, (event) => events.push(event))

    expect(events.map((event) => `${event.role}:${event.state}:${event.message?.role ?? '-'}`)).toEqual([
      'agent-1:working:-',
      'agent-1:idle:agent-1',
      'agent-2:working:-',
      'agent-2:idle:agent-2',
      'host:working:-',
      'host:idle:host',
    ])
    expect(result.messages.map((item) => item.role)).toEqual(['agent-1', 'agent-2', 'host'])
    expect(snapshots[0].messages.at(-1)?.role).toBe('agent-1')
  })

  it('persists an imported workspace on the roundtable session', async () => {
    const stored: RoundtableSession = { ...session(), id: 'workspace-session', status: 'active' }
    const save = vi.fn(async (value: RoundtableSession) => { Object.assign(stored, value) })
    const store = { get: vi.fn(async () => stored), save }
    const { RoundtableOrchestrator } = await import('../../src/main/janus/roundtable-orchestrator')
    const orchestrator = new RoundtableOrchestrator(undefined, store)

    const result = await orchestrator.updateWorkspaces({ sessionId: stored.id, workspaces: [
      { workspaceId: 'ws-1', workspacePath: 'C:/repo/project', workspaceName: 'project' },
      { workspaceId: 'ws-2', workspacePath: 'C:/repo/shared', workspaceName: 'shared' },
    ] })

    expect(result).toMatchObject({
      workspaceId: 'ws-1',
      workspacePath: 'C:/repo/project',
      workspaces: [
        { workspaceId: 'ws-1', workspacePath: 'C:/repo/project', workspaceName: 'project' },
        { workspaceId: 'ws-2', workspacePath: 'C:/repo/shared', workspaceName: 'shared' },
      ],
    })
    expect(save).toHaveBeenCalledOnce()
  })
})

describe('roundtable chat projection', () => {
  it('previews the working agent as the next assistant message', async () => {
    const { roundtableMessagesToChat } = await import('../../src/renderer/src/components/janus/roundtable-chat')
    const messages = roundtableMessagesToChat([], 'agent-1', 1)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ id: 'roundtable-working-1-agent-1', role: 'assistant' })
    expect(messages[0].content).toContain('Agent-1')
  })
})

describe('roundtable markdown', () => {
  it('serializes the final conclusion and shared state', async () => {
    const { serializeRoundtableMarkdown } = await import('../../src/main/janus/roundtable-orchestrator')
    const content = serializeRoundtableMarkdown(session())
    expect(content).toContain('采用方案 A')
    expect(content).toContain('方案 A')
    expect(content).toContain('共享结构化数据')
  })
})
