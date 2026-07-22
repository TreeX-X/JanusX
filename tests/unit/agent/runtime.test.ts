import { describe, expect, it, vi } from 'vitest'
import { WorkspaceAgentRuntime } from '../../../src/main/agent/runtime/runtime'
import { ToolRegistry } from '../../../src/main/agent/runtime/registry'

const echoTool = (execute = vi.fn(async (input) => input)) => ({
  name: 'workspace.echo', description: 'Echo input',
  inputSchema: { type: 'object' as const, properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
  execute,
})

describe('ToolRegistry', () => {
  it('rejects unknown and invalid calls before implementation', () => {
    const execute = vi.fn()
    const registry = new ToolRegistry(); registry.register(echoTool(execute))
    expect(() => registry.validateCall({ toolName: 'missing', input: {} })).toThrow('Unknown tool')
    expect(() => registry.validateCall({ toolName: 'workspace.echo', input: { text: 1 } })).toThrow('Invalid input')
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects unsupported schemas and required keys without properties', () => {
    const registry = new ToolRegistry()
    expect(() => registry.register({ ...echoTool(), inputSchema: { type: 'object', properties: { value: { type: 'integer' } } } } as unknown as Parameters<ToolRegistry['register']>[0])).toThrow('Invalid tool definition')
    expect(() => registry.register({ ...echoTool(), inputSchema: { type: 'object', properties: {}, required: ['missing'] } })).toThrow('Invalid tool definition')
    expect(() => registry.register({ ...echoTool(), inputSchema: { type: 'object', properties: {}, required: ['toString'] } })).toThrow('Invalid tool definition')
  })
})

describe('WorkspaceAgentRuntime', () => {
  it('binds a canonical workspace and emits a deterministic successful lifecycle', async () => {
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd()); runtime.registry.register(echoTool())
    const events: string[] = []; runtime.onEvent((event) => events.push(event.type))
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const result = await runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'ok' }, source: 'planner' } })
    expect(result).toMatchObject({ workspaceId: 'workspace-1', sessionId: session.id, status: 'completed', output: { text: 'ok' } })
    expect(result.summary).toBe('workspace.echo completed')
    expect(events).toEqual(['session-created', 'tool-requested', 'tool-started', 'tool-completed'])
  })

  it('does not expose mutable internal session state', async () => {
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    let eventSession
    runtime.onEvent((event) => { if (event.type === 'session-created') eventSession = event.session })
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    session.workspace.workspaceId = 'changed-return'
    expect(eventSession).toBeDefined()
    eventSession!.workspace.workspaceRoot = 'changed-event'
    expect(runtime.getSession(session.id)?.workspace).toEqual({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
  })

  it('rejects missing workspace identity and invalid tool input', async () => {
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd()); const execute = vi.fn(); runtime.registry.register(echoTool(execute))
    await expect(runtime.createSession({ workspaceId: '', workspaceRoot: process.cwd() })).rejects.toThrow('required')
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const result = await runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 3 } } })
    expect(result.status).toBe('failed'); expect(result.summary).toContain('workspace.echo failed'); expect(execute).not.toHaveBeenCalled()
  })

  it('rejects inherited required input before implementation', async () => {
    const execute = vi.fn(async () => 'unexpected')
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd()); runtime.registry.register(echoTool(execute))
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const inheritedInput = Object.create({ text: 'inherited' }) as Record<string, unknown>
    const result = await runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: inheritedInput } })
    expect(result.status).toBe('failed')
    expect(execute).not.toHaveBeenCalled()
  })

  it('cancels an active call and prevents later calls', async () => {
    let release!: () => void
    const execute = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd()); runtime.registry.register(echoTool(execute))
    const events: string[] = []; runtime.onEvent((event) => events.push(event.type))
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const pending = runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'wait' } } })
    await runtime.cancelSession(session.id)
    const cancelled = await pending
    expect(cancelled.status).toBe('cancelled'); expect(cancelled.summary).toContain('workspace.echo cancelled')
    expect(events.slice(-2)).toEqual(['tool-cancelled', 'session-ended'])
    const rejected = await runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'later' } } })
    expect(rejected.status).toBe('cancelled'); expect(rejected.summary).toContain('Session is not running')
    expect(events.slice(-2)).toEqual(['tool-requested', 'tool-cancelled'])
    expect(execute).toHaveBeenCalledTimes(1); release()
  })

  it('waits for required approval before starting implementation', async () => {
    const execute = vi.fn(async () => 'approved')
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register({ ...echoTool(execute), approval: 'required' })
    let approvalId = ''
    const events: string[] = []
    runtime.onEvent((event) => {
      events.push(event.type)
      if (event.type === 'approval-requested') approvalId = event.request.id
    })
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const pending = runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'ok' } } })
    await Promise.resolve()
    expect(execute).not.toHaveBeenCalled()
    expect(runtime.resolveApproval({ approvalId, approved: true })).toBe(true)
    expect((await pending).status).toBe('completed')
    expect(events).toEqual(['session-created', 'tool-requested', 'approval-requested', 'tool-started', 'tool-completed'])
  })

  it('supports synchronous approval without exposing execution input to listeners', async () => {
    const execute = vi.fn(async (input) => input)
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register({ ...echoTool(execute), approval: 'required' })
    runtime.onEvent((event) => {
      if (event.type !== 'approval-requested') return
      event.request.input.text = 'listener-change'
      expect(runtime.resolveApproval({ approvalId: event.request.id, approved: true })).toBe(true)
    })
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const result = await runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'original' } } })
    expect(result).toMatchObject({ status: 'completed', output: { text: 'original' } })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('times out an unanswered approval with a terminal timed-out event', async () => {
    vi.useFakeTimers()
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register({ ...echoTool(), approval: 'required' })
    const events: string[] = []; runtime.onEvent((event) => events.push(event.type))
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd(), timeoutMs: 10 })
    const pending = runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'wait' } } })
    await vi.advanceTimersByTimeAsync(11)
    const result = await pending
    expect(result.status).toBe('timed-out'); expect(result.summary).toContain('workspace.echo timed-out')
    expect(runtime.getSession(session.id)?.status).toBe('timed-out')
    expect(events.filter((event) => event === 'tool-timed-out')).toHaveLength(1)
    expect(events.filter((event) => event === 'session-ended')).toHaveLength(1)
    expect(events.at(-1)).toBe('session-ended')
    vi.useRealTimers()
  })

  it('settles concurrent approvals with one terminal event per call', async () => {
    vi.useFakeTimers()
    const execute = vi.fn(async () => 'unexpected')
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register({ ...echoTool(execute), approval: 'required' })
    const events: string[] = []
    const terminalCorrelationIds: string[] = []
    runtime.onEvent((event) => {
      events.push(event.type)
      if (event.type === 'tool-timed-out' || event.type === 'tool-cancelled') terminalCorrelationIds.push(event.result.correlationId)
    })
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd(), timeoutMs: 10 })
    const first = runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'first' }, correlationId: 'first' } })
    const second = runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'second' }, correlationId: 'second' } })
    await vi.advanceTimersByTimeAsync(11)
    expect((await Promise.all([first, second])).map(({ status }) => status)).toEqual(['timed-out', 'cancelled'])
    expect(execute).not.toHaveBeenCalled()
    expect(terminalCorrelationIds.sort()).toEqual(['first', 'second'])
    expect(events.filter((event) => event === 'session-ended')).toHaveLength(1)
    expect(events.at(-1)).toBe('session-ended')
    vi.useRealTimers()
  })

  it('does not invoke implementation when approval and cancellation race', async () => {
    const execute = vi.fn(async () => 'unexpected')
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register({ ...echoTool(execute), approval: 'required' })
    const events: string[] = []
    let cancellation: Promise<unknown> | undefined
    runtime.onEvent((event) => {
      events.push(event.type)
      if (event.type !== 'approval-requested') return
      expect(runtime.resolveApproval({ approvalId: event.request.id, approved: true })).toBe(true)
      cancellation = runtime.cancelSession(event.request.sessionId)
    })
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const result = await runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'race' } } })
    await cancellation
    expect(result.status).toBe('cancelled')
    expect(execute).not.toHaveBeenCalled()
    expect(events.filter((event) => event === 'tool-cancelled')).toHaveLength(1)
    expect(events.filter((event) => event === 'session-ended')).toHaveLength(1)
    expect(events.at(-1)).toBe('session-ended')
  })

  it('settles pending approval on denial and session cancellation', async () => {
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register({ ...echoTool(), approval: 'required' })
    let approvalId = ''
    runtime.onEvent((event) => { if (event.type === 'approval-requested') approvalId = event.request.id })
    const deniedSession = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const denied = runtime.executeTool({ sessionId: deniedSession.id, call: { toolName: 'workspace.echo', input: { text: 'deny' } } })
    await Promise.resolve(); expect(runtime.resolveApproval({ approvalId, approved: false })).toBe(true)
    expect((await denied).status).toBe('cancelled')

    const cancelEvents: string[] = []; const unsubscribe = runtime.onEvent((event) => cancelEvents.push(event.type))
    const cancelledSession = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const cancelled = runtime.executeTool({ sessionId: cancelledSession.id, call: { toolName: 'workspace.echo', input: { text: 'cancel' } } })
    await Promise.resolve(); await runtime.cancelSession(cancelledSession.id)
    expect((await cancelled).status).toBe('cancelled')
    expect(cancelEvents.slice(-2)).toEqual(['tool-cancelled', 'session-ended']); unsubscribe()
  })

  it('requires a registered workspace root and rejects mismatched pairs', async () => {
    const unknown = new WorkspaceAgentRuntime(async () => undefined)
    await expect(unknown.createSession({ workspaceId: 'missing', workspaceRoot: process.cwd() })).rejects.toThrow('not registered')
    const trusted = new WorkspaceAgentRuntime(async () => process.cwd())
    await expect(trusted.createSession({ workspaceId: 'workspace-1', workspaceRoot: require('node:os').tmpdir() })).rejects.toThrow('does not match')
  })

  it('uses the same executor for function calls and planner steps', async () => {
    const execute = vi.fn(async (input) => input)
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd()); runtime.registry.register(echoTool(execute))
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    expect((await runtime.executeFunctionCall({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'fn' } } })).status).toBe('completed')
    expect((await runtime.executePlannerStep({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'plan' } } })).status).toBe('completed')
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('ends a timed-out concurrent session only after every tool is terminal', async () => {
    vi.useFakeTimers()
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register({ ...echoTool(() => new Promise(() => {})), name: 'workspace.first' })
    runtime.registry.register({ ...echoTool(() => new Promise(() => {})), name: 'workspace.second' })
    const events: string[] = []; runtime.onEvent((event) => events.push(event.type))
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd(), timeoutMs: 10 })
    const first = runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.first', input: { text: 'a' } } })
    const second = runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.second', input: { text: 'b' } } })
    await vi.advanceTimersByTimeAsync(11)
    await Promise.all([first, second])
    expect(events.filter((event) => event === 'session-ended')).toHaveLength(1)
    expect(events.at(-1)).toBe('session-ended')
    expect(events.slice(-3, -1).every((event) => event === 'tool-timed-out' || event === 'tool-cancelled')).toBe(true)
    vi.useRealTimers()
  })

  it('marks tool and session timeout deterministically', async () => {
    vi.useFakeTimers()
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd()); runtime.registry.register(echoTool(vi.fn(() => new Promise(() => {}))))
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd(), timeoutMs: 10 })
    const pending = runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'wait' } } })
    await vi.advanceTimersByTimeAsync(11)
    expect((await pending).status).toBe('timed-out'); expect(runtime.getSession(session.id)?.status).toBe('timed-out')
    vi.useRealTimers()
  })
})
