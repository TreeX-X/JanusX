/**
 * ToB M3 远控 IPC 契约。
 * RemoteCommand/ResultCode 与 `src/main/companion/contracts.ts` 同构（main 侧做断言映射），
 * shared 不反向依赖 main，保持打包分层干净。
 */

export const REMOTE_CHANNELS = {
  issueCode: 'remote:issueCode',
  redeemCode: 'remote:redeemCode',
  listTerminals: 'remote:listTerminals',
  tail: 'remote:tail',
  execute: 'remote:execute',
  issueActionToken: 'remote:issueActionToken',
  listTrusted: 'remote:listTrusted',
  revokeDevice: 'remote:revokeDevice',
} as const

export type RemoteCommand =
  | { type: 'status' }
  | { type: 'terminals' }
  | { type: 'bind'; terminalId: string }
  | { type: 'unbind' }
  | { type: 'follow-up'; text: string }
  | { type: 'stop' }

export type RemoteResultCode =
  | 'ok'
  | 'disabled'
  | 'unauthorized'
  | 'invalid-request'
  | 'invalid-target'
  | 'unbound'
  | 'expired-binding'
  | 'terminal-unavailable'
  | 'invalid-prompt'
  | 'invalid-token'
  | 'expired-token'
  | 'token-scope-mismatch'
  | 'token-replayed'
  | 'execution-failed'

export interface RemoteCommandResult {
  ok: boolean
  code: RemoteResultCode
  message: string
  targetTerminalId?: string
  replayed?: boolean
  data?: Record<string, unknown>
}

export interface RemoteDeviceInput {
  deviceId: string
  name: string
}

export interface PairingCodeResult {
  code: string
  expiresAt: number
}

export interface RedeemResult {
  hostDeviceId: string
  tenantId: string
}

export interface RemoteTerminalInfo {
  terminalId: string
  engine: string
  workspaceId: string
}

export interface RemoteTailResult {
  data: string
  seq: number
}

export interface TrustedDeviceView {
  deviceId: string
  userId: string
  tenantId: string
  name: string
  pairedAt: number
  lastSeenAt: number
}

export type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

/** 双机 LAN 远控（同账号）：被控 HTTPS 服务 + 控制端 mDNS 发现/指纹配对。 */
export const PEER_CHANNELS = {
  hostStatus: 'peer:hostStatus',
  startHost: 'peer:startHost',
  stopHost: 'peer:stopHost',
  discover: 'peer:discover',
  pair: 'peer:pair',
  peers: 'peer:peers',
  terminals: 'peer:terminals',
  tail: 'peer:tail',
  execute: 'peer:execute',
  disconnect: 'peer:disconnect',
  forget: 'peer:forget',
} as const

export interface DiscoveredPeerView {
  deviceId: string
  name: string
  host: string
  port: number
  fingerprint: string
  lastSeenAt: number
}

export type PeerHostStatusView =
  | { running: true; port: number; fingerprint: string; addresses: string[]; deviceId: string }
  | { running: false }

export interface ConnectedPeerView {
  hostDeviceId: string
  baseUrl: string
  tenantId: string
}

export interface PeerAPI {
  hostStatus(): Promise<RemoteResult<PeerHostStatusView>>
  startHost(token: string, deviceName: string): Promise<RemoteResult<PeerHostStatusView>>
  stopHost(): Promise<RemoteResult<{ success: boolean }>>
  discover(timeoutMs?: number): Promise<RemoteResult<DiscoveredPeerView[]>>
  pair(
    token: string,
    deviceName: string,
    baseUrl: string,
    fingerprint: string,
    code: string,
    expectedDeviceId?: string,
  ): Promise<RemoteResult<RedeemResult>>
  peers(): Promise<RemoteResult<ConnectedPeerView[]>>
  listTerminals(token: string, hostDeviceId: string): Promise<RemoteResult<RemoteTerminalInfo[]>>
  tail(token: string, hostDeviceId: string, terminalId: string): Promise<RemoteResult<RemoteTailResult>>
  execute(
    token: string,
    hostDeviceId: string,
    command: RemoteCommand,
    opts?: { actionToken?: string; eventId?: string },
  ): Promise<RemoteResult<RemoteCommandResult>>
  disconnect(hostDeviceId?: string): Promise<RemoteResult<{ success: boolean }>>
  forget(hostDeviceId: string): Promise<RemoteResult<{ success: boolean }>>
}

export interface RemoteAPI {
  issueCode(token: string): Promise<RemoteResult<PairingCodeResult>>
  redeemCode(token: string, code: string, device: RemoteDeviceInput): Promise<RemoteResult<RedeemResult>>
  listTerminals(token: string, deviceId: string): Promise<RemoteResult<RemoteTerminalInfo[]>>
  tail(token: string, deviceId: string, terminalId: string): Promise<RemoteResult<RemoteTailResult>>
  execute(
    token: string,
    deviceId: string,
    command: RemoteCommand,
    opts?: { actionToken?: string; eventId?: string },
  ): Promise<RemoteResult<RemoteCommandResult>>
  issueActionToken(
    token: string,
    deviceId: string,
    terminalId: string,
    action: RemoteCommand['type'],
  ): Promise<RemoteResult<{ token: string; expiresAt: number }>>
  listTrusted(token: string): Promise<RemoteResult<TrustedDeviceView[]>>
  revokeDevice(token: string, deviceId: string): Promise<RemoteResult<{ success: boolean }>>
}
