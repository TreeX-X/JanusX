import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildFeishuCard,
  configureFeishuCardActionTokenIssuer,
  FeishuRemoteNotificationProvider,
} from '../../src/main/remote-notifications/providers/feishu-provider'
import type { RemoteNotificationEvent } from '../../src/main/remote-notifications/types'
import { FEISHU_CONTROL_DEFAULTS } from '../../src/shared/notifications'

const event: RemoteNotificationEvent = {
  id: 'event-1',
  engine: 'codex',
  type: 'approval',
  terminalId: 'term-1',
  workspacePath: 'C:/repo',
  title: 'JanusX - codex needs attention',
  body: 'approve command',
  createdAt: new Date(0).toISOString(),
  severity: 'warning',
}

describe('FeishuRemoteNotificationProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    configureFeishuCardActionTokenIssuer(undefined)
  })

  it('sends an interactive card to a webhook', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 0 }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new FeishuRemoteNotificationProvider()
    await provider.send(
      event,
      {
        enabled: true,
        mode: 'webhook',
        inboundControlEnabled: false,
        allowedOpenIds: [],
        ...FEISHU_CONTROL_DEFAULTS,
        webhookUrl: 'https://example.test/hook',
        appId: '',
        appSecret: '',
        receiveIdType: 'chat_id',
        receiveId: '',
      },
      { timeoutMs: 1000 },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/hook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('"msg_type":"interactive"'),
      }),
    )
  })

  it('uses tenant access token before sending app messages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, tenant_access_token: 'tenant-token' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new FeishuRemoteNotificationProvider()
    await provider.send(
      event,
      {
        enabled: true,
        mode: 'app',
        inboundControlEnabled: false,
        allowedOpenIds: [],
        ...FEISHU_CONTROL_DEFAULTS,
        webhookUrl: '',
        appId: 'app-id',
        appSecret: 'app-secret',
        receiveIdType: 'open_id',
        receiveId: 'ou_x',
      },
      { timeoutMs: 1000 },
    )

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      expect.objectContaining({
        body: JSON.stringify({ app_id: 'app-id', app_secret: 'app-secret' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer tenant-token',
        }),
        body: expect.stringContaining('"receive_id":"ou_x"'),
      }),
    )
  })

  it('validates required app settings', async () => {
    const provider = new FeishuRemoteNotificationProvider()

    await expect(
      provider.send(
        event,
        {
          enabled: true,
          mode: 'app',
          inboundControlEnabled: false,
          allowedOpenIds: [],
          ...FEISHU_CONTROL_DEFAULTS,
          webhookUrl: '',
          appId: '',
          appSecret: 'secret',
          receiveIdType: 'chat_id',
          receiveId: 'chat',
        },
        { timeoutMs: 1000 },
      ),
    ).rejects.toThrow('Feishu app_id is required')
  })

  it('adds signed controls only to eligible app cards', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const expirations: number[] = []
    configureFeishuCardActionTokenIssuer((_context, terminalId, action, expiresAt) => {
      expirations.push(expiresAt)
      return `token:${terminalId}:${action}`
    })
    const base = {
      enabled: true,
      inboundControlEnabled: true,
      allowedOpenIds: ['ou-1'],
      ...FEISHU_CONTROL_DEFAULTS,
      actionTokenTtlMinutes: 2,
      webhookUrl: 'https://example.test/hook',
      appId: 'app-id',
      appSecret: 'secret',
      receiveIdType: 'chat_id' as const,
      receiveId: 'oc-1',
    }
    const appCard = buildFeishuCard(event, { ...base, mode: 'app' })
    const webhookCard = buildFeishuCard(event, { ...base, mode: 'webhook' })
    const appJson = JSON.stringify(appCard)
    const webhookJson = JSON.stringify(webhookCard)

    expect(appJson).toContain('"action":"bind"')
    expect(appJson).toContain('"action":"approve"')
    expect(appJson).toContain('"action":"reject"')
    expect(appJson).toContain('"action":"stop"')
    expect(appJson).toContain('token:term-1:approve')
    expect(expirations).toEqual(Array(4).fill(1_800_000_120_000))
    expect(webhookJson).not.toContain('"tag":"button"')
    expect(webhookJson).not.toContain('token:')

    const openIdCard = buildFeishuCard(event, {
      ...base, mode: 'app', receiveIdType: 'open_id', receiveId: 'ou-1',
    })
    const contextlessCard = buildFeishuCard({ ...event, terminalId: undefined }, { ...base, mode: 'app' })
    expect(JSON.stringify(openIdCard)).not.toContain('"tag":"button"')
    expect(JSON.stringify(contextlessCard)).not.toContain('"tag":"button"')

    const sharedCard = buildFeishuCard(event, {
      ...base, mode: 'app', allowedOpenIds: ['ou-1', 'ou-2'],
    })
    expect(JSON.stringify(sharedCard)).not.toContain('"tag":"button"')
  })
})
