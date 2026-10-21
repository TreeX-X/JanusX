import { ipcMain } from 'electron'
import { REMOTE_CHANNELS, type MobileHostOptions } from '../../shared/ipc/remote'
import { mobileHostStatus, startMobileHost, stopMobileHost, approveMobile, rejectMobile, revokeMobile } from '../remote/mobile-host'
export function registerRemoteHandlers(): void {
  ipcMain.handle(REMOTE_CHANNELS.status, () => mobileHostStatus())
  ipcMain.handle(REMOTE_CHANNELS.start, (_event, options: MobileHostOptions) => startMobileHost(options).then(mobileHostStatus))
  ipcMain.handle(REMOTE_CHANNELS.stop, () => stopMobileHost().then(mobileHostStatus))
  ipcMain.handle(REMOTE_CHANNELS.approve, (_event, id: string) => { approveMobile(id); return mobileHostStatus() })
  ipcMain.handle(REMOTE_CHANNELS.reject, () => { rejectMobile(); return mobileHostStatus() })
  ipcMain.handle(REMOTE_CHANNELS.revoke, (_event, id: string) => { revokeMobile(id); return mobileHostStatus() })
}
export function registerPeerHandlers(): void { /* account-dependent LAN transport removed */ }
