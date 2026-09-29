import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentHookPayload } from '../../../src/main/notifications/agent-hook-types'

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  getKnowledgeSettings: vi.fn(),
  scheduleImmediate: vi.fn(),
}))

vi.mock('../../../src/main/knowledge/observation-service', () => ({
  knowledgeObservationService: {
    capture: mocks.capture,
  },
}))

vi.mock('../../../src/main/knowledge/processing-queue', () => ({
  knowledgeProcessingQueue: {
    scheduleImmediate: mocks.scheduleImmediate,
  },
}))

vi.mock('../../../src/main/config/service', () => ({
  configService: {
    getKnowledgeSettings: mocks.getKnowledgeSettings,
  },
}))

async function loadRecorder() {
  vi.resetModules()
  return import('../../../src/main/knowledge/agent-turn-recorder')
}

describe('AgentTurnRecorder', () => {
  beforeEach(() => {
    mocks.capture.mockReset()
    mocks.capture.mockResolvedValue({ workspaceId: 'workspace-1' })
    mocks.getKnowledgeSettings.mockReset()
    mocks.getKnowledgeSettings.mockResolvedValue({ enabled: true })
    mocks.scheduleImmediate.mockReset()
  })

  it('records hook-driven terminal turn start and completion with duration metadata', async () => {
    const { agentTurnRecorder } = await loadRecorder()
    agentTurnRecorder.registerTerminal({
      terminalId: 'terminal-1',
      engine: 'codex',
      workspaceId: 'workspace-1',
      cwd: 'C:/work/project',
    })

    const startPayload: AgentHookPayload = {
      source: 'codex',
      event: 'UserPromptSubmit',
      terminalId: 'terminal-1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      message: 'Implement knowledge capture',
      timestamp: '2026-07-06T00:00:00.000Z',
    }
    const stopPayload: AgentHookPayload = {
      source: 'codex',
      event: 'Stop',
      terminalId: 'terminal-1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      timestamp: '2026-07-06T00:00:05.000Z',
    }

    agentTurnRecorder.handleHookPayload(startPayload)
    agentTurnRecorder.handleHookPayload(stopPayload)

    await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(2))

    expect(mocks.capture).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workspacePath: 'C:/work/project',
        source: 'agent-stream',
        type: 'conversation-turn',
        content: 'Implement knowledge capture',
        tags: ['terminal-hook', 'turn-started', 'codex'],
        actor: 'user',
      }),
      expect.objectContaining({ speaker: 'user', sourceEventId: expect.any(String), createdAt: '2026-07-06T00:00:00.000Z' }),
    )
    expect(mocks.capture).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        source: 'agent-stream',
        type: 'system-event',
        tags: ['terminal-hook', 'turn-completed', 'codex'],
        actor: 'codex',
        metadata: expect.objectContaining({
          durationMs: 5000,
          prompt: 'Implement knowledge capture',
        }),
      }),
    )
  })

  it('schedules immediate processing when a turn completes (Phase 5 §6)', async () => {
    const { agentTurnRecorder } = await loadRecorder()
    agentTurnRecorder.registerTerminal({
      terminalId: 'terminal-1',
      engine: 'codex',
      workspaceId: 'workspace-1',
      cwd: 'C:/work/project',
    })

    agentTurnRecorder.handleHookPayload({
      source: 'codex',
      event: 'UserPromptSubmit',
      terminalId: 'terminal-1',
      workspaceId: 'workspace-1',
      message: 'hello',
    })
    agentTurnRecorder.handleHookPayload({
      source: 'codex',
      event: 'Stop',
      terminalId: 'terminal-1',
      workspaceId: 'workspace-1',
    })

    await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(mocks.scheduleImmediate).toHaveBeenCalledTimes(1))
    expect(mocks.scheduleImmediate).toHaveBeenCalledWith('workspace-1')
  })

  it('does not write observations when knowledge capture is disabled', async () => {
    mocks.getKnowledgeSettings.mockResolvedValue({ enabled: false })
    const { agentTurnRecorder } = await loadRecorder()
    agentTurnRecorder.registerTerminal({
      terminalId: 'terminal-1',
      engine: 'codex',
      workspaceId: 'workspace-1',
      cwd: 'C:/work/project',
    })

    agentTurnRecorder.handleHookPayload({
      source: 'codex',
      event: 'UserPromptSubmit',
      terminalId: 'terminal-1',
      workspaceId: 'workspace-1',
      message: 'This should not be captured',
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.capture).not.toHaveBeenCalled()
  })

  it('does not attribute status-shaped messages to a user or trust a mismatched terminal engine', async () => {
    const { agentTurnRecorder } = await loadRecorder()
    agentTurnRecorder.registerTerminal({ terminalId: 'terminal', engine: 'opencode', workspaceId: 'workspace-1', cwd: 'C:/work' })
    agentTurnRecorder.handleHookPayload({ source: 'opencode', event: 'session.status', terminalId: 'terminal', raw: { status: 'busy' }, message: 'I prefer pnpm' })
    await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(1))
    expect(mocks.capture.mock.calls[0][1].speaker).toBe('unknown')
    agentTurnRecorder.handleHookPayload({ source: 'claude', event: 'UserPromptSubmit', terminalId: 'terminal', message: 'I prefer pnpm' })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(mocks.capture).toHaveBeenCalledTimes(1)
  })

  it('keeps a source event identity across recorder restarts and separates later identical prompts', async () => {
    const { agentTurnRecorder } = await loadRecorder()
    const terminal = { terminalId: 'terminal', engine: 'codex' as const, workspaceId: 'workspace-1', cwd: 'C:/work' }
    const payload: AgentHookPayload = { source: 'codex', event: 'UserPromptSubmit', terminalId: 'terminal', sessionId: 'session', message: 'I prefer pnpm', timestamp: '2026-09-29T00:00:00.000Z' }
    for (const timestamp of [payload.timestamp, payload.timestamp, '2026-09-29T00:01:00.000Z']) {
      agentTurnRecorder.dispose(); agentTurnRecorder.registerTerminal(terminal)
      const count = mocks.capture.mock.calls.length
      agentTurnRecorder.handleHookPayload({ ...payload, timestamp })
      await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(count + 1))
    }
    const events = mocks.capture.mock.calls.map(call => call[1].sourceEventId)
    expect(events[0]).toBe(events[1]); expect(events[2]).not.toBe(events[0])
  })

  it('redacts prompts in both the start record and completion metadata while deduplicating retries', async () => {
    const { agentTurnRecorder } = await loadRecorder()
    agentTurnRecorder.registerTerminal({ terminalId: 'terminal', engine: 'codex', workspaceId: 'workspace-1', cwd: 'C:/work' })
    const secret = 'sk-' + 'x'.repeat(48)
    const payload: AgentHookPayload = { source: 'codex', event: 'UserPromptSubmit', terminalId: 'terminal', sessionId: 'session', message: `Use OPENAI_API_KEY=${secret}` }
    agentTurnRecorder.handleHookPayload(payload)
    agentTurnRecorder.handleHookPayload(payload)
    agentTurnRecorder.handleHookPayload({ ...payload, event: 'Stop', message: undefined })
    await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(2))
    const [start, end] = mocks.capture.mock.calls.map(call => call[0])
    expect(start.content).not.toContain(secret)
    expect(end.metadata.prompt).toBe(start.content)
  })
})
