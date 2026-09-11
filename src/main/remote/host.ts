/**
 * @file 账号制 LAN 远控被控端（ToB M3）
 * @description LAN 监听的受控入口：验配对码 → 验控制端会话 + 同组织 Membership →
 *              绑设备 → 转 `gateway.execute`。无账号不连；错码/跨组织/禁用后一律拒绝。
 *              每次执行都重验会话（登出/禁用即时失效，fail-closed）；显式 revoke 只做清理加速。
 *              公网 Relay 仅在 transport 层留接口，本步只走 lan（见 transport.ts）。
 */

// Note: same-account gate with LAN pairing codes — see .agents/notes/implemented/feature/2026-08-20-tob-lan-remote.md
import { randomBytes, randomUUID } from 'crypto'
import { createHash } from 'crypto'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { app } from 'electron'
import type {
  CompanionCommand,
  CompanionRequest,
  CompanionResult,
} from '../companion/contracts'
import { CompanionActionTokens } from '../companion/action-token'
import { CompanionAuditStore } from '../companion/audit-store'
import { CompanionBindingStore } from '../companion/binding-store'
import { CompanionDedupe } from '../companion/dedupe'
import { CompanionGateway } from '../companion/gateway'
import { LanPairingCodes } from '../companion/lan-pairing'
import { MainProcessTerminalControl } from '../companion/terminal-control'
import { listRegisteredWorkspaces, resolveRegisteredWorkspace } from '../companion/workspace-registry'
import { terminalManager } from '../terminal/manager'
import { createCompanionTerminal, submitCompanionTerminalLine } from '../ipc/terminal-handlers'
import { TeamError } from '../team/service'
import type { TeamSession } from '../../shared/team/types'
import {
  remoteAuditFile,
  remoteBindingsFile,
  remoteDedupeFile,
  remoteSecretFile,
} from './paths'

/** 配对码有效期：5 分钟，单次有效（doc §P2/M3）。 */
export const PAIRING_TTL_MS = 5 * 60 * 1000
/** action-token 默认有效期：分钟级（doc M3）。 */
export const ACTION_TOKEN_TTL_MS = 5 * 60 * 1000
/** tail 经 IPC 的截断上限，避免 1MB 全量 buffer 压垮通道。 */
export const TAIL_IPC_LIMIT = 128 * 1024

/** Host 对账号体系的最小依赖面（生产接 teamService，测试可注假）。 */
export interface RemoteTeamPort {
  resolveSession(token: string): Promise<TeamSession>
}

export interface TrustedDevice {
  deviceId: string
  userId: string
  tenantId: string
  name: string
  pairedAt: number
  lastSeenAt: number
}

interface PairingMeta {
  hostUserId: string
  hostTenantId: string
  hostDeviceId: string
}

export interface RemoteHostOptions {
  team: RemoteTeamPort
  gateway: CompanionGateway
  bindings: CompanionBindingStore
  pairing?: LanPairingCodes
  now?: () => number
  tailProvider?: (terminalId: string) => { data: string; seq: number } | null
  listTerminalsProvider?: () => Array<{ terminalId: string; engine: string; workspaceId: string }>
}

function teamChatId(deviceId: string): string {
  return `team:${deviceId}`
}

export class RemoteHost {
  private readonly team: RemoteTeamPort
  private readonly gateway: CompanionGateway
  private readonly bindings: CompanionBindingStore
  private readonly pairing: LanPairingCodes
  private readonly now: () => number
  private readonly tailProvider: (terminalId: string) => { data: string; seq: number } | null
  private readonly listTerminalsProvider: () => Array<{ terminalId: string; engine: string; workspaceId: string }>
  private readonly trusted = new Map<string, TrustedDevice>()
  private readonly pairingMeta = new Map<string, PairingMeta>()

