/**
 * @file 控制端连接管理（ToB 双机 LAN 远控，主进程侧）
 * @description 同一时间可连一台（个人版 MVP 约束，多主机后续再放开）：
 *              配对时先验已知指纹（TOFU，中途变更不见码直拒）→ 探针验版本 →
 *              配对码 redeem → 记忆指纹。token 每次由渲染端传入，
 *              不在主进程存会话原文；设备身份每次从 token 实时解析。
 */

import type { CompanionCommand, CompanionResult } from '../companion/contracts'
import { TeamError } from '../team/service'
import type { TeamSession } from '../../shared/team/types'
import type { RemoteConnector } from './client'
import { PeerKnownHosts } from './known-hosts'
import { createHttpConnector, normalizePeerBaseUrl, probePeer } from './peer-client'

export interface PeerControlPort {
  resolveSession(token: string): Promise<TeamSession>
}

interface PeerEntry {
  connector: RemoteConnector
  baseUrl: string
  fingerprint: string
  deviceId: string
}

function asTeamError(error: unknown): TeamError {
  if (error instanceof TeamError) return error
  return new TeamError('peer-unreachable', error instanceof Error ? error.message : '连接远端失败')
}

export class PeerConnections {
  private readonly peers = new Map<string, { entry: PeerEntry; tenantId: string }>()

  constructor(
    private readonly team: PeerControlPort,
    private readonly knownHosts: PeerKnownHosts = new PeerKnownHosts(),
  ) {}

  async pair(input: {
    token: string
    deviceName: string
    baseUrl: string
    fingerprint: string
    code: string
    /** 发现列表带出的被控设备 ID：有则先验已知指纹、后验 redeem 一致性（防重定向）。 */
    expectedDeviceId?: string
  }): Promise<{ hostDeviceId: string; tenantId: string }> {
    const baseUrl = normalizePeerBaseUrl(input.baseUrl)
    const fingerprint = input.fingerprint.trim().toLowerCase()
    if (!/^[0-9a-f]{64}$/.test(fingerprint)) throw new TeamError('invalid-request', '远端指纹格式不正确，请重新发现或输入')
    const session = await this.team.resolveSession(input.token).catch((error: unknown) => {
      throw asTeamError(error)
    })
    // TOFU：发现路径已知设备且指纹变化时，不见配对码直拒。
    if (input.expectedDeviceId) {
      const known = await this.knownHosts.known(input.expectedDeviceId).catch(() => null)
      if (known && known.toLowerCase() !== fingerprint) {
        throw new TeamError('fingerprint-mismatch', '该设备证书指纹与上次不一致，已中止连接（如重装过对方，请先遗忘该设备）')
      }
    }
    await probePeer({ baseUrl, fingerprint })
    const connector = createHttpConnector({ baseUrl, fingerprint })
    const redeemed = await connector.redeem(input.code, {
      deviceId: session.deviceId,
      deviceName: input.deviceName?.trim() || 'Desktop',
      token: input.token,
    })
    if (input.expectedDeviceId && redeemed.hostDeviceId !== input.expectedDeviceId) {
      throw new TeamError('fingerprint-mismatch', '远端设备与发现时不一致，已中止连接')
    }
    await this.knownHosts.checkOrRemember(redeemed.hostDeviceId, fingerprint)
    // MVP 同一时间只连一台：新配对顶掉旧连接（旧指纹记忆保留）。
    this.peers.clear()
    this.peers.set(redeemed.hostDeviceId, {
      entry: { connector, baseUrl, fingerprint, deviceId: session.deviceId },
      tenantId: redeemed.tenantId,
    })
    return redeemed
  }

  listPeers(): Array<{ hostDeviceId: string; baseUrl: string; tenantId: string }> {
    return [...this.peers.entries()].map(([hostDeviceId, peer]) => ({
      hostDeviceId,
      baseUrl: peer.entry.baseUrl,
      tenantId: peer.tenantId,
    }))
  }

  private async connection(token: string, hostDeviceId: string): Promise<{ entry: PeerEntry; token: string }> {
    const peer = this.peers.get(hostDeviceId)
    if (!peer) throw new TeamError('invalid-request', '远控未连接，请先配对')
    const session = await this.team.resolveSession(token).catch((error: unknown) => {
      throw asTeamError(error)
    })
    if (session.deviceId !== peer.entry.deviceId) {
      throw new TeamError('invalid-session', '本机登录设备变化，请重新配对')
    }
    return { entry: peer.entry, token }
  }

  async listTerminals(token: string, hostDeviceId: string): Promise<Array<{ terminalId: string; engine: string; workspaceId: string }>> {
    const { entry, token: fresh } = await this.connection(token, hostDeviceId)
    try {
      return await entry.connector.listTerminals({ deviceId: entry.deviceId, token: fresh })
    } catch (error) {
      throw asTeamError(error)
    }
  }

