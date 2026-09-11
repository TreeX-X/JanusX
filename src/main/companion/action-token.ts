import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import type { CompanionCommand, CompanionProvider } from './contracts'
import type { TeamRole } from '../../shared/team/types'

type TokenAction = CompanionCommand['type']

export interface CompanionActionClaims {
  v: 1
  jti: string
  provider: CompanionProvider
  operatorOpenId: string
  chatId: string
  threadId?: string
  terminalId?: string
  workspaceId?: string
  engine?: 'claude' | 'codex' | 'opencode'
  action: TokenAction
  exp: number
  /** M3 团队化增量：有则必须逐项匹配，无则忽略（兼容飞书旧 token）。 */
  userId?: string
  tenantId?: string
  role?: TeamRole
  deviceId?: string
}

export type TokenVerification =
  | { ok: true; claims: CompanionActionClaims }
  | { ok: false; reason: 'invalid-token' | 'expired-token' | 'token-scope-mismatch' }

function encode(value: string): string {
  return Buffer.from(value).toString('base64url')
}

export class CompanionActionTokens {
  constructor(
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {
    if (Buffer.byteLength(secret) < 32) throw new Error('Companion action token secret must be at least 32 bytes')
  }

  issue(claims: Omit<CompanionActionClaims, 'v' | 'jti'>): string {
    const payload = encode(JSON.stringify({ ...claims, v: 1, jti: randomUUID() }))
    return `${payload}.${this.sign(payload)}`
  }

  verify(token: string, expected: Omit<CompanionActionClaims, 'v' | 'jti' | 'exp'>): TokenVerification {
    const [payload, signature, extra] = token.split('.')
    if (!payload || !signature || extra || !this.validSignature(payload, signature)) {
      return { ok: false, reason: 'invalid-token' }
    }
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as CompanionActionClaims
      if (claims.v !== 1 || !claims.jti || !Number.isFinite(claims.exp)) return { ok: false, reason: 'invalid-token' }
      const workspaceAction = claims.action === 'create-terminal'
      if (workspaceAction !== Boolean(claims.workspaceId) || workspaceAction === Boolean(claims.terminalId)) {
        return { ok: false, reason: 'invalid-token' }
      }
      if (workspaceAction !== Boolean(claims.engine)) return { ok: false, reason: 'invalid-token' }
      if (claims.exp <= this.now()) return { ok: false, reason: 'expired-token' }
      const matches = claims.provider === expected.provider
        && claims.operatorOpenId === expected.operatorOpenId
        && claims.chatId === expected.chatId
        && (claims.threadId ?? '') === (expected.threadId ?? '')
        && (claims.terminalId ?? '') === (expected.terminalId ?? '')
        && (claims.workspaceId ?? '') === (expected.workspaceId ?? '')
        && (claims.engine ?? '') === (expected.engine ?? '')
        && claims.action === expected.action
        && teamClaimsMatch(claims, expected)
      return matches ? { ok: true, claims } : { ok: false, reason: 'token-scope-mismatch' }
    } catch {
      return { ok: false, reason: 'invalid-token' }
    }
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url')
  }

  private validSignature(payload: string, signature: string): boolean {
    const actual = Buffer.from(signature)
    const expected = Buffer.from(this.sign(payload))
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
}

/**
 * 团队 claims 匹配：调用方给出期望值时必须相等；
 * 旧 token 无团队字段而调用方也无期望时通过（兼容飞书）。
 */
function teamClaimsMatch(
  claims: CompanionActionClaims,
  expected: Omit<CompanionActionClaims, 'v' | 'jti' | 'exp'>,
): boolean {
  if ((expected.userId ?? '') !== '' && claims.userId !== expected.userId) return false
  if ((expected.tenantId ?? '') !== '' && claims.tenantId !== expected.tenantId) return false
  if ((expected.role ?? '') !== '' && claims.role !== expected.role) return false
  if ((expected.deviceId ?? '') !== '' && claims.deviceId !== expected.deviceId) return false
  return true
}