  constructor(options: RemoteHostOptions) {
    this.team = options.team
    this.gateway = options.gateway
    this.bindings = options.bindings
    this.now = options.now ?? Date.now
    this.pairing = options.pairing ?? new LanPairingCodes(this.now, PAIRING_TTL_MS)
    this.tailProvider = options.tailProvider ?? ((terminalId) => terminalManager.getOutputReplay(terminalId))
    this.listTerminalsProvider = options.listTerminalsProvider
      ?? (() => terminalManager.listInstances().map((t) => ({ terminalId: t.id, engine: 'shell', workspaceId: t.config.workspaceId ?? '' })))
  }

  /** 被控端签发配对码：需被控端已登录且在组织内。 */
  async issuePairingCode(hostToken: string): Promise<{ code: string; expiresAt: number }> {
    const session = await this.team.resolveSession(hostToken).catch((error: unknown) => {
      throw asTeamError(error)
    })
    if (!session.activeTenantId) throw new TeamError('forbidden', '请先创建或加入组织后再开启远控')
    const { code, expiresAt } = this.pairing.issue(session.deviceId, session.deviceId)
    this.pairingMeta.set(code, {
      hostUserId: session.userId,
      hostTenantId: session.activeTenantId,
      hostDeviceId: session.deviceId,
    })
    return { code, expiresAt }
  }

  /**
   * 控制端 redeem：验配对码 → 验控制端会话 → 同账号（同用户个人版 / 同组织团队版）→ 绑设备。
   * 跨组织、错码、过期、复用、会话失效一律拒绝。
   */
  async redeemPairingCode(input: {
    code: string
    clientDeviceId: string
    clientDeviceName?: string
    clientToken: string
  }): Promise<{ hostDeviceId: string; tenantId: string }> {
    const normalized = input.code.trim().toUpperCase()
    const meta = this.pairingMeta.get(normalized)
    const redeemed = this.pairing.redeem(normalized, input.clientDeviceId)
    if (!redeemed.ok) {
      if (redeemed.reason === 'expired-code') {
        if (meta) this.pairingMeta.delete(normalized)
        throw new TeamError('invite-expired', '配对码已过期，请重新生成')
      }
      if (redeemed.reason === 'redeemed-code') throw new TeamError('invite-used', '配对码已被使用，请重新生成')
      throw new TeamError('invite-invalid', '配对码无效')
    }
    if (!meta) throw new TeamError('invite-invalid', '配对码无效')
    this.pairingMeta.delete(normalized)

    const session = await this.team.resolveSession(input.clientToken).catch((error: unknown) => {
      throw asTeamError(error)
    })
    if (!input.clientDeviceId || session.deviceId !== input.clientDeviceId) {
      throw new TeamError('forbidden', '设备与会话不一致，请重新登录后重试')
    }
    const sameUser = session.userId === meta.hostUserId
    const sameTenant = session.activeTenantId === meta.hostTenantId
    if (!sameUser && !sameTenant) throw new TeamError('forbidden', '不在同一账号/组织，不允许配对')
    if (!session.activeTenantId) throw new TeamError('forbidden', '请先加入组织后再配对')

    const now = this.now()
    this.trusted.set(input.clientDeviceId, {
      deviceId: input.clientDeviceId,
      userId: session.userId,
      tenantId: meta.hostTenantId,
      name: input.clientDeviceName?.trim() || input.clientDeviceId,
      pairedAt: now,
      lastSeenAt: now,
    })
    return { hostDeviceId: meta.hostDeviceId, tenantId: meta.hostTenantId }
  }

  /** 每次执行前重验：会话有效 + 设备受信 + 仍在配对组织内（登出/禁用即时失效）。 */
  private async requireTrusted(clientToken: string, clientDeviceId: string): Promise<{ session: TeamSession; trust: TrustedDevice }> {
    const trust = this.trusted.get(clientDeviceId)
    if (!trust) throw new TeamError('forbidden', '设备未配对，请先输入配对码')
    const session = await this.team.resolveSession(clientToken).catch((error: unknown) => {
      throw asTeamError(error)
    })
    if (session.deviceId !== clientDeviceId) throw new TeamError('forbidden', '设备与会话不一致')
    const sameUser = session.userId === trust.userId
    const sameTenant = session.activeTenantId === trust.tenantId
    if (!sameUser && !sameTenant) throw new TeamError('forbidden', '不在同一账号/组织，访问被拒绝')
    trust.lastSeenAt = this.now()
    return { session, trust }
  }

