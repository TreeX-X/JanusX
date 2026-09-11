import { ipcMain } from 'electron'
import {
  PEER_CHANNELS,
  REMOTE_CHANNELS,
  type RemoteCommand,
  type RemoteDeviceInput,
  type RemoteResult,
} from '../../shared/ipc/remote'
import type { CompanionCommand } from '../companion/contracts'
import { getProductionRemoteHost } from '../remote/host'
import {
  discoverPeerHosts,
  getPeerConnections,
  peerHostStatus,
  startPeerHost,
  stopPeerHost,
} from '../remote/peer-runtime'
import { teamService, TeamError } from '../team/service'

function envelope<T>(operation: () => Promise<T>): Promise<RemoteResult<T>> {
  return operation().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({
      ok: false as const,
      error: {
        code: error instanceof TeamError ? error.code : 'internal',
        message: error instanceof Error ? error.message : '未知错误',
      },
    }),
  )
}

function toCompanionCommand(command: RemoteCommand): CompanionCommand {
  switch (command.type) {
    case 'status':
    case 'terminals':
    case 'unbind':
    case 'stop':
      return { type: command.type }
    case 'bind':
      return { type: 'bind', terminalId: command.terminalId }
    case 'follow-up':
      return { type: 'follow-up', text: command.text }
  }
}

async function host() {
  return getProductionRemoteHost(teamService)
}

export function registerRemoteHandlers(): void {
  ipcMain.handle(REMOTE_CHANNELS.issueCode, (_event, token: string) =>
    envelope(async () => (await host()).issuePairingCode(token)),
  )
  ipcMain.handle(REMOTE_CHANNELS.redeemCode, (_event, token: string, code: string, device: RemoteDeviceInput) =>
    envelope(async () =>
      (await host()).redeemPairingCode({
        code,
        clientDeviceId: device.deviceId,
        clientDeviceName: device.name,
        clientToken: token,
      }),
    ),
  )
  ipcMain.handle(REMOTE_CHANNELS.listTerminals, (_event, token: string, deviceId: string) =>
    envelope(async () => (await host()).listTerminals(token, deviceId)),
  )
  ipcMain.handle(REMOTE_CHANNELS.tail, (_event, token: string, deviceId: string, terminalId: string) =>
    envelope(async () => (await host()).getTail(token, deviceId, terminalId)),
  )
  ipcMain.handle(
    REMOTE_CHANNELS.execute,
    (_event, token: string, deviceId: string, command: RemoteCommand, opts?: { actionToken?: string; eventId?: string }) =>
      envelope(async () =>
        (await host()).execute({
          clientToken: token,
          clientDeviceId: deviceId,
          command: toCompanionCommand(command),
          actionToken: opts?.actionToken,
          eventId: opts?.eventId,
        }),
      ),
  )
  ipcMain.handle(
    REMOTE_CHANNELS.issueActionToken,
    (_event, token: string, deviceId: string, terminalId: string, action: RemoteCommand['type']) =>
      envelope(async () =>
        (await host()).issueActionToken({
          clientToken: token,
          clientDeviceId: deviceId,
          terminalId,
          action: action as CompanionCommand['type'],
        }),
      ),
  )
  ipcMain.handle(REMOTE_CHANNELS.listTrusted, (_event, token: string) =>
    envelope(async () => (await host()).listTrustedDevices(token)),
  )
  ipcMain.handle(REMOTE_CHANNELS.revokeDevice, (_event, token: string, deviceId: string) =>
    envelope(async () => (await host()).revokeDevice(token, deviceId)),
  )
}

/** 双机 LAN 远控（同账号）：被控启停 + 控制端发现/配对/执行，全部经主进程走 HTTPS。 */
export function registerPeerHandlers(): void {
  const peers = () => getPeerConnections()
  ipcMain.handle(PEER_CHANNELS.hostStatus, () =>
    envelope(async () => peerHostStatus()),
  )
  ipcMain.handle(PEER_CHANNELS.startHost, (_event, token: string, deviceName: string) =>
    envelope(async () => startPeerHost(token, deviceName)),
  )
  ipcMain.handle(PEER_CHANNELS.stopHost, () => envelope(async () => stopPeerHost()))
  ipcMain.handle(PEER_CHANNELS.discover, (_event, timeoutMs?: number) =>
    envelope(async () => discoverPeerHosts(timeoutMs)),
  )
  ipcMain.handle(
    PEER_CHANNELS.pair,
    (_event, token: string, deviceName: string, baseUrl: string, fingerprint: string, code: string, expectedDeviceId?: string) =>
      envelope(async () => peers().pair({ token, deviceName, baseUrl, fingerprint, code, expectedDeviceId })),
  )
  ipcMain.handle(PEER_CHANNELS.peers, () => envelope(async () => peers().listPeers()))
  ipcMain.handle(PEER_CHANNELS.terminals, (_event, token: string, hostDeviceId: string) =>
    envelope(async () => peers().listTerminals(token, hostDeviceId)),
  )
  ipcMain.handle(PEER_CHANNELS.tail, (_event, token: string, hostDeviceId: string, terminalId: string) =>
    envelope(async () => peers().tail(token, hostDeviceId, terminalId)),
  )
  ipcMain.handle(
    PEER_CHANNELS.execute,
    (_event, token: string, hostDeviceId: string, command: RemoteCommand, opts?: { actionToken?: string; eventId?: string }) =>
      envelope(async () =>
        peers().execute(token, hostDeviceId, toCompanionCommand(command), opts),
      ),
  )
  ipcMain.handle(PEER_CHANNELS.disconnect, (_event, hostDeviceId?: string) =>
    envelope(async () => peers().disconnect(hostDeviceId)),
  )
  ipcMain.handle(PEER_CHANNELS.forget, (_event, hostDeviceId: string) =>
    envelope(async () => peers().forget(hostDeviceId)),
  )
}
