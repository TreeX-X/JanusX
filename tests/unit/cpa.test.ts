import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CPA_CHANNELS, CPA_SURFACE_ID, DEFAULT_CPA_MANAGEMENT_URL, normalizeCpaManagementUrl, normalizeCpaSettings, validateCpaManagementKey } from '../../src/shared/ipc/cpa'
import { CpaService } from '../../src/main/cpa/service'
import type { BrowserSurfaceManager } from '../../src/main/browser/surface-manager'
import { registerCpaHandlers } from '../../src/main/ipc/cpa-handlers'

const h = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  update: vi.fn(),
  external: vi.fn(),
  handle: vi.fn(),
  runtime: { start: vi.fn(), stop: vi.fn(), status: vi.fn(), dispose: vi.fn(), stageUpdate: vi.fn(), copyKey: vi.fn(), setManagementKey: vi.fn(), openLogs: vi.fn() },
}))
vi.mock('../../src/main/cpa/runtime', () => ({ CpaRuntime: class {
  start = h.runtime.start; stop = h.runtime.stop; status = h.runtime.status; dispose = h.runtime.dispose
  stageUpdate = h.runtime.stageUpdate; copyKey = h.runtime.copyKey; openLogs = h.runtime.openLogs
  setManagementKey = h.runtime.setManagementKey
} }))
vi.mock('electron', () => ({ shell: { openExternal: h.external }, ipcMain: { handle: h.handle } }))
vi.mock('../../src/main/config/service', () => ({ configService: {
  get: async () => h.config,
  update: async (partial: object) => { h.update(partial); h.config = { ...h.config, ...partial } },
} }))

beforeEach(() => { h.config = {}; vi.clearAllMocks() })

function fixture() {
  let open = false
  const surfaces = {
    getState: vi.fn(() => open ? {} : null),
    createSurface: vi.fn(() => { open = true; return { success: true } }),
    destroySurface: vi.fn(() => { open = false }),
  }
  return { surfaces, service: new CpaService(surfaces as unknown as BrowserSurfaceManager) }
}

describe('CPA page addresses', () => {
  it.each([
    ['localhost:8317', 'http://localhost:8317/management.html'],
    ['127.0.0.1:8317/', DEFAULT_CPA_MANAGEMENT_URL],
    ['[::1]:8317', 'http://[::1]:8317/management.html'],
    ['example.com', 'https://example.com/management.html'],
    [' https://example.com/panel/#/quota ', 'https://example.com/panel/#/quota'],
  ])('normalizes %s', (input, expected) => { expect(normalizeCpaManagementUrl(input)).toBe(expected) })

  it.each(['', 'file:///C:/secret', 'javascript:alert(1)', 'data:text/html,content', 'https://user:secret@example.com',
    'http://localhost:8317/?key=secret', 'https://', null, 42])('rejects non-page and credential-bearing input %j', (input) => {
    expect(() => normalizeCpaManagementUrl(input)).toThrow('invalid-cpa-url')
  })
})

