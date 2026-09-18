import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Blueprint } from '../../src/shared/janus/types'
import type { BlueprintMaintenanceTask } from '../../src/shared/janus/maintenance-types'

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

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
vi.mock('../../src/main/llm/ai-runtime', () => ({ generateObject: mocks.generateObject, streamText: mocks.streamText }))
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
  blueprintMaintenanceService,
  toChatTraceEntry,
  toMaintenanceChatEvent,
  toMaintenanceTraceEntry,
} from '../../src/main/janus/maintenance/service'

const BLUEPRINT_ID = 'bp-discussion'
const READ_ONLY = [
  'workspace_list', 'workspace_search', 'workspace_read',
  'project_detect', 'project_list_processes', 'project_process_output',
  'git_status', 'git_log', 'git_diff',
]

function fixture(): Blueprint {
  return {
    schemaVersion: 2,
    contentRevision: 7,
    id: BLUEPRINT_ID,
    name: 'Blueprint',
    description: '',
    rootNodeId: 'root',
    nodeIds: ['root'],
    nodes: {
      root: {
        id: 'root', title: 'Root', type: 'epic', status: 'not-started', progress: 0,
        statusSource: 'manual', positioning: '', description: '', features: [], completedItems: [],
        techSolution: '', notes: '', todos: [], issues: [], activities: [], analyses: [], workspaceId: null,
        workspaceSnapshot: null, boundTerminalId: null, terminalHistory: [], lastAnalyzedCommitSha: null,
        children: [], parentId: null, tags: [], createdAt: '', updatedAt: '',
      },
    },
    relations: [],
    requirementCandidates: [],
    mountedTo: null,
    canvasLayout: {},
    createdAt: '',
    updatedAt: '',
  } as Blueprint
}

let recordsDir = ''
let checkoutDir = ''

function serviceOf() {
  return blueprintMaintenanceService as unknown as {
    tasks: Map<string, BlueprintMaintenanceTask>
    cancelAll(): void
  }
}

function stageTask(): void {
  serviceOf().tasks.set('t-1', {
    id: 't-1',
    blueprintId: BLUEPRINT_ID,
    blueprintName: 'Blueprint',
    baseRevision: 7,
    workspaceId: 'ws-1',
    workspaceName: 'W',
    workspacePath: checkoutDir,
    authorizedWorkspaces: [{ workspaceId: 'ws-1', workspaceName: 'W', workspacePath: checkoutDir }],
    nodeScope: { type: 'blueprint' },
    goal: 'shape the scope',
    status: 'active',
    progress: 0,
    phase: '',
    messages: [{ id: 'm0', role: 'user', content: 'hi', createdAt: '' }],
    changeSet: null,
    changeSetHistory: [],
    createdAt: '',
    updatedAt: '',
  })
}

function liveTask(): BlueprintMaintenanceTask {
  const task = serviceOf().tasks.get('t-1')
  if (!task) throw new Error('task t-1 missing')
  return task
}

const waitFor = <T,>(assertion: () => T) => vi.waitFor(assertion, { timeout: 15_000, interval: 25 })

describe('maintenance discussion on the shared turn', () => {
  beforeEach(async () => {
    recordsDir = await fs.mkdtemp(join(tmpdir(), 'maint-discuss-records-'))
    checkoutDir = await fs.mkdtemp(join(tmpdir(), 'maint-discuss-checkout-'))
    await fs.writeFile(join(recordsDir, 'ws-1.json'), JSON.stringify({ id: 'ws-1', path: checkoutDir }))
    mocks.workspacesDir.mockReturnValue(recordsDir)
    mocks.loadBlueprint.mockReset().mockResolvedValue(fixture())
    mocks.getDefaultModel.mockReset().mockResolvedValue({ provider: { id: 'p' }, modelId: 'm' })
    mocks.createSession.mockReset().mockResolvedValue({ id: 's1' })
    mocks.getSession.mockReset().mockReturnValue({ status: 'idle' })
    mocks.knowledgeSearch.mockReset().mockResolvedValue({ compactContext: '', items: [] })
    mocks.knowledgeCapture.mockReset().mockResolvedValue({})
    mocks.getAgentMaxSteps.mockReset().mockResolvedValue(40)
    mocks.runChatTurn.mockReset().mockImplementation(async (request: { requestId: string }) => ({
      requestId: request.requestId,
      text: 'discussed',
      toolTraces: [{ toolName: 'workspace_read', workspaceId: 'ws-1', status: 'completed', summary: 'a.ts' }],
      cancelled: false,
      todos: [],
      compacted: false,
    }))
    serviceOf().cancelAll()
  })

  afterEach(async () => {
    serviceOf().cancelAll()
    await fs.rm(recordsDir, { recursive: true, force: true }).catch(() => undefined)
    await fs.rm(checkoutDir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('drives discussion through runChatTurn with read-only maintenance hosting', async () => {
    stageTask()
    await blueprintMaintenanceService.message({ taskId: 't-1', content: 'what next' })
    await waitFor(() => expect(liveTask().status).toBe('active'))
    expect(mocks.runChatTurn).toHaveBeenCalledTimes(1)
    const [request, ports] = mocks.runChatTurn.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>,
    ]
    expect(request.sourceTag).toBe('maintenance')
    expect([...(request.toolAllowlist as string[])].sort()).toEqual([...READ_ONLY].sort())
    // Memory separation: the engineering channel never offers person-scope
    // tools, so no maintenance turn can mint or read user memories.
    expect((request.toolAllowlist as string[]).some((name) => name.startsWith('user-memory'))).toBe(false)
    expect(request.systemPromptPrefix as string).toContain('never emit a ChangeSet')
    expect(request.chatSession).toBeDefined()
    expect(request.steeringPort).toBeDefined()
    const userMessage = (request.messages as Array<{ role: string; content: string }>).find((m) => m.role === 'user')
    expect(userMessage?.content).toContain('Nodes:')
    expect(userMessage?.content).toContain('shape the scope')
    expect(ports.question).toBeUndefined()
    expect(ports.knowledgeSearch).toBeUndefined()
    expect(ports.knowledgeCapture).toBeUndefined()
    expect(liveTask().messages[2]?.content).toBe('discussed')
    expect(liveTask().status).toBe('active')
  })

  it('replays panel traces without runner-only display assets', async () => {
    stageTask()
    await blueprintMaintenanceService.message({ taskId: 't-1', content: 'first' })
    await waitFor(() => expect(liveTask().status).toBe('active'))
    await blueprintMaintenanceService.message({ taskId: 't-1', content: 'second' })
    await waitFor(() => expect(mocks.runChatTurn).toHaveBeenCalledTimes(2))
    const [secondRequest] = mocks.runChatTurn.mock.calls[1] as unknown as [Record<string, unknown>]
    expect(secondRequest.toolTraces).toEqual([
      { toolName: 'workspace_read', workspaceId: 'ws-1', status: 'completed', summary: 'a.ts' },
    ])
  })

  it('lands no assistant message when the turn is cancelled', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    mocks.runChatTurn.mockReset().mockImplementation(async (request: { requestId: string }) => {
      await gate
      return { requestId: request.requestId, text: 'too late', toolTraces: [], cancelled: false, todos: [], compacted: false }
    })
    stageTask()
    await blueprintMaintenanceService.message({ taskId: 't-1', content: 'hi' })
    await waitFor(() => expect(mocks.runChatTurn).toHaveBeenCalledTimes(1))
    blueprintMaintenanceService.cancel('t-1')
    release()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(liveTask().messages).toHaveLength(2)
  })
})

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
