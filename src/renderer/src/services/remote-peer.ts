import type {
  ConnectedPeerView,
  DiscoveredPeerView,
  PeerHostStatusView,
  RedeemResult,
  RemoteCommand,
  RemoteCommandResult,
  RemoteTailResult,
  RemoteTerminalInfo,
} from '../../../shared/ipc/remote'
import { authed, getDeviceName } from './team'

export type {
  ConnectedPeerView,
  DiscoveredPeerView,
  PeerHostStatusView,
  RedeemResult,
  RemoteCommand,
  RemoteCommandResult,
  RemoteTailResult,
  RemoteTerminalInfo,
}

/**
 * 双机 LAN 远控（同账号）调用：token 每次走团队会话续期，
 * 设备名走本机稳定命名；发现/启停等本地态调用直达主进程。
 */
export const peerService = {
  hostStatus: () => window.electron.peer.hostStatus(),
  startHost: () => authed((token) => window.electron.peer.startHost(token, getDeviceName())),
  stopHost: () => window.electron.peer.stopHost(),
  discover: (timeoutMs?: number) => window.electron.peer.discover(timeoutMs),
  pair: (baseUrl: string, fingerprint: string, code: string, expectedDeviceId?: string) =>
    authed((token) =>
      window.electron.peer.pair(token, getDeviceName(), baseUrl, fingerprint, code, expectedDeviceId),
    ),
  peers: () => window.electron.peer.peers(),
  listTerminals: (hostDeviceId: string) =>
    authed((token) => window.electron.peer.listTerminals(token, hostDeviceId)),
  tail: (hostDeviceId: string, terminalId: string) =>
    authed((token) => window.electron.peer.tail(token, hostDeviceId, terminalId)),
  execute: (hostDeviceId: string, command: RemoteCommand, opts?: { actionToken?: string }) =>
    authed((token) => window.electron.peer.execute(token, hostDeviceId, command, opts)),
  disconnect: (hostDeviceId?: string) => window.electron.peer.disconnect(hostDeviceId),
  forget: (hostDeviceId: string) => window.electron.peer.forget(hostDeviceId),
}