describe('CPA global integration service', () => {
  it('applies a write-only custom key between stopping and restarting without returning or persisting plaintext settings', async () => {
    const { service, surfaces } = fixture()
    const settings = { mode: 'managed', enabled: true, port: 18317, autoUpdate: false }
    h.config = { cpaSettings: settings }
    await service.open()
    vi.clearAllMocks()
    const result = await service.saveSettings(settings, 'custom-management-key')
    expect(h.runtime.stop).toHaveBeenCalledOnce()
    expect(h.runtime.setManagementKey).toHaveBeenCalledWith('custom-management-key')
    expect(h.runtime.start).toHaveBeenCalledWith(normalizeCpaSettings(settings))
    expect(h.runtime.stop.mock.invocationCallOrder[0]).toBeLessThan(h.runtime.setManagementKey.mock.invocationCallOrder[0])
    expect(h.runtime.setManagementKey.mock.invocationCallOrder[0]).toBeLessThan(h.runtime.start.mock.invocationCallOrder[0])
    expect(surfaces.destroySurface).toHaveBeenCalledOnce()
    expect(JSON.stringify([h.config, result, h.update.mock.calls])).not.toContain('custom-management-key')
    vi.clearAllMocks()
    await service.saveSettings(settings)
    expect(h.runtime.setManagementKey).not.toHaveBeenCalled()
    expect(h.runtime.stop).not.toHaveBeenCalled()
  })

  it('rejects invalid keys and external key changes before stopping or writing configuration', async () => {
    const { service } = fixture()
    await expect(service.saveSettings({ mode: 'managed' }, 'short')).rejects.toThrow('cpa-invalid-management-key')
    await expect(service.saveSettings({ managementUrl: DEFAULT_CPA_MANAGEMENT_URL }, 'custom-key')).rejects.toThrow('cpa-not-managed')
    expect(h.runtime.stop).not.toHaveBeenCalled()
    expect(h.update).not.toHaveBeenCalled()
  })

  it('does not restart or claim settings were saved when encrypted key storage fails', async () => {
    const { service } = fixture()
    const settings = { mode: 'managed', enabled: true, port: 18317 }
    h.config = { cpaSettings: settings }
    h.runtime.setManagementKey.mockRejectedValueOnce(new Error('cpa-key-save-failed'))
    await expect(service.saveSettings(settings, 'custom-key')).rejects.toThrow('cpa-key-save-failed')
    expect(h.runtime.start).not.toHaveBeenCalled()
    expect(h.update).not.toHaveBeenCalled()
  })
  it('defaults without a configured instance and persists only a validated page address', async () => {
    const { service } = fixture()
    expect(await service.getSettings()).toEqual(normalizeCpaSettings(null))
    await service.saveSettings({ managementUrl: 'localhost:9000', managementKey: 'never-store-me' })
    expect(h.update).toHaveBeenCalledWith({ cpaSettings: normalizeCpaSettings({ managementUrl: 'localhost:9000' }) })
    expect(JSON.stringify(h.config)).not.toContain('never-store-me')
    await expect(service.saveSettings({ managementUrl: 'file:///secret' })).rejects.toThrow()
    expect(h.update).toHaveBeenCalledTimes(1)
  })

  it('reuses one surface concurrently and keeps login storage across close/reopen', async () => {
    const { service, surfaces } = fixture()
    h.config = { cpaSettings: { managementUrl: DEFAULT_CPA_MANAGEMENT_URL } }
    await Promise.all([service.open(), service.open()])
    expect(surfaces.createSurface).toHaveBeenCalledTimes(1)
    const profile = surfaces.createSurface.mock.calls[0]
    expect(profile).toEqual([
      { surfaceId: CPA_SURFACE_ID, carrier: 'pane', url: DEFAULT_CPA_MANAGEMENT_URL },
      { partition: expect.stringMatching(/^persist:janusx-cpa-[a-f0-9]+$/), httpOnly: true },
    ])
    await service.saveSettings({ managementUrl: DEFAULT_CPA_MANAGEMENT_URL })
    await service.open()
    expect(surfaces.createSurface).toHaveBeenCalledTimes(1)
    await service.close()
    await service.open()
    expect(surfaces.createSurface.mock.calls[1]).toEqual(profile)
    await service.saveSettings({ managementUrl: 'http://localhost:9000' })
    await service.open()
    expect(surfaces.createSurface.mock.calls[2][1]).not.toEqual(profile[1])
  })

  it('recovers an invalid persisted address so settings can repair it', async () => {
    h.config = { cpaSettings: { managementUrl: 'file:///secret' } }
    const { service } = fixture()
    expect(await service.getSettings()).toEqual(normalizeCpaSettings(null))
    await service.saveSettings({ managementUrl: 'localhost:9000' })
    expect(await service.getSettings()).toEqual(normalizeCpaSettings({ managementUrl: 'localhost:9000' }))
  })

  it('opens the validated configured address in the system browser', async () => {
    const { service } = fixture()
    await service.saveSettings({ managementUrl: 'https://cpa.example.com/custom/' })
    await service.openExternal()
    expect(h.external).toHaveBeenCalledWith('https://cpa.example.com/custom/')
  })

  it('allows only the trusted main frame to use the fixed CPA IPC methods', async () => {
    const { surfaces } = fixture()
    const mainFrame = {}
    const sender = { mainFrame }
    registerCpaHandlers(() => ({ isDestroyed: () => false, webContents: sender }) as never, surfaces as unknown as BrowserSurfaceManager)
    const handlers = new Map(h.handle.mock.calls)
    expect([...handlers.keys()]).toEqual(Object.values(CPA_CHANNELS))
    const get = handlers.get(CPA_CHANNELS.get)!
    await expect(get({ sender, senderFrame: mainFrame })).resolves.toEqual(normalizeCpaSettings(null))
    for (const handler of handlers.values()) {
      expect(() => handler({ sender: {}, senderFrame: mainFrame })).toThrow('unauthorized')
      expect(() => handler({ sender, senderFrame: {} })).toThrow('unauthorized')
    }
  })

  it('starts on enable, restarts for a new port, preserves the service when closing UI, and stops on disable', async () => {
    const { service } = fixture()
    const settings = { mode: 'managed', enabled: true, port: 18317, autoUpdate: true }
    await service.saveSettings(settings)
    expect(h.runtime.start).toHaveBeenLastCalledWith(normalizeCpaSettings(settings))
    await service.open()
    await service.close()
    expect(h.runtime.stop).toHaveBeenCalledTimes(1)
    await service.saveSettings({ ...settings, port: 18318 })
    expect(h.runtime.start).toHaveBeenLastCalledWith(expect.objectContaining({ port: 18318 }))
    await service.saveSettings({ ...settings, enabled: false })
    await expect(service.open()).rejects.toThrow('cpa-not-enabled')
    await service.dispose()
    expect(h.runtime.dispose).toHaveBeenCalledOnce()
  })

  it.each([0, 1023, 65536, 1.5, NaN])('rejects invalid managed port %j', async (port) => {
    const { service } = fixture()
    await expect(service.saveSettings({ mode: 'managed', enabled: true, port })).rejects.toThrow('cpa-invalid-port')
    expect(h.update).not.toHaveBeenCalled()
    expect(h.runtime.start).not.toHaveBeenCalled()
  })

  it('does not create a late native surface after a concurrent stop or application disposal', async () => {
    const { service, surfaces } = fixture()
    h.config = { cpaSettings: { mode: 'managed', enabled: true, port: 8317 } }
    const opening = service.open()
    const result = expect(opening).rejects.toThrow('cpa-stopped')
    await service.stop()
    await result
    expect(surfaces.createSurface).not.toHaveBeenCalled()
    await service.dispose()
    await expect(service.open()).rejects.toThrow('cpa-stopped')
  })
})

describe('CPA management key validation', () => {
  it.each(['', 'short', ' leading', 'trailing ', 'a\r\nbcdefgh', '中文管理密钥123', 'x'.repeat(129), null])('rejects unusable header credentials without echoing them', (input) => {
    expect(() => validateCpaManagementKey(input)).toThrow(/^cpa-invalid-management-key$/)
  })
  it('accepts bounded printable credentials without modifying them', () => {
    expect(validateCpaManagementKey('My-Key_2026!')).toBe('My-Key_2026!')
    expect(validateCpaManagementKey('a'.repeat(128))).toHaveLength(128)
  })
})
