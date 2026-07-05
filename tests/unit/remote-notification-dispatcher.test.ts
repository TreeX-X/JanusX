import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '.'),
  },
}))

import {
  DEFAULT_AGENT_NOTIFICATION_SETTINGS,
  type RemoteNotificationSettings,
} from '../../src/shared/notifications'
import { RemoteNotificationDispatcher } from '../../src/main/remote-notifications/dispatcher'
import { RemoteDeliveryStore } from '../../src/main/remote-notifications/delivery-store'
import type {
  RemoteNotificationEvent,
  RemoteNotificationProvider,
} from '../../src/main/remote-notifications/types'

function createSettings(overrides: Partial<RemoteNotificationSettings> = {}): RemoteNotificationSettings {
  return {
    ...DEFAULT_AGENT_NOTIFICATION_SETTINGS.remote,
    enabled: true,
    providers: {
      feishu: {
        ...DEFAULT_AGENT_NOTIFICATION_SETTINGS.remote.providers.feishu,
        enabled: true,
        webhookUrl: 'https://example.test/hook',
      },
    },
    ...overrides,
  }
}

function createEvent(overrides: Partial<RemoteNotificationEvent> = {}): RemoteNotificationEvent {
  return {
    id: 'event-1',
    engine: 'codex',
    type: 'completed',
    title: 'done',
    body: 'completed',
    createdAt: new Date(10_000).toISOString(),
    severity: 'success',
    startedAt: new Date(0).toISOString(),
    endedAt: new Date(10_000).toISOString(),
    ...overrides,
  }
}

function createProvider(send = vi.fn()): RemoteNotificationProvider {
  return {
    id: 'feishu',
    send,
    test: vi.fn(),
  }
}

describe('RemoteNotificationDispatcher', () => {
  it('skips dispatch when remote notifications are disabled', async () => {
    const provider = createProvider()
    const dispatcher = new RemoteNotificationDispatcher(new RemoteDeliveryStore(), { feishu: provider })

    const results = await dispatcher.dispatch(createEvent(), {
      settings: createSettings({ enabled: false }),
    })

    expect(results).toEqual([])
    expect(provider.send).not.toHaveBeenCalled()
  })

  it('sends enabled events through Feishu provider', async () => {
    const provider = createProvider(vi.fn().mockResolvedValue(undefined))
    const dispatcher = new RemoteNotificationDispatcher(new RemoteDeliveryStore(), { feishu: provider })

    const results = await dispatcher.dispatch(createEvent(), {
      settings: createSettings({ minDurationSeconds: 0 }),
    })

    expect(results).toEqual([{ providerId: 'feishu', ok: true }])
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'event-1', type: 'completed' }),
      expect.objectContaining({ enabled: true }),
      { timeoutMs: 10_000 },
    )
  })

  it('deduplicates the same event for the same provider', async () => {
    const provider = createProvider(vi.fn().mockResolvedValue(undefined))
    const dispatcher = new RemoteNotificationDispatcher(new RemoteDeliveryStore(), { feishu: provider })
    const settings = createSettings({ minDurationSeconds: 0, dedupeWindowSeconds: 300 })

    await dispatcher.dispatch(createEvent(), { settings })
    const second = await dispatcher.dispatch(createEvent(), { settings })

    expect(provider.send).toHaveBeenCalledTimes(1)
    expect(second).toEqual([
      {
        providerId: 'feishu',
        ok: true,
        skipped: true,
        reason: 'deduped',
      },
    ])
  })

  it('clears a failed reservation so the event can be retried', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(undefined)
    const provider = createProvider(send)
    const dispatcher = new RemoteNotificationDispatcher(new RemoteDeliveryStore(), { feishu: provider })
    const settings = createSettings({ minDurationSeconds: 0 })

    const first = await dispatcher.dispatch(createEvent(), { settings })
    const second = await dispatcher.dispatch(createEvent(), { settings })

    expect(first).toEqual([{ providerId: 'feishu', ok: false, reason: 'network down' }])
    expect(second).toEqual([{ providerId: 'feishu', ok: true }])
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('applies the remote duration threshold only to completed events', async () => {
    const provider = createProvider(vi.fn().mockResolvedValue(undefined))
    const dispatcher = new RemoteNotificationDispatcher(new RemoteDeliveryStore(), { feishu: provider })
    const settings = createSettings({ minDurationSeconds: 30 })

    const completed = await dispatcher.dispatch(createEvent(), { settings })
    const failed = await dispatcher.dispatch(
      createEvent({
        id: 'event-2',
        type: 'failed',
        severity: 'error',
      }),
      { settings },
    )

    expect(completed).toEqual([])
    expect(failed).toEqual([{ providerId: 'feishu', ok: true }])
    expect(provider.send).toHaveBeenCalledTimes(1)
  })
})
