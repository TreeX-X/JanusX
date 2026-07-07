import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentHookPayload } from '../../../src/main/notifications/agent-hook-types'

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  getKnowledgeSettings: vi.fn(),
}))

vi.mock('../../../src/main/knowledge/observation-service', () => ({
  knowledgeObservationService: {
    capture: mocks.capture,
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
    mocks.capture.mockResolvedValue({})
    mocks.getKnowledgeSettings.mockReset()
    mocks.getKnowledgeSettings.mockResolvedValue({ enabled: true })
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
})
