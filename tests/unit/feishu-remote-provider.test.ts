import { afterEach, describe, expect, it, vi } from 'vitest'

import { FeishuRemoteNotificationProvider } from '../../src/main/remote-notifications/providers/feishu-provider'
import type { RemoteNotificationEvent } from '../../src/main/remote-notifications/types'

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
    vi.unstubAllGlobals()
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
})
