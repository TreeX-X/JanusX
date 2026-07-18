import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NOTIFICATION_SETTINGS_CHANNELS } from '../../src/shared/ipc/settings'
import type { AgentNotificationSettings } from '../../src/shared/notifications'
import { DEFAULT_AGENT_NOTIFICATION_SETTINGS } from '../../src/shared/notifications'

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const getNotificationSettings = vi.fn()
const getRemoteNotificationSettings = vi.fn()
const updateNotificationSettings = vi.fn()
const testFeishu = vi.fn()
const reconfigure = vi.fn()
const getControlStatus = vi.fn()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler) },
}))
vi.mock('../../src/main/config/service', () => ({
  configService: { getNotificationSettings, getRemoteNotificationSettings, updateNotificationSettings },
}))
vi.mock('../../src/main/remote-notifications/dispatcher', () => ({
  remoteNotificationDispatcher: { testFeishu },
}))
vi.mock('../../src/main/remote-notifications/feishu-inbound/runtime', () => ({
  feishuInboundRuntime: { reconfigure, getControlStatus },
}))

function settings(): AgentNotificationSettings {
  return {
    ...DEFAULT_AGENT_NOTIFICATION_SETTINGS,
    remote: {
      ...DEFAULT_AGENT_NOTIFICATION_SETTINGS.remote,
      enabled: true,
      providers: { feishu: {
        ...DEFAULT_AGENT_NOTIFICATION_SETTINGS.remote.providers.feishu,
        enabled: true, mode: 'app', inboundControlEnabled: true, allowedOpenIds: ['ou-1'],
        appId: 'app-id', appSecret: 'stored-secret', receiveId: 'oc-1',
      } },
    },
  }
}

describe('Feishu settings IPC', () => {
  beforeAll(async () => {
    const { registerSettingsHandlers } = await import('../../src/main/ipc/settings-handlers')
    registerSettingsHandlers()
  })

  beforeEach(() => {
    const value = settings()
    getNotificationSettings.mockReset().mockResolvedValue(value)
    getRemoteNotificationSettings.mockReset().mockResolvedValue(value.remote)
    updateNotificationSettings.mockReset().mockResolvedValue(value)
    testFeishu.mockReset().mockResolvedValue({ providerId: 'feishu', ok: true })
    reconfigure.mockReset().mockResolvedValue(undefined)
    getControlStatus.mockReset().mockReturnValue({
      state: 'connected', enabled: true, configured: true, updatedAt: 123,
    })
  })

  it('redacts appSecret from get and update responses while reconfiguring with the full value', async () => {
    const getResult = await handlers.get(NOTIFICATION_SETTINGS_CHANNELS.get)!({})
    const updateResult = await handlers.get(NOTIFICATION_SETTINGS_CHANNELS.update)!({}, {
      remote: { providers: { feishu: { appSecret: '' } } },
    })
    expect(JSON.stringify(getResult)).not.toContain('stored-secret')
    expect(JSON.stringify(updateResult)).not.toContain('stored-secret')
    expect(getResult).toMatchObject({
      remote: { providers: { feishu: { appSecretConfigured: true } } },
    })
    expect((getResult as { remote: { providers: { feishu: object } } }).remote.providers.feishu)
      .not.toHaveProperty('appSecret')
    expect(reconfigure).toHaveBeenCalledWith(expect.objectContaining({
      providers: { feishu: expect.objectContaining({ appSecret: 'stored-secret' }) },
    }))
    expect(updateResult).toBeDefined()
  })

  it('uses the stored secret for tests and exposes sanitized status only', async () => {
    const rawSecret = `  ${'credential-fragment-'.repeat(24)}\nsecret-tail  `
    const normalizedSecret = rawSecret.trim().replace(/\s+/g, ' ')
    const value = settings()
    value.remote.providers.feishu.appSecret = rawSecret
    getRemoteNotificationSettings.mockResolvedValueOnce(value.remote)
    testFeishu.mockResolvedValueOnce({
      providerId: 'feishu', ok: false, reason: `${normalizedSecret}\napp-id failed`,
    })
    const supplied = settings().remote
    supplied.providers.feishu.appSecret = ''
    const testResult = await handlers.get(NOTIFICATION_SETTINGS_CHANNELS.testFeishu)!({}, supplied)
    expect(testFeishu).toHaveBeenCalledWith(expect.objectContaining({
      providers: { feishu: expect.objectContaining({ appSecret: rawSecret }) },
    }))
    expect(testResult).toEqual({
      providerId: 'feishu', ok: false, reason: '[redacted] [redacted] failed',
    })
    expect(JSON.stringify(testResult)).not.toContain('credential-fragment')
    expect(JSON.stringify(testResult)).not.toContain('secret-tail')

    const status = await handlers.get(NOTIFICATION_SETTINGS_CHANNELS.feishuControlStatus)!({})
    expect(status).toEqual({ state: 'connected', enabled: true, configured: true, updatedAt: 123 })
    expect(JSON.stringify(status)).not.toContain('stored-secret')
  })
})