  /** 只读视图前的准入校验：会话有效 + 设备受信 + 仍在配对组织内。 */
  async verifyAccess(clientToken: string, clientDeviceId: string): Promise<void> {
    await this.requireTrusted(clientToken, clientDeviceId)
  }

  async listTerminals(clientToken: string, clientDeviceId: string): Promise<Array<{ terminalId: string; engine: string; workspaceId: string }>> {
    await this.requireTrusted(clientToken, clientDeviceId)
    return this.listTerminalsProvider()
  }

  async getTail(clientToken: string, clientDeviceId: string, terminalId: string): Promise<{ data: string; seq: number }> {
    await this.requireTrusted(clientToken, clientDeviceId)
    const replay = this.tailProvider(terminalId)
    if (!replay) throw new TeamError('not-found', '终端不存在或已退出')
    const data = replay.data.length > TAIL_IPC_LIMIT ? replay.data.slice(-TAIL_IPC_LIMIT) : replay.data
    return { data, seq: replay.seq }
  }

  /**
   * 受控执行：只支持网关已有语义（status/terminals/bind/unbind/follow-up/stop），
   * 不新增命令；查看终端、提交一行、中断均走 gateway 留痕。
   */
  async execute(input: {
    clientToken: string
    clientDeviceId: string
    command: CompanionCommand
    actionToken?: string
    eventId?: string
  }): Promise<CompanionResult> {
    const { session, trust } = await this.requireTrusted(input.clientToken, input.clientDeviceId)
    const request: CompanionRequest = {
      context: {
        provider: 'team',
        eventId: input.eventId ?? randomUUID(),
        operatorOpenId: input.clientDeviceId,
        deviceId: input.clientDeviceId,
        userId: session.userId,
        tenantId: trust.tenantId,
        chatId: teamChatId(input.clientDeviceId),
        timestamp: this.now(),
        transport: 'lan',
        sessionId: `team:${session.userId}:${session.deviceId}`,
      },
      command: input.command,
      ...(input.actionToken ? { actionToken: input.actionToken } : {}),
    }
    return this.gateway.execute(request)
  }

  /** 受控建终端：验配对 → 签工作区级单次 token → 走网关创建并留痕。 */
  async createTerminal(input: {
    clientToken: string
    clientDeviceId: string
    workspaceId: string
    engine: 'claude' | 'codex' | 'opencode'
  }): Promise<CompanionResult> {
    const { session, trust } = await this.requireTrusted(input.clientToken, input.clientDeviceId)
    const actionToken = this.gateway.issueWorkspaceActionToken(
      {
        provider: 'team',
        operatorOpenId: input.clientDeviceId,
        chatId: teamChatId(input.clientDeviceId),
        userId: session.userId,
        tenantId: trust.tenantId,
        deviceId: input.clientDeviceId,
      },
      input.workspaceId,
      input.engine,
      this.now() + ACTION_TOKEN_TTL_MS,
    )
    const request: CompanionRequest = {
      context: {
        provider: 'team',
        eventId: randomUUID(),
        operatorOpenId: input.clientDeviceId,
        deviceId: input.clientDeviceId,
        userId: session.userId,
        tenantId: trust.tenantId,
        chatId: teamChatId(input.clientDeviceId),
        timestamp: this.now(),
        transport: 'lan',
        sessionId: `team:${session.userId}:${session.deviceId}`,
      },
      command: { type: 'create-terminal', workspaceId: input.workspaceId, engine: input.engine },
      actionToken,
    }
    return this.gateway.execute(request)
  }

