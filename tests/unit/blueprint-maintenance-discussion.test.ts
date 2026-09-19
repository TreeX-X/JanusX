import { describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 30_000 })

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  streamText: vi.fn(),
  getDefaultModel: vi.fn(),
  getLanguageModel: vi.fn(),
  loadBlueprint: vi.fn(),
  applyMaintenanceOperations: vi.fn(),
  workspacesDir: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  cancelSession: vi.fn(),
  collectEvidence: vi.fn(),
  runChatTurn: vi.fn(),
  knowledgeSearch: vi.fn(),
  knowledgeCapture: vi.fn(),
  scheduleImmediate: vi.fn(),
  getAgentMaxSteps: vi.fn(),
}))

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))
vi.mock('../../src/main/llm/ai-runtime', () => ({
  generateObject: mocks.generateObject,
  streamText: mocks.streamText,
}))
vi.mock('../../src/main/agent/runtime/shell-runtime', () => ({
  workspaceAgentRuntime: {
    registry: { list: () => [] },
    createSession: mocks.createSession,
    getSession: mocks.getSession,
    cancelSession: mocks.cancelSession,
    executeFunctionCall: vi.fn(),
  },
}))
vi.mock('../../src/main/llm/LlmService', () => ({
  llmService: {
    getDefaultModel: mocks.getDefaultModel,
    getLanguageModel: mocks.getLanguageModel,
  },
}))
vi.mock('../../src/main/janus/blueprint-store', () => ({
  blueprintStore: {
    loadBlueprint: mocks.loadBlueprint,
    applyMaintenanceOperations: mocks.applyMaintenanceOperations,
  },
  isProjectGraphId: (id: string) => id.startsWith('harness:project:'),
}))
vi.mock('../../src/main/janus/blueprint-paths', () => ({ workspacesDir: mocks.workspacesDir }))
vi.mock('../../src/main/harness/service', () => ({ harnessNoteService: {} }))
vi.mock('@janus-agent/agent-core', () => ({
  AgentSteeringPort: class {
    size = 0
    push(): void {}
    remove(): boolean { return false }
  },
  janusWorkspaceFs: { collectTextEvidence: mocks.collectEvidence },
}))
vi.mock('@janus-agent/janus-agent', () => ({ runChatTurn: mocks.runChatTurn }))
vi.mock('../../src/main/knowledge/context-service', () => ({
  knowledgeContextService: { search: mocks.knowledgeSearch },
}))
vi.mock('../../src/main/knowledge/observation-service', () => ({
  knowledgeObservationService: { capture: mocks.knowledgeCapture },
}))
vi.mock('../../src/main/knowledge/processing-queue', () => ({
  knowledgeProcessingQueue: { scheduleImmediate: mocks.scheduleImmediate },
}))
vi.mock('../../src/main/config/service', () => ({
  configService: { getAgentMaxSteps: mocks.getAgentMaxSteps },
  DEFAULT_AGENT_MAX_STEPS: 40,
}))

import {
  toChatTraceEntry,
  toMaintenanceChatEvent,
  toMaintenanceTraceEntry,
} from '../../src/main/janus/maintenance/service'

describe('maintenance chat event and trace mapping', () => {
  const taskId = 't-9'
  it('projects every shared lifecycle event onto the task channel', () => {
    expect(toMaintenanceChatEvent(taskId, { type: 'agent_start', requestId: 'r' })).toEqual({ type: 'agent_start', taskId })
    expect(toMaintenanceChatEvent(taskId, { type: 'text_delta', requestId: 'r', delta: 'hi' })).toEqual({ type: 'text_delta', taskId, delta: 'hi' })
    expect(toMaintenanceChatEvent(taskId, { type: 'reasoning_delta', requestId: 'r', delta: 'hmm' })).toEqual({ type: 'reasoning_delta', taskId, delta: 'hmm' })
    expect(toMaintenanceChatEvent(taskId, { type: 'tool_call_start', requestId: 'r', callId: 'c', toolName: 't' })).toEqual({ type: 'tool_call_start', taskId, callId: 'c', toolName: 't' })
    expect(toMaintenanceChatEvent(taskId, { type: 'tool_call_ready', requestId: 'r', callId: 'c', toolName: 't', argumentKeys: ['a'] })).toEqual({ type: 'tool_call_ready', taskId, callId: 'c', toolName: 't', argumentKeys: ['a'] })
    expect(toMaintenanceChatEvent(taskId, { type: 'tool_execution_start', requestId: 'r', callId: 'c', toolName: 't' })).toEqual({ type: 'tool_execution_start', taskId, callId: 'c', toolName: 't' })
    expect(toMaintenanceChatEvent(taskId, { type: 'tool_execution_end', requestId: 'r', callId: 'c', toolName: 't', status: 'completed' })).toEqual({ type: 'tool_execution_end', taskId, callId: 'c', toolName: 't', status: 'completed' })
    expect(toMaintenanceChatEvent(taskId, { type: 'tool_execution_end', requestId: 'r', callId: 'c', toolName: 't', status: 'cancelled' })).toEqual({ type: 'tool_execution_end', taskId, callId: 'c', toolName: 't', status: 'failed' })
    expect(toMaintenanceChatEvent(taskId, { type: 'model_finish', requestId: 'r', reason: 'stop' })).toEqual({ type: 'model_finish', taskId, reason: 'stop' })
    expect(toMaintenanceChatEvent(taskId, { type: 'model_error', requestId: 'r', code: 'E', retryable: true })).toEqual({ type: 'model_error', taskId, code: 'E', retryable: true })
    expect(toMaintenanceChatEvent(taskId, { type: 'steering_consumed', requestId: 'r', keys: ['k'] })).toEqual({ type: 'steering_consumed', taskId, keys: ['k'] })
    expect(toMaintenanceChatEvent(taskId, { type: 'stream_end', requestId: 'r', cancelled: true })).toEqual({ type: 'stream_end', taskId, cancelled: true })
    expect(toMaintenanceChatEvent(taskId, { type: 'todo_update', requestId: 'r', todos: [] })).toBeUndefined()
    expect(toMaintenanceChatEvent(taskId, { type: 'question_requested', requestId: 'r', callId: 'c', questions: [], allowCustom: false })).toBeUndefined()
  })

  it('round-trips traces between panel and chat shapes with no runner-only leakage', () => {
    const chat = {
      toolName: 'workspace_read', workspaceId: 'ws-1', status: 'completed', summary: 'a.ts',
      turnId: 'r1', argsDigest: 'a.ts', resultDigest: '1 match',
      errorDetail: 'x', diffPreview: 'diff', diffTruncated: true, checkpointId: 'cp', startedAt: 1, completedAt: 2,
    }
    expect(toMaintenanceTraceEntry(chat)).toEqual({
      toolName: 'workspace_read', workspaceId: 'ws-1', status: 'completed', summary: 'a.ts',
      argsDigest: 'a.ts', resultDigest: '1 match',
    })
    const panel = { toolName: 'workspace_read', workspaceId: 'ws-1', status: 'completed', summary: 'a.ts' }
    expect(toChatTraceEntry(panel)).toEqual(panel)
  })
})
