import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

let userData = '.'
vi.mock('electron', () => ({ app: { getPath: () => userData } }))

describe('Feishu settings secret persistence', () => {
  beforeAll(async () => {
    userData = await mkdtemp(join(tmpdir(), 'janusx-feishu-settings-'))
  })

  it('preserves the stored app secret for blank and omitted updates', async () => {
    const { ConfigService } = await import('../../src/main/config/service')
    const service = new ConfigService()
    await service.updateNotificationSettings({
      remote: {
        providers: {
          feishu: { appSecret: 'stored-secret' },
        },
      } as never,
    })
    await service.updateNotificationSettings({
      remote: { providers: { feishu: { appSecret: '   ' } } } as never,
    })
    expect((await service.getRemoteNotificationSettings()).providers.feishu.appSecret).toBe('stored-secret')

    await service.updateNotificationSettings({ remote: { enabled: true } })
    expect((await service.getRemoteNotificationSettings()).providers.feishu.appSecret).toBe('stored-secret')
  })

  it('rejects unsafe enablement and stops control when authorization is cleared', async () => {
    const { ConfigService } = await import('../../src/main/config/service')
    const service = new ConfigService()
    await expect(service.updateNotificationSettings({
      remote: { providers: { feishu: { inboundControlEnabled: true } } } as never,
    })).rejects.toThrow('requires App mode')

    const enabled = await service.updateNotificationSettings({
      remote: {
        enabled: true,
        providers: { feishu: {
          enabled: true,
          mode: 'app',
          inboundControlEnabled: true,
          allowedOpenIds: ['bad', 'ou_owner', 'ou_owner'],
          appId: 'app-id',
          appSecret: 'new-secret',
          receiveId: 'oc_chat',
        } },
      } as never,
    })
    expect(enabled.remote.providers.feishu).toMatchObject({
      inboundControlEnabled: true,
      allowedOpenIds: ['ou_owner'],
    })

    const revoked = await service.updateNotificationSettings({
      remote: { providers: { feishu: {
        inboundControlEnabled: true,
        allowedOpenIds: [],
      } } } as never,
    })
    expect(revoked.remote.providers.feishu.inboundControlEnabled).toBe(false)

    const providerDisabled = await service.updateNotificationSettings({
      remote: { providers: { feishu: {
        enabled: false,
        inboundControlEnabled: true,
        allowedOpenIds: ['ou_owner'],
      } } } as never,
    })
    expect(providerDisabled.remote.providers.feishu).toMatchObject({
      enabled: false,
      inboundControlEnabled: false,
    })

    await expect(service.updateNotificationSettings({
      remote: { providers: { feishu: {
        enabled: true, mode: 'app', inboundControlEnabled: true, allowedOpenIds: [],
      } } } as never,
    })).rejects.toThrow('valid Feishu open_id')
  })
})
