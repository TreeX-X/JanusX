/**
 * @file 双机远控主进程单例（ToB 双机 LAN 远控）
 * @description 被控 `RemotePeerServer` 单例 + 控制端 `PeerConnections` 单例。
 *              登出时整体 teardown（停广播、断控制连接），安全 fail-closed：
 *              退出登录后本机既不可被连、也不保持对外连接。
 */

import { TeamError, teamService } from '../team/service'
import { getProductionRemoteHost } from './host'
import { discoverPeers, type DiscoveredPeer } from './peer-discovery'
import { PeerConnections } from './peer-connections'
import { RemotePeerServer, type PeerServerInfo } from './peer-server'
import { createLocalViewPorts, type LocalViewPorts } from './view-ports'
import { terminalManager } from '../terminal/manager'
import { app } from 'electron'
import { join } from 'path'

let server: RemotePeerServer | null = null
let serverDeviceId: string | null = null
let connections: PeerConnections | null = null
let sharedView: LocalViewPorts | null = null

/** 被控三视图数据源（peer HTTPS 与本地网关共用，保证两端同形）。 */
export function getSharedView(): LocalViewPorts {
  if (!sharedView) {
    sharedView = createLocalViewPorts({
      workspacesDir: join(app.getPath('userData'), 'janusx', 'workspaces'),
      listTerminalInstances: () => terminalManager.listInstances().map((t) => ({
        id: t.id,
        workspaceId: t.config.workspaceId,
        status: t.status,
        outputSeq: t.outputSeq,
      })),
      getOutputReplay: (terminalId) => terminalManager.getOutputReplay(terminalId),
    })
  }
  return sharedView
}

export function getPeerConnections(): PeerConnections {
  if (!connections) connections = new PeerConnections(teamService)
  return connections
}

export async function startPeerHost(token: string, deviceName: string): Promise<PeerServerInfo & { deviceId: string }> {
  const session = await teamService.resolveSession(token)
  if (!session.activeTenantId) throw new TeamError('forbidden', '请先创建或加入组织后再开启远控')
  if (!server) {
    const host = await getProductionRemoteHost(teamService)
    const identity = { deviceId: session.deviceId, name: deviceName?.trim() || 'Desktop' }
    server = new RemotePeerServer({ host, getIdentity: () => identity, view: getSharedView() })
    serverDeviceId = session.deviceId
  }
  return { ...(await server.start()), deviceId: serverDeviceId ?? session.deviceId }
}

export function peerHostStatus(): ({ running: true } & PeerServerInfo & { deviceId: string }) | { running: false } {
  const info = server?.currentInfo
  if (!server || !info) return { running: false as const }
  return { running: true as const, ...info, deviceId: serverDeviceId ?? '' }
}

export async function stopPeerHost(): Promise<{ success: boolean }> {
  if (server) await server.stop().catch(() => undefined)
  server = null
  serverDeviceId = null
  return { success: true }
}

export function discoverPeerHosts(timeoutMs = 3000): Promise<DiscoveredPeer[]> {
  const clamped = Math.min(10_000, Math.max(500, timeoutMs || 3000))
  return discoverPeers(clamped)
}

/** 登出钩子：停被控广播 + 断全部控制端连接（只做清理，鉴权本就逐调用重验）。 */
export async function stopPeerRuntime(): Promise<void> {
  await stopPeerHost()
  connections?.clear()
}
