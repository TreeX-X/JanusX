import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { statSync } from 'node:fs'
import type { AgentRuntimeEvent, AgentSession, ApprovalResult, CreateAgentSessionInput, ExecuteToolInput, ToolResult } from '../../../shared/ipc/agent-runtime'
import { ToolRegistry, type RegisteredTool } from './registry'
import type { ResolveWorkspaceRoot } from '../../office/office-workspace-guard'

type Listener = (event: AgentRuntimeEvent) => void
type ApprovalOutcome = 'approved' | 'denied' | 'cancelled' | 'timed-out'
interface PendingApproval { resolve: (outcome: ApprovalOutcome) => void; timer: ReturnType<typeof setTimeout> }
interface ActiveSession extends AgentSession { controller: AbortController; pending: Map<string, PendingApproval>; activeCalls: Set<Promise<void>>; ended: boolean }
class ToolTimeoutError extends Error {}

export class WorkspaceAgentRuntime {
  readonly registry = new ToolRegistry()
  private readonly sessions = new Map<string, ActiveSession>()
  private readonly listeners = new Set<Listener>()
  constructor(private resolveWorkspaceRoot?: ResolveWorkspaceRoot) {}
  setWorkspaceResolver(resolveWorkspaceRoot: ResolveWorkspaceRoot): void { this.resolveWorkspaceRoot = resolveWorkspaceRoot }
  onEvent(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private emit(event: AgentRuntimeEvent): void { for (const listener of this.listeners) listener(event) }

  async createSession(input: CreateAgentSessionInput): Promise<AgentSession> {
    if (!input.workspaceId?.trim() || !input.workspaceRoot?.trim() || !this.resolveWorkspaceRoot) throw new Error('workspaceId and workspaceRoot are required')
    const trustedRoot = await this.resolveWorkspaceRoot(input.workspaceId)
    if (!trustedRoot) throw new Error('Workspace is not registered')
    const root = await realpath(trustedRoot)
    if ((await realpath(input.workspaceRoot)) !== root) throw new Error('workspaceRoot does not match registered workspace')
    if (!statSync(root).isDirectory()) throw new Error('workspaceRoot must be a directory')
    const now = new Date().toISOString()
    const session: ActiveSession = { id: randomUUID(), workspace: { workspaceId: input.workspaceId, workspaceRoot: root }, status: 'running', createdAt: now, updatedAt: now, timeoutMs: input.timeoutMs ?? 120_000, controller: new AbortController(), pending: new Map(), activeCalls: new Set(), ended: false }
    this.sessions.set(session.id, session)
    this.emit({ type: 'session-created', session: this.publicSession(session) })
    return this.publicSession(session)
  }

  async executeTool(input: ExecuteToolInput): Promise<ToolResult> {
    const session = this.sessions.get(input.sessionId)
    if (!session) throw new Error('Unknown session')
    const correlationId = input.call.correlationId ?? randomUUID()
    this.emit({ type: 'tool-requested', sessionId: session.id, correlationId, toolName: input.call.toolName })
    if (session.status !== 'running' || session.controller.signal.aborted) { const result = this.result(session, input.call.toolName, correlationId, 'cancelled', undefined, 'Session is not running'); this.emit({ type: 'tool-cancelled', result }); return result }
    let complete!: () => void
    const activeCall = new Promise<void>((resolve) => { complete = resolve })
    session.activeCalls.add(activeCall)
    try { return await this.executeActiveTool(session, input, correlationId) }
    finally { session.activeCalls.delete(activeCall); complete(); this.endSessionWhenIdle(session) }
  }

  private async executeActiveTool(session: ActiveSession, input: ExecuteToolInput, correlationId: string): Promise<ToolResult> {
    let tool: RegisteredTool
    try { tool = this.registry.validateCall(input.call) } catch (error) { const result = this.result(session, input.call.toolName, correlationId, 'failed', undefined, error instanceof Error ? error.message : String(error)); this.emit({ type: 'tool-failed', result }); return result }
    if (tool.approval === 'required') {
      const approvalId = randomUUID()
      const request = { id: approvalId, sessionId: session.id, workspaceId: session.workspace.workspaceId, toolName: tool.name, input: input.call.input, createdAt: new Date().toISOString() }
      this.emit({ type: 'approval-requested', request })
      const outcome = await new Promise<ApprovalOutcome>((resolve) => {
        const timer = setTimeout(() => { const pending = session.pending.get(approvalId); if (!pending) return; session.pending.delete(approvalId); resolve('timed-out') }, session.timeoutMs)
        session.pending.set(approvalId, { resolve, timer })
      })
      if (outcome !== 'approved') {
        const timedOut = outcome === 'timed-out'
        const result = this.result(session, tool.name, correlationId, timedOut ? 'timed-out' : 'cancelled', undefined, timedOut ? 'Tool approval timed out' : outcome === 'denied' ? 'Tool approval denied' : 'Session cancelled', approvalId)
        this.emit({ type: timedOut ? 'tool-timed-out' : 'tool-cancelled', result }); return result
      }
    }
    const startedAt = new Date().toISOString(); this.emit({ type: 'tool-started', sessionId: session.id, correlationId, toolName: tool.name, startedAt })
    const executionController = new AbortController()
    const abortExecution = () => executionController.abort()
    session.controller.signal.addEventListener('abort', abortExecution, { once: true })
    try {
      const output = await this.withTimeout(Promise.resolve(tool.execute(input.call.input, { workspaceId: session.workspace.workspaceId, workspaceRoot: session.workspace.workspaceRoot, signal: executionController.signal })), session.timeoutMs, session.controller.signal, executionController)
      const result = this.result(session, tool.name, correlationId, 'completed', output, undefined, undefined, startedAt)
      this.emit({ type: 'tool-completed', result }); return result
    } catch (error) {
      const timedOut = error instanceof ToolTimeoutError
      const status = timedOut ? 'timed-out' : session.controller.signal.aborted ? 'cancelled' : 'failed'
      if (timedOut) { session.status = 'timed-out'; session.updatedAt = new Date().toISOString(); session.controller.abort(); this.settleApprovals(session, 'cancelled') }
      const result = this.result(session, tool.name, correlationId, status, undefined, error instanceof Error ? error.message : String(error), undefined, startedAt)
      this.emit({ type: timedOut ? 'tool-timed-out' : status === 'cancelled' ? 'tool-cancelled' : 'tool-failed', result }); return result
    } finally {
      session.controller.signal.removeEventListener('abort', abortExecution)
    }
  }

  async cancelSession(id: string): Promise<AgentSession> { const session = this.sessions.get(id); if (!session) throw new Error('Unknown session'); if (session.status === 'running') { session.status = 'cancelled'; session.updatedAt = new Date().toISOString(); session.controller.abort(); this.settleApprovals(session, 'cancelled'); await Promise.all([...session.activeCalls]); this.endSessionWhenIdle(session) }; return this.publicSession(session) }
  resolveApproval(input: ApprovalResult): boolean { for (const session of this.sessions.values()) { const pending = session.pending.get(input.approvalId); if (pending) { session.pending.delete(input.approvalId); clearTimeout(pending.timer); pending.resolve(input.approved ? 'approved' : 'denied'); return true } } return false }
  executeFunctionCall(input: ExecuteToolInput): Promise<ToolResult> { return this.executeTool({ ...input, call: { ...input.call, source: 'function-calling' } }) }
  executePlannerStep(input: ExecuteToolInput): Promise<ToolResult> { return this.executeTool({ ...input, call: { ...input.call, source: 'planner' } }) }
  getSession(id: string): AgentSession | null { const session = this.sessions.get(id); return session ? this.publicSession(session) : null }
  private publicSession(session: ActiveSession): AgentSession { const { controller: _controller, pending: _pending, activeCalls: _activeCalls, ended: _ended, ...publicValue } = session; return publicValue }
  private endSession(session: ActiveSession): void { if (session.ended) return; session.ended = true; this.emit({ type: 'session-ended', session: this.publicSession(session) }) }
  private endSessionWhenIdle(session: ActiveSession): void { if (session.status !== 'running' && session.activeCalls.size === 0) this.endSession(session) }
  private settleApprovals(session: ActiveSession, outcome: ApprovalOutcome): void { session.pending.forEach(({ resolve, timer }) => { clearTimeout(timer); resolve(outcome) }); session.pending.clear() }
  private result(session: ActiveSession, toolName: string, correlationId: string, status: ToolResult['status'], output?: unknown, error?: string, approvalId?: string, startedAt = new Date().toISOString()): ToolResult { const completedAt = new Date().toISOString(); const summary = error ? `${toolName} ${status}: ${error}` : `${toolName} ${status}`; return { workspaceId: session.workspace.workspaceId, sessionId: session.id, correlationId, toolName, status, startedAt, completedAt, durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)), summary, output, error, approvalId } }
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, signal: AbortSignal, executionController: AbortController): Promise<T> { return await new Promise<T>((resolve, reject) => { const timer = setTimeout(() => { executionController.abort(); reject(new ToolTimeoutError('Tool execution timed out')) }, timeoutMs); const abort = () => { clearTimeout(timer); executionController.abort(); reject(new Error('Tool execution cancelled')) }; if (signal.aborted) return abort(); signal.addEventListener('abort', abort, { once: true }); promise.then((value) => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(value) }, (error) => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(error) }) }) }
}

export const workspaceAgentRuntime = new WorkspaceAgentRuntime()
