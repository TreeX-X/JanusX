/**
 * @file 远控传输抽象（ToB M3）
 * @description M3 仅实现 LAN 直连（本机回环 + 局域网直连预留）；
 *              公网 Relay 只留接口，M5 再实现。远控语义、token、审计均不随传输变化，
 *              只换 peer/transport 选路（见 ToB §P2 / 远控统一方案 §8）。
 */

export type RemoteTransportKind = 'lan' | 'relay'

export interface RemotePeerAddress {
  kind: RemoteTransportKind
  /** LAN：`192.168.x.x:port` 或空（本机回环）；Relay：`wss://...`（M5）。 */
  address: string | null
}

/** 信封版本：LAN/Relay 共用，切换传输不换会话（`sessionId+eventId` 去重）。 */
export interface RemoteEnvelope {
  v: 1
  from: string
  to: string
  sessionId: string
  eventId: string
  seq: number
  type: string
  payload: unknown
  sig?: string
}

export const RELAY_NOT_IMPLEMENTED = 'relay-transport-not-implemented'

/**
 * 传输选路决策（M3：仅 lan；relay 直接抛错，调用方降级提示）。
 * Happy Eyeballs / 热备切路在 M5 实现，本步只做类型与分支占位。
 */
export function selectTransport(preferred: RemoteTransportKind): RemoteTransportKind {
  if (preferred === 'relay') throw new Error(RELAY_NOT_IMPLEMENTED)
  return 'lan'
}

/** 发现到的被控端（M3：手动输入 + 本机回环；mDNS 在真 LAN 联调时再接）。 */
export interface DiscoveredHost {
  deviceId: string
  name: string
  address: RemotePeerAddress
  lastSeenAt: number
}