  /**
   * 受控销毁终端：验配对后直杀 PTY（与桌面关闭终端一致）。
   * 会话/hook/遥测等清理走终端 lifecycle 的 onExit；绑定的 stale 引用由网关下次使用时自愈。
   */
  async killTerminal(input: {
    clientToken: string
    clientDeviceId: string
    terminalId: string
  }): Promise<{ success: boolean; terminalId: string }> {
    await this.requireTrusted(input.clientToken, input.clientDeviceId)
    const terminalId = input.terminalId.trim()
    if (!terminalId || terminalId.includes('/')) throw new TeamError('invalid-request', '终端标识非法')
    if (!terminalManager.getInstance(terminalId)) throw new TeamError('not-found', '终端不存在或已退出')
    terminalManager.kill(terminalId)
    return { success: true, terminalId }
  }

  /**
   * 受控同步终端尺寸：浏览器 far 端 xterm fit 出的列行数回传，被控端 PTY 跟着变
   * （发 SIGWINCH，全屏 TUI 如 opencode 重绘后即占满）。纯显示提示，失败不抛给调用方看。
   * manager.resize 内含归一化（越界钳制、未变化 no-op），此处只做配对与标识校验。
   */
  async resizeTerminal(input: {
    clientToken: string
    clientDeviceId: string
    terminalId: string
    cols: number
    rows: number
  }): Promise<{ success: boolean; terminalId: string; cols: number; rows: number }> {
    await this.requireTrusted(input.clientToken, input.clientDeviceId)
    const terminalId = input.terminalId.trim()
    if (!terminalId || terminalId.includes('/')) throw new TeamError('invalid-request', '终端标识非法')
    if (!Number.isFinite(input.cols) || !Number.isFinite(input.rows)) {
      throw new TeamError('invalid-request', '终端尺寸非法')
    }
    if (!terminalManager.getInstance(terminalId)) throw new TeamError('not-found', '终端不存在或已退出')
    terminalManager.resize(terminalId, Math.floor(input.cols), Math.floor(input.rows))
    return { success: true, terminalId, cols: Math.floor(input.cols), rows: Math.floor(input.rows) }
  }

  /** 为受控写操作签发分钟级单次 action-token（复用 dedupe 防重放）。 */
  async issueActionToken(input: {
    clientToken: string
    clientDeviceId: string
    terminalId: string
    action: CompanionCommand['type']
    ttlMs?: number
  }): Promise<{ token: string; expiresAt: number }> {
    const { session, trust } = await this.requireTrusted(input.clientToken, input.clientDeviceId)
    const expiresAt = this.now() + (input.ttlMs ?? ACTION_TOKEN_TTL_MS)
    const token = this.gateway.issueActionToken(
      {
        provider: 'team',
        operatorOpenId: input.clientDeviceId,
        chatId: teamChatId(input.clientDeviceId),
        userId: session.userId,
        tenantId: trust.tenantId,
        deviceId: input.clientDeviceId,
      },
      input.terminalId,
      input.action,
      expiresAt,
    )
    return { token, expiresAt }
  }

  async listTrustedDevices(hostToken: string): Promise<TrustedDevice[]> {
    const session = await this.team.resolveSession(hostToken).catch((error: unknown) => {
      throw asTeamError(error)
    })
    return [...this.trusted.values()].filter(
      (t) => t.tenantId === session.activeTenantId || t.userId === session.userId,
    )
  }

  async revokeDevice(hostToken: string, deviceId: string): Promise<{ success: boolean }> {
    const session = await this.team.resolveSession(hostToken).catch((error: unknown) => {
      throw asTeamError(error)
    })
    const trust = this.trusted.get(deviceId)
    if (!trust) return { success: true }
    if (trust.tenantId !== session.activeTenantId && trust.userId !== session.userId) {
      throw new TeamError('forbidden', '无权吊销该设备')
    }
    this.trusted.delete(deviceId)
    await this.bindings.unbind({
      provider: 'team',
      chatId: teamChatId(deviceId),
      userId: trust.userId,
      tenantId: trust.tenantId,
      deviceId,
    }).catch(() => undefined)
    return { success: true }
  }

