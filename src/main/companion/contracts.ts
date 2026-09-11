import type { CompanionEngine } from './session-state'
import type { TeamRole } from '../../shared/team/types'

export type CompanionProvider = 'feishu' | 'lan' | 'team'

/** 传输标记：M3 仅 lan 直连，relay 只留接口（M5 实现）。 */
export type CompanionTransport = 'lan' | 'relay'

export interface CompanionRequestContext {
  provider: CompanionProvider
  eventId: string
  operatorOpenId: string
  chatId: string
  threadId?: string
  timestamp: number
  /**
   * LAN operator device UUID (M3 team device identity). Required when
   * provider is 'lan' or 'team': operatorOpenId must equal deviceId so the paired
   * device set maps 1:1 onto the policy allowlist. Unused by 'feishu'.
   */
  deviceId?: string
  /**
   * M3 账号制远控上下文（provider 'team' 必填，'lan' 可选兼容）：
   * userId/tenantId 由被控端验控制端会话后填入，不信任客户端自报；
   * gateway 仅透传，鉴权由 RemoteHost 逐调用 Membership 校验。
   */
  userId?: string
  tenantId?: string
  projectId?: string | null
  role?: TeamRole
  transport?: CompanionTransport
  sessionId?: string
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