  async tail(token: string, hostDeviceId: string, terminalId: string): Promise<{ data: string; seq: number }> {
    const { entry, token: fresh } = await this.connection(token, hostDeviceId)
    try {
      return await entry.connector.tail({ deviceId: entry.deviceId, token: fresh }, terminalId)
    } catch (error) {
      throw asTeamError(error)
    }
  }

  /** 被控主界面骨架三视图（远控显示契约）：回环连接器无此能力。 */
  private async requireView(hostDeviceId: string): Promise<NonNullable<RemoteConnector['view']>> {
    const peer = this.peers.get(hostDeviceId)
    if (!peer) throw new TeamError('invalid-request', '远控未连接，请先配对')
    if (!peer.entry.connector.view) throw new TeamError('invalid-request', '该连接不支持三视图')
    return peer.entry.connector.view
  }

  async viewWorkspaces(token: string, hostDeviceId: string) {
    const view = await this.requireView(hostDeviceId)
    const { entry, token: fresh } = await this.connection(token, hostDeviceId)
    try {
      return await view.workspaces({ deviceId: entry.deviceId, token: fresh })
    } catch (error) {
      throw asTeamError(error)
    }
  }

  async viewFiles(token: string, hostDeviceId: string, workspaceId: string, dir: string) {
    const view = await this.requireView(hostDeviceId)
    const { entry, token: fresh } = await this.connection(token, hostDeviceId)
    try {
      return await view.files({ deviceId: entry.deviceId, token: fresh }, workspaceId, dir)
    } catch (error) {
      throw asTeamError(error)
    }
  }

  async viewTerminals(token: string, hostDeviceId: string) {
    const view = await this.requireView(hostDeviceId)
    const { entry, token: fresh } = await this.connection(token, hostDeviceId)
    try {
      return await view.terminals({ deviceId: entry.deviceId, token: fresh })
    } catch (error) {
      throw asTeamError(error)
    }
  }

  async createTerminal(token: string, hostDeviceId: string, workspaceId: string, engine: string) {
    const peer = this.peers.get(hostDeviceId)
    if (!peer) throw new TeamError('invalid-request', '远控未连接，请先配对')
    const create = peer.entry.connector.createTerminal
    if (!create) throw new TeamError('invalid-request', '该连接不支持建终端')
    const { entry, token: fresh } = await this.connection(token, hostDeviceId)
    try {
      return await create({ deviceId: entry.deviceId, token: fresh }, workspaceId, engine)
    } catch (error) {
      throw asTeamError(error)
    }
  }

  async killTerminal(token: string, hostDeviceId: string, terminalId: string) {
    const peer = this.peers.get(hostDeviceId)
    if (!peer) throw new TeamError('invalid-request', '远控未连接，请先配对')
    const kill = peer.entry.connector.killTerminal
    if (!kill) throw new TeamError('invalid-request', '该连接不支持销毁终端')
    const { entry, token: fresh } = await this.connection(token, hostDeviceId)
    try {
      return await kill({ deviceId: entry.deviceId, token: fresh }, terminalId)
    } catch (error) {
      throw asTeamError(error)
    }
  }

  async resizeTerminal(token: string, hostDeviceId: string, terminalId: string, cols: number, rows: number) {
    const peer = this.peers.get(hostDeviceId)
    if (!peer) throw new TeamError('invalid-request', '远控未连接，请先配对')
    const resize = peer.entry.connector.resizeTerminal
    if (!resize) throw new TeamError('invalid-request', '该连接不支持同步终端尺寸')
    const { entry, token: fresh } = await this.connection(token, hostDeviceId)
    try {
      return await resize({ deviceId: entry.deviceId, token: fresh }, terminalId, cols, rows)
    } catch (error) {
      throw asTeamError(error)
    }
  }

  async execute(
    token: string,
    hostDeviceId: string,
    command: CompanionCommand,
    opts?: { actionToken?: string; eventId?: string },
  ): Promise<CompanionResult> {
    const { entry, token: fresh } = await this.connection(token, hostDeviceId)
    try {
      return await entry.connector.execute({ deviceId: entry.deviceId, token: fresh }, command, opts)
    } catch (error) {
      throw asTeamError(error)
    }
  }

  disconnect(hostDeviceId?: string): { success: boolean } {
    if (hostDeviceId) this.peers.delete(hostDeviceId)
    else this.peers.clear()
    return { success: true }
  }

  async forget(hostDeviceId: string): Promise<{ success: boolean }> {
    this.peers.delete(hostDeviceId)
    await this.knownHosts.forget(hostDeviceId).catch(() => undefined)
    return { success: true }
  }

  clear(): void {
    this.peers.clear()
  }
}
