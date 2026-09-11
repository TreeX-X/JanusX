import type {
  RemoteCommand,
  RemoteCommandResult,
  RemoteTailResult,
  RemoteTerminalInfo,
  TrustedDeviceView,
} from '../../../shared/ipc/remote'
import { authed, getDeviceId, getDeviceName } from './team'

export type { RemoteCommand, RemoteCommandResult, RemoteTailResult, RemoteTerminalInfo, TrustedDeviceView }

/** 控制端调用：token 走团队会话续期，device 走本机稳定 UUID。 */
export const remoteService = {
  issueCode: () => authed((token) => window.electron.remote.issueCode(token)),
  redeemCode: (code: string) =>
    authed((token) =>
      window.electron.remote.redeemCode(token, code, { deviceId: getDeviceId(), name: getDeviceName() }),
    ),
  listTerminals: () => authed((token) => window.electron.remote.listTerminals(token, getDeviceId())),
  tail: (terminalId: string) => authed((token) => window.electron.remote.tail(token, getDeviceId(), terminalId)),
  execute: (command: RemoteCommand, opts?: { actionToken?: string }) =>
    authed((token) => window.electron.remote.execute(token, getDeviceId(), command, opts)),
  listTrusted: () => authed((token) => window.electron.remote.listTrusted(token)),
  revokeDevice: (deviceId: string) => authed((token) => window.electron.remote.revokeDevice(token, deviceId)),
}
