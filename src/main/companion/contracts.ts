import type { CompanionEngine } from './session-state'

export type CompanionProvider = 'feishu'

export interface CompanionRequestContext {
  provider: CompanionProvider
  eventId: string
  operatorOpenId: string
  chatId: string
  threadId?: string
  timestamp: number
}

export type CompanionCommand =
  | { type: 'status' }
  | { type: 'terminals' }
  | { type: 'create-terminal'; workspaceId: string; engine: CompanionEngine }
  | { type: 'bind'; terminalId: string }
  | { type: 'unbind' }
  | { type: 'follow-up'; text: string }
  | { type: 'stop' }
  | { type: 'approve' }
  | { type: 'reject' }

export interface CompanionRequest {
  context: CompanionRequestContext
  command: CompanionCommand
  actionToken?: string
}

export type CompanionResultCode =
  | 'ok'
  | 'disabled'
  | 'unauthorized'
  | 'invalid-request'
  | 'invalid-target'
  | 'unbound'
  | 'expired-binding'
  | 'terminal-unavailable'
  | 'invalid-prompt'
  | 'approval-not-pending'
  | 'invalid-token'
  | 'expired-token'
  | 'token-scope-mismatch'
  | 'token-replayed'
  | 'execution-failed'

export interface CompanionResult {
  ok: boolean
  code: CompanionResultCode
  message: string
  targetTerminalId?: string
  replayed?: boolean
  data?: Record<string, unknown>
}

export interface CompanionControlPolicy {
  enabled: boolean
  mode: 'app' | 'webhook'
  allowedOpenIds: readonly string[]
  maxPromptLength?: number
  requestMaxAgeMs?: number
}
