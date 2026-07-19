import { createHash } from 'crypto'
import type { CompanionActionTokens } from './action-token'
import type { CompanionAuditStore } from './audit-store'
import type { CompanionBinding, CompanionBindingStore } from './binding-store'
import type {
  CompanionCommand,
  CompanionControlPolicy,
  CompanionRequest,
  CompanionRequestContext,
  CompanionResult,
  CompanionResultCode,
} from './contracts'
import type { CompanionDedupe } from './dedupe'
import type { CompanionTerminalControl } from './terminal-control'

const DEFAULT_PROMPT_LIMIT = 4_000
const DEFAULT_REQUEST_MAX_AGE_MS = 5 * 60 * 1000

export interface CompanionGatewayOptions {
  policy: () => CompanionControlPolicy
  bindings: CompanionBindingStore
  tokens: CompanionActionTokens
  dedupe: CompanionDedupe
  audit: CompanionAuditStore
  terminals: CompanionTerminalControl
  createTerminal?: (workspaceId: string, engine: 'claude' | 'codex' | 'opencode') => Promise<string>
  listWorkspaces?: () => Promise<Array<{ id: string; name: string; path: string }>>
  bindingTtlMs?: number
  now?: () => number
}

export class CompanionGateway {
  private readonly now: () => number
  private readonly bindingTtlMs: number

  constructor(private readonly options: CompanionGatewayOptions) {
    this.now = options.now ?? Date.now
    this.bindingTtlMs = options.bindingTtlMs ?? 8 * 60 * 60 * 1000
  }

  async execute(request: CompanionRequest): Promise<CompanionResult> {
    const validation = this.validateContext(request.context)
    if (validation) return this.recordResult(request, validation)

    try {
      return await this.options.dedupe.runEvent(
        {
          provider: request.context.provider,
          eventId: request.context.eventId,
          operatorOpenId: request.context.operatorOpenId,
          chatId: request.context.chatId,
          threadId: request.context.threadId,
          command: request.command.type,
          commandFingerprint: fingerprintCommand(request.command),
        },
        async () => {
          let auditId: string
          try {
            auditId = await this.options.audit.begin(request.context, request.command)
          } catch {
            return denied('execution-failed', 'Action was not executed because its audit intent could not be recorded')
          }

          let result: CompanionResult
          try {
            result = await this.executeOnce(request)
          } catch {
            result = denied('execution-failed', 'Companion action failed safely')
          }
          try {
            await this.options.audit.complete(auditId, request.context, request.command, result)
            return result
          } catch {
            return denied(
              'execution-failed',
              'Action will not be repeated because its audit outcome could not be recorded',
              result.targetTerminalId,
            )
          }
        },
        () => this.recordResult(
          request,
          denied('invalid-request', 'Event id scope does not match its original delivery'),
        ),
      )
    } catch {
      return denied('execution-failed', 'Action will not be repeated because replay state could not be finalized')
    }
  }

  issueActionToken(
    context: Pick<CompanionRequestContext, 'provider' | 'operatorOpenId' | 'chatId' | 'threadId'>,
    terminalId: string,
    action: CompanionCommand['type'],
    expiresAt: number,
  ): string {
    return this.options.tokens.issue({ ...context, terminalId, action, exp: expiresAt })
  }

  issueWorkspaceActionToken(
    context: Pick<CompanionRequestContext, 'provider' | 'operatorOpenId' | 'chatId' | 'threadId'>,
    workspaceId: string,
    engine: 'claude' | 'codex' | 'opencode',
    expiresAt: number,
  ): string {
    return this.options.tokens.issue({ ...context, workspaceId, engine, action: 'create-terminal', exp: expiresAt })
  }

