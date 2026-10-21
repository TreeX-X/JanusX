import { describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ features: vi.fn(), workspace: vi.fn(), window: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: () => 'profile', on: vi.fn() }, BrowserWindow: mocks.window, ipcMain: { on: vi.fn() } }))
vi.mock('../../src/main/config/service', () => ({ configService: { getExperimentalFeatures: mocks.features } }))
vi.mock('../../src/main/terminal/manager', () => ({ terminalManager: {}, terminalOutputEvents: { off: vi.fn(), on: vi.fn() } }))
vi.mock('../../src/main/ipc/terminal-handlers', () => ({ createCompanionTerminal: vi.fn(), submitCompanionTerminalLine: vi.fn() }))
vi.mock('../../src/main/companion/workspace-registry', () => ({ listRegisteredWorkspaces: async () => [], resolveRegisteredWorkspace: mocks.workspace }))
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'qr' } }))
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
})
