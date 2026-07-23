import { describe, expect, it, vi } from 'vitest'
import { WorkspaceAgentRuntime } from '../../../src/main/agent/runtime/runtime'
import { ToolRegistry } from '../../../src/main/agent/runtime/registry'
import type { ApprovalRequest } from '../../../src/shared/ipc/agent-runtime'

const echoTool = (execute = vi.fn(async (input) => input)) => ({
  name: 'workspace.echo', description: 'Echo input',
  actionRisk: 'read' as const,
  inputSchema: { type: 'object' as const, properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
  execute,
})

function resolve(runtime: WorkspaceAgentRuntime, request: ApprovalRequest, approved: boolean, callerId = 'internal'): boolean {
  return runtime.resolveApproval({
    approvalId: request.id, approved, workspaceId: request.workspaceId, sessionId: request.sessionId,
    correlationId: request.correlationId, toolName: request.toolName, actionRisk: request.actionRisk,
  }, callerId)
}

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
    expect(events).toEqual(['session-created', 'tool-requested', 'policy-decided', 'tool-started', 'tool-completed'])
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
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
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
    runtime.registry.register({ ...echoTool(execute), actionRisk: 'run' })
    let approvalRequest: ApprovalRequest | undefined
    const events: string[] = []
    runtime.onEvent((event) => {
      events.push(event.type)
      if (event.type === 'approval-requested') approvalRequest = event.request
    })
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const pending = runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'ok' } } })
    await vi.waitFor(() => expect(approvalRequest).toBeDefined())
    expect(execute).not.toHaveBeenCalled()
    expect(resolve(runtime, approvalRequest!, true)).toBe(true)
    expect((await pending).status).toBe('completed')
    expect(events).toEqual(['session-created', 'tool-requested', 'policy-decided', 'approval-requested', 'policy-decided', 'tool-started', 'tool-completed'])
  })

  it('supports synchronous approval without exposing execution input to listeners', async () => {
    const execute = vi.fn(async (input) => input)
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register({ ...echoTool(execute), actionRisk: 'run' })
    runtime.onEvent((event) => {
      if (event.type !== 'approval-requested') return
      event.request.input.text = 'listener-change'
      expect(resolve(runtime, event.request, true)).toBe(true)
    })
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const result = await runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'original' } } })
    expect(result).toMatchObject({ status: 'completed', output: { text: 'original' } })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('records confidence, risk, approval, identity, stable reasons, and redacted inputs', async () => {
    const execute = vi.fn(async (input) => input)
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register({
      ...echoTool(execute),
      actionRisk: 'run',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' }, apiKey: { type: 'string' } },
        required: ['text', 'apiKey'],
        additionalProperties: false,
      },
    })
    runtime.onEvent((event) => {
      if (event.type === 'approval-requested') {
        expect(event.request.input).toEqual({ text: '[string:5]', apiKey: '[string:14]' })
        resolve(runtime, event.request, true)
      }
    })
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const result = await runtime.executeTool({
      sessionId: session.id,
      call: {
        toolName: 'workspace.echo',
        input: { text: 'start', apiKey: 'do-not-display' },
        correlationId: 'run-1',
        evidenceConfidence: 'high',
      },
    })

    expect(result).toMatchObject({
      status: 'completed',
      reasonCode: 'APPROVAL_GRANTED',
      output: { text: 'start', apiKey: '[REDACTED]' },
      policyDecision: {
        workspaceId: 'workspace-1',
        sessionId: session.id,
        correlationId: 'run-1',
        evidenceConfidence: 'high',
        actionRisk: 'run',
        approvalPolicy: 'per-action',
        approvalDecision: 'approved',
      },
    })
    expect((await runtime.getPolicyAuditRecords(session.id)).map((record) => record.reasonCode)).toEqual([
      'ACTION_REQUIRES_APPROVAL',
      'APPROVAL_GRANTED',
    ])
    expect(JSON.stringify(await runtime.getPolicyAuditRecords(session.id))).not.toContain('do-not-display')
  })

  it('cannot use high confidence to bypass mutation approval', async () => {
    const execute = vi.fn(async () => 'unexpected')
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register({ ...echoTool(execute), actionRisk: 'write' })
    runtime.onEvent((event) => {
      if (event.type === 'approval-requested') resolve(runtime, event.request, false)
    })
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const result = await runtime.executeTool({
      sessionId: session.id,
      call: { toolName: 'workspace.echo', input: { text: 'change' }, evidenceConfidence: 'high', preview: { summary: 'Change file', paths: ['file.txt'], truncated: false } },
    })
    expect(result).toMatchObject({ status: 'cancelled', reasonCode: 'APPROVAL_DENIED' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects malformed, cross-sender, mismatched, and replayed approvals', async () => {
    const execute = vi.fn(async () => 'ok')
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register({ ...echoTool(execute), actionRisk: 'run' })
    let request: ApprovalRequest | undefined
    runtime.onEvent((event) => { if (event.type === 'approval-requested') request = event.request })
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const pending = runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'run' } } }, 'renderer:1')
    await vi.waitFor(() => expect(request).toBeDefined())
    expect(runtime.resolveApproval({ approvalId: request!.id, approved: 1 } as never, 'renderer:1')).toBe(false)
    expect(resolve(runtime, request!, true, 'renderer:2')).toBe(false)
    expect(runtime.resolveApproval({ ...request!, approvalId: request!.id, approved: true, toolName: 'other' }, 'renderer:1')).toBe(false)
    expect(resolve(runtime, request!, true, 'renderer:1')).toBe(true)
    expect(resolve(runtime, request!, true, 'renderer:1')).toBe(false)
    expect((await pending).status).toBe('completed')
  })

  it('accepts approval on a later event-loop turn before the real timeout', async () => {
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register({ ...echoTool(), actionRisk: 'run' })
    runtime.onEvent((event) => {
      if (event.type === 'approval-requested') setTimeout(() => resolve(runtime, event.request, true), 5)
    })
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd(), timeoutMs: 100 })
    await expect(runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'later' } } })).resolves.toMatchObject({ status: 'completed' })
  })

  it('requires bounded preview metadata for mutation approvals', async () => {
    const execute = vi.fn()
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register({ ...echoTool(execute), actionRisk: 'write' })
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    await expect(runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'change' } } })).resolves.toMatchObject({ status: 'failed', reasonCode: 'PREVIEW_REQUIRED' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('sanitizes nested arrays, scalar results, thrown errors, events, and audit snapshots', async () => {
    const secret = 'sk-super-secret-123456'
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register(echoTool(vi.fn(async () => ({ nested: [{ value: secret }] }))))
    runtime.registry.register({ ...echoTool(vi.fn(async () => { throw new Error(`failed with Bearer ${secret}`) })), name: 'workspace.fail' })
    const events: unknown[] = []; runtime.onEvent((event) => events.push(event))
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const completed = await runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: secret } } })
    const failed = await runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.fail', input: { text: 'x' } } })
    expect(JSON.stringify([completed, failed, events, await runtime.getPolicyAuditRecords(session.id)])).not.toContain(secret)
  })

  it('denies a sensitive target before tool implementation and audits the reason', async () => {
    const execute = vi.fn(async () => 'unexpected')
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register({
      ...echoTool(execute),
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
        additionalProperties: false,
      },
    })
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const result = await runtime.executeTool({
      sessionId: session.id,
      call: { toolName: 'workspace.echo', input: { path: '.env' } },
    })
    expect(result).toMatchObject({ status: 'failed', reasonCode: 'SENSITIVE_PATH' })
    expect(await runtime.getPolicyAuditRecords(session.id)).toHaveLength(1)
    expect((await runtime.getPolicyAuditRecords(session.id))[0]).toMatchObject({ outcome: 'deny', reasonCode: 'SENSITIVE_PATH' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('records a path-guard failure as the final deny outcome', async () => {
    const failure = Object.assign(new Error('outside'), { code: 'OUTSIDE_WORKSPACE' })
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register(echoTool(vi.fn(async () => { throw failure })))
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const result = await runtime.executeTool({ sessionId: session.id, call: { toolName: 'workspace.echo', input: { text: 'read' }, correlationId: 'path-denial' } })
    const records = await runtime.queryPolicyAudit({ correlationId: 'path-denial' })
    expect(result).toMatchObject({ status: 'failed', reasonCode: 'OUTSIDE_WORKSPACE' })
    expect(records.at(-1)).toMatchObject({ outcome: 'deny', reasonCode: 'OUTSIDE_WORKSPACE' })
  })

  it('times out an unanswered approval with a terminal timed-out event', async () => {
    vi.useFakeTimers()
    const runtime = new WorkspaceAgentRuntime(async () => process.cwd())
    runtime.registry.register({ ...echoTool(), actionRisk: 'run' })
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
    runtime.registry.register({ ...echoTool(execute), actionRisk: 'run' })
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
    runtime.registry.register({ ...echoTool(execute), actionRisk: 'run' })
    const events: string[] = []
    let cancellation: Promise<unknown> | undefined
    runtime.onEvent((event) => {
      events.push(event.type)
      if (event.type !== 'approval-requested') return
      expect(resolve(runtime, event.request, true)).toBe(true)
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
    runtime.registry.register({ ...echoTool(), actionRisk: 'run' })
    let approvalRequest: ApprovalRequest | undefined
    runtime.onEvent((event) => { if (event.type === 'approval-requested') approvalRequest = event.request })
    const deniedSession = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: process.cwd() })
    const denied = runtime.executeTool({ sessionId: deniedSession.id, call: { toolName: 'workspace.echo', input: { text: 'deny' } } })
    await vi.waitFor(() => expect(approvalRequest).toBeDefined()); expect(resolve(runtime, approvalRequest!, false)).toBe(true)
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