  private validateContext(context: CompanionRequestContext): CompanionResult | null {
    const policy = this.options.policy()
    if (!policy.enabled || policy.mode !== 'app') return denied('disabled', 'Inbound control is disabled')
    if (
      context.provider !== 'feishu'
      || !isIdentity(context.eventId)
      || !isIdentity(context.operatorOpenId)
      || !isIdentity(context.chatId)
      || (context.threadId !== undefined && !isIdentity(context.threadId))
      || !Number.isFinite(context.timestamp)
      || Math.abs(this.now() - context.timestamp) > (policy.requestMaxAgeMs ?? DEFAULT_REQUEST_MAX_AGE_MS)
    ) return denied('invalid-request', 'Invalid request identity or timestamp')
    if (!policy.allowedOpenIds.includes(context.operatorOpenId)) {
      return denied('unauthorized', 'Operator is not authorized')
    }
    return null
  }

  private async executeOnce(request: CompanionRequest): Promise<CompanionResult> {
    if (request.command.type === 'terminals') {
      return allowed('Live terminals listed', undefined, {
        terminals: (this.options.terminals.listTerminals?.() ?? []).slice(0, 50),
        workspaces: (await this.options.listWorkspaces?.() ?? []).slice(0, 25),
      })
    }
    if (request.command.type === 'create-terminal') {
      if (!this.options.createTerminal) return denied('execution-failed', 'Terminal creation is unavailable')
      const tokenError = await this.verifyWorkspaceActionToken(request, request.command.workspaceId, request.command.engine)
      if (tokenError) return tokenError
      try {
        const terminalId = await this.options.createTerminal(request.command.workspaceId, request.command.engine)
        return allowed('Terminal created', terminalId)
      } catch {
        return denied('execution-failed', 'Terminal creation failed')
      }
    }
    if (request.command.type === 'bind') {
      return this.bind(request.context, request.command, request.actionToken)
    }
    const resolution = await this.options.bindings.resolve(request.context)
    if (resolution.status === 'missing') {
      if (request.command.type === 'status') return allowed('No terminal is bound', undefined, { bound: false })
      return denied('unbound', 'No terminal is bound to this conversation')
    }
    if (resolution.status === 'expired') {
      this.options.terminals.clearPendingApproval(resolution.binding.terminalId)
      return denied('expired-binding', 'The terminal binding has expired', resolution.binding.terminalId)
    }
    const binding = resolution.binding
    if (request.command.type === 'unbind') {
      const tokenError = await this.verifyActionToken(request, binding.terminalId)
      return tokenError ?? this.unbind(request.context, binding)
    }

    const terminal = this.options.terminals.getTerminal(binding.terminalId)
    if (!terminal) {
      await this.options.bindings.unbind(request.context)
      this.options.terminals.clearPendingApproval(binding.terminalId)
      return denied('terminal-unavailable', 'The bound terminal is no longer available', binding.terminalId)
    }
    const tokenError = await this.verifyActionToken(request, binding.terminalId)
    if (tokenError) return tokenError

    switch (request.command.type) {
      case 'status':
        return allowed('Terminal is bound', binding.terminalId, { bound: true, engine: terminal.engine })
      case 'follow-up':
        return this.followUp(request.command.text, binding.terminalId)
      case 'stop':
        await this.options.terminals.interrupt(binding.terminalId)
        return allowed('Interrupt sent', binding.terminalId)
      case 'approve':
      case 'reject':
        if (!this.options.terminals.hasPendingApproval(binding.terminalId)) {
          return denied('approval-not-pending', 'No approval is pending for this terminal', binding.terminalId)
        }
        await this.options.terminals.respondToApproval(binding.terminalId, request.command.type === 'approve')
        return allowed(request.command.type === 'approve' ? 'Approval sent' : 'Rejection sent', binding.terminalId)
    }
  }

