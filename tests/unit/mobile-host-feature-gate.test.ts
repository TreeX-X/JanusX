import { describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ features: vi.fn(), workspace: vi.fn(), window: vi.fn(), qr: vi.fn(async (_payload: string) => 'qr'), signal: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: () => 'profile', getAppPath: () => '.', on: vi.fn() }, BrowserWindow: mocks.window, ipcMain: { on: vi.fn() } }))
vi.mock('../../src/main/config/service', () => ({ configService: { getExperimentalFeatures: mocks.features } }))
vi.mock('../../src/main/terminal/manager', () => ({ terminalManager: {}, terminalOutputEvents: { off: vi.fn(), on: vi.fn() } }))
vi.mock('../../src/main/ipc/terminal-handlers', () => ({ createCompanionTerminal: vi.fn(), submitCompanionTerminalLine: vi.fn() }))
vi.mock('../../src/main/companion/workspace-registry', () => ({ listRegisteredWorkspaces: async () => [], resolveRegisteredWorkspace: mocks.workspace }))
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.qr } }))
vi.mock('../../src/main/remote/signaling', () => ({ startSignaling: mocks.signal }))
vi.mock('node:os', () => ({ networkInterfaces: () => ({ Ethernet: [{ family: 'IPv4', internal: false, address: '192.168.31.5' }] }) }))
import { startMobileHost, stopMobileHost, mobileHostStatus } from '../../src/main/remote/mobile-host'

describe('mobile host experimental feature gate', () => {
  it('rejects starting the host while disabled, even via direct IPC', async () => {
    mocks.features.mockResolvedValue({ remoteControl: false })
    await expect(startMobileHost({ workspaceId: 'w', signalUrl: 'ws://localhost/signal', stunUrl: '' })).rejects.toThrow('创新功能')
    expect(mocks.window).not.toHaveBeenCalled()
    expect((await mobileHostStatus()).running).toBe(false)
  })
  it('cancels an in-flight activation when the feature is stopped', async () => {
    mocks.features.mockResolvedValue({ remoteControl: true })
    let resolveWorkspace!: () => void
    mocks.workspace.mockImplementationOnce(() => new Promise<void>(resolve => { resolveWorkspace = resolve }))
    const starting = startMobileHost({ workspaceId: 'w', signalUrl: 'ws://localhost/signal', stunUrl: '' })
    await vi.waitFor(() => expect(resolveWorkspace).toBeTypeOf('function'))
    await stopMobileHost(); resolveWorkspace()
    await expect(starting).rejects.toThrow('取消')
    expect(mocks.window).not.toHaveBeenCalled()
    expect((await mobileHostStatus()).running).toBe(false)
  })
  it('puts the configured public endpoint into the QR without starting a private signal service', async () => {
    mocks.features.mockResolvedValue({ remoteControl: true })
    mocks.window.mockImplementation(function () {
      return { webContents: { on: vi.fn(), setWindowOpenHandler: vi.fn() }, on: vi.fn(),
        isDestroyed: () => false, destroy: vi.fn(), loadFile: vi.fn(), loadURL: vi.fn() }
    })
    await startMobileHost({ workspaceId: 'w', signalUrl: 'wss://signal.example.com/signal', stunUrl: 'stun:stun.example.com:3478' })
    expect(mocks.signal).not.toHaveBeenCalled()
    const payload = JSON.parse(mocks.qr.mock.calls.at(-1)![0] as string)
    expect(payload).toMatchObject({ signalUrl: 'wss://signal.example.com/signal', stun: 'stun:stun.example.com:3478', v: 1 })
    expect(await mobileHostStatus()).toMatchObject({ signalUrl: payload.signalUrl, localSignal: false, running: true })
    await stopMobileHost()
    expect((await mobileHostStatus()).signalUrl).toBeUndefined()
  })
  it('rejects a stale manually selected interface before binding a local signal service', async () => {
    await expect(startMobileHost({ workspaceId: 'w', signalUrl: '', stunUrl: '', localAddress: '169.254.1.2' })).rejects.toThrow('网卡')
    expect(mocks.signal).not.toHaveBeenCalled()
  })
  it('uses the explicitly selected available interface in local QR codes', async () => {
    const address = (await mobileHostStatus()).lanAddresses![0].address
    mocks.signal.mockResolvedValueOnce({ port: 43821, close: vi.fn() })
    await startMobileHost({ workspaceId: 'w', signalUrl: '', stunUrl: '', localAddress: address })
    expect(JSON.parse(mocks.qr.mock.calls.at(-1)![0])).toMatchObject({ signalUrl: `ws://${address}:43821/signal` })
    expect(await mobileHostStatus()).toMatchObject({ localSignal: true })
    await stopMobileHost()
  })
})
