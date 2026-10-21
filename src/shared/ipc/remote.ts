export const REMOTE_CHANNELS = {
  status: 'remote:status', start: 'remote:start', stop: 'remote:stop',
  approve: 'remote:approve', reject: 'remote:reject', revoke: 'remote:revoke',
} as const
export interface MobileHostOptions { signalUrl: string; stunUrl: string; workspaceId: string; localAddress?: string }
export interface MobileHostStatus {
  running: boolean; state: string; qr?: string; expiresAt?: number
  workspaceId?: string
  signalUrl?: string
  localSignal?: boolean
  lanAddresses?: { name: string; address: string }[]
  connectedDeviceId?: string
  terminals: { id: string; pid: number; alive: boolean }[]
  pending?: { id: string; name: string }
  devices: { id: string; name: string }[]
  workspaces: { id: string; name: string; path: string }[]
}
export interface RemoteAPI {
  status(): Promise<MobileHostStatus>
  start(options: MobileHostOptions): Promise<MobileHostStatus>
  stop(): Promise<MobileHostStatus>
  approve(id: string): Promise<MobileHostStatus>
  reject(): Promise<MobileHostStatus>
  revoke(id: string): Promise<MobileHostStatus>
}
