/**
 * @file 账号制 LAN 远控控制端（ToB M3）
 * @description 发现 → 连 → 收 tail → 发命令。M3 只实现发现桩 + 回环连接器：
 *              真 LAN 的 mDNS/HTTP-WSS 在联调时接入同一接口，Relay 在 M5 实现。
 *              渲染端 `useRemoteStore` 是实际的控制端 UI，`RemoteClient` 是
 *              main 侧的传输无关门面（单测用回环模拟两端，验收同账号配对）。
 */

import { randomUUID } from 'crypto'
import type { CompanionCommand, CompanionResult } from '../companion/contracts'
import type { RemoteHost } from './host'
import type { PeerViewConnector } from './peer-client'
import { selectTransport, type DiscoveredHost, type RemoteTransportKind } from './transport'

export interface RemoteConnector {
  redeem(code: string, client: { deviceId: string; deviceName: string; token: string }): Promise<{ hostDeviceId: string; tenantId: string }>
  listTerminals(client: { deviceId: string; token: string }): Promise<Array<{ terminalId: string; engine: string; workspaceId: string }>>
  tail(client: { deviceId: string; token: string }, terminalId: string): Promise<{ data: string; seq: number }>
  execute(
    client: { deviceId: string; token: string },
    command: CompanionCommand,
    opts?: { actionToken?: string; eventId?: string },
  ): Promise<CompanionResult>
  /** 建终端（仅 HTTPS 双机连接器提供，回环无此能力）。 */
  createTerminal?(client: { deviceId: string; token: string }, workspaceId: string, engine: string): Promise<CompanionResult>
  /** 销毁终端（回环直调 host，双机走 HTTPS）。 */
  killTerminal?(client: { deviceId: string; token: string }, terminalId: string): Promise<{ success: boolean; terminalId: string }>
  /** 同步终端尺寸（回环直调 host，双机走 HTTPS）。 */
  resizeTerminal?(client: { deviceId: string; token: string }, terminalId: string, cols: number, rows: number): Promise<{ success: boolean; terminalId: string; cols: number; rows: number }>
  /** 三视图（仅 HTTPS 双机连接器提供，回环无此能力）。 */
  view?: PeerViewConnector
}

/** 回环连接器：同一进程内模拟 LAN 直连（单测/单机演示），传输恒为 lan。 */
export function createLoopbackConnector(host: RemoteHost): RemoteConnector {
  return {
    redeem: (code, client) => host.redeemPairingCode({
      code,
      clientDeviceId: client.deviceId,
      clientDeviceName: client.deviceName,
      clientToken: client.token,
    }),
    listTerminals: (client) => host.listTerminals(client.token, client.deviceId),
    tail: (client, terminalId) => host.getTail(client.token, client.deviceId, terminalId),
    execute: (client, command, opts) => host.execute({
      clientToken: client.token,
      clientDeviceId: client.deviceId,
      command,
      actionToken: opts?.actionToken,
      eventId: opts?.eventId ?? randomUUID(),
    }),
    killTerminal: (client, terminalId) => host.killTerminal({
      clientToken: client.token,
      clientDeviceId: client.deviceId,
      terminalId,
    }),
    resizeTerminal: (client, terminalId, cols, rows) => host.resizeTerminal({
      clientToken: client.token,
      clientDeviceId: client.deviceId,
      terminalId,
      cols,
      rows,
    }),
  }
}

export interface RemoteClientOptions {
  connector: RemoteConnector
  deviceId: string
  deviceName: string
  getToken: () => Promise<string | null>
  now?: () => number
}

export type RemoteConnectionState = 'disconnected' | 'pairing' | 'connected'

/**
 * 控制端门面：发现（M3 桩）→ 配对 → 收 tail → 发命令。
 * 传输选择只允许 lan；relay 直接抛错提示 M5（调用方转文案）。
 */
export class RemoteClient {
  private state: RemoteConnectionState = 'disconnected'
  private tenantId: string | null = null

  constructor(private readonly options: RemoteClientOptions) {}

  get connectionState(): RemoteConnectionState {
    return this.state
  }

  get activeTenantId(): string | null {
    return this.tenantId
  }

  /** M3 发现桩：无 mDNS，返回空列表由 UI 走手动输码；保留接口给真 LAN。 */
  async discover(_transport: RemoteTransportKind = 'lan'): Promise<DiscoveredHost[]> {
    selectTransport(_transport)
    return []
  }

  async pair(code: string, transport: RemoteTransportKind = 'lan'): Promise<{ hostDeviceId: string; tenantId: string }> {
    selectTransport(transport)
    const token = await this.options.getToken()
    if (!token) throw new Error('请先登录团队账号后再配对')
    this.state = 'pairing'
    try {
      const result = await this.options.connector.redeem(code, {
        deviceId: this.options.deviceId,
        deviceName: this.options.deviceName,
        token,
      })
      this.tenantId = result.tenantId
      this.state = 'connected'
      return result
    } catch (error) {
      this.state = 'disconnected'
      throw error
    }
  }

  private async client(): Promise<{ deviceId: string; token: string }> {
    const token = await this.options.getToken()
    if (!token) throw new Error('请先登录团队账号')
    if (this.state !== 'connected') throw new Error('远控未连接，请先配对')
    return { deviceId: this.options.deviceId, token }
  }

  async terminals(): Promise<Array<{ terminalId: string; engine: string; workspaceId: string }>> {
    return this.options.connector.listTerminals(await this.client())
  }

  async tail(terminalId: string): Promise<{ data: string; seq: number }> {
    return this.options.connector.tail(await this.client(), terminalId)
  }

  async send(
    command: CompanionCommand,
    opts?: { actionToken?: string; eventId?: string },
  ): Promise<CompanionResult> {
    return this.options.connector.execute(await this.client(), command, opts)
  }

  disconnect(): void {
    this.state = 'disconnected'
    this.tenantId = null
  }
}