  /** 登出/禁用后的清理加速（安全由 requireTrusted 逐调用保证，此处只做 unbind）。 */
  async revokeDevicesByUser(userId: string, deviceId?: string): Promise<void> {
    for (const [id, trust] of [...this.trusted]) {
      if (trust.userId !== userId) continue
      if (deviceId && id !== deviceId) continue
      this.trusted.delete(id)
      await this.bindings.unbind({
        provider: 'team',
        chatId: teamChatId(id),
        userId: trust.userId,
        tenantId: trust.tenantId,
        deviceId: id,
      }).catch(() => undefined)
    }
  }

  async revokeDevicesByTenant(tenantId: string): Promise<void> {
    for (const [id, trust] of [...this.trusted]) {
      if (trust.tenantId !== tenantId) continue
      this.trusted.delete(id)
      await this.bindings.unbind({
        provider: 'team',
        chatId: teamChatId(id),
        userId: trust.userId,
        tenantId: trust.tenantId,
        deviceId: id,
      }).catch(() => undefined)
    }
  }

  trustedDeviceIds(): string[] {
    return [...this.trusted.keys()]
  }
}

function asTeamError(error: unknown): TeamError {
  if (error instanceof TeamError) return error
  return new TeamError('invalid-session', error instanceof Error ? error.message : '会话无效，请重新登录')
}

async function loadActionSecret(): Promise<string> {
  try {
    const raw = await readFile(remoteSecretFile(), 'utf8')
    if (raw.trim().length >= 32) return raw.trim()
  } catch {
    /* 首次生成 */
  }
  const created = randomBytes(32).toString('hex')
  await mkdir(dirname(remoteSecretFile()), { recursive: true })
  await writeFile(remoteSecretFile(), created, 'utf8')
  return created
}

let productionHost: RemoteHost | null = null

/** 生产单例：自建 gateway（policy allowlist = 受信设备），与飞书网关隔离。 */
export async function getProductionRemoteHost(team: RemoteTeamPort): Promise<RemoteHost> {
  if (productionHost) return productionHost
  const secret = await loadActionSecret()
  const bindings = new CompanionBindingStore(remoteBindingsFile())
  const hostRef: { current: RemoteHost | null } = { current: null }
  const gateway = new CompanionGateway({
    policy: () => ({
      enabled: true,
      mode: 'app',
      allowedOpenIds: hostRef.current?.trustedDeviceIds() ?? [],
    }),
    bindings,
    tokens: new CompanionActionTokens(createHash('sha256').update(`janusx-remote:${secret}`).digest('hex')),
    dedupe: new CompanionDedupe(remoteDedupeFile()),
    audit: new CompanionAuditStore(remoteAuditFile(), 30 * 24 * 60 * 60 * 1000),
    terminals: new MainProcessTerminalControl((id, text) => submitCompanionTerminalLine(id, text)),
    createTerminal: async (workspaceId, engine) => {
      const rootDir = join(app.getPath('userData'), 'janusx', 'workspaces')
      const record = await resolveRegisteredWorkspace(rootDir, workspaceId)
      const terminalId = randomUUID()
      await createCompanionTerminal({
        id: terminalId,
        workspaceId,
        cwd: record.path,
        shell: process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash'),
        preset: engine,
      })
      return terminalId
    },
    listWorkspaces: async () => {
      const rootDir = join(app.getPath('userData'), 'janusx', 'workspaces')
      return listRegisteredWorkspaces(rootDir)
    },
  })
  const host = new RemoteHost({ team, gateway, bindings })
  hostRef.current = host
  productionHost = host
  return host
}

/** 仅测试/重建用：丢弃生产单例。 */
export function resetProductionRemoteHost(): void {
  productionHost = null
}

/**
 * 团队侧登出/禁用的清理钩子：生产单例未创建时直接 no-op，避免为一次登出
 * 冷启动整个远控网关；安全由 `requireTrusted` 逐调用重验保证，此处只加速 unbind。
 */
export async function notifyTeamDeviceRevoked(userId: string, deviceId?: string): Promise<void> {
  if (!productionHost) return
  await productionHost.revokeDevicesByUser(userId, deviceId).catch(() => undefined)
}