  private async bind(
    context: CompanionRequestContext,
    command: Extract<CompanionCommand, { type: 'bind' }>,
    actionToken?: string,
  ): Promise<CompanionResult> {
    const terminal = this.options.terminals.getTerminal(command.terminalId)
    if (!terminal) return denied('invalid-target', 'An explicit live CLI-agent terminal is required')
    const tokenError = await this.verifyActionToken({ context, command, actionToken }, terminal.terminalId)
    if (tokenError) return tokenError
    const binding: CompanionBinding = {
      provider: context.provider,
      chatId: context.chatId,
      threadId: context.threadId,
      terminalId: terminal.terminalId,
      createdBy: context.operatorOpenId,
      createdAt: this.now(),
      expiresAt: this.now() + this.bindingTtlMs,
    }
    await this.options.bindings.bind(binding)
    return allowed('Terminal bound', terminal.terminalId, { expiresAt: binding.expiresAt })
  }

  private async unbind(context: CompanionRequestContext, binding: CompanionBinding): Promise<CompanionResult> {
    await this.options.bindings.unbind(context)
    this.options.terminals.clearPendingApproval(binding.terminalId)
    return allowed('Terminal unbound', binding.terminalId)
  }

  private async followUp(text: string, terminalId: string): Promise<CompanionResult> {
    const normalized = text.trim()
    const limit = this.options.policy().maxPromptLength ?? DEFAULT_PROMPT_LIMIT
    if (!normalized || normalized.length > limit || /[\x00-\x1f\x7f]/.test(normalized)) {
      return denied('invalid-prompt', `Prompt must be one line between 1 and ${limit} characters`, terminalId)
    }
    await this.options.terminals.submitLine(terminalId, normalized)
    return allowed('Follow-up submitted', terminalId, { length: normalized.length })
  }

  private async verifyActionToken(request: CompanionRequest, terminalId: string): Promise<CompanionResult | null> {
    if (!request.actionToken) return null
    const verification = this.options.tokens.verify(request.actionToken, {
      provider: request.context.provider,
      operatorOpenId: request.context.operatorOpenId,
      chatId: request.context.chatId,
      threadId: request.context.threadId,
      terminalId,
      action: request.command.type,
    })
    if (!verification.ok) return denied(verification.reason, 'Action token is invalid for this request', terminalId)
    if (!await this.options.dedupe.consumeAction(verification.claims.jti, verification.claims.exp)) {
      return denied('token-replayed', 'Action token has already been used', terminalId)
    }
    return null
  }

  private async verifyWorkspaceActionToken(request: CompanionRequest, workspaceId: string, engine: 'claude' | 'codex' | 'opencode'): Promise<CompanionResult | null> {
    if (!request.actionToken) return denied('invalid-token', 'A signed workspace action token is required')
    const verification = this.options.tokens.verify(request.actionToken, {
      provider: request.context.provider, operatorOpenId: request.context.operatorOpenId,
      chatId: request.context.chatId, threadId: request.context.threadId,
      workspaceId, engine, action: 'create-terminal',
    })
    if (!verification.ok) return denied(verification.reason, 'Action token is invalid for this request')
    if (!await this.options.dedupe.consumeAction(verification.claims.jti, verification.claims.exp)) {
      return denied('token-replayed', 'Action token has already been used')
    }
    return null
  }

  private async recordResult(request: CompanionRequest, result: CompanionResult): Promise<CompanionResult> {
    try {
      await this.options.audit.record(request.context, request.command, result)
      return result
    } catch {
      return denied('execution-failed', 'Request was rejected but its audit record could not be persisted')
    }
  }
}

function isIdentity(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x20\x7f]/.test(value)
}

function fingerprintCommand(command: CompanionCommand): string {
  const payload = command.type === 'bind'
    ? `${command.type}\u0000${command.terminalId}`
    : command.type === 'create-terminal'
      ? `${command.type}\u0000${command.workspaceId}\u0000${command.engine}`
    : command.type === 'follow-up'
      ? `${command.type}\u0000${command.text}`
      : command.type
  return createHash('sha256').update(payload).digest('hex')
}

function allowed(message: string, targetTerminalId?: string, data?: Record<string, unknown>): CompanionResult {
  return { ok: true, code: 'ok', message, targetTerminalId, data }
}

function denied(code: CompanionResultCode, message: string, targetTerminalId?: string): CompanionResult {
  return { ok: false, code, message, targetTerminalId }
}
