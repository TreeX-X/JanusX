import { describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ features: vi.fn(async () => ({ remoteControl: true })), qr: vi.fn(async (_payload: string) => 'qr'), signal: vi.fn(async () => ({ port: 43821, close: vi.fn() })) }))
vi.mock('../../src/shared/remote-scope', () => ({ REMOTE_LAN_ONLY: true, REMOTE_SETTINGS_PREFIX: 'remote.lan.' }))
vi.mock('electron', () => ({ app: { getPath: () => 'profile', getAppPath: () => '.', on: vi.fn() },
  BrowserWindow: vi.fn(function () { return { webContents: { on: vi.fn(), setWindowOpenHandler: vi.fn() }, on: vi.fn(), isDestroyed: () => false, destroy: vi.fn(), loadFile: vi.fn() } }), ipcMain: { on: vi.fn() } }))
vi.mock('../../src/main/config/service', () => ({ configService: { getExperimentalFeatures: mocks.features } }))
vi.mock('../../src/main/terminal/manager', () => ({ terminalManager: {}, terminalOutputEvents: { off: vi.fn(), on: vi.fn() } }))
vi.mock('../../src/main/ipc/terminal-handlers', () => ({ createCompanionTerminal: vi.fn(), submitCompanionTerminalLine: vi.fn() }))
vi.mock('../../src/main/companion/workspace-registry', () => ({ listRegisteredWorkspaces: async () => [], resolveRegisteredWorkspace: async () => ({ path: '.' }) }))
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.qr } }))
vi.mock('../../src/main/remote/signaling', () => ({ startSignaling: mocks.signal }))
vi.mock('node:os', () => ({ networkInterfaces: () => ({ Ethernet: [{ family: 'IPv4', internal: false, address: '192.168.31.5' }] }) }))
import { startMobileHost, stopMobileHost } from '../../src/main/remote/mobile-host'
import { mobileRemoteSettings } from '../../src/renderer/src/lib/mobile-remote-settings'

describe('LAN release boundary', () => {
  it('ignores old public preferences without reading or overwriting them', () => {
    const read = vi.fn(() => 'wss://custom.example/signal')
    expect(mobileRemoteSettings(read)).toEqual({ network: 'lan', signalUrl: '', stunUrl: '' })
    expect(read).not.toHaveBeenCalled()
  })
  it('rejects public URLs, even custom LAN URLs, and STUN through direct IPC', async () => {
    for (const options of [
      { signalUrl: 'wss://example.com/signal', stunUrl: '' },
      { signalUrl: 'ws://127.0.0.1/signal', stunUrl: '' },
      { signalUrl: '', stunUrl: 'stun:example.com' },
    ]) await expect(startMobileHost({ ...options, workspaceId: 'w' })).rejects.toThrow('仅支持局域网测试')
    expect(mocks.signal).not.toHaveBeenCalled()
  })
  it('generates a local invitation with no STUN and keeps the experimental gate', async () => {
    await startMobileHost({ workspaceId: 'w', signalUrl: '', stunUrl: '' })
    expect(JSON.parse(mocks.qr.mock.calls.at(-1)![0])).toMatchObject({ signalUrl: 'ws://192.168.31.5:43821/signal', stun: '' })
    await stopMobileHost()
    mocks.features.mockResolvedValueOnce({ remoteControl: false })
    await expect(startMobileHost({ workspaceId: 'w', signalUrl: '', stunUrl: '' })).rejects.toThrow('创新功能')
  })
})
